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
  if (str.includes('no due') || str.includes('nodue')) return 'no due fee';
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
    let left = v;
    for (const t of targets) {
      if (left <= 0) break;
      const r = remaining.get(t.id) || 0;
      if (r <= 0) continue;
      const take = Math.min(r, left);
      addPaid(t, take);
      remaining.set(t.id, r - take);
      left -= take;
    }
    if (left > 0 && targets.length) {
      addPaid(targets[0], left);
    }
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

    // Fallback: if fee head did not match a specific config group, waterfall across remaining dues
    if (left > 0 && (!list || !list.length)) {
      for (const c of configs) {
        if (left <= 0) break;
        const r = remaining.get(c.id) || 0;
        if (r <= 0) continue;
        const take = Math.min(r, left);
        addPaid(c, take);
        remaining.set(c.id, r - take);
        left -= take;
      }
      if (left > 0 && configs.length) {
        addPaid(configs[0], left);
      }
    }
  });

  return paid;
}

/**
 * Standardize batch match across different formatting variants (e.g. 2026-2028 vs 2026-28 vs 2026 - 2028).
 */
export const isBatchMatch = (b1, b2) => {
  if (!b1 || !b2) return false;
  const s1 = String(b1).trim().toLowerCase();
  const s2 = String(b2).trim().toLowerCase();
  if (s1 === s2) return true;
  const n1 = s1.replace(/[^a-z0-9]/g, '');
  const n2 = s2.replace(/[^a-z0-9]/g, '');
  if (n1 === n2) return true;
  const m1 = s1.match(/\d{4}\s*[-_]\s*\d{2,4}/);
  const m2 = s2.match(/\d{4}\s*[-_]\s*\d{2,4}/);
  if (m1 && m2) {
    const normYear = (yStr) => {
      const parts = yStr.split(/[-_]/);
      const y1 = parts[0].trim();
      let y2 = parts[1].trim();
      if (y2.length === 2) y2 = '20' + y2;
      return `${y1}-${y2}`;
    };
    return normYear(m1[0]) === normYear(m2[0]);
  }
  return false;
};

/**
 * Flexible programme matching ensuring UG matches B.E. / B.Tech and PG matches M.E. / M.Tech / MBA.
 */
export const isProgMatch = (fProg, sProg) => {
  if (!fProg || String(fProg).trim().toLowerCase() === 'all') return true;
  const fp = String(fProg).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const sp = String(sProg || 'ug').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fp === sp) return true;
  if (fp === 'ug' && (sp === 'be' || sp === 'btech' || sp === 'ug')) return true;
  if ((fp === 'be' || fp === 'btech') && (sp === 'ug' || sp === 'be' || sp === 'btech')) return true;
  if (fp === 'pg' && (sp === 'me' || sp === 'mtech' || sp === 'mba' || sp === 'pg')) return true;
  if ((fp === 'me' || fp === 'mtech' || fp === 'mba') && (sp === 'pg' || sp === 'me' || sp === 'mtech' || sp === 'mba')) return true;
  return false;
};

/**
 * Standardize quota matching strings.
 */
export const normalizeQuotaStr = (q) => {
  if (!q) return '';
  const s = String(q).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('mgmt') || s.includes('management') || s === 'mq') return 'management';
  if (s.includes('govt') || s.includes('government') || s === 'gq' || s.includes('75')) return 'government';
  if (s.includes('nri')) return 'nri';
  if (s.includes('sports')) return 'sports';
  return s;
};

export const isQuotaMatchExact = (configQuota, studentQuota) => {
  if (!configQuota || !studentQuota) return false;
  const cq = normalizeQuotaStr(configQuota);
  const sq = normalizeQuotaStr(studentQuota);
  return Boolean(cq && sq && (cq === sq || cq.includes(sq) || sq.includes(cq)));
};

export const isQuotaApplicable = (configQuota, studentQuota) => {
  if (!configQuota || configQuota.trim().toLowerCase() === 'all') return true;
  if (!studentQuota) {
    const cq = normalizeQuotaStr(configQuota);
    return cq !== 'management' && cq !== 'nri';
  }
  return isQuotaMatchExact(configQuota, studentQuota);
};

export const normalizeCategoryStr = (cat) => {
  if (!cat) return '';
  const s = String(cat).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'all' || s === 'allcategories' || s === '') return 'all';
  if (s.includes('lateral')) return 'lateral entry';
  if (s.includes('regular')) return 'regular';
  if (s.includes('transfer')) return 'transfer';
  if (s.includes('readmission') || s.includes('re-admission')) return 'readmission';
  return s;
};

export const isCategoryMatchExact = (configCategory, sCategory) => {
  const cc = normalizeCategoryStr(configCategory);
  const sc = normalizeCategoryStr(sCategory || 'regular');
  if (!cc || cc === 'all') return true;
  return cc === sc;
};

export const isCategoryApplicable = (configCategory, sCategory) => {
  if (!configCategory || configCategory.trim().toLowerCase() === 'all' || configCategory.trim().toLowerCase() === 'all categories') return true;
  return isCategoryMatchExact(configCategory, sCategory || 'regular');
};

export const parseYearStart = (ayStr) => {
  if (!ayStr || ayStr === "ALL") return 0;
  const m = String(ayStr).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * Builds a fast identifier lookup mapping all aliases of a student to their canonical ID.
 */
export const buildStudentCanonicalLookup = (students = []) => {
  const lookup = new Map();
  students.forEach(s => {
    const canonicalKey = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim().toUpperCase();
    if (!canonicalKey) return;
    const keys = [
      s.regNo,
      s.examNumber,
      s.rollNo,
      s.id,
      s.uid,
      s.studentId,
      s.applicationNo,
      s.enquiryId,
      s.admissionNo,
      s.email,
      s.emailId,
      s._docId,
      s.name,
      s.displayName,
      s.studentName,
      s._profile_data?.enquiryId,
      s._profile_data?.applicationNo,
      s._profile_data?.emailId
    ].filter(Boolean);
    keys.forEach(k => {
      const kNorm = String(k).trim().toLowerCase();
      if (kNorm && !lookup.has(kNorm)) lookup.set(kNorm, canonicalKey);
    });
  });
  return lookup;
};

/**
 * Aggregates verified payments per canonical student key, strictly preventing duplicate/double counting.
 */
export const aggregatePaymentsByStudent = (payments = [], lookup = new Map()) => {
  const studentPaidMap = new Map();
  const seenPaymentIds = new Set();
  payments.forEach((p, idx) => {
    const pId = p.id || p.orderId || p.receiptNo || `pay_${idx}`;
    if (seenPaymentIds.has(pId)) return;
    seenPaymentIds.add(pId);

    const amt = Number(p.chargedAmount || p.amount || 0);
    if (amt <= 0) return;

    const reg = (p.examNumber || p.regNo || p.studentRegNo || p.registerNumber || p.applicationNo || "").trim().toLowerCase();
    const uid = (p.studentId || p.uid || p.enquiryId || "").trim().toLowerCase();
    const email = (p.studentEmail || p.email || "").trim().toLowerCase();
    const name = (p.studentName || p.candidateName || p.name || "").trim().toLowerCase();

    const canonicalKey = (reg && lookup.get(reg)) ||
                         (uid && lookup.get(uid)) ||
                         (email && lookup.get(email)) ||
                         (name && lookup.get(name)) ||
                         (reg ? reg.toUpperCase() : (uid ? uid.toUpperCase() : ""));

    if (canonicalKey) {
      studentPaidMap.set(canonicalKey, (studentPaidMap.get(canonicalKey) || 0) + amt);
    }
  });
  return studentPaidMap;
};

/**
 * Aggregates approved concessions per canonical student key.
 */
export const aggregateConcessionsByStudent = (concessions = [], lookup = new Map()) => {
  const studentConcessionsMap = new Map();
  concessions.filter(c => c.status === "approved" || !c.status).forEach(c => {
    const amt = Number(c.amount || 0);
    if (amt <= 0) return;

    const reg = (c.regNo || c.studentRegNo || c.examNumber || c.applicationNo || "").trim().toLowerCase();
    const uid = (c.studentId || c.uid || c.enquiryId || "").trim().toLowerCase();
    const name = (c.studentName || c.name || "").trim().toLowerCase();

    const canonicalKey = (reg && lookup.get(reg)) ||
                         (uid && lookup.get(uid)) ||
                         (name && lookup.get(name)) ||
                         (reg ? reg.toUpperCase() : (uid ? uid.toUpperCase() : ""));
    if (canonicalKey) {
      studentConcessionsMap.set(canonicalKey, (studentConcessionsMap.get(canonicalKey) || 0) + amt);
    }
  });
  return studentConcessionsMap;
};

/**
 * Aggregates opening dues / arrears per canonical student key up to target year.
 */
export const aggregateOpeningDuesByStudent = (openingDues = [], lookup = new Map(), targetYearStart = 0) => {
  const studentOpeningDuesMap = new Map();
  openingDues.forEach(o => {
    const amt = Number(o.amount || o.dueAmount || 0);
    if (amt <= 0) return;
    if (targetYearStart > 0 && o.academicYear) {
      const odYearStart = parseYearStart(o.academicYear);
      if (odYearStart > targetYearStart) return;
    }
    const reg = (o.regNo || o.studentRegNo || o.examNumber || o.applicationNo || "").trim().toLowerCase();
    const uid = (o.studentId || o.uid || o.enquiryId || "").trim().toLowerCase();
    const name = (o.studentName || o.name || "").trim().toLowerCase();

    const canonicalKey = (reg && lookup.get(reg)) ||
                         (uid && lookup.get(uid)) ||
                         (name && lookup.get(name)) ||
                         (reg ? reg.toUpperCase() : (uid ? uid.toUpperCase() : ""));
    if (canonicalKey) {
      studentOpeningDuesMap.set(canonicalKey, (studentOpeningDuesMap.get(canonicalKey) || 0) + amt);
    }
  });
  return studentOpeningDuesMap;
};

/**
 * Evaluates currently active semester configs from AcademicCalendar.jsx (semester_config)
 * strictly matching ongoing date range (today >= startDate && today <= endDate),
 * completely excluding past date ranges (today > endDate).
 */
export const getActiveSemesterConfigs = (semesterConfigs = []) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (semesterConfigs || []).filter(cfg => {
    if (!cfg.startDate || !cfg.endDate) return false;
    const start = new Date(cfg.startDate + 'T00:00:00');
    const end = new Date(cfg.endDate + 'T23:59:59');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    // Ongoing date range strictly enforced; past date ranges excluded
    return today >= start && today <= end;
  });
};

/**
 * Checks whether a student belongs to one of the currently active studying batches.
 */
export const isStudentInActiveConfigs = (student, activeConfigs = []) => {
  if (!student || !student.batch || !activeConfigs || activeConfigs.length === 0) return false;
  return activeConfigs.some(cfg => {
    const cfgBatches = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
    const batchMatches = cfgBatches.some(b => isBatchMatch(b, student.batch));
    if (!batchMatches) return false;
    if (cfg.programme && student.programme) {
      return isProgMatch(cfg.programme, student.programme);
    }
    return true;
  });
};

/**
 * Scopes student list to only those currently studying based on AcademicCalendar active semester configs.
 */
export const filterActiveStudyingStudents = (students = [], semesterConfigs = []) => {
  const activeConfigs = getActiveSemesterConfigs(semesterConfigs);
  if (!activeConfigs || activeConfigs.length === 0) return students;
  return (students || []).filter(s => isStudentInActiveConfigs(s, activeConfigs));
};


