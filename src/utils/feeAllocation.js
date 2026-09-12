/**
 * Shared fee-payment allocator (office FeeOperations + student Fees portal).
 *
 * Problem it fixes: a portal/"collect payment" entry used to reduce EVERY
 * academic year's row for that fee head (matched by head name only), so one
 * ₹40,000 Tuition Fee payment showed "Paid: ₹40,000" under 2026-2027,
 * 2027-2028, 2028-2029, 2029-2030 simultaneously.
 *
 * Rule: each portal payment reduces exactly ONE fee config —
 *  1. Payments tagged with academicYear (+semester) go to the matching config.
 *  2. Untagged legacy payments waterfall oldest-due-first (clear oldest dues first).
 * Application-time payments keep the existing first-year-only rule.
 */

export const normHead = (s) => {
  const str = String(s || '').replace(/[\s ]+/g, ' ').trim().toLowerCase();
  if (!str) return '';
  if (str.includes('application') || str.includes('app fee') || str.includes('consortium') || str.includes('registration') || str.includes('enquiry')) return 'application fee';
  if (str.includes('admission')) return 'admission fee';
  if (str.includes('caution')) return 'caution deposit';
  if (str.includes('tuition')) return 'tuition fee';
  if (str.includes('other')) return 'other fee';
  if (str.includes('transport')) return 'transport fee';
  if (str.includes('hostel')) return 'hostel fee';
  return str;
};

export const yearStart = (y) => Number(String(y || '').match(/^\d{4}/)?.[0] || 99999);

const eqStr = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const isSpecificSem = (s) => {
  const t = String(s || '').trim().toLowerCase();
  return Boolean(t) && t !== 'all';
};

const payAmount = (p) => Number(p.chargedAmount || p.amount) || 0;

const payTime = (p) => {
  const t = p.createdAt?.toDate?.() || p.createdAt || p.paymentDate || 0;
  const d = t instanceof Date ? t : new Date(t);
  return isNaN(d) ? 0 : d.getTime();
};

/**
 * @param {Array} configs - fee config rows [{id, head, academicYear, semester, amount}]
 * @param {Array} portalPayments - successful fee_payments docs (may carry academicYear/semester)
 * @param {Array} appPayments - successful application-time payments (first-year rule)
 * @returns {Map} cfg.id -> total paid against that exact config
 */
export function computePaidByConfig({ configs = [], portalPayments = [], appPayments = [] }) {
  const paid = new Map();
  configs.forEach((c) => paid.set(c.id, 0));
  const addPaid = (cfg, v) => {
    if (!cfg || !v) return;
    paid.set(cfg.id, (paid.get(cfg.id) || 0) + v);
  };

  // Group configs per head, oldest academic year first.
  const byHead = new Map();
  configs.forEach((c) => {
    const nh = normHead(c.head);
    if (!nh) return;
    if (!byHead.has(nh)) byHead.set(nh, []);
    byHead.get(nh).push(c);
  });
  byHead.forEach((list) => list.sort((a, b) => yearStart(a.academicYear) - yearStart(b.academicYear)));

  // 1. Application payments → first-year config only (existing rule).
  (appPayments || []).forEach((p) => {
    const list = byHead.get(normHead(p.feeHead));
    if (list && list.length) addPaid(list[0], payAmount(p));
  });

  // Remaining due per config after application payments.
  const remaining = new Map();
  configs.forEach((c) => {
    remaining.set(c.id, Math.max(0, (Number(c.amount) || 0) - (paid.get(c.id) || 0)));
  });

  // Oldest-first chronological order for deterministic allocation.
  const chrono = [...(portalPayments || [])].sort((a, b) => payTime(a) - payTime(b));
  const untagged = [];

  // 2. Year-tagged payments → that exact year's config (semester-narrowed when possible).
  chrono.forEach((p) => {
    const list = byHead.get(normHead(p.feeHead));
    if (!list || !list.length) return;
    const py = String(p.academicYear || '').trim();
    if (!py) {
      untagged.push(p);
      return;
    }
    let targets = list.filter((c) => eqStr(c.academicYear, py));
    if (!targets.length) {
      untagged.push(p); // tagged year has no config → treat as untagged
      return;
    }
    if (isSpecificSem(p.semester)) {
      const narrowed = targets.filter((c) => isSpecificSem(c.semester) && eqStr(c.semester, p.semester));
      if (narrowed.length) targets = narrowed;
    }
    const v = payAmount(p);
    addPaid(targets[0], v);
    remaining.set(targets[0].id, Math.max(0, (remaining.get(targets[0].id) || 0) - v));
  });

  // 3. Untagged legacy payments → oldest config with remaining due first.
  untagged.forEach((p) => {
    let left = payAmount(p);
    if (left <= 0) return;
    const list = byHead.get(normHead(p.feeHead)) || [];
    for (const c of list) {
      if (left <= 0) break;
      const r = remaining.get(c.id) || 0;
      if (r <= 0) continue;
      const take = Math.min(r, left);
      addPaid(c, take);
      remaining.set(c.id, r - take);
      left -= take;
    }
    // Overpayment beyond all configured years: park on earliest config so the
    // credit stays visible instead of vanishing (display caps handle excess).
    if (left > 0 && list.length) addPaid(list[0], left);
  });

  return paid;
}
