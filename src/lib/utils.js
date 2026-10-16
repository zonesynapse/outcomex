import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { deleteField } from "firebase/firestore";

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

export function compactAttendanceRecords(records) {
  if (!records || typeof records !== 'object') return {};
  const cleaned = {};

  for (const [recKey, recVal] of Object.entries(records)) {
    if (!recVal || typeof recVal !== 'object') continue;

    const parentTopic = (recVal.topicTaught || '').trim();
    const parentAid = (recVal.teachingAid || '').trim();
    const parentMethod = (recVal.teachingMethodology || '').trim();

    const rawStudents = recVal.students || {};
    let compactStudents = {};

    if (rawStudents && typeof rawStudents === 'object' && !Array.isArray(rawStudents)) {
      for (const [sKey, sVal] of Object.entries(rawStudents)) {
        if (!sVal) continue;
        let entry = typeof sVal === 'string' ? { status: sVal } : { ...sVal };

        // Strip student-level topic/aid/methodology if they match parent record or are empty
        if (entry.topicTaught && entry.topicTaught.trim() === parentTopic) delete entry.topicTaught;
        if (entry.teachingAid && entry.teachingAid === parentAid) delete entry.teachingAid;
        if (entry.teachingMethodology && entry.teachingMethodology === parentMethod) delete entry.teachingMethodology;

        if (entry.topicTaught === '') delete entry.topicTaught;
        if (entry.teachingAid === '') delete entry.teachingAid;
        if (entry.teachingMethodology === '') delete entry.teachingMethodology;

        compactStudents[sKey] = entry;
      }
    } else {
      compactStudents = rawStudents;
    }

    cleaned[recKey] = {
      ...recVal,
      students: compactStudents,
    };
  }

  return cleaned;
}

export function prepareAttendancePayload(updatedRecords, extraMeta = {}) {
  const safeRecords = updatedRecords && typeof updatedRecords === 'object' ? compactAttendanceRecords(updatedRecords) : {};
  const fullJson = JSON.stringify(safeRecords);

  // Safe chunk size limit per property (500 KB = 500,000 bytes)
  const CHUNK_SIZE = 500000;

  if (fullJson.length <= CHUNK_SIZE) {
    const payload = {
      records_json: fullJson,
      records: deleteField()
    };
    for (let i = 2; i <= 25; i++) {
      payload[`records_json_${i}`] = deleteField();
    }
    if (extraMeta) {
      Object.assign(payload, extraMeta);
    }
    return payload;
  }

  // Split updatedRecords entries into multiple JSON chunks <= CHUNK_SIZE
  const entries = Object.entries(safeRecords);
  const chunks = [];
  let currentChunk = {};
  let currentSize = 2; // For "{}"

  for (const [key, val] of entries) {
    const itemStr = JSON.stringify({ [key]: val });
    const itemLen = itemStr.length - 2; // Subtract length of outer {}
    if (currentSize + itemLen > CHUNK_SIZE && Object.keys(currentChunk).length > 0) {
      chunks.push(JSON.stringify(currentChunk));
      currentChunk = {};
      currentSize = 2;
    }
    currentChunk[key] = val;
    currentSize += itemLen + 1;
  }

  if (Object.keys(currentChunk).length > 0) {
    chunks.push(JSON.stringify(currentChunk));
  }

  const payload = {
    records_json: chunks[0] || "{}",
    records: deleteField()
  };

  for (let i = 1; i < chunks.length; i++) {
    payload[`records_json_${i + 1}`] = chunks[i];
  }

  for (let i = chunks.length + 1; i <= 25; i++) {
    payload[`records_json_${i}`] = deleteField();
  }

  if (extraMeta) {
    Object.assign(payload, extraMeta);
  }

  return payload;
}

export function normalizeDateStr(str) {
  if (!str) return '';
  const s = String(str).trim();
  // YYYY-M-D, YYYY-MM-DD, YYYY/M/D
  const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  }
  // D-M-YYYY, DD-MM-YYYY, D/M/YYYY
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m2) {
    return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }
  return s;
}

export function smartMergeStudentsMap(map1 = {}, map2 = {}) {
  const merged = { ...(typeof map1 === 'object' && map1 !== null ? map1 : {}) };
  if (!map2 || typeof map2 !== 'object') return merged;

  Object.entries(map2).forEach(([id, val2]) => {
    if (merged[id] === undefined) {
      merged[id] = val2;
      return;
    }
    const val1 = merged[id];
    const p1 = parseStudentAttendanceVal(val1);
    const p2 = parseStudentAttendanceVal(val2);

    // Present 'P' wins over Absent 'A', exempt '-', or empty
    if (p2?.status === 'P' && p1?.status !== 'P') {
      merged[id] = typeof val2 === 'object' ? { ...(typeof val1 === 'object' ? val1 : {}), ...val2 } : val2;
    } else if (p1?.status === 'P' && p2?.status !== 'P') {
      // keep val1, but enrich missing metadata from val2
      if (typeof val1 === 'object' && typeof val2 === 'object') {
        merged[id] = { ...val2, ...val1 };
      }
    } else if (p2?.status === 'OD' && p1?.status !== 'OD') {
      merged[id] = typeof val2 === 'object' ? { ...(typeof val1 === 'object' ? val1 : {}), ...val2 } : val2;
    } else if (p1?.status === 'OD' && p2?.status !== 'OD') {
      if (typeof val1 === 'object' && typeof val2 === 'object') {
        merged[id] = { ...val2, ...val1 };
      }
    } else if (p2?.status === 'A' && p1?.status === '-') {
      // Exempt marker wins over a stale Absent merged in from another doc
      // for the same class — keep the existing '-' record.
      if (typeof val1 === 'object' && typeof val2 === 'object') {
        merged[id] = { ...val2, ...val1 };
      }
      // else keep val1 (already in merged)
    } else if (typeof val1 === 'object' && typeof val2 === 'object') {
      merged[id] = { ...val1, ...val2 };
    } else {
      merged[id] = val2;
    }
  });
  return merged;
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
          const normD = normalizeDateStr(d);
          const key = String(d).includes('_P') ? `${normD}_P${p}` : `${normD}_P${p}`;
          if (!mergedRecords[key]) {
            mergedRecords[key] = item;
          } else {
            mergedRecords[key] = {
              ...item,
              ...mergedRecords[key],
              students: smartMergeStudentsMap(mergedRecords[key].students, item.students)
            };
          }
        }
      });
      return;
    }

    Object.entries(recObj).forEach(([rk, rVal]) => {
      if (!rVal || typeof rVal !== 'object') return;
      if (rk.startsWith('_') || rk.startsWith('records_json') || rk === 'records' || rk === 'records_chunks') return;

      let normKey = rk;
      const dateMatch = rk.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
      if (dateMatch) {
        const datePart = normalizeDateStr(dateMatch[1]);
        let periodPart = "1";
        const pMatch = rk.match(/_P(\d+)|_period_?(\d+)|_(\d+)$/i);
        if (pMatch) {
          periodPart = String(parseInt(pMatch[1] || pMatch[2] || pMatch[3] || "1", 10));
        } else if (rVal.period) {
          periodPart = String(parseInt(rVal.period, 10) || 1);
        }
        normKey = `${datePart}_P${periodPart}`;
      }

      if (!mergedRecords[normKey]) {
        mergedRecords[normKey] = rVal;
      } else {
        mergedRecords[normKey] = {
          ...rVal,
          ...mergedRecords[normKey],
          students: smartMergeStudentsMap(mergedRecords[normKey].students, rVal.students)
        };
      }
    });
  };

  // 1. Process primary records_json and any chunked records_json_2, records_json_3, ..., records_chunks
  Object.keys(attData).forEach(key => {
    if (key === 'records_json' || key.startsWith('records_json_') || key === 'records_chunks') {
      const val = attData[key];
      if (val !== undefined && val !== null) {
        if (typeof val === 'object') {
          processRecordObject(val);
        } else if (typeof val === 'string' && val.trim() !== '') {
          try {
            const parsed = JSON.parse(val);
            processRecordObject(parsed);
          } catch (e) {
            console.warn(`Failed to parse ${key}:`, e);
          }
        }
      }
    }
  });

  // 2. Process records field if present (legacy)
  if (attData.records) {
    processRecordObject(attData.records);
  }

  // 3. Process alternative array/object fields
  ['dailyRecords', 'attendanceRecords', 'sessions', 'history', 'dates', 'recordsMap'].forEach(field => {
    if (attData[field]) {
      processRecordObject(attData[field]);
    }
  });

  // 4. Process any root keys containing period records
  Object.entries(attData).forEach(([key, val]) => {
    if (key.startsWith('_') || key.startsWith('records_json') || key === 'records' || key === 'records_chunks' || key === 'students') return;
    if (val && typeof val === 'object' && (val.students || val.period || key.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/))) {
      let datePart = '';
      const dMatch = key.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
      if (dMatch) datePart = normalizeDateStr(dMatch[1]);
      else if (val.date) datePart = normalizeDateStr(String(val.date));
      else if (val.attendanceDate) datePart = normalizeDateStr(String(val.attendanceDate));

      if (datePart) {
        let periodPart = "1";
        const pMatch = key.match(/_P(\d+)|_period_?(\d+)|_(\d+)$/i);
        if (pMatch) {
          periodPart = String(parseInt(pMatch[1] || pMatch[2] || pMatch[3] || "1", 10));
        } else if (val.period) {
          periodPart = String(parseInt(val.period, 10) || 1);
        }
        const normKey = `${datePart}_P${periodPart}`;
        if (!mergedRecords[normKey]) {
          mergedRecords[normKey] = val;
        } else {
          mergedRecords[normKey] = {
            ...val,
            ...mergedRecords[normKey],
            students: smartMergeStudentsMap(mergedRecords[normKey].students, val.students)
          };
        }
      }
    }
  });

  if (attData.students && typeof attData.students === 'object' && Object.keys(attData.students).length > 0) {
    const rawLegacyDate = attData._meta?.date || attData.date || attData.attendanceDate || attData._date;
    if (rawLegacyDate) {
      const legacyDate = normalizeDateStr(rawLegacyDate);
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
        mergedRecords[legacyKey].students = smartMergeStudentsMap(mergedRecords[legacyKey].students, attData.students);
      }
    }
  }

  return mergedRecords;
}

export function parseStudentAttendanceVal(val) {
  if (val === undefined || val === null) return null;

  if (typeof val === 'string') {
    const s = val.trim().toUpperCase();
    if (s === '-' || s === '—' || s === 'NA' || s === 'N/A' || s === 'NONE' || s === 'NOT_ENROLLED' || s === 'EXEMPT') {
      return { status: '-', hours: 0, isNA: true };
    }
    if (s === 'P' || s === 'PRESENT' || s === '1' || s === 'TRUE' || s === 'PR') return { status: 'P', hours: 1 };
    if (s === 'A' || s === 'ABSENT' || s === '0' || s === 'FALSE' || s === 'AB') return { status: 'A', hours: 0 };
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

    if (status === '-' || status === '—' || status === 'NA' || status === 'N/A' || status === 'NONE' || status === 'NOT_ENROLLED' || status === 'EXEMPT' || val.isNA) {
      return {
        status: '-',
        hours: 0,
        isNA: true,
        topicTaught: val.topicTaught || val.topic || '',
        teachingAid: val.teachingAid || val.aid || '',
        teachingMethodology: val.teachingMethodology || val.methodology || ''
      };
    }

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

    if (status === 'PRESENT' || status === '1' || status === 'TRUE' || status === 'PR') status = 'P';
    if (status === 'ABSENT' || status === '0' || status === 'FALSE' || status === 'AB') status = 'A';
    if (status === 'ON DUTY' || status === 'ONDUTY' || status === '-1') status = 'OD';

    // No status signal and no hours at all (e.g. {} or {name} legacy entries):
    // this is NOT an attendance marking — return null so callers render '—'
    // instead of a false Absent.
    if (!status && hours === undefined) return null;

    // If status is 'P' (Present), hours must be at least 1!
    if (status === 'P') {
      hours = (hours !== undefined && !isNaN(hours) && hours > 0) ? hours : 1;
    } else if (status === 'OD') {
      hours = -1;
    } else if (status === 'A') {
      hours = 0;
    } else if (!status && hours !== undefined && !isNaN(hours)) {
      if (hours > 0) status = 'P';
      else if (hours === -1) status = 'OD';
      else status = 'A';
    }

    if (hours === undefined || isNaN(hours)) {
      if (status === 'P') hours = 1;
      else if (status === 'OD') hours = -1;
      else hours = 0;
    }
    if (!status) status = (hours > 0 ? 'P' : (hours === -1 ? 'OD' : 'A'));
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
    ...(/^UG$/i.test(progKey) || /undergraduate/i.test(programme) ? ['B.E.', 'B.Tech.', 'BE', 'BTech'] : []),
    ...(/^PG$/i.test(progKey) || /postgraduate/i.test(programme) ? ['M.E.', 'M.Tech.', 'MBA', 'MCA'] : [])
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
  const yearsMatch = String(batch).match(/(\d{4})\s*[-_]\s*(\d{2,4})/);
  const startYearMatch = String(batch).match(/\b(19\d{2}|20\d{2})\b/);
  const batchCandidates = new Set([
    batchClean,
    batchClean.replace(/_Batch_\([^)]+\)/i, '_Batch'),
    batchClean.replace(/_Batch/i, '')
  ].filter(Boolean));
  if (yearsMatch) {
    const by1 = yearsMatch[1];
    const rawBy2 = yearsMatch[2];
    const by2 = rawBy2.length === 2 ? `20${rawBy2}` : rawBy2;
    const shortBy2 = by2.slice(-2);
    batchCandidates.add(`${by1}-${by2}`);
    batchCandidates.add(`${by1}_${by2}`);
    batchCandidates.add(`${by1}-${shortBy2}`);
    batchCandidates.add(`${by1}_${shortBy2}`);
  }
  if (startYearMatch) {
    batchCandidates.add(startYearMatch[1]);
  }

  const ayClean = cleanKey(academicYear);
  const ayAlt = cleanKey(academicYear).replace(/-/g, '_');
  const ayCandidates = new Set([ayClean, ayAlt].filter(Boolean));
  const ayMatch = String(academicYear).match(/(\d{4})[-_/](\d{2,4})/);
  if (ayMatch) {
    const y1 = parseInt(ayMatch[1], 10);
    const rawY2 = ayMatch[2];
    const y2 = rawY2.length === 2 ? 2000 + parseInt(rawY2, 10) : parseInt(rawY2, 10);
    const shortY2 = String(y2).slice(-2);
    ayCandidates.add(`${y1}-${y2}`);
    ayCandidates.add(`${y1}_${y2}`);
    ayCandidates.add(`${y1}-${shortY2}`);
    ayCandidates.add(`${y1}_${shortY2}`);
    // Adjacent previous AY (vital for July semester transitions)
    ayCandidates.add(`${y1 - 1}-${y1}`);
    ayCandidates.add(`${y1 - 1}_${y1}`);
    ayCandidates.add(`${y1 - 1}-${String(y1).slice(-2)}`);
    ayCandidates.add(`${y1 - 1}_${String(y1).slice(-2)}`);
    // Adjacent next AY
    ayCandidates.add(`${y1 + 1}-${y2 + 1}`);
    ayCandidates.add(`${y1 + 1}_${y2 + 1}`);
    ayCandidates.add(`${y1 + 1}-${String(y2 + 1).slice(-2)}`);
  }
  // Allow empty AY for legacy doc IDs without academicYear
  ayCandidates.add('');

  const semCandidates = new Set([
    semNum,
    `Sem_${semNum}`,
    `Semester_${semNum}`,
    '' // allow empty semester for legacy doc IDs
  ]);

  const subCodes = Array.from(new Set([cleanKey(subjectCode), ...legacyCodes.map(cleanKey)].filter(Boolean)));
  const secSuffixes = Array.from(new Set([
    section ? `_${cleanKey(section)}` : '',
    ''
  ]));

  const candidateIds = new Set();
  // Ensure the primary canonical doc ID is always evaluated first!
  const canonicalSecSuffix = section ? `_${cleanKey(section)}` : '';
  const canonicalDocId = `${progKey}_${deptClean}_${batchClean}_${ayClean}_${semNum}_${cleanKey(subjectCode)}${canonicalSecSuffix}`;
  candidateIds.add(canonicalDocId);

  progCandidates.forEach(p => {
    deptCandidates.forEach(d => {
      [...batchCandidates].forEach(b => {
        [...ayCandidates].forEach(ay => {
          [...semCandidates].forEach(s => {
            subCodes.forEach(sub => {
              secSuffixes.forEach(sec => {
                const parts = [p, d, b, ay, s, sub].filter(Boolean);
                candidateIds.add(`${parts.join('_')}${sec}`);
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
    return at === 'exam' || at === 'written' || at === 'written test' || at === 'ia' || at.includes('ia') || at.includes('test');
  }
  const cat = String(qp.category || qp.selectedCategory || qp.selected_category || '').toLowerCase();
  if (cat) {
    if (/(assignment|activity|project|observation|record|survey|indirect|viva)/.test(cat)) return false;
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

export function getExamTag(s) {
  if (!s) return "";
  const str = String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (str.includes("ia1") || str.includes("cat1") || str.includes("internalassessment1")) return "ia1";
  if (str.includes("ia2") || str.includes("cat2") || str.includes("internalassessment2")) return "ia2";
  if (str.includes("ia3") || str.includes("cat3") || str.includes("internalassessment3")) return "ia3";
  if (str.includes("model")) return "model";
  if (str.includes("semester") || str.includes("endsem")) return "endsem";
  return str;
}

export function isSameExam(e1, e2) {
  if (!e1 || !e2) return false;
  if (String(e1).trim() === String(e2).trim()) return true;
  const tag1 = getExamTag(e1);
  const tag2 = getExamTag(e2);
  if (tag1 && tag2 && tag1 === tag2) return true;
  return false;
}

// Extract the regulation year embedded in an exam label, e.g.
// "IA 2 (AU - R2025)" → "2025". Returns "" when no regulation is present.
export function getExamRegYear(s) {
  const m = String(s || "").match(/R\s*(\d{4})/i);
  return m ? m[1] : "";
}

// Strict grouping key for an exam event: base tag + regulation year, e.g.
// "IA 2 (AU - R2025)" → "ia2__2025", "IA 2" → "ia2".
// Used so "IA 2 (AU - R2021)" and "IA 2 (AU - R2025)" NEVER collapse into one.
export function getExamGroupKey(s) {
  const tag = getExamTag(s) || String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = getExamRegYear(s);
  return y ? `${tag}__${y}` : tag;
}

// Strict exam-event matcher for the whole IA/QP flow (timetable authority).
// Same exam tag AND same regulation year when BOTH sides carry a regulation
// ("IA 2 (AU - R2021)" vs "IA 2 (AU - R2025)" → false: different exams).
// When EITHER side lacks a regulation (legacy docs / raw "IA 2"), falls back
// to base-tag equality so old saved timetables keep loading.
// Raw Firestore push-ids NEVER match each other (they carry no exam meaning);
// match by exam NAME, not by calendar event id.
export function isSameExamEvent(e1, e2) {
  if (!e1 || !e2) return false;
  if (String(e1).trim() === String(e2).trim()) return true;
  const y1 = getExamRegYear(e1);
  const y2 = getExamRegYear(e2);
  if (y1 && y2 && y1 !== y2) return false;
  const tag1 = getExamTag(e1);
  const tag2 = getExamTag(e2);
  if (tag1 && tag2 && tag1 === tag2) return true;
  return false;
}

// Single shared strict regulation matcher for the whole IA/QP flow.
// A syllabus/schedule document belongs to the target batch regulation when:
// exact match → AU-prefix-insensitive match → regulation-year match (R2025 vs R2021).
// Used by IAScheduleCreation, QPSetterAssignment, ExamCellQPReview and
// PrincipalIAScheduleView so every page resolves the SAME regulation subjects
// and no multi-regulation codes leak into one timetable.
export function matchRegulation(docReg, targetReg) {
  if (!targetReg) return true;
  if (!docReg) return false;

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const dNorm = norm(docReg);
  const tNorm = norm(targetReg);
  if (dNorm === tNorm) return true;

  const dClean = dNorm.replace(/^au/, "");
  const tClean = tNorm.replace(/^au/, "");
  if (dClean === tClean) return true;

  const getRegYear = (str) => {
    const m = String(str).match(/R\s*(\d{4})/i) || String(str).match(/(19|20)\d{2}/);
    return m ? m[1] || m[0] : null;
  };
  const dYear = getRegYear(docReg);
  const tYear = getRegYear(targetReg);
  if (dYear && tYear) return dYear === tYear;

  return false;
}

export const cleanStudentId = (id) => String(id || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const findStudentValInRecord = (studentsObj, studentIds) => {
  if (!studentsObj) return undefined;
  if (!Array.isArray(studentIds) || studentIds.length === 0) return undefined;

  // 1. Direct key match
  for (const id of studentIds) {
    if (id && studentsObj[id] !== undefined) return studentsObj[id];
  }

  const cleanTargetIds = new Set(studentIds.map(cleanStudentId).filter(Boolean));
  if (cleanTargetIds.size === 0) return undefined;

  // 2. Categorized collections: present / absent / od (support both Arrays and Objects)
  const presentCol = studentsObj.present || studentsObj.presentees || studentsObj.p;
  const absentCol = studentsObj.absent || studentsObj.absentees || studentsObj.a;
  const odCol = studentsObj.od || studentsObj.onDuty || studentsObj.on_duty;

  const matchesCollection = (col) => {
    if (!col) return false;
    if (Array.isArray(col)) {
      return col.some(x => {
        if (!x) return false;
        if (typeof x === 'string' || typeof x === 'number') return cleanTargetIds.has(cleanStudentId(x));
        const reg = x.reg || x.regNo || x.registerNo || x.admNo || x.admissionNo || x.id || x.studentId || '';
        return cleanTargetIds.has(cleanStudentId(reg));
      });
    }
    if (typeof col === 'object') {
      return Object.entries(col).some(([k, v]) => {
        if (cleanTargetIds.has(cleanStudentId(k))) return true;
        if (v && typeof v === 'object') {
          const reg = v.reg || v.regNo || v.registerNo || v.admissionNo || v.admNo || v.id || v.studentId || '';
          return cleanTargetIds.has(cleanStudentId(reg));
        }
        return false;
      });
    }
    return false;
  };

  if (matchesCollection(presentCol)) return { status: 'P', hours: 1 };
  if (matchesCollection(absentCol)) return { status: 'A', hours: 0 };
  if (matchesCollection(odCol)) return { status: 'OD', hours: -1 };

  // Absentee-only collection: if absentCol is populated but presentCol is empty/omitted,
  // students not in the absent list were present in this conducted class!
  const hasAbsentCol = absentCol && ((Array.isArray(absentCol) && absentCol.length > 0) || (typeof absentCol === 'object' && Object.keys(absentCol).length > 0));
  const hasPresentCol = presentCol && ((Array.isArray(presentCol) && presentCol.length > 0) || (typeof presentCol === 'object' && Object.keys(presentCol).length > 0));
  if (hasAbsentCol && !hasPresentCol) {
    return { status: 'P', hours: 1 };
  }

  // 3. Array of student items (strings or objects)
  if (Array.isArray(studentsObj)) {
    const match = studentsObj.find(item => {
      if (!item) return false;
      if (typeof item === 'string' || typeof item === 'number') {
        return cleanTargetIds.has(cleanStudentId(item));
      }
      const itemReg = item.reg || item.regNo || item.registerNo || item.admNo || item.admissionNo || item.rollNo || item.id || item.studentId || '';
      return cleanTargetIds.has(cleanStudentId(itemReg));
    });
    if (match !== undefined) {
      if (typeof match === 'string' || typeof match === 'number') return { status: 'P', hours: 1 };
      return match;
    }
  }

  // 4. Object keys normalized & deep value check
  if (typeof studentsObj === 'object' && !Array.isArray(studentsObj)) {
    for (const [k, v] of Object.entries(studentsObj)) {
      if (cleanTargetIds.has(cleanStudentId(k))) return v;
      if (v && typeof v === 'object') {
        const innerReg = v.reg || v.regNo || v.registerNo || v.admNo || v.admissionNo || v.rollNo || v.id || v.studentId || '';
        if (innerReg && cleanTargetIds.has(cleanStudentId(innerReg))) return v;
      }
    }

    // Absentee-only map: if every recorded entry in studentsObj is Absent,
    // unlisted enrolled students were present!
    const entries = Object.entries(studentsObj).filter(([k]) => !k.startsWith('_') && k !== 'totalHours' && k !== 'period');
    if (entries.length > 0 && entries.every(([, v]) => {
      const s = String(typeof v === 'object' && v ? (v.status || v.attendance || '') : v).trim().toUpperCase();
      return s === 'A' || s === 'ABSENT' || s === '0' || v === 0 || (typeof v === 'object' && v?.hours === 0 && s !== '-');
    })) {
      return { status: 'P', hours: 1 };
    }
  }

  return undefined;
};

export const extractSubjectCodeFromDocId = (docId) => {
  if (!docId) return '';
  const parts = String(docId).split('_');
  const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
  if (batchIdx >= 0 && batchIdx + 3 < parts.length) {
    return parts.slice(batchIdx + 3).join('_').replace(/_(Sec-\w+)$/, '');
  }
  return parts.slice(4).join('_');
};

/**
 * Shared canonical attendance processor for student views (Dashboard and Attendance page).
 * Guarantees 100% synchronized attendance percentages, exactly up to 8 periods/day,
 * and correct '-' isolation for parallel/elective subjects.
 */
export function calculateStudentAttendanceOverview({
  attDocs = [],
  enrolMap = {},
  studentIds = [],
  studentSection = '',
  joiningDate = '',
  facultyUidMap = {},
  facultyNames = {},
  subjectNames = {},
  maxPeriodsPerDay = 8
}) {
  const cleanTargetIds = new Set(studentIds.map(cleanStudentId).filter(Boolean));
  const studentSectionNorm = (studentSection || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // 1. Collect raw entries
  const rawEntries = [];
  attDocs.forEach(docSnap => {
    const id = docSnap.id || docSnap._id || '';
    if (!id) return;
    const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
    const records = getAttendanceRecords(data);
    if (!records || Object.keys(records).length === 0) return;

    const subjectCode = extractSubjectCodeFromDocId(id);

    // Section matching check: If attendance doc is for another section, check enrollment
    const docSecMatch = id.match(/_(Sec-[A-Za-z0-9]+)/i);
    const docSecNorm = docSecMatch ? docSecMatch[1].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';

    // Extract enrollment key for this doc
    const parts = id.split('_');
    const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
    let enrolKey = '';
    if (batchIdx >= 0 && batchIdx + 2 < parts.length) {
      const bKey = parts[batchIdx];
      const ayKey = parts[batchIdx + 1];
      const semNum = parts[batchIdx + 2];
      enrolKey = `${parts[0]}_${parts[1]}_${sanitizeKey(bKey)}_${sanitizeKey(ayKey)}_${semNum}_${sanitizeKey(subjectCode)}`;
    }

    const enrolledSet = enrolKey ? enrolMap[enrolKey] : null;
    const isExplicitlyEnrolled = enrolledSet && [...cleanTargetIds].some(sid => enrolledSet.has(sid));

    // If doc is for a different section and student is not explicitly enrolled in course_enrolments, skip doc
    if (docSecNorm && studentSectionNorm && docSecNorm !== studentSectionNorm && !isExplicitlyEnrolled) {
      return;
    }

    Object.entries(records).forEach(([key, rec]) => {
      let dateStr = '';
      let period = 1;
      const m = key.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})_+[pP](\d+)/i);
      if (m) {
        dateStr = normalizeDateStr(m[1]);
        period = parseInt(m[2], 10);
      } else {
        const dOnly = key.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
        if (dOnly) {
          dateStr = normalizeDateStr(dOnly[1]);
          period = parseInt(rec?.period, 10) || 1;
        }
      }
      if (!dateStr) return;

      // Lateral entry / joining date check: classes before joining date are skipped
      if (joiningDate && dateStr < joiningDate) return;

      const rawH = findStudentValInRecord(rec?.students, studentIds);
      const parsedVal = parseStudentAttendanceVal(rawH);

      let status = '-';
      if (parsedVal) {
        if (parsedVal.status === '-' || parsedVal.isNA || parsedVal.status === '—') {
          status = '-';
        } else if (parsedVal.status === 'OD' || parsedVal.hours === -1) {
          status = 'OD';
        } else if (parsedVal.status === 'P' || parsedVal.hours > 0) {
          status = 'P';
        } else if (parsedVal.status === 'A' || parsedVal.hours === 0) {
          status = 'A';
        } else {
          status = 'P';
        }
      } else if (rawH === undefined) {
        // If other students were marked in this doc, but this student was not in students map:
        // Student does not belong to this elective/parallel subject -> status '-'
        if (rec?.students && Object.keys(rec.students).length > 0) {
          status = '-';
        } else {
          const isMatchSec = !docSecNorm || (studentSectionNorm && docSecNorm === studentSectionNorm);
          if (isMatchSec || isExplicitlyEnrolled) {
            status = 'P';
          } else {
            return;
          }
        }
      }

      rawEntries.push({
        docId: id,
        subjectCode,
        dateStr,
        period,
        recordKey: key,
        status,
        markedBy: rec?.markedBy || '',
        isEvent: rec?.isEvent || false,
        eventName: rec?.eventName || '',
        enrolKey,
        isExplicitlyEnrolled
      });
    });
  });

  // Filter entries by course enrollment when enrollment docs exist
  const filteredEntries = rawEntries.filter(e => {
    if (e.enrolKey && enrolMap[e.enrolKey]) {
      return [...cleanTargetIds].some(id => enrolMap[e.enrolKey].has(id));
    }
    return true;
  });

  // Dedup SAME subject records ONLY (in case sectioned + unsectioned docs exist for same subject/period)
  const entriesBySubjRecord = {};
  filteredEntries.forEach(e => {
    const uniqueSubjKey = `${e.subjectCode}_${e.recordKey}`;
    if (!entriesBySubjRecord[uniqueSubjKey]) entriesBySubjRecord[uniqueSubjKey] = [];
    entriesBySubjRecord[uniqueSubjKey].push(e);
  });

  const resolvedEntries = [];
  Object.values(entriesBySubjRecord).forEach(group => {
    if (group.length === 1) {
      resolvedEntries.push(group[0]);
    } else {
      const best = group.find(e => e.docId.includes(`_${studentSection}`)) || group[0];
      resolvedEntries.push(best);
    }
  });

  // 1. Calculate subject-wise attendance (ONLY count classes where status !== '-')
  const subjectStats = {};
  resolvedEntries.forEach(entry => {
    if (entry.isEvent) return;

    if (!subjectStats[entry.subjectCode]) {
      subjectStats[entry.subjectCode] = {
        docId: entry.docId,
        subjectCode: entry.subjectCode,
        totalClasses: 0,
        attended: 0,
        odCount: 0
      };
    }
    // '-' means student did not take this subject/period -> do NOT increment totalClasses or absent
    if (entry.status !== '-') {
      subjectStats[entry.subjectCode].totalClasses += 1;
      if (entry.status === 'P') subjectStats[entry.subjectCode].attended += 1;
      if (entry.status === 'OD') subjectStats[entry.subjectCode].odCount += 1;
    }
  });

  const subjects = [];
  Object.values(subjectStats).forEach(s => {
    // If 0 classes conducted for this student in this subject (e.g. other elective/parallel subject), omit from active table
    if (s.totalClasses === 0) return;
    const effectiveClasses = Math.max(0, s.totalClasses - s.odCount);
    const pct = effectiveClasses > 0 ? (s.attended / effectiveClasses) * 100 : (s.odCount > 0 ? 100 : 0);
    const odPct = s.totalClasses > 0 ? (s.odCount / s.totalClasses) * 100 : 0;
    const facultyUid = facultyUidMap[s.subjectCode] || '';
    subjects.push({
      docId: s.docId,
      subjectCode: s.subjectCode,
      subjectName: subjectNames[s.subjectCode] || '',
      facultyName: facultyUid ? (facultyNames[facultyUid] || '') : '',
      totalClasses: s.totalClasses,
      attended: s.attended,
      odCount: s.odCount,
      percentage: pct,
      odPercentage: odPct,
    });
  });

  subjects.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

  // 2. Resolve date-wise rows per period slot (strictly capped at maxPeriodsPerDay = 8):
  // When parallel subjects occur in the same period, select the student's active subject ('P', 'A', 'OD') over '-'
  // If period > 8 (e.g. legacy P9 from timetable lunch-break shift), clamp to at most 8
  const datePeriodMap = {};
  resolvedEntries.forEach(entry => {
    if (!datePeriodMap[entry.dateStr]) datePeriodMap[entry.dateStr] = {};
    let p = parseInt(entry.period, 10) || 1;
    if (p > maxPeriodsPerDay) {
      p = maxPeriodsPerDay;
    }
    if (!datePeriodMap[entry.dateStr][p]) datePeriodMap[entry.dateStr][p] = [];
    datePeriodMap[entry.dateStr][p].push(entry);
  });

  const allRows = [];
  Object.entries(datePeriodMap).forEach(([dateStr, periodGroups]) => {
    const sortedPeriodNums = Object.keys(periodGroups).map(Number).sort((a, b) => a - b);
    sortedPeriodNums.forEach(p => {
      const group = periodGroups[p];
      let chosen = group[0];
      if (group.length > 1) {
        // 1. Prefer enrolled subject
        const enrolled = group.find(e => e.isExplicitlyEnrolled);
        // 2. Prefer active attendance ('P', 'A', 'OD') over exempt / other elective ('-')
        const active = group.find(e => e.status === 'P' || e.status === 'A' || e.status === 'OD');
        chosen = enrolled || active || group[0];
      }

      if (chosen.status === '-' && group.length > 1) {
        const active = group.find(e => e.status !== '-');
        if (active) chosen = active;
      }

      const isAttended = (chosen.status === 'P');
      if (chosen.isEvent) {
        allRows.push({
          date: dateStr,
          subject: '-',
          period: p,
          present: isAttended,
          status: chosen.status,
          isEvent: true,
          subjectName: chosen.eventName || '',
          facultyName: chosen.markedBy ? (facultyNames[chosen.markedBy] || '') : chosen.markedBy
        });
      } else {
        allRows.push({
          date: dateStr,
          subject: chosen.subjectCode,
          period: p,
          present: isAttended,
          status: chosen.status,
          isEvent: false,
          markedBy: chosen.markedBy,
          subjectName: subjectNames[chosen.subjectCode] || '',
          facultyName: chosen.markedBy ? (facultyNames[chosen.markedBy] || '') : (facultyUidMap[chosen.subjectCode] ? facultyNames[facultyUidMap[chosen.subjectCode]] : '')
        });
      }
    });
  });

  allRows.sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);

  // 3. Overall attendance metrics
  const total = subjects.reduce((s, r) => s + r.totalClasses, 0);
  const present = subjects.reduce((s, r) => s + r.attended, 0);
  const totalOd = subjects.reduce((s, r) => s + r.odCount, 0);
  const overallEffective = Math.max(0, total - totalOd);
  const overallPercentage = overallEffective > 0 ? (present / overallEffective) * 100 : (totalOd > 0 ? 100 : 0);

  return {
    subjects,
    dateWiseRows: allRows,
    totalClasses: total,
    totalPresent: present,
    totalOd,
    overallPercentage
  };
}



