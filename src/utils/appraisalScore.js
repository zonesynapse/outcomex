/**
 * Shared performance-evaluation scorer for the HR Appraisal module.
 * Evaluates a faculty appraisal `formData` against the dynamic criteria
 * configured in `appraisal_config/criteria` (AppraisalSettings.jsx):
 *   - part1: rule-based items { type, maxMarks, rules: [{min,max,rating,marks}] }
 *   - part2: count-based items { type, maxMarks, targetCount, marksPerUnit }
 *
 * Returns { part1Rows, part2Rows, part1Total, part1Max, part2Total, part2Max,
 *           grandTotal, grandMax } where each row is
 * { id, sNo, kra, particulars, maxMarks, value, valueLabel, scored, note }.
 */

const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const IGNORED_ROW_KEYS = new Set(["fileUrl", "fileName"]);

function rowHasData(row, byFields) {
  if (!row || typeof row !== "object") return String(row ?? "").trim() !== "";
  if (Array.isArray(byFields) && byFields.length > 0) {
    return byFields.some((k) => String(row[k] ?? "").trim() !== "");
  }
  return Object.entries(row).some(
    ([k, v]) => !IGNORED_ROW_KEYS.has(k) && String(v ?? "").trim() !== ""
  );
}

function countRows(list, byFields) {
  if (!Array.isArray(list)) return 0;
  const by = Array.isArray(byFields) ? byFields : byFields ? [byFields] : [];
  return list.filter((row) => rowHasData(row, by)).length;
}

function avgField(rows, field) {
  const vals = (Array.isArray(rows) ? rows : [])
    .map((r) => toNum(r?.[field]))
    .filter((v) => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function matchRule(rules, value) {
  const v = Number(value);
  if (!Array.isArray(rules) || rules.length === 0 || Number.isNaN(v)) {
    return { marks: 0, rating: null };
  }
  const hit = rules.find((r) => v >= Number(r.min) && v <= Number(r.max));
  if (!hit) return { marks: 0, rating: 0 };
  return { marks: Number(hit.marks) || 0, rating: hit.rating ?? null };
}

// Normalize a feedback average onto a 0–100 scale (supports 5-point & 10-point scales).
function normalizeFeedback(avg) {
  if (avg === null || avg === undefined) return null;
  if (avg <= 5) return avg * 20;
  if (avg <= 10) return avg * 10;
  return avg;
}

// formData list keys grouped by purpose
const THEORY_LISTS = ["oddTheorySubjects", "evenTheorySubjects"];
const PRACTICAL_LISTS = ["oddPracticalSubjects", "evenPracticalSubjects"];
const ALL_SUBJECT_LISTS = [...THEORY_LISTS, ...PRACTICAL_LISTS];

const PART2_LIST_MAP = {
  online_courses: [{ key: "onlineCourses", by: "title" }],
  publications: [{ key: "researchPapers", by: "title" }],
  workshops: [{ key: "workshopsFDPs", by: "title" }],
  qualification_upgrade: [{ key: "improvingDetails", by: "degreeRegistered" }],
  organizing_events: [{ key: "organizingPrograms", by: "title" }],
  funding_proposals: [{ key: "fundingProposals", by: ["title", "fundingAgencyScheme"] }],
  placement_mentoring: [{ key: "involvementPlacement", by: "description" }],
  accreditation_rd: [
    { key: "accreditationContributions", by: ["role", "description"] },
    { key: "rdContributions", by: ["role", "description"] },
  ],
  admissions: [{ key: "admissionContribution", sumField: "countContributed" }],
};

function collectLists(formData, defs) {
  const rows = [];
  (defs || []).forEach(({ key }) => {
    const list = formData?.[key];
    if (Array.isArray(list)) rows.push(...list);
  });
  return rows;
}

function part1Value(type, formData) {
  const avgPct = (lists) => {
    const rows = collectLists(formData, lists.map((key) => ({ key })));
    return avgField(rows, "resultPercentage");
  };
  const allRows = collectLists(
    formData,
    ALL_SUBJECT_LISTS.map((key) => ({ key }))
  );
  switch (type) {
    case "theory_pass":
      return { value: avgPct(THEORY_LISTS), label: "Avg theory pass %" };
    case "practical_pass":
      return { value: avgPct(PRACTICAL_LISTS), label: "Avg practical pass %" };
    case "student_feedback": {
      const raw = avgField(allRows, "feedbackRating");
      const norm = normalizeFeedback(raw);
      return {
        value: norm,
        label:
          raw === null
            ? "No feedback entered"
            : raw <= 10
              ? `Avg feedback ${raw.toFixed(2)} (scaled to ${norm.toFixed(1)})`
              : `Avg feedback ${raw.toFixed(2)}`,
      };
    }
    default:
      return { value: null, label: "Manual review required" };
  }
}

function part2Count(type, formData) {
  const defs = PART2_LIST_MAP[type];
  if (!defs) return { count: 0, label: "Manual review required" };
  // Admissions: sum of contributed admission counts (falls back to row count).
  if (type === "admissions") {
    const rows = collectLists(formData, defs);
    let sum = 0;
    let hasNumeric = false;
    rows.forEach((r) => {
      const n = toNum(r?.countContributed);
      if (n !== null) {
        hasNumeric = true;
        sum += n;
      }
    });
    if (hasNumeric) return { count: sum, label: `${sum} admissions contributed` };
    const c = countRows(rows, "teamNoArea");
    return { count: c, label: `${c} admission rows` };
  }
  let count = 0;
  const parts = [];
  defs.forEach(({ key, by }) => {
    const c = countRows(formData?.[key], by);
    count += c;
    if (c > 0) parts.push(`${c} in ${key}`);
  });
  return { count, label: parts.join(", ") || "None entered" };
}

export function evaluateAppraisal(formData, criteria) {
  const fd = formData || {};
  const part1 = Array.isArray(criteria?.part1) ? criteria.part1 : [];
  const part2 = Array.isArray(criteria?.part2) ? criteria.part2 : [];

  const part1Rows = part1.map((item) => {
    const maxMarks = Number(item.maxMarks) || 0;
    const { value, label } = part1Value(item.type, fd);
    const { marks, rating } = matchRule(item.rules, value);
    const scored = Math.min(maxMarks, marks);
    return {
      id: item.id,
      sNo: item.sNo,
      kra: item.kra,
      particulars: item.particulars,
      maxMarks,
      value: value === null ? null : Math.round(value * 100) / 100,
      valueLabel: value === null ? "No data" : `${Math.round(value * 100) / 100} — ${label}`,
      rating,
      scored,
      note: value === null ? "No qualifying data entered" : "",
    };
  });

  const part2Rows = part2.map((item) => {
    const maxMarks = Number(item.maxMarks) || 0;
    const targetCount = Number(item.targetCount) || 0;
    const marksPerUnit = Number(item.marksPerUnit) || 0;
    const { count, label } = part2Count(item.type, fd);
    let scored = 0;
    if (Array.isArray(item.rules) && item.rules.length > 0 && !targetCount) {
      scored = matchRule(item.rules, count).marks;
    } else {
      const capped = targetCount > 0 ? Math.min(count, targetCount) : count;
      scored = capped * marksPerUnit;
    }
    scored = Math.min(maxMarks, Math.round(scored * 100) / 100);
    return {
      id: item.id,
      sNo: item.sNo,
      kra: item.kra,
      particulars: item.particulars,
      maxMarks,
      value: count,
      valueLabel: `${count}${targetCount > 0 ? ` / target ${targetCount}` : ""} — ${label}`,
      rating: null,
      scored,
      note: "",
    };
  });

  const part1Total = part1Rows.reduce((a, r) => a + r.scored, 0);
  const part1Max = part1Rows.reduce((a, r) => a + r.maxMarks, 0);
  const part2Total = part2Rows.reduce((a, r) => a + r.scored, 0);
  const part2Max = part2Rows.reduce((a, r) => a + r.maxMarks, 0);

  return {
    part1Rows,
    part2Rows,
    part1Total: Math.round(part1Total * 100) / 100,
    part1Max,
    part2Total: Math.round(part2Total * 100) / 100,
    part2Max,
    grandTotal: Math.round((part1Total + part2Total) * 100) / 100,
    grandMax: part1Max + part2Max,
  };
}

export default evaluateAppraisal;
