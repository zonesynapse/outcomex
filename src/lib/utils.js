import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging tailwind classes
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function sanitizeKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]/ ]/g, '_');
}

export function formatProgrammeKey(p) {
  if (!p) return "";
  if (p === 'B.E.') return 'B_E';
  if (p === 'B.Tech.') return 'B_Tech';
  if (p === 'M.E.') return 'M_E';
  if (p === 'M.Tech.') return 'M_Tech';
  return String(p).replace(/[.#$[\]/ ]/g, '_');
}

export function formatProgDisplay(prog) {
  if (prog === 'B_E') return 'B.E.';
  if (prog === 'B_Tech') return 'B.Tech.';
  if (prog === 'M_E') return 'M.E.';
  if (prog === 'M_Tech') return 'M.Tech.';
  return prog;
}

export function formatDepartmentDisplay(dept, prog) {
  if (!dept) return prog ? formatProgDisplay(prog) : "";
  let str = String(dept).trim();

  if (str.startsWith("B_E_")) {
    str = "B.E. " + str.slice(4);
  } else if (str.startsWith("B_Tech_")) {
    str = "B.Tech. " + str.slice(7);
  } else if (str.startsWith("M_E_")) {
    str = "M.E. " + str.slice(4);
  } else if (str.startsWith("M_Tech_")) {
    str = "M.Tech. " + str.slice(7);
  }

  str = str.replace(/_/g, ' ');
  str = str.replace(/\s+/g, ' ').trim();

  if (prog && !str.toLowerCase().startsWith("b.e") && !str.toLowerCase().startsWith("b.tech") && !str.toLowerCase().startsWith("m.e") && !str.toLowerCase().startsWith("m.tech")) {
    const formattedProg = formatProgDisplay(prog);
    if (formattedProg && !str.startsWith(formattedProg)) {
      str = `${formattedProg} ${str}`;
    }
  }

  return str;
}

export function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatBatchDisplay(batch) {
  if (!batch) return "";
  // already canonical like "25 Batch (2025-29)" — return as-is to avoid double wrap
  if (/^\d{2}\s*Batch\s*\(/i.test(String(batch).trim())) return String(batch).trim();
  const parts = String(batch).split("-");
  const startYear = parseInt(parts[0]);
  if (isNaN(startYear)) return batch;
  const lastTwo = startYear % 100;

  let range = batch;
  if (parts.length === 2) {
    const endYear = parts[1];
    if (endYear.length === 4) {
      range = `${parts[0]}-${endYear.slice(-2)}`;
    }
  }

  return `${lastTwo} Batch (${range})`;
}

export function getRecentBatches(duration = 4) {
  const currentYear = new Date().getFullYear();
  const batches = [];
  // Show batches from 4 years ago to 1 year ahead
  for (let start = currentYear - 4; start <= currentYear + 1; start++) {
    const end = start + (parseInt(duration) || 4);
    batches.push(`${start}-${end}`);
  }
  return batches;
}

export function getAcademicYears(batch) {
  if (!batch) return [];
  const parts = batch.split("-").map(Number);
  const start = parts[0];
  const end = parts[1];
  const duration = end - start;
  return Array.from({ length: duration }, (_, i) => `${start + i}-${start + i + 1}`);
}

export function parseStudentDocId(id, availableProgrammes = []) {
  if (!id) return { batch: "", programme: "", department: "", section: "" };
  const parts = id.split('_');
  const batch = parts[0] || "";

  // Let's strip the batch part
  const remainingParts = parts.slice(1);
  if (remainingParts.length === 0) {
    return { batch, programme: "", department: "", section: "" };
  }

  // Check if last part is a section (starts with "Sec")
  let section = "";
  if (remainingParts.length > 1 && remainingParts[remainingParts.length - 1].toLowerCase().startsWith("sec")) {
    section = remainingParts.pop();
  }

  const commonProgKeys = ["B_Tech", "B_E", "M_Tech", "M_E", "B_Sc", "M_Sc", "B_C_A", "M_C_A", "B_B_A", "M_B_A", "B_Com", "M_Com", "B_A", "M_A"];
  const allProgKeys = Array.from(new Set([...commonProgKeys, ...availableProgrammes]));

  let matchedProgKey = "";
  for (let i = remainingParts.length - 1; i >= 1; i--) {
    const candidate = remainingParts.slice(0, i).join('_');
    if (allProgKeys.includes(candidate)) {
      matchedProgKey = candidate;
      remainingParts.splice(0, i);
      break;
    }
  }

  if (!matchedProgKey) {
    if (remainingParts.length >= 2) {
      if (remainingParts[0] === "B" || remainingParts[0] === "M" || remainingParts[0] === "b" || remainingParts[0] === "m") {
        matchedProgKey = `${remainingParts[0].toUpperCase()}_${remainingParts[1]}`;
        remainingParts.splice(0, 2);
      } else {
        matchedProgKey = remainingParts.shift() || "";
      }
    } else {
      matchedProgKey = remainingParts.shift() || "";
    }
  }

  const department = remainingParts.join('_') || "";

  return {
    batch,
    programme: matchedProgKey,
    department,
    section
  };
}

export function getAttendanceRecords(attData) {
  if (!attData || typeof attData !== 'object') return {};

  const mergedRecords = {};

  const processRecordObject = (recObj) => {
    if (!recObj || typeof recObj !== 'object') return;

    if (Array.isArray(recObj)) {
      recObj.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const d = item.date || item._date || item.attendanceDate;
        const p = item.period || item._period || (idx + 1);
        if (d) {
          const key = String(d).includes('_P') ? String(d) : `${d}_P${p}`;
          if (!mergedRecords[key]) mergedRecords[key] = item;
        }
      });
      return;
    }

    Object.entries(recObj).forEach(([rk, rVal]) => {
      if (!rVal || typeof rVal !== 'object') return;
      if (rk.startsWith('_') || rk === 'records_json' || rk === 'records') return;

      let normKey = rk;
      const dateMatch = rk.match(/^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})/);
      if (dateMatch) {
        let datePart = dateMatch[1];
        if (datePart.includes('/')) {
          const parts = datePart.split('/');
          if (parts[0].length === 4) datePart = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          else datePart = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        } else if (datePart.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [d, m, y] = datePart.split('-');
          datePart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        let periodPart = "1";
        const pMatch = rk.match(/_P(\d+)|_period_?(\d+)|_(\d+)$/i);
        if (pMatch) {
          periodPart = pMatch[1] || pMatch[2] || pMatch[3] || "1";
        } else if (rVal.period) {
          periodPart = String(rVal.period);
        }
        normKey = `${datePart}_P${periodPart}`;
      }

      if (!mergedRecords[normKey]) {
        mergedRecords[normKey] = rVal;
      } else {
        const existingStu = typeof mergedRecords[normKey].students === 'object' ? mergedRecords[normKey].students : {};
        const newStu = typeof rVal.students === 'object' ? rVal.students : {};
        mergedRecords[normKey] = {
          ...rVal,
          ...mergedRecords[normKey],
          students: { ...newStu, ...existingStu }
        };
      }
    });
  };

  if (attData.records_json !== undefined && attData.records_json !== null) {
    if (typeof attData.records_json === 'object') {
      processRecordObject(attData.records_json);
    } else if (typeof attData.records_json === 'string' && attData.records_json.trim() !== '') {
      try {
        const parsed = JSON.parse(attData.records_json);
        processRecordObject(parsed);
      } catch (e) {
        console.warn("Failed to parse records_json:", e);
      }
    }
  }

  if (attData.records) {
    processRecordObject(attData.records);
  }

  ['dailyRecords', 'attendanceRecords', 'sessions', 'history', 'dates', 'recordsMap'].forEach(field => {
    if (attData[field]) {
      processRecordObject(attData[field]);
    }
  });

  Object.entries(attData).forEach(([key, val]) => {
    if (key.startsWith('_') || key === 'records_json' || key === 'records' || key === 'students') return;
    if (val && typeof val === 'object' && (val.students || val.period || key.match(/^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})/))) {
      let datePart = '';
      const dMatch = key.match(/^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})/);
      if (dMatch) datePart = dMatch[1];
      else if (val.date) datePart = String(val.date);
      else if (val.attendanceDate) datePart = String(val.attendanceDate);

      if (datePart) {
        if (datePart.includes('/')) {
          const parts = datePart.split('/');
          if (parts[0].length === 4) datePart = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          else datePart = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        } else if (datePart.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [d, m, y] = datePart.split('-');
          datePart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        let periodPart = "1";
        const pMatch = key.match(/_P(\d+)|_period_?(\d+)|_(\d+)$/i);
        if (pMatch) {
          periodPart = pMatch[1] || pMatch[2] || pMatch[3] || "1";
        } else if (val.period) {
          periodPart = String(val.period);
        }
        const normKey = `${datePart}_P${periodPart}`;
        if (!mergedRecords[normKey]) {
          mergedRecords[normKey] = val;
        } else {
          const existingStu = typeof mergedRecords[normKey].students === 'object' ? mergedRecords[normKey].students : {};
          const newStu = typeof val.students === 'object' ? val.students : {};
          mergedRecords[normKey] = {
            ...val,
            ...mergedRecords[normKey],
            students: { ...newStu, ...existingStu }
          };
        }
      }
    }
  });

  if (attData.students && typeof attData.students === 'object' && Object.keys(attData.students).length > 0) {
    const legacyDate = attData._meta?.date || attData.date || '2026-07-10';
    const legacyKey = legacyDate.includes('_P') ? legacyDate : `${legacyDate}_P1`;
    if (!mergedRecords[legacyKey]) {
      mergedRecords[legacyKey] = {
        period: "1",
        totalHours: attData._meta?.totalHours || 1,
        students: attData.students,
        topicTaught: attData.topicTaught || attData._meta?.topicTaught || "",
        teachingAid: attData.teachingAid || attData._meta?.teachingAid || "",
        teachingMethodology: attData.teachingMethodology || attData._meta?.teachingMethodology || "",
        markedBy: attData.markedBy || attData._meta?.markedBy || ""
      };
    } else {
      const existingStu = typeof mergedRecords[legacyKey].students === 'object' ? mergedRecords[legacyKey].students : {};
      const newStu = typeof attData.students === 'object' ? attData.students : {};
      mergedRecords[legacyKey].students = { ...newStu, ...existingStu };
    }
  }

  return mergedRecords;
}

export function parseStudentAttendanceVal(val) {
  if (val === undefined || val === null) return null;

  if (typeof val === 'string') {
    const s = val.trim().toUpperCase();
    if (s === 'P' || s === 'PRESENT' || s === '1' || s === 'TRUE') return { status: 'P', hours: 1 };
    if (s === 'A' || s === 'ABSENT' || s === '0' || s === 'FALSE') return { status: 'A', hours: 0 };
    if (s === 'OD' || s === 'ON DUTY' || s === 'ONDUTY' || s === '-1') return { status: 'OD', hours: -1 };
    return { status: s || 'P', hours: 1 };
  }

  if (typeof val === 'number') {
    if (val > 0) return { status: 'P', hours: val };
    if (val === -1) return { status: 'OD', hours: -1 };
    return { status: 'A', hours: 0 };
  }

  if (typeof val === 'boolean') {
    return val ? { status: 'P', hours: 1 } : { status: 'A', hours: 0 };
  }

  if (typeof val === 'object') {
    let status = String(val.status || val.attendance || val.mark || val.val || val.value || '').trim().toUpperCase();
    let hours = typeof val.hours === 'number' ? val.hours : (typeof val.hours === 'string' ? parseInt(val.hours, 10) : undefined);

    if (val.isPresent !== undefined && !status) {
      status = val.isPresent ? 'P' : 'A';
    }
    if (val.present !== undefined && !status) {
      status = val.present ? 'P' : 'A';
    }
    if (val.absent !== undefined && !status) {
      status = val.absent ? 'A' : 'P';
    }
    if (val.od !== undefined && val.od && !status) {
      status = 'OD';
    }
    if (val.onDuty !== undefined && val.onDuty && !status) {
      status = 'OD';
    }

    if (status === 'PRESENT' || status === '1' || status === 'TRUE') status = 'P';
    if (status === 'ABSENT' || status === '0' || status === 'FALSE') status = 'A';
    if (status === 'ON DUTY' || status === 'ONDUTY' || status === '-1') status = 'OD';

    if (!status && hours !== undefined) {
      if (hours > 0) status = 'P';
      else if (hours === -1) status = 'OD';
      else status = 'A';
    }
    if (hours === undefined || isNaN(hours)) {
      if (status === 'P') hours = 1;
      else if (status === 'OD') hours = -1;
      else hours = 0;
    }
    if (!status) status = 'P';
    return {
      status,
      hours,
      topicTaught: val.topicTaught || val.topic || '',
      teachingAid: val.teachingAid || val.aid || '',
      teachingMethodology: val.teachingMethodology || val.methodology || ''
    };
  }

  return null;
}

export function getAllCandidateAttendanceDocIds({ programme, department, batch, academicYear, semester, subjectCode, legacyCodes = [], section = '' }) {
  if (!programme || !department || !batch || !subjectCode) return [];

  const norm = str => String(str || '').trim();
  const cleanKey = str => String(str || '').replace(/[.#$[\]]/g, '_');

  const semNum = String(semester || '').match(/\d+/)?.[0] || '1';

  const progKey = formatProgrammeKey(programme);
  const progCandidates = Array.from(new Set([
    progKey,
    cleanKey(programme),
    norm(programme),
    'UG', 'PG', 'B.Tech.', 'B.E.', 'BE', 'BTech', 'M.E.', 'M.Tech.', 'MBA', 'MCA'
  ].filter(Boolean)));

  const deptClean = cleanKey(department);
  const deptNoDegree = cleanKey(department.replace(/^(B\.?Tech\.?|B\.?E\.?|M\.?E\.?|M\.?Tech\.?|MBA|MCA)\s+/i, ''));
  let deptAcronym = '';
  const matchAcronym = department.match(/\(([^)]+)\)/);
  if (matchAcronym) {
    deptAcronym = cleanKey(matchAcronym[1]);
  } else {
    const words = department.replace(/^(B\.?Tech\.?|B\.?E\.?|M\.?E\.?|M\.?Tech\.?|MBA|MCA)\s+/i, '').split(/[\s&/_-]+/);
    if (words.length > 1) {
      deptAcronym = cleanKey(words.map(w => w[0]).join(''));
    }
  }
  const deptCandidates = Array.from(new Set([
    deptClean,
    deptNoDegree,
    deptAcronym,
    deptAcronym.replace(/_/g, ''),
    deptAcronym.replace(/_/g, '&')
  ].filter(Boolean)));

  const batchClean = cleanKey(batch);
  const yearsMatch = String(batch).match(/\d{4}\s*[-_]\s*\d{2,4}/);
  const startYearMatch = String(batch).match(/\b\d{2,4}\b/);
  const batchYearStr = yearsMatch ? cleanKey(yearsMatch[0]) : (startYearMatch ? cleanKey(startYearMatch[0]) : '');
  const batchCandidates = Array.from(new Set([
    batchClean,
    batchYearStr,
    batchClean.replace(/_Batch_\([^)]+\)/i, '_Batch'),
    batchClean.replace(/_Batch/i, '')
  ].filter(Boolean)));

  const ayClean = cleanKey(academicYear);
  const ayAlt = cleanKey(academicYear).replace(/-/g, '_');
  const ayCandidates = Array.from(new Set([ayClean, ayAlt].filter(Boolean)));

  const semCandidates = Array.from(new Set([semNum, `Sem_${semNum}`, `Semester_${semNum}`]));

  const subCodes = Array.from(new Set([cleanKey(subjectCode), ...legacyCodes.map(cleanKey)].filter(Boolean)));

  const secSuffixes = Array.from(new Set([
    section ? `_${cleanKey(section)}` : '',
    ''
  ]));

  const candidateIds = new Set();

  progCandidates.forEach(p => {
    deptCandidates.forEach(d => {
      batchCandidates.forEach(b => {
        ayCandidates.forEach(ay => {
          semCandidates.forEach(s => {
            subCodes.forEach(sub => {
              secSuffixes.forEach(sec => {
                const id = `${p}_${d}_${b}_${ay}_${s}_${sub}${sec}`;
                candidateIds.add(id);
              });
            });
          });
        });
      });
    });
  });

  return Array.from(candidateIds);
}

/**
 * Parse a subject field that may be a JSON string or plain string.
 * Returns { code, name, category }.
 */
export function parseSubjectField(subject) {
  if (!subject) return { code: '', name: '', category: '' };
  const raw = String(subject).trim();
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      return {
        code: obj.code || obj.subject_code || '',
        name: obj.name || obj.subject_name || '',
        category: obj.category || ''
      };
    }
  } catch { /* not JSON */ }
  return { code: raw, name: '', category: '' };
}

/**
 * Format Question Paper Set display (e.g., "Set 1", "Set 2", "Set A").
 */
export function formatQPSetDisplay(qp) {
  if (!qp) return "Set 1";
  const s = qp.qp_set || qp.qpSet || qp.set || qp.selectedSet || qp.set_name || qp.setName;
  if (s && String(s).trim()) {
    const val = String(s).trim();
    return val.toLowerCase().startsWith('set') ? val : `Set ${val}`;
  }
  const idStr = String(qp.id || qp.docId || qp.compositeKey || "");
  const matchSet = idStr.match(/_Set_Set(\d+|[A-Z]+)/i) || idStr.match(/_Set_(\d+|[A-Z]+)/i) || idStr.match(/Set_(\d+|[A-Z]+)/i) || idStr.match(/Set(\d+|[A-Z]+)/i);
  if (matchSet && matchSet[1]) {
    return `Set ${matchSet[1]}`;
  }
  return "Set 1";
}

export function isWrittenTestQp(qp) {
  if (!qp) return false;
  const at = String(qp.assessment_type || qp.assessmentType || '').toLowerCase();
  if (at) {
    return at === 'exam' || at === 'written' || at === 'written test';
  }
  const cat = String(qp.category || qp.selectedCategory || qp.selected_category || qp.exam_name || qp.qpaper_name || '').toLowerCase();
  if (cat) {
    if (/(assignment|activity|project|practical|observation|record|survey|indirect|viva|lab)/.test(cat)) return false;
    return true;
  }
  return true;
}

export function isMasterOrAdmin(role, email) {
  const r = String(role || '').toLowerCase().trim();
  const e = String(email || '').toLowerCase().trim();
  if (r.includes('master') || r.includes('admin') || r === 'super admin' || r === 'system admin') return true;
  if (e && (e.includes('admin') || e.includes('master'))) return true;
  return false;
}

