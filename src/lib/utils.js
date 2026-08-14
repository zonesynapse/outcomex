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
  const parts = batch.split("-");
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
  if (!attData) return {};
  if (attData.records_json !== undefined && attData.records_json !== null) {
    if (typeof attData.records_json === 'object') return attData.records_json;
    if (typeof attData.records_json === 'string' && attData.records_json.trim() !== '') {
      try {
        const parsed = JSON.parse(attData.records_json);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        console.warn("Failed to parse records_json:", e);
      }
    }
  }
  if (attData.records && typeof attData.records === 'object' && Object.keys(attData.records).length > 0) {
    return attData.records;
  }
  // Backward compatibility: top-level students object (oldest single-record format)
  if (attData.students && typeof attData.students === 'object' && Object.keys(attData.students).length > 0) {
    const legacyDate = attData._meta?.date || attData.date || '2026-07-10';
    const legacyKey = legacyDate.includes('_P') ? legacyDate : `${legacyDate}_P1`;
    return {
      [legacyKey]: {
        period: "1",
        totalHours: attData._meta?.totalHours || 1,
        students: attData.students,
        topicTaught: attData.topicTaught || attData._meta?.topicTaught || "",
        teachingAid: attData.teachingAid || attData._meta?.teachingAid || "",
        teachingMethodology: attData.teachingMethodology || attData._meta?.teachingMethodology || "",
        markedBy: attData.markedBy || attData._meta?.markedBy || ""
      }
    };
  }
  return {};
}

export function parseStudentAttendanceVal(val) {
  if (val === undefined || val === null) return null;

  // 1. String format: "P", "A", "OD", "1", "0", "-1"
  if (typeof val === 'string') {
    const s = val.trim().toUpperCase();
    if (s === 'P' || s === 'PRESENT' || s === '1') return { status: 'P', hours: 1 };
    if (s === 'A' || s === 'ABSENT' || s === '0') return { status: 'A', hours: 0 };
    if (s === 'OD' || s === 'ON DUTY' || s === '-1') return { status: 'OD', hours: -1 };
    return { status: s || 'P', hours: 1 };
  }

  // 2. Number format: 1 (Present), 0 (Absent), -1 (OD)
  if (typeof val === 'number') {
    if (val > 0) return { status: 'P', hours: val };
    if (val === -1) return { status: 'OD', hours: -1 };
    return { status: 'A', hours: 0 };
  }

  // 3. Boolean format: true (Present), false (Absent)
  if (typeof val === 'boolean') {
    return val ? { status: 'P', hours: 1 } : { status: 'A', hours: 0 };
  }

  // 4. Object format: { status, hours, ... }
  if (typeof val === 'object') {
    let status = String(val.status || '').trim().toUpperCase();
    let hours = typeof val.hours === 'number' ? val.hours : (typeof val.hours === 'string' ? parseInt(val.hours, 10) : undefined);

    if (!status && hours !== undefined) {
      if (hours > 0) status = 'P';
      else if (hours === -1) status = 'OD';
      else status = 'A';
    }
    if (hours === undefined) {
      if (status === 'P') hours = 1;
      else if (status === 'OD') hours = -1;
      else hours = 0;
    }
    if (!status) status = 'P';
    return {
      status,
      hours,
      topicTaught: val.topicTaught || '',
      teachingAid: val.teachingAid || '',
      teachingMethodology: val.teachingMethodology || ''
    };
  }

  return null;
}


