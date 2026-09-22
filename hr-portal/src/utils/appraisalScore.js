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

export const DEFAULT_CRITERIA = {
  criteriaVersion: "2026_v2",
  part1: [
    { id: "p1_s1", sNo: 1, kra: "Pass Percentage", particulars: "Practicals Handled", maxMarks: 5, type: "practical_pass", rules: [{ min: 95, max: 100, rating: 1, marks: 5 }, { min: 0, max: 94.99, rating: 0, marks: 0 }] },
    { id: "p1_s2", sNo: 2, kra: "Pass Percentage", particulars: "Theory Subjects Handled", maxMarks: 45, type: "theory_pass", rules: [{ min: 91, max: 100, rating: 5, marks: 45 }, { min: 81, max: 90.99, rating: 4, marks: 36 }, { min: 71, max: 80.99, rating: 3, marks: 27 }, { min: 61, max: 70.99, rating: 2, marks: 18 }, { min: 51, max: 60.99, rating: 1, marks: 9 }, { min: 0, max: 50.99, rating: 0, marks: 0 }] }
  ],
  part2: [
    { id: "p2_1a", sNo: "1a", kra: "Investing in Yourself", particulars: "Completion of Knowledge Sharing Sessions with its Outcome", maxMarks: 10, type: "knowledge_sharing", targetCount: 1, marksPerUnit: 10 },
    { id: "p2_1c", sNo: "1c", kra: "Investing in Yourself", particulars: "Participation in Workshops, Conferences, Seminars and Special Programs, if any (Two Workshop)", maxMarks: 5, type: "workshops", targetCount: 2, marksPerUnit: 2.5 },
    { id: "p2_1d", sNo: "1d", kra: "Investing in Yourself", particulars: "Improvements in Qualification/Interaction with Outside World (One program)", maxMarks: 10, type: "qualification_outside_world", targetCount: 1, marksPerUnit: 10 },
    { id: "p2_2c", sNo: "2c", kra: "Contribution for the Development of the Department / Institution", particulars: "Involvement in Department Development / Student Welfare / Mentoring / Counseling / Special efforts, if any", maxMarks: 10, type: "dept_student_welfare", targetCount: 1, marksPerUnit: 10 },
    { id: "p2_2d", sNo: "2d", kra: "Contribution for the Development of the Department / Institution", particulars: "Contribution towards Alumni / Sports / NSS / Special efforts as a Class Teacher / Teacher", maxMarks: 5, type: "alumni_sports_nss_class_teacher", targetCount: 1, marksPerUnit: 5 },
    { id: "p2_2f", sNo: "2f", kra: "Contribution for the Development of the Department / Institution", particulars: "Contibution towards Admission (Minimum of 5 admission)", maxMarks: 10, type: "admissions", targetCount: 5, marksPerUnit: 2 }
  ]
};

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

function avgField(rows, fieldNames) {
  const fields = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
  const vals = (Array.isArray(rows) ? rows : [])
    .map((r) => {
      for (const f of fields) {
        const v = toNum(r?.[f]);
        if (v !== null) return v;
      }
      const p = toNum(r?.passed);
      const a = toNum(r?.appeared);
      if (p !== null && a !== null && a > 0) {
        return (p / a) * 100;
      }
      return null;
    })
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
const THEORY_LISTS = ["resultsAnnualTheory", "resultsQuarterly", "resultsHalfYearly", "oddTheorySubjects", "evenTheorySubjects"];
const PRACTICAL_LISTS = ["resultsAnnualPractical", "oddPracticalSubjects", "evenPracticalSubjects"];
const ALL_SUBJECT_LISTS = [...THEORY_LISTS, ...PRACTICAL_LISTS];

const PART2_LIST_MAP = {
  knowledge_sharing: [{ key: "iiyClasses", by: ["topic", "numClasses"] }],
  workshops: [
    { key: "workshops", by: ["title", "organization"] },
    { key: "workshopsFDPs", by: ["title", "organization"] }
  ],
  qualification_outside_world: [
    { key: "qualificationDetails", by: ["degree", "specialization", "university"] },
    { key: "improvingDetails", by: "degreeRegistered" }
  ],
  dept_student_welfare: [{ key: "deptInvolvement", by: ["description", "role"] }],
  alumni_sports_nss_class_teacher: [{ key: "otherContributions", by: ["role", "description"] }],
  admissions: [
    { key: "admissionsInstitution", sumField: "count" },
    { key: "admissionsVijayadashami", sumField: "count" },
    { key: "admissionContribution", sumField: "countContributed" }
  ],
  online_courses: [{ key: "onlineCourses", by: "title" }],
  publications: [{ key: "researchPapers", by: "title" }],
  qualification_upgrade: [{ key: "improvingDetails", by: "degreeRegistered" }],
  organizing_events: [{ key: "organizingPrograms", by: "title" }],
  funding_proposals: [{ key: "fundingProposals", by: ["title", "fundingAgencyScheme"] }],
  placement_mentoring: [{ key: "involvementPlacement", by: "description" }],
  accreditation_rd: [
    { key: "accreditationContributions", by: ["role", "description"] },
    { key: "rdContributions", by: ["role", "description"] },
  ]
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
    return avgField(rows, ["passPercent", "resultPercentage", "passPercentage"]);
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

  if (type === "qualification_outside_world" && formData?.improvingQualification === "Yes") {
    let count = 0;
    defs.forEach(({ key, by }) => {
      count += countRows(formData?.[key], by);
    });
    const finalCount = Math.max(count, 1);
    return { count: finalCount, label: `${finalCount} qualification / outside world entries` };
  }

  // Admissions: sum of contributed admission counts (falls back to row count).
  if (type === "admissions") {
    const rows = collectLists(formData, defs);
    let sum = 0;
    let hasNumeric = false;
    rows.forEach((r) => {
      const n = toNum(r?.count) ?? toNum(r?.countContributed);
      if (n !== null) {
        hasNumeric = true;
        sum += n;
      }
    });
    if (hasNumeric) return { count: sum, label: `${sum} admissions contributed` };
    const c = countRows(rows, ["area", "teamNoArea"]);
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

/**
 * Parse any date input format into epoch milliseconds.
 * Supports: ISO strings ("2026-09-16T12:45"), DD/MM/YYYY hh:mm AM/PM,
 * YYYY-MM-DD, timestamps, and Firestore Timestamp objects.
 */
export const parseAppraisalDateTime = (val) => {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate().getTime();
  if (typeof val === "number") return val;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Standard ISO/YYYY-MM-DD check
    if (/^\d{4}[-\/]/.test(trimmed)) {
      const dIso = new Date(trimmed);
      if (!isNaN(dIso.getTime())) return dIso.getTime();
    }

    // Match DD/MM/YYYY, HH:MM AM/PM or DD-MM-YYYY, HH:MM AM/PM
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*,\s*|\s+)?(\d{1,2})?:?(\d{2})?:?(\d{2})?\s*(AM|PM|am|pm)?$/);
    if (dmyMatch) {
      let [_, dayStr, monthStr, yearStr, hoursStr, minutesStr, secondsStr, ampm] = dmyMatch;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-indexed
      const year = parseInt(yearStr, 10);
      let hours = hoursStr ? parseInt(hoursStr, 10) : 0;
      const minutes = minutesStr ? parseInt(minutesStr, 10) : 0;
      const seconds = secondsStr ? parseInt(secondsStr, 10) : 0;

      if (ampm) {
        const isPM = ampm.toUpperCase() === "PM";
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
      }
      const dParsed = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(dParsed.getTime())) return dParsed.getTime();
    }

    // Fallback standard Date parse
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
};

/**
 * Checks if the appraisal portal is currently open based on schedule object.
 * Returns { isOpen: boolean, reason: 'deactivated' | 'not_started' | 'closed' | 'open' }
 */
export const checkAppraisalPortalStatus = (sched) => {
  if (!sched) return { isOpen: true, reason: 'open' };
  if (sched.isActive === false) return { isOpen: false, reason: 'deactivated' };

  const now = Date.now();
  const startMs = parseAppraisalDateTime(sched.openTime);
  const endMs = parseAppraisalDateTime(sched.closeTime);

  if (startMs && now < startMs) {
    return { isOpen: false, reason: 'not_started' };
  }
  if (endMs && now > endMs) {
    return { isOpen: false, reason: 'closed' };
  }
  return { isOpen: true, reason: 'open' };
};

export default evaluateAppraisal;

