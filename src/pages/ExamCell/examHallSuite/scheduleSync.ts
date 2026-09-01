import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { ExamSchedule, Student, Department } from '../../../types';

const normCodeKey = (s: any) => String(s || '').toUpperCase().replace(/\s+/g, '');
const sanitizeKey = (key: any) => (!key ? '' : String(key).replace(/[.#$[\]/ ]/g, '_'));
const normBatch = (b: any) => String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function deriveBatchFromSemester(semester?: number, academicYear?: string, programmeOrDept?: string): string {
  let ayStart = 2026;
  if (academicYear) {
    const match = String(academicYear).match(/^(\d{4})/);
    if (match) ayStart = parseInt(match[1], 10);
  }
  const semNum = Number(semester) || 1;
  const yearsAgo = Math.floor((semNum - 1) / 2);
  const startYear = ayStart - yearsAgo;

  const pLower = String(programmeOrDept || '').toLowerCase();
  const isPG = pLower.includes('mba') || pLower.includes('m.e') || pLower.includes('m.tech') || pLower.includes('mtech') || pLower.includes('pg');
  const duration = isPG ? 2 : 4;
  const endYear = startYear + duration;
  return `${startYear}-${endYear}`;
}

export function deriveSemesterFromBatch(batch?: string, academicYear?: string, programmeOrDept?: string): number {
  if (!batch) return 0;
  const m = String(batch).match(/(\d{4})/);
  if (!m) return 0;
  const batchStart = parseInt(m[1], 10);
  let ayStart = 2026;
  if (academicYear) {
    const ayM = String(academicYear).match(/^(\d{4})/);
    if (ayM) ayStart = parseInt(ayM[1], 10);
  }
  const yearIndex = ayStart - batchStart;
  if (yearIndex < 0 || yearIndex > 5) return 0;
  // Default to Odd semester for the year (7,5,3,1) – batch namelist is valid for that year
  return yearIndex * 2 + 1;
}

// Robust parser for Firestore student namelist docs: "2023-2027_UG_B_E_ Computer Science and Engineering_Sec-A"
function parseStudentDocId(docId: string, meta: any, data: any) {
  let batch = meta?.batch || meta?.Batch || meta?.batch_name || data?.batch || '';
  let department = meta?.department || meta?.dept || meta?.department_name || data?.department || data?.dept || '';
  let programme = meta?.programme || meta?.programme_name || meta?.prog || data?.programme || data?.prog || '';
  let semester: number | undefined = meta?.semester ?? meta?.sem ?? data?.semester ?? data?.sem;
  if (semester !== undefined) semester = parseInt(String(semester).replace(/[^0-9]/g, ''), 10) || undefined;
  let section = meta?.section || data?.section || '';

  const batchMatch = String(docId).match(/(\d{4}-\d{4}|\d{4}-\d{2})/);
  if (!batch && batchMatch) batch = batchMatch[1].replace('_', '-');

  const secMatch = String(docId).match(/(Sec-[A-Z0-9]+)/i);
  if (!section && secMatch) section = secMatch[1];

  // Isolate middle part between batch and section
  if ((!department || !programme) && docId) {
    let isolated = String(docId);
    if (batch) {
      const idx = isolated.indexOf(batch);
      if (idx >= 0) {
        isolated = isolated.slice(idx + batch.length);
        isolated = isolated.replace(/^[_-]+/, '');
      }
    }
    if (section) {
      const sIdx = isolated.lastIndexOf(section);
      if (sIdx >= 0) isolated = isolated.slice(0, sIdx).replace(/[_-]+$/, '');
    }
    // Programme prefix UG/PG
    const progM = isolated.match(/^(UG|PG)(?:[_-]|$)/i);
    if (progM && !programme) {
      programme = progM[1].toUpperCase();
      isolated = isolated.slice(progM[0].length);
    }
    // Degree prefix B_E_, B_Tech_, M_E_, M_Tech_, Master...
    const degreePrefs = ['B_E_', 'B_Tech_', 'B_Tech', 'M_E_', 'M_Tech_', 'M_Tech', 'B_E', 'M_E'];
    for (const pref of degreePrefs) {
      if (isolated.startsWith(pref)) {
        isolated = isolated.slice(pref.length).replace(/^[_-]+/, '');
        break;
      }
    }
    // Strip leading UG/PG that may remain after degree strip (e.g., "UG_B_E_" case already handled)
    if (!department) {
      let deptCandidate = isolated.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      // Remove stray leading programme token if still present
      deptCandidate = deptCandidate.replace(/^(UG|PG)\s+/i, '').trim();
      if (deptCandidate) department = deptCandidate;
    }
  }

  // Semester fallback from docId "_semX"
  if (!semester) {
    const semM = String(docId).match(/_sem\s*(\d)/i);
    if (semM) semester = parseInt(semM[1], 10);
  }

  return { batch: batch || '', department: department || '', programme: programme || '', section: section || '', semester };
}

export interface ScheduleSyncResult {
  exams: ExamSchedule[];
  students: Student[];
  loading: boolean;
}

/**
 * Normalizes date strings to YYYY-MM-DD format
 */
export const normalizeDateStr = (raw: any): string => {
  if (!raw) return '';
  let str = String(raw).trim();
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return str;
};

// Convert 24h string ("09:30" or "14:00") to 12h formatted string ("09:30 AM" or "02:00 PM")
export const format12HourStr = (time24: string): string => {
  if (!time24) return '';
  if (time24.includes('AM') || time24.includes('PM')) return time24.trim();
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const formattedH = String(h).padStart(2, '0');
  return `${formattedH}:${mStr || '00'} ${ampm}`;
};

/**
 * Clean time slot string into clean range e.g. "09:30 AM - 11:30 AM"
 */
export const formatCleanTimeSlot = (startTime?: string, endTime?: string, rawSlot?: string): string => {
  if (startTime && endTime) {
    const s12 = format12HourStr(startTime);
    const e12 = format12HourStr(endTime);
    return `${s12} - ${e12}`;
  }
  if (rawSlot) {
    let s = String(rawSlot)
      .replace(/^(FN|AN)\s*/gi, '')
      .replace(/[()]/g, '')
      .trim();
    if (s) return s;
  }
  return '';
};

/**
 * Authoritative semester number resolver:
 * Step 1: Explicit semester property in record / document metadata
 * Step 2: Live syllabus_data semester mapping (from Curriculum.jsx)
 * Step 3: Anna University & 2025 Regulation Subject Code Regex Heuristics
 */
export const resolveSemesterNumber = (
  rec: any,
  docMeta?: any,
  code?: string,
  syllabusSemMap?: Record<string, number>
): number => {
  const normC = normCodeKey(code);

  // Step 1: Explicit semester in record or docMeta
  const rawSem =
    rec?.semester ||
    rec?.sem ||
    rec?.semesterNum ||
    rec?.semNo ||
    rec?.sem_no ||
    rec?.semester_num ||
    docMeta?.semester ||
    docMeta?.sem ||
    docMeta?.semesterNum ||
    docMeta?.semNo;

  if (rawSem) {
    const parsed = parseInt(String(rawSem).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 8) return parsed;
  }

  // Step 2: Syllabus master map (Curriculum.jsx)
  if (syllabusSemMap && normC && syllabusSemMap[normC]) {
    const sSem = syllabusSemMap[normC];
    if (sSem >= 1 && sSem <= 8) return sSem;
  }

  // Step 3: Anna University & 2025 Regulation Subject Code Regex Heuristics
  if (code) {
    const codeStr = String(code).toUpperCase().trim();

    // Anna University 2025 Regulation: CS25C11, AD25C01, MA25C03, MA25C04, MA25C05, AP25002, CE25301 -> Sem 3
    if (/\b[A-Z]{2,4}25[C0-9]\d{2,3}\b/.test(codeStr) || codeStr.includes('25C') || codeStr.includes('2530')) {
      return 3;
    }

    // Standard Anna University 4-digit UG & PG codes
    const match = codeStr.match(/^[A-Z]{2,4}(\d)(\d)(\d{2})/);
    if (match) {
      const yrDigit = parseInt(match[1], 10);
      const semDigit = parseInt(match[2], 10);

      if (yrDigit === 5) {
        if (semDigit >= 1 && semDigit <= 4) return semDigit;
        return 1;
      }

      if (semDigit >= 1 && semDigit <= 8) return semDigit;

      if (semDigit === 0) {
        if (codeStr.includes('3021') || codeStr.includes('8')) return 8;
        if (codeStr.includes('3035')) return 5;
        if (yrDigit === 3) return 5;
        if (yrDigit === 4) return 7;
      }

      if (yrDigit >= 1 && yrDigit <= 8) return yrDigit;
    }
  }

  return 0;
};



const extractBatchAndSemesterFromDoc = (docId: string, meta: any) => {
  let batch = meta?.batch || '';
  let semester = parseInt(String(meta?.semester || meta?.sem || ''), 10) || 0;

  if (!batch && docId) {
    const match = docId.match(/(20\d{2}[-_]\d{2,4}|\d{2}[-_]\d{2})/);
    if (match) batch = match[1];
  }

  if (!semester && docId) {
    const semMatch = docId.match(/_sem?(\d)(?:_|$)/i) || docId.match(/_(\d)(?:_|$)/) || docId.match(/_(\d)$/);
    if (semMatch) {
      semester = parseInt(semMatch[1], 10);
    }
  }

  if (semester > 0 && !batch) {
    batch = deriveBatchFromSemester(semester, meta?.programme);
  }

  // No hardcoded batch->semester inference — use only Firestore values

  return { batch, semester };
};

/**
 * Real-time listener for Firestore exam schedules (`qp_setter_assignments` & `ia_schedules`)
 */
export const subscribeToRealtimeSchedules = (
  onDataLoaded: (data: ScheduleSyncResult) => void
) => {
  let qpSetterDocs: any[] = [];
  let iaScheduleDocs: any[] = [];
  let syllabusSemMap: Record<string, number> = {};
  let courseEnrolmentsMap: Record<string, Record<string, boolean>> = {};
  let masterStudentList: Array<{ regNo: string; name: string; batch: string; semester?: number; department?: string; programme?: string; section?: string }> = [];
  let dynamicDeptShortMap: Record<string, string> = {}; // normFullDept -> short code e.g. "becivilengineering" -> "CIVIL"

  const resolveDeptShort = (raw: any): string => {
    const s = String(raw || '').trim();
    if (!s) return '';
    const norm = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (dynamicDeptShortMap[norm]) return dynamicDeptShortMap[norm];
    // fallback: find short code whose keywords appear in raw
    for (const [k, v] of Object.entries(dynamicDeptShortMap)) {
      if (norm.includes(k) || k.includes(norm)) return v;
    }
    // No mapping yet — return raw short (e.g. "MBA" stays "MBA", "B.E. Civil Engineering" stays as is for display)
    // Keep raw but trim to first meaningful token if too long? Keep as is.
    return s;
  };

  const processAndEmit = () => {
    const scheduledSubjectMap = new Map<string, {
      code: string;
      name: string;
      examTitle: string;
      examDate: string;
      session: 'FN' | 'AN';
      startTime: string;
      endTime: string;
      timeSlot: string;
      department: Department;
      programme: string;
      semester: number;
      batch: string;
      academicYear: string;
    }>();

    const processAssignmentRecord = (rec: any, defaultDept?: string, defaultBatch?: string, docMeta?: any) => {
      if (!rec || typeof rec !== 'object') return;

      const rawDate = rec.examDate || rec.exam_date || rec.date || rec.assignedDate;
      if (!rawDate) return;

      const examDate = normalizeDateStr(rawDate);
      if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return;

      const startTime = rec.startTime || rec.start_time || '09:30';
      const endTime = rec.endTime || rec.end_time || '11:30';
      let session: 'FN' | 'AN' = (rec.slot || rec.session || '').toUpperCase() as any;
      if (!['FN', 'AN'].includes(session)) {
        const h = parseInt(startTime.split(':')[0], 10);
        session = !isNaN(h) && h >= 12 ? 'AN' : 'FN';
      }

      const code = (rec.code || rec.subjectCode || rec.courseCode || '').toUpperCase().trim();
      if (!code) return;

      const name = rec.name || rec.subjectName || rec.courseName || code;
      const rawDeptStr = rec.department || rec.dept || defaultDept || '';
      const department = rawDeptStr as Department;

      let programme = rec.programme || rec.prog || docMeta?.programme || docMeta?.progKey || '';
      programme = String(programme).trim();

      const examTitle =
        rec.examTitle ||
        rec.examName ||
        rec.exam_name ||
        rec.title ||
        docMeta?.examTitle ||
        docMeta?.examName ||
        docMeta?.title ||
        'Continuous Internal Assessment';

      const semNum = resolveSemesterNumber(rec, docMeta, code, syllabusSemMap);
      const batch = rec.batch || defaultBatch || docMeta?.batch || deriveBatchFromSemester(semNum, programme);
      const ay = rec.academicYear || docMeta?.academicYear || '2025-26';
      const timeSlot = formatCleanTimeSlot(startTime, endTime, rec.timeSlot);

      const dedupKey = `${examDate}_${session}_${normCodeKey(code)}`;

      if (!scheduledSubjectMap.has(dedupKey)) {
        scheduledSubjectMap.set(dedupKey, {
          code,
          name,
          examTitle,
          examDate,
          session,
          startTime,
          endTime,
          timeSlot,
          department,
          programme,
          semester: semNum,
          batch,
          academicYear: ay,
        });
      }
    };

    // Helper to extract semester & metadata from doc.id (e.g. UG_B_E__Bio_Medical_Engineering_2024-2028_2026-2027_5)
    const extractDocMeta = (docId: string, dData: any) => {
      const meta = dData._meta || {};
      let semester = meta.semester || meta.sem || dData.semester || dData.sem;
      let department = meta.department || meta.dept || dData.department || dData.dept;
      let batch = meta.batch || dData.batch;

      if (docId) {
        if (!batch) {
          const bMatch = docId.match(/(20\d{2}[-_]\d{2,4}|\d{2}[-_]\d{2})/);
          if (bMatch) batch = bMatch[1].replace('_', '-');
        }

        if (!department) {
          const cleanId = docId.replace(/^UG_|^PG_|^B_E__|^B_Tech__|^M_E__/gi, '');
          const parts = cleanId.split('_').filter(Boolean);
          const deptParts: string[] = [];
          for (const p of parts) {
            if (/^\d{4}(-\d{2,4})?$/.test(p)) continue;
            if (/^\d+$/.test(p)) continue;
            if (['UG', 'PG', 'BE', 'B_E', 'BTECH', 'B_TECH', 'MBA', 'PG_MBA', 'ME', 'M_E', 'MTECH', 'M_TECH', 'DEFAULT'].includes(p.toUpperCase())) continue;
            deptParts.push(p);
          }
          if (deptParts.length > 0) {
            department = deptParts.join(' ');
          }
        }

        if (!semester) {
          const semMatch = docId.match(/_sem?(\d)(?:_|$)/i) || docId.match(/_(\d)(?:_|$)/) || docId.match(/_(\d)$/);
          if (semMatch) {
            semester = parseInt(semMatch[1], 10);
          }
        }
      }

      department = resolveDeptShort(department);

      return {
        ...meta,
        semester: semester || meta.semester,
        batch: batch || meta.batch,
        department: department || meta.department,
      };
    };

    // Parse qp_setter_assignments docs
    qpSetterDocs.forEach((dData) => {
      const meta = extractDocMeta(dData.id || '', dData);
      const batch = meta.batch || dData.batch;
      const dept = meta.department || dData.department;

      if (dData.assignments && typeof dData.assignments === 'object') {
        Object.values(dData.assignments).forEach((val) => processAssignmentRecord(val, dept, batch, meta));
      }
      Object.entries(dData).forEach(([k, v]) => {
        if (k !== 'assignments' && !k.startsWith('_')) {
          processAssignmentRecord(v, dept, batch, meta);
        }
      });
    });

    // Parse ia_schedules docs
    iaScheduleDocs.forEach((dData) => {
      const meta = dData._meta || dData;
      if (dData.timetable && typeof dData.timetable === 'object') {
        Object.values(dData.timetable).forEach((val) => processAssignmentRecord(val, undefined, undefined, meta));
      }
      if (dData.schedules && Array.isArray(dData.schedules)) {
        dData.schedules.forEach((val: any) => processAssignmentRecord(val, undefined, undefined, meta));
      }
    });

    const scheduledItems = Array.from(scheduledSubjectMap.values());

    // Group items by date & session -> Create ExamSchedule objects
    const examMap = new Map<string, {
      id: string;
      name: string;
      date: string;
      session: 'FN' | 'AN';
      timeSlot: string;
      semesters: Set<number>;
      departments: Set<Department>;
      items: typeof scheduledItems;
    }>();

    scheduledItems.forEach((item) => {
      const key = `${item.examDate}_${item.session}`;
      if (!examMap.has(key)) {
        examMap.set(key, {
          id: `exam-${key}`,
          name: item.examTitle || `Continuous Internal Assessment`,
          date: item.examDate,
          session: item.session,
          timeSlot: item.timeSlot,
          semesters: new Set<number>(),
          departments: new Set<Department>(),
          items: [],
        });
      }
      const ex = examMap.get(key)!;
      if (item.examTitle) {
        ex.name = item.examTitle;
      }
      if (item.semester && item.semester > 0) {
        ex.semesters.add(item.semester);
      }
      ex.departments.add(item.department);
      ex.items.push(item);
    });

    const examsList: ExamSchedule[] = Array.from(examMap.values())
      .sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session))
      .map((ex) => {
        const sortedSems = Array.from(ex.semesters).sort((a, b) => a - b);
        const semDisplay = sortedSems.length > 0 ? sortedSems.join(', ') : '';
        return {
          id: ex.id,
          name: ex.name,
          date: ex.date,
          session: ex.session,
          timeSlot: ex.timeSlot,
          semester: sortedSems[0] || 0,
          semesterDisplay: semDisplay,
          departments: Array.from(ex.departments),
          status: 'Scheduled' as const,
          selectedHallIds: [],
          items: ex.items,
        };
      });

    // Fetch 100% real student register numbers — must be IDENTICAL to
    // PrincipalIAScheduleView.getSubjectRegNoRange() so hall regs == range regs.
    const generatedStudents: Student[] = [];
    const addedRegs = new Set<string>();

    const normAlpha = (str: any) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Build fast lookup maps from master students (same as PrincipalIAScheduleView)
    const deptBatchMap: Record<string, Array<{ regNo: string; name: string; department?: string }>> = {};
    const deptSemMap: Record<string, Array<{ regNo: string; name: string; department?: string }>> = {};
    masterStudentList.forEach((s) => {
      const nD = normAlpha(s.department);
      const nB = normBatch(s.batch);
      const sem = s.semester;
      if (nD && nB) {
        const k = `${nD}_${nB}`;
        if (!deptBatchMap[k]) deptBatchMap[k] = [];
        deptBatchMap[k].push({ regNo: s.regNo, name: s.name, department: s.department });
      }
      if (nD && sem) {
        const k2 = `${nD}_sem${sem}`;
        if (!deptSemMap[k2]) deptSemMap[k2] = [];
        deptSemMap[k2].push({ regNo: s.regNo, name: s.name, department: s.department });
      }
    });

    scheduledItems.forEach((item) => {
      const normC = normCodeKey(item.code);
      const sanitizeC = sanitizeKey(item.code);
      const itemDeptNorm = normAlpha(item.department);
      const derivedBatch = deriveBatchFromSemester(item.semester, item.academicYear, item.department);
      const effectiveBatch = derivedBatch || item.batch;
      const itemBatchNorm = normBatch(effectiveBatch);
      const itemSem = item.semester;
      const normB = String(effectiveBatch || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normBAlt = String(effectiveBatch || '').replace(/[^0-9]/g, '').slice(0, 8);
      const normSem = String(itemSem || '').trim();

      // Priority 1: course_enrolments — strict batch match; stale batch docs are ignored
      let bestDocObj: Record<string, boolean> | null = null;
      let bestScore = -1;

      Object.entries(courseEnrolmentsMap).forEach(([docKey, enrolObj]) => {
        const docKeyNorm = docKey.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!docKeyNorm.includes(normC.toLowerCase().replace(/[^a-z0-9]/g, '')) && !docKey.includes(sanitizeC)) return;
        if (normB && !docKeyNorm.includes(normB) && !docKeyNorm.includes(normBAlt)) return;
        let score = 1;
        const docKeyAlpha = normAlpha(docKey);
        if (!itemDeptNorm || docKeyAlpha.includes(itemDeptNorm) || itemDeptNorm.includes(docKeyAlpha.slice(0, 10))) {
          score += 2;
        }
        if (normB && (docKeyNorm.includes(normB) || docKeyNorm.includes(normBAlt))) {
          score += 4;
        }
        if (normSem && (docKey.includes(`_${normSem}_`) || docKey.endsWith(`_${normSem}`) || docKey.includes(`_${normSem}-`))) {
          score += 1;
        }

        if (score > bestScore && enrolObj && typeof enrolObj === 'object') {
          bestScore = score;
          bestDocObj = enrolObj;
        }
      });

      let candidateList: Array<{ regNo: string; name: string; department?: string }> = [];

      // Priority 1: Course enrolment specific candidate list
      const enrolKey = `${item.programme}_${sanitizeKey(item.department)}_${sanitizeKey(effectiveBatch)}_${sanitizeKey(item.academicYear)}_${item.semester}_${sanitizeC}`;
      const enrolDoc = courseEnrolmentsMap[enrolKey];
      if (enrolDoc) {
        const enrolRegs = Object.keys(enrolDoc).filter((k) => enrolDoc[k] && !k.startsWith('_'));
        if (enrolRegs.length > 0) {
          candidateList = enrolRegs.map((reg) => {
            const match = masterStudentList.find((m) => m.regNo === reg);
            return { regNo: reg, name: match?.name || `Student (${reg})`, department: match?.department || item.department };
          });
        }
      }

      if (candidateList.length === 0) {
        // Priority 2: students master — exact same keys as PrincipalIAScheduleView
        if (itemDeptNorm && normB && deptBatchMap[`${itemDeptNorm}_${normB}`]) {
          candidateList = deptBatchMap[`${itemDeptNorm}_${normB}`];
        } else if (itemDeptNorm && normSem && deptSemMap[`${itemDeptNorm}_sem${normSem}`]) {
          candidateList = deptSemMap[`${itemDeptNorm}_sem${normSem}`];
        } else {
          // Final fallback: filtered by dept + (batch OR sem)
          const fallback = masterStudentList.filter((s) => {
            const sDeptNorm = normAlpha(s.department);
            const sBatchNorm = normBatch(s.batch);
            const sSem = s.semester;
            const deptMatch = !itemDeptNorm || !sDeptNorm || sDeptNorm.includes(itemDeptNorm) || itemDeptNorm.includes(sDeptNorm);
            if (!deptMatch) return false;
            if (sBatchNorm && itemBatchNorm && sBatchNorm === itemBatchNorm) return true;
            if (sSem && itemSem && String(sSem) === String(itemSem)) return true;
            return false;
          });
          candidateList = fallback;
        }
      }

      // Sort candidate list numerically by Register Number (First to Last)
      candidateList.sort((a, b) => {
        const numA = parseInt(a.regNo.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(b.regNo.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.regNo.localeCompare(b.regNo);
      });

      // Generate seating student records strictly with Firestore values — no hardcoded reg heuristic
      candidateList.forEach((st) => {
        if (!st.regNo) return;
        addedRegs.add(st.regNo);

        const studentDept = (st.department || item.department) as Department;

        let cleanName = st.name;
        if (!cleanName || cleanName === 'true' || cleanName === st.regNo || cleanName.startsWith('Student (')) {
          const last4 = st.regNo.slice(-4);
          cleanName = `Candidate #${last4}`;
        }

        const masterMatch: any = masterStudentList.find((m: any) => m.regNo === st.regNo);
        generatedStudents.push({
          id: `std-${item.examDate}-${item.session}-${item.code}-${st.regNo}`,
          name: cleanName,
          registerNumber: st.regNo,
          department: studentDept as Department,
          programme: item.programme,
          subjectCode: item.code,
          subjectName: item.name,
          semester: item.semester,
          year: Math.ceil(item.semester / 2),
          section: masterMatch?.section || 'A',
          academicYear: item.academicYear || '',
          batch: effectiveBatch || '',
          examDate: item.examDate,
          session: item.session,
        });
      });
    });

    // Pool all master candidates from approved_admissions and students master collection
    masterStudentList.forEach((st: any) => {
      if (!st.regNo || addedRegs.has(st.regNo)) return;
      addedRegs.add(st.regNo);

      let cleanName = st.name;
      if (!cleanName || cleanName === 'true' || cleanName === st.regNo || cleanName.startsWith('Student (')) {
        const last4 = st.regNo.slice(-4);
        cleanName = `Candidate #${last4}`;
      }

      const stProg: string = st.programme || (String(st.department || '').toLowerCase().includes('mba') || String(st.department || '').toLowerCase().includes('business') ? 'PG' : 'UG');
      let stSem: number = st.semester as number;
      if (!stSem && st.batch) {
        const dSem = deriveSemesterFromBatch(st.batch, '2026-2027', stProg || st.department);
        if (dSem) stSem = dSem;
      }
      if (!stSem) stSem = 1;
      const stBatch = st.batch || deriveBatchFromSemester(stSem, '2026-2027', stProg || st.department);

      generatedStudents.push({
        id: `std-master-${st.regNo}`,
        name: cleanName,
        registerNumber: st.regNo,
        department: (st.department || '') as Department,
        programme: stProg || 'UG',
        subjectCode: '',
        subjectName: '',
        semester: stSem,
        year: Math.ceil(stSem / 2),
        section: st.section || 'A',
        academicYear: '2026-2027',
        batch: stBatch,
        examDate: '',
        session: 'FN',
      });
    });

    onDataLoaded({
      exams: examsList,
      students: generatedStudents,
      loading: false,
    });
  };

  // 1. Listen to syllabus_data
  const unsubSyllabus = onSnapshot(
    collection(db, 'syllabus_data'),
    (snap) => {
      const semMap: Record<string, number> = {};
      snap.forEach((d) => {
        const dData = d.data() || {};
        const registerCourse = (c: any, semNum?: number) => {
          if (!c) return;
          const code = typeof c === 'string' ? c : c.code || c.subjectCode || c.courseCode;
          const normC = normCodeKey(code);
          if (normC && semNum && semNum > 0 && semNum <= 8) semMap[normC] = semNum;
        };

        if (Array.isArray(dData.courses)) dData.courses.forEach((c) => registerCourse(c));
        if (Array.isArray(dData.subjects)) dData.subjects.forEach((c) => registerCourse(c));
        if (dData.semesters && typeof dData.semesters === 'object') {
          Object.entries(dData.semesters).forEach(([semKey, semArr]: [string, any]) => {
            const semNum = parseInt(String(semKey).replace(/[^0-9]/g, ''), 10);
            if (Array.isArray(semArr)) {
              semArr.forEach((c) => registerCourse(c, semNum));
            }
          });
        }
      });
      syllabusSemMap = semMap;
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching syllabus_data:', err);
    }
  );

  // 2. Listen to qp_setter_assignments
  const unsubQP = onSnapshot(
    collection(db, 'qp_setter_assignments'),
    (snap) => {
      qpSetterDocs = snap.docs.map((d) => d.data());
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching qp_setter_assignments:', err);
      processAndEmit();
    }
  );

  // 3. Listen to ia_schedules
  const unsubIA = onSnapshot(
    collection(db, 'ia_schedules'),
    (snap) => {
      iaScheduleDocs = snap.docs.map((d) => d.data());
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching ia_schedules:', err);
      processAndEmit();
    }
  );

  // 4. Listen to course_enrolments
  const unsubEnrol = onSnapshot(
    collection(db, 'course_enrolments'),
    (snap) => {
      const map: Record<string, Record<string, boolean>> = {};
      snap.forEach((d) => {
        map[d.id] = d.data() as Record<string, boolean>;
      });
      courseEnrolmentsMap = map;
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching course_enrolments:', err);
      processAndEmit();
    }
  );

  let studentsMasterList: Array<{ regNo: string; name: string; batch: string; semester?: number; department?: string; programme?: string; section?: string }> = [];
  let admissionsMasterList: Array<{ regNo: string; name: string; batch: string; semester?: number; department?: string; programme?: string; section?: string }> = [];

  const updateCombinedMasterList = () => {
    const map = new Map<string, { regNo: string; name: string; batch: string; semester?: number; department?: string; programme?: string; section?: string }>();
    // 1. First populate admissions master list
    admissionsMasterList.forEach((s) => { if (s.regNo) map.set(s.regNo, s); });
    // 2. Merge students master list (uploaded via Upload.jsx) so uploaded student records take precedence
    studentsMasterList.forEach((s) => {
      if (s.regNo) {
        const existing = map.get(s.regNo);
        map.set(s.regNo, {
          regNo: s.regNo,
          name: (s.name && !s.name.startsWith('Student (')) ? s.name : (existing?.name || s.name),
          batch: s.batch || existing?.batch || '',
          semester: s.semester || existing?.semester,
          department: s.department || existing?.department || '',
          programme: (s as any).programme || (existing as any)?.programme || '',
          section: (s as any).section || (existing as any)?.section || 'A',
        });
      }
    });
    masterStudentList = Array.from(map.values()) as any;
  };

  // 5. Listen to students master collection — Firestore: students/{batch}_{programme}_{dept}_{sec}
  const unsubStudents = onSnapshot(
    collection(db, 'students'),
    (snap) => {
      const list: Array<{ regNo: string; name: string; department?: string; batch: string; semester?: number; programme?: string }> = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const meta = data._meta || {};
        const parsed = parseStudentDocId(d.id, meta, data);
        let dept = parsed.department || meta.department || meta.dept || data.department || data.dept || '';
        dept = resolveDeptShort(dept);
        // Derive semester from batch when doc holds no explicit semester (namelist per batch is valid for that year's Odd sem)
        let sem = parsed.semester;
        if (!sem && parsed.batch) {
          const derived = deriveSemesterFromBatch(parsed.batch, '2026-2027', parsed.programme || dept);
          if (derived) sem = derived;
        }

        Object.entries(data).forEach(([key, val]) => {
          if (!key.startsWith('_')) {
            const sName = typeof val === 'object' && val !== null ? (val as any).name || '' : String(val || '');
            list.push({
              regNo: key,
              name: sName || `Student (${key})`,
              department: dept,
              batch: parsed.batch || '',
              semester: sem,
              programme: parsed.programme || '',
              section: parsed.section || 'A',
            } as any);
          }
        });
      });
      studentsMasterList = list as any;
      updateCombinedMasterList();
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching students:', err);
      processAndEmit();
    }
  );

  // 6. Listen to approved_admissions master collection (identical namelist source as Attendance.jsx)
  const unsubAdmissions = onSnapshot(
    collection(db, 'approved_admissions'),
    (snap) => {
      const list: Array<{ regNo: string; name: string; department?: string; batch: string; semester?: number; programme?: string }> = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const meta = data._meta || {};
        const parsed = parseStudentDocId(d.id, meta, data);
        let dept = parsed.department || meta.department || meta.dept || data.department || data.dept || '';
        dept = resolveDeptShort(dept);
        let sem: number | undefined = parsed.semester;
        if (!sem && parsed.batch) {
          const derived = deriveSemesterFromBatch(parsed.batch, '2026-2027', parsed.programme || dept);
          if (derived) sem = derived;
        }

        Object.entries(data).forEach(([key, val]) => {
          if (!key.startsWith('_')) {
            const sName = typeof val === 'object' && val !== null ? (val as any).name || '' : String(val || '');
            if (sName) {
              list.push({
                regNo: key,
                name: sName,
                department: dept,
                batch: parsed.batch || '',
                semester: sem,
                programme: parsed.programme || '',
                section: parsed.section || 'A',
              } as any);
            }
          }
        });
      });
      admissionsMasterList = list as any;
      updateCombinedMasterList();
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching approved_admissions:', err);
      processAndEmit();
    }
  );

  return () => {
    unsubSyllabus();
    unsubQP();
    unsubIA();
    unsubEnrol();
    unsubStudents();
    unsubAdmissions();
  };
};
