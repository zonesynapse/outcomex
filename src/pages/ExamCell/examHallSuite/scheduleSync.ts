import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { ExamSchedule, Student, Department } from '../../../types';

const normCodeKey = (s: any) => String(s || '').toUpperCase().replace(/\s+/g, '');
const sanitizeKey = (key: any) => (!key ? '' : String(key).replace(/[.#$[\]/ ]/g, '_'));
const normBatch = (b: any) => String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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

  return 5;
};

/**
 * Reverse-engineers batch from semester number
 */
export const deriveBatchFromSemester = (semester: number, programme?: string): string => {
  const isPG = programme === 'M.E.' || programme === 'MBA' || String(programme || '').includes('M');
  if (isPG) {
    if (semester === 1 || semester === 2) return '2025-27';
    if (semester === 3 || semester === 4) return '2024-26';
    return '2025-27';
  }
  if (semester === 1 || semester === 2) return '2025-29';
  if (semester === 3 || semester === 4) return '2024-28';
  if (semester === 5 || semester === 6) return '2023-27';
  if (semester === 7 || semester === 8) return '2022-26';
  return '2023-27';
};

const extractBatchAndSemesterFromDoc = (docId: string, meta: any) => {
  let batch = meta?.batch || '';
  let semester = parseInt(String(meta?.semester || meta?.sem || ''), 10) || 0;

  if (!batch) {
    const match = docId.match(/(20\d{2}[-_]\d{2,4}|\d{2}[-_]\d{2})/);
    if (match) batch = match[1];
  }

  if (!semester) {
    const semMatch = docId.match(/_sem?(\d)_/i) || docId.match(/_(\d)_/);
    if (semMatch) semester = parseInt(semMatch[1], 10);
  }

  if (semester > 0 && !batch) {
    batch = deriveBatchFromSemester(semester, meta?.programme);
  }

  if (batch && (!semester || semester === 0)) {
    if (batch.includes('2025') || batch.includes('25')) semester = 1;
    else if (batch.includes('2024') || batch.includes('24')) semester = 3;
    else if (batch.includes('2023') || batch.includes('23')) semester = 5;
    else if (batch.includes('2022') || batch.includes('22')) semester = 7;
  }

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
  let masterStudentList: Array<{ regNo: string; name: string; batch: string; semester?: number }> = [];

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
      const rawDeptStr = rec.department || rec.dept || defaultDept || 'CSE';
      const department = (rawDeptStr || 'CSE') as Department;

      let programme = rec.programme || rec.prog || docMeta?.programme || docMeta?.progKey || 'B.E.';
      if (programme.includes('Tech')) programme = 'B.Tech';
      else if (programme.includes('M') || programme.includes('PG')) programme = 'M.E.';
      else programme = 'B.E.';

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

    // Parse qp_setter_assignments docs
    qpSetterDocs.forEach((dData) => {
      const meta = dData._meta || {};
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

    if (scheduledItems.length === 0) {
      onDataLoaded({ exams: [], students: [], loading: false });
      return;
    }

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
        const semDisplay = sortedSems.length > 0 ? sortedSems.join(', ') : '5';
        return {
          id: ex.id,
          name: ex.name,
          date: ex.date,
          session: ex.session,
          timeSlot: ex.timeSlot,
          semester: sortedSems[0] || 5,
          semesterDisplay: semDisplay,
          departments: Array.from(ex.departments),
          selectedHallIds: [],
        };
      });

    // Calculate candidate students for each deduplicated scheduled subject
    const generatedStudents: Student[] = [];

    scheduledItems.forEach((item) => {
      const normC = normCodeKey(item.code);
      const sanitizeC = sanitizeKey(item.code);

      // Check course_enrolments for exact enrolled student count
      let enrolledCount = 0;
      const enrolledStudentList: Array<{ regNo: string; name: string }> = [];

      Object.entries(courseEnrolmentsMap).forEach(([docKey, enrolObj]) => {
        if (docKey.toUpperCase().includes(normC) || docKey.includes(sanitizeC)) {
          Object.entries(enrolObj || {}).forEach(([examNo, isEnrolled]) => {
            if (isEnrolled) {
              enrolledCount++;
              enrolledStudentList.push({
                regNo: examNo,
                name: `Student (${examNo})`,
              });
            }
          });
        }
      });

      let finalCount = enrolledCount;
      const normItemBatch = normBatch(item.batch);

      const matchingBatchStudents = masterStudentList.filter((s) => {
        const sNormBatch = normBatch(s.batch);
        if (sNormBatch && sNormBatch === normItemBatch) return true;
        if (s.semester && s.semester === item.semester) return true;
        return false;
      });

      if (finalCount === 0) {
        if (matchingBatchStudents.length > 0) {
          finalCount = matchingBatchStudents.length;
        } else if (masterStudentList.length > 0) {
          finalCount = Math.min(60, masterStudentList.length);
        } else {
          finalCount = 30;
        }
      }

      for (let i = 1; i <= finalCount; i++) {
        const enrolledStudent = enrolledStudentList[i - 1];
        const masterStudent = matchingBatchStudents[i - 1] || masterStudentList[i - 1];

        const regNo = enrolledStudent
          ? enrolledStudent.regNo
          : masterStudent
            ? masterStudent.regNo
            : `CAND-${i.toString().padStart(3, '0')}`;

        const name = enrolledStudent
          ? enrolledStudent.name
          : masterStudent
            ? masterStudent.name
            : `Candidate ${i}`;

        generatedStudents.push({
          id: `std-${item.examDate}-${item.session}-${item.code}-${i}`,
          name,
          registerNumber: regNo,
          department: item.department,
          programme: item.programme,
          subjectCode: item.code,
          subjectName: item.name,
          semester: item.semester,
          year: Math.ceil(item.semester / 2),
          examDate: item.examDate,
          session: item.session,
        });
      }
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

  // 5. Listen to students master collection
  const unsubStudents = onSnapshot(
    collection(db, 'students'),
    (snap) => {
      const list: Array<{ regNo: string; name: string; batch: string; semester?: number }> = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const meta = data._meta || {};
        const { batch, semester } = extractBatchAndSemesterFromDoc(d.id, meta);

        Object.entries(data).forEach(([key, val]) => {
          if (!key.startsWith('_')) {
            const sName = typeof val === 'object' && val !== null ? (val as any).name || '' : String(val || '');
            list.push({
              regNo: key,
              name: sName || `Student (${key})`,
              batch,
              semester,
            });
          }
        });
      });
      masterStudentList = list;
      processAndEmit();
    },
    (err) => {
      console.warn('Error fetching students:', err);
      processAndEmit();
    }
  );

  return () => {
    unsubSyllabus();
    unsubQP();
    unsubIA();
    unsubEnrol();
    unsubStudents();
  };
};
