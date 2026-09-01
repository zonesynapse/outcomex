import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Printer,
  Download,
  FileText,
  Building2,
  UserCheck,
  Layers,
  QrCode,
  CheckCircle2,
  FileSpreadsheet,
  Sliders,
  Sparkles,
  Package,
  BookOpen,
  Inbox,
  Check
} from 'lucide-react';
import { Room, Student, AllocatedSeat, DutyAllocation, Faculty, ExamSchedule, Department, ExamDutyWorkflow } from '../../../types';
import { useDepartments } from '../../../hooks/useDepartments';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';

interface PrintReportsViewProps {
  rooms: Room[];
  students: Student[];
  allocatedSeats: AllocatedSeat[];
  dutyAllocations: DutyAllocation[];
  dutyWorkflows?: ExamDutyWorkflow[];
  facultyList: Faculty[];
  selectedExam: ExamSchedule;
  defaultHallId?: string;
}

export type SeatingSortOrder = 'department' | 'desk' | 'regNo';

interface DepartmentSeatGroup {
  subjectCode: string;
  subjectName: string;
  seats: AllocatedSeat[];
}

// Academic year that a calendar date falls under (July-start convention)
function getAcademicYearForDate(d: Date): string {
  const y = d.getFullYear();
  return d.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// Reverse-engineering: derive the batch from a semester + academic year
// (inverse of year-of-study: batchStart = AYstart - floor((sem-1)/2))
function deriveBatchFromSemesterAy(semester?: string, academicYear?: string, isPG?: boolean): string {
  let ayStart = 2026;
  if (academicYear) {
    const m = String(academicYear).match(/^(\d{4})/);
    if (m) ayStart = parseInt(m[1], 10);
  }
  const semNum = Number(semester) || 1;
  const startYear = ayStart - Math.floor((semNum - 1) / 2);
  const duration = isPG ? 2 : 4;
  return `${startYear}-${startYear + duration}`;
}

// Calculate expected semester for a student batch in a given academic year
function deriveSemFromBatchAy(batch?: string, academicYear?: string, isPG?: boolean): number {
  if (!batch || !academicYear) return 0;
  const bMatch = normalizeBatch(batch).match(/^(\d{4})/);
  const ayMatch = normalizeAy(academicYear).match(/^(\d{4})/);
  if (!bMatch || !ayMatch) return 0;

  const batchStart = parseInt(bMatch[1], 10);
  const ayStart = parseInt(ayMatch[1], 10);
  const yearIndex = ayStart - batchStart; // 0=1st yr, 1=2nd yr, 2=3rd yr, 3=4th yr

  if (yearIndex < 0 || yearIndex > 4) return 0;
  return yearIndex * 2 + 1; // Default to Odd sem (1, 3, 5, 7) for that year of study
}

// Normalize AY / batch for comparison (handles 2026-2027 vs 2026-27 vs 2026/2027)
function normalizeAy(ay?: string): string {
  if (!ay) return '';
  const m = String(ay).match(/(\d{4})\D+(\d{2,4})/);
  if (!m) return String(ay).trim().toLowerCase();
  const start = m[1];
  const end = m[2].length === 2 ? `${start.slice(0, 2)}${m[2]}` : m[2];
  return `${start}-${end}`;
}
function normalizeBatch(batch?: string): string {
  if (!batch) return '';
  const nums = String(batch).match(/\d{4}/g);
  if (nums && nums.length >= 2) return `${nums[0]}-${nums[1]}`;
  // fallback: handle short form like 2023-27
  const m = String(batch).match(/(\d{4})\D+(\d{2,4})/);
  if (!m) return String(batch).trim().toLowerCase();
  const start = m[1];
  const end = m[2].length === 2 ? `${start.slice(0, 2)}${m[2]}` : m[2];
  return `${start}-${end}`;
}

// Extract canonical batch for a candidate (register number 420723104001 -> 23 -> 2023-2027 takes precedence)
function extractCandidateBatch(st: Student, isPG?: boolean): string {
  const reg = String(st.registerNumber || '').trim();
  // Register number format e.g. 420723104001 -> 23 -> 2023-2027
  const regM = reg.match(/^\d{4}(\d{2})\d{5,}$/) || reg.match(/(\d{2})\d{6,}$/);
  if (regM) {
    const yr = parseInt(regM[1], 10);
    if (yr >= 18 && yr <= 45) {
      const startYr = 2000 + yr;
      const duration = isPG ? 2 : 4;
      return `${startYr}-${startYr + duration}`;
    }
  }

  if (st.batch) {
    const norm = normalizeBatch(st.batch);
    if (norm) return norm;
  }

  return '';
}

export const PrintReportsView: React.FC<PrintReportsViewProps> = ({
  rooms,
  students,
  allocatedSeats,
  dutyAllocations,
  facultyList,
  selectedExam,
  defaultHallId,
}) => {
  const [reportType, setReportType] = useState<
    'dept-attendance' | 'qp-distribution' | 'door-notice' | 'desk-slips' | 'admin-oversight' | 'absentee-statement' | 'faculty-orders'
  >('qp-distribution');
  const [selectedHallId, setSelectedHallId] = useState<string>(defaultHallId || rooms[0]?.id || '');
  const [selectedProgramme, setSelectedProgramme] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [semesterConfigs, setSemesterConfigs] = useState<any[]>([]);
  const [deptSortBy, setDeptSortBy] = useState<'regNo' | 'hall' | 'name'>('regNo');
  const [sortBy, setSortBy] = useState<SeatingSortOrder>('department');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [groupByDept, setGroupByDept] = useState<boolean>(true);
  const [includeSignatures, setIncludeSignatures] = useState<boolean>(true);
  const [collegeName, setCollegeName] = useState<string>('C.K. COLLEGE OF ENGINEERING & TECHNOLOGY (AUTONOMOUS)');
  const [examSubTitle, setExamSubTitle] = useState<string>('Internal Assessment Cell');

  // QP Distribution Report specific state
  const [qpViewMode, setQpViewMode] = useState<'matrix' | 'subject-summary' | 'envelope-slips'>('matrix');
  const [qpSelectedHall, setQpSelectedHall] = useState<string>('all');
  const [qpSelectedDept, setQpSelectedDept] = useState<string>('all');

  const printAreaRef = useRef<HTMLDivElement>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedHallId) || rooms[0];

  // Base seats for selected hall for the active exam date & session
  const rawHallSeats = useMemo(() => {
    return allocatedSeats.filter(
      (s) =>
        s.roomId === selectedHallId &&
        s.student.examDate === selectedExam.date &&
        s.student.session === selectedExam.session
    );
  }, [allocatedSeats, selectedHallId, selectedExam.date, selectedExam.session]);

  // Unique departments present in this hall
  const hallDepartments = useMemo(() => {
    const depts = new Set<Department>();
    rawHallSeats.forEach((s) => depts.add(s.student.department));
    return Array.from(depts);
  }, [rawHallSeats]);

  const { departments: firestoreDeptMap } = useDepartments();

  const normalizeDeptName = (rawDept?: string): string => {
    if (!rawDept) return '';
    let s = String(rawDept).trim();
    s = s.replace(/^Department of\s+/i, '');
    const lower = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower === 'cse' || lower.includes('computerscience')) return 'B.E. Computer Science and Engineering';
    if (lower === 'it' || lower.includes('informationtechnology')) return 'B.Tech. Information Technology';
    if (lower === 'aids' || lower.includes('artificialintelligence')) return 'B.Tech. Artificial Intelligence and Data Science';
    if (lower === 'ece' || lower.includes('electronicsandcommunication')) return 'B.E. Electronics and Communication Engineering';
    if (lower === 'eee' || lower.includes('electricalandelectronics')) return 'B.E. Electrical and Electronics Engineering';
    if (lower === 'mech' || lower.includes('mechanicalengineering')) return 'B.E. Mechanical Engineering';
    if (lower === 'civil' || lower.includes('civilengineering')) return 'B.E. Civil Engineering';
    if (lower === 'bme' || lower.includes('biomedical')) return 'B.E. Bio Medical Engineering';
    if (lower === 'robotics' || lower.includes('roboticsandautomation')) return 'B.E. Robotics and Automation';
    if (lower === 'mba' || lower.includes('businessadministration') || lower === 'administration') return 'PG Master of Business Administration';
    return s;
  };

  const getProgrammeForDept = (deptName: string): string => {
    if (!deptName) return 'OTHER';
    const norm = normalizeDeptName(deptName);
    const lower = norm.toLowerCase();

    if (norm.startsWith('B.E.') || lower.includes('b.e.') || lower.startsWith('be ')) return 'B_E';
    if (norm.startsWith('B.Tech') || lower.includes('b.tech') || lower.startsWith('btech')) return 'B_Tech';
    if (norm.startsWith('PG') || lower.includes('mba') || lower.includes('business administration') || lower.includes('administration')) return 'PG_MBA';
    if (norm.startsWith('M.E.') || lower.includes('m.e.') || lower.startsWith('me ')) return 'M_E';
    if (norm.startsWith('M.Tech') || lower.includes('m.tech') || lower.startsWith('mtech')) return 'M_Tech';

    return 'B_E';
  };

  const PROGRAMME_LABEL_MAP: Record<string, string> = {
    ALL: 'All Programmes',
    UG: 'UG',
    PG: 'PG',
    B_E: 'B.E. (Bachelor of Engineering)',
    B_TECH: 'B.Tech. (Bachelor of Technology)',
    PG_MBA: 'PG Master of Business Administration',
    M_E: 'M.E. (Master of Engineering)',
    M_TECH: 'M.Tech. (Master of Technology)',
  };

  // Generic UG/PG bucket helpers — Firestore may store UG/PG as umbrella keys
  const isUgProgramme = (k: string) => {
    const n = String(k || '').trim().toUpperCase();
    return n === 'UG' || n === 'B_E' || n === 'B_TECH' || n === 'BTECH' || n === 'BE';
  };
  const isPgProgramme = (k: string) => {
    const n = String(k || '').trim().toUpperCase();
    return n === 'PG' || n === 'PG_MBA' || n === 'M_E' || n === 'M_TECH' || n === 'MBA' || n === 'ME' || n === 'MTECH' || n === 'ADMINISTRATION';
  };

  // All unique departments configured in Firestore & candidate dataset (Normalized & Deduplicated)
  const allExamDepartments = useMemo(() => {
    const depts = new Set<string>();
    const addDept = (d?: string) => {
      const norm = normalizeDeptName(d);
      if (norm) depts.add(norm);
    };

    const normDate = (d?: string) => String(d || '').replace(/[^0-9]/g, '');
    const targetDateNorm = normDate(selectedExam?.date);
    const targetSessNorm = String(selectedExam?.session || '').trim().toUpperCase();

    // 1. Session candidates in Firestore
    students.forEach((s) => {
      const sDateNorm = normDate(s.examDate);
      const sSessNorm = String(s.session || '').trim().toUpperCase();
      const isMatch = (!targetDateNorm || sDateNorm === targetDateNorm) && (!targetSessNorm || sSessNorm === targetSessNorm);
      if (isMatch && s.department) addDept(s.department);
    });

    // 2. Allocated seats in Firestore
    allocatedSeats.forEach((s) => {
      const sDateNorm = normDate(s.student?.examDate);
      const sSessNorm = String(s.student?.session || '').trim().toUpperCase();
      const isMatch = (!targetDateNorm || sDateNorm === targetDateNorm) && (!targetSessNorm || sSessNorm === targetSessNorm);
      if (isMatch && s.student?.department) addDept(s.student.department);
    });

    // 3. Fall back to all students in total dataset
    students.forEach((s) => { if (s.department) addDept(s.department); });
    allocatedSeats.forEach((s) => { if (s.student?.department) addDept(s.student.department); });

    // 4. Fetch from Firestore programme_departments collection via useDepartments
    if (firestoreDeptMap && typeof firestoreDeptMap === 'object') {
      Object.values(firestoreDeptMap).forEach((deptList) => {
        if (Array.isArray(deptList)) {
          deptList.forEach((d) => addDept(d));
        }
      });
    }

    return Array.from(depts).sort();
  }, [firestoreDeptMap, students, allocatedSeats, selectedExam?.date, selectedExam?.session]);

  // Programme dropdown — derived strictly from Curriculum (Firestore programme_departments) only
  const availableProgrammes = useMemo(() => {
    const progMap = new Map<string, { key: string; label: string }>();

    if (firestoreDeptMap && typeof firestoreDeptMap === 'object') {
      Object.keys(firestoreDeptMap).forEach((progKey) => {
        const label = PROGRAMME_LABEL_MAP[progKey] || progKey;
        progMap.set(progKey, { key: progKey, label });
      });
    }

    return Array.from(progMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [firestoreDeptMap]);

  // Department dropdown — exactly the departments configured for the selected Programme in Curriculum
  const availableDepartments = useMemo(() => {
    if (!selectedProgramme || selectedProgramme.trim() === '') return [];
    if (!firestoreDeptMap || typeof firestoreDeptMap !== 'object') return [];
    const deps = firestoreDeptMap[selectedProgramme];
    if (!Array.isArray(deps)) return [];
    return deps
      .map((d) => normalizeDeptName(d))
      .filter((d): d is string => !!d)
      .sort((a, b) => a.localeCompare(b));
  }, [firestoreDeptMap, selectedProgramme]);

  // Auto-select programme when none selected — prefer the programme whose configured
  // department list contains the MOST departments present in the live candidate dataset,
  // so the default selection doesn't land on a programme with no (or fewer) matching candidates.
  useEffect(() => {
    if (availableProgrammes.length > 0 && (!selectedProgramme || selectedProgramme.trim() === '')) {
      let best = availableProgrammes[0].key;
      let bestCount = -1;
      const candidates = new Set(allExamDepartments.map((d) => normalizeDeptName(d)));
      for (const p of availableProgrammes) {
        const list = (firestoreDeptMap as any)?.[p.key];
        if (!Array.isArray(list) || list.length === 0) continue;
        const overlap = list.filter((d: string) => candidates.has(normalizeDeptName(d))).length;
        if (overlap > bestCount) { best = p.key; bestCount = overlap; }
      }
      setSelectedProgramme(best);
    }
  }, [availableProgrammes, selectedProgramme, allExamDepartments, firestoreDeptMap]);

  // Auto-select first department when none selected
  useEffect(() => {
    if (availableDepartments.length > 0 && (!selectedDepartment || selectedDepartment.trim() === '')) {
      setSelectedDepartment(availableDepartments[0]);
    }
  }, [availableDepartments, selectedDepartment]);

  // Subscribe to Firestore semester_config (Academic Calendar configurations)
  useEffect(() => {
    const semRef = collection(db, 'semester_config');
    const unsub = onSnapshot(semRef, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setSemesterConfigs(list);
    });
    return () => unsub();
  }, []);

  // Available Batches — pooled from students candidate data, Academic Calendar (semester_config), and standard durations
  const availableBatches = useMemo(() => {
    const set = new Set<string>();
    const isPG = isPgProgramme(selectedProgramme);
    const expectedDuration = isPG ? 2 : 4;

    students.forEach((s) => {
      if (s.batch && String(s.batch).trim()) {
        const normB = normalizeBatch(s.batch);
        const parts = normB.split('-');
        if (parts.length === 2) {
          const dur = parseInt(parts[1], 10) - parseInt(parts[0], 10);
          if (dur === expectedDuration) set.add(normB);
        } else {
          set.add(normB);
        }
      }
    });

    semesterConfigs.forEach((cfg) => {
      const bList = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
      bList.forEach((b: any) => {
        if (b && String(b).trim()) {
          const normB = normalizeBatch(b);
          const parts = normB.split('-');
          if (parts.length === 2) {
            const dur = parseInt(parts[1], 10) - parseInt(parts[0], 10);
            if (dur === expectedDuration) set.add(normB);
          } else {
            set.add(normB);
          }
        }
      });
    });

    const currYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const start = currYear - i;
      set.add(`${start}-${start + expectedDuration}`);
    }

    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [students, semesterConfigs, selectedProgramme]);

  // Auto-select first batch with candidate data or first valid batch in availableBatches
  useEffect(() => {
    if (availableBatches.length > 0) {
      const normSel = selectedBatch ? normalizeBatch(selectedBatch) : '';
      if (!normSel || !availableBatches.includes(normSel)) {
        // Find batch that has candidates for this department if possible
        const matchingWithData = availableBatches.find((b) =>
          students.some((s) => normalizeDeptName(s.department) === normalizeDeptName(selectedDepartment) && normalizeBatch(s.batch) === b)
        );
        setSelectedBatch(matchingWithData || availableBatches[0]);
      }
    }
  }, [availableBatches, selectedDepartment, students]);

  // Academic Year options — distinct normalized years present in candidate data, plus current academic year
  const availableAcademicYears = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => { if (s.academicYear) set.add(normalizeAy(s.academicYear)); });
    set.add(normalizeAy(getAcademicYearForDate(new Date())));
    const recent = getAcademicYearForDate(new Date());
    const startY = parseInt(String(recent).split('-')[0], 10);
    for (let i = -3; i <= 1; i++) set.add(`${startY + i}-${startY + i + 1}`);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [students]);

  // Auto-fetch Academic Year & Semester whenever Batch is selected
  useEffect(() => {
    if (!selectedBatch || selectedBatch.trim() === '') return;

    const normTargetBatch = normalizeBatch(selectedBatch);

    // 1. Check AcademicCalendar semester_config in Firestore first
    const matchingConfig = semesterConfigs.find((cfg) => {
      const bList = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
      return bList.some((b: any) => normalizeBatch(b) === normTargetBatch);
    });

    if (matchingConfig && matchingConfig.startDate) {
      const startY = parseInt(String(matchingConfig.startDate).split('-')[0], 10);
      const computedAy = `${startY}-${startY + 1}`;
      setSelectedAcademicYear(computedAy);

      const batchStart = parseInt(normTargetBatch.split('-')[0], 10);
      const yearNumber = startY - batchStart + 1;
      const isOdd = matchingConfig.semesterType === 'Odd';
      const computedSem = isOdd ? (yearNumber * 2 - 1) : (yearNumber * 2);
      if (computedSem > 0 && computedSem <= 8) {
        setSelectedSemester(String(computedSem));
        return;
      }
    }

    // 2. Default Academic Calendar calculation (July-start academic year)
    const currentAyStr = getAcademicYearForDate(new Date());
    setSelectedAcademicYear(currentAyStr);

    const currAyStart = parseInt(currentAyStr.split('-')[0], 10);
    const batchStart = parseInt(normTargetBatch.split('-')[0], 10);
    if (!isNaN(batchStart)) {
      const yearIndex = currAyStart - batchStart;
      if (yearIndex >= 0 && yearIndex < 5) {
        const currentMonth = new Date().getMonth();
        const isOdd = currentMonth >= 6; // July-Dec is Odd sem (Sem 1, 3, 5, 7)
        const computedSem = (yearIndex * 2) + (isOdd ? 1 : 2);
        if (computedSem > 0 && computedSem <= 8) {
          setSelectedSemester(String(computedSem));
        }
      }
    }
  }, [selectedBatch, semesterConfigs, selectedProgramme]);

  // Default Academic Year slot to the current academic year if empty
  useEffect(() => {
    if (!selectedAcademicYear || selectedAcademicYear.trim() === '') {
      setSelectedAcademicYear(getAcademicYearForDate(new Date()));
    }
  }, [selectedAcademicYear]);

  // Reverse-engineered batch from chosen semester + academic year or explicit selection
  const derivedReportBatch = useMemo(() => {
    if (selectedBatch && selectedBatch.trim() !== '') return selectedBatch;
    if (!selectedSemester || !selectedAcademicYear) return '';
    const isPG = isPgProgramme(selectedProgramme) && !isUgProgramme(selectedProgramme) ? true : selectedProgramme === 'PG_MBA' || selectedProgramme === 'M_E' || selectedProgramme === 'M_TECH';
    const pgFlag = selectedProgramme === 'PG' || selectedProgramme === 'PG_MBA' || selectedProgramme === 'M_E' || selectedProgramme === 'M_TECH';
    return deriveBatchFromSemesterAy(selectedSemester, selectedAcademicYear, pgFlag);
  }, [selectedBatch, selectedSemester, selectedAcademicYear, selectedProgramme]);

  // Map for fast room lookup
  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    rooms.forEach((r) => map.set(r.id, r));
    return map;
  }, [rooms]);

  // Listen to Firestore qp_setter_assignments and syllabus_data to get authoritative scheduled subjects for columns
  const [scheduledAssignments, setScheduledAssignments] = useState<any[]>([]);
  const [syllabusSubjects, setSyllabusSubjects] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'qp_setter_assignments'), (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        docs.push({ id: d.id, ...data });
      });

      // Sort documents by updatedAt descending (latest schedule document first)
      docs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

      const list: any[] = [];
      docs.forEach((data) => {
        const docBatch = data.batch || data._meta?.batch || data.id || '';
        const docDept = data.department || data.dept || data._meta?.department || data.id || '';
        const docSem = data.semester || data.sem || 0;
        const docProg = data.programme || data._meta?.programme || '';

        const rawAssignments = data.assignments || data.courses || data;
        let items: any[] = [];
        if (Array.isArray(rawAssignments)) {
          items = rawAssignments;
        } else if (typeof rawAssignments === 'object' && rawAssignments !== null) {
          items = Object.values(rawAssignments);
        }

        items.forEach((it: any) => {
          if (it && typeof it === 'object') {
            const code = String(it.subjectCode || it.code || it.courseCode || '').trim();
            const name = String(it.subjectName || it.name || it.subject || it.courseName || '').trim();
            const dateStr = String(it.examDate ?? it.exam_date ?? it.date ?? it.assignedDate ?? it.fromDate ?? data.examDate ?? data.date ?? '').trim();
            if (code) {
              list.push({
                docId: data.id,
                updatedAt: data.updatedAt || '',
                batch: it.batch || docBatch,
                department: it.department || it.dept || docDept,
                programme: it.programme || docProg,
                semester: it.semester || it.sem || docSem,
                subjectCode: code,
                subjectName: name,
                examDate: dateStr,
                session: it.session || 'FN',
              });
            }
          }
        });
      });
      setScheduledAssignments(list);
    }, (err) => console.warn('qp_setter_assignments fetch error in PrintReportsView:', err));

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'syllabus_data'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const docId = d.id;
        const semesters = data.semesters || {};
        Object.entries(semesters).forEach(([semNumStr, rawSubs]) => {
          const semNum = parseInt(semNumStr, 10);
          const subList = Array.isArray(rawSubs) ? rawSubs : (typeof rawSubs === 'object' && rawSubs !== null ? Object.values(rawSubs) : []);
          subList.forEach((s: any) => {
            if (s && typeof s === 'object') {
              const code = String(s.code || s.subjectCode || s.courseCode || '').trim();
              const name = String(s.name || s.subjectName || s.courseName || '').trim();
              if (code && !s.isNonOBE && s.isActive !== false) {
                list.push({
                  docId,
                  department: data.department || docId,
                  semester: semNum,
                  subjectCode: code,
                  subjectName: name,
                });
              }
            }
          });
        });
      });
      setSyllabusSubjects(list);
    }, (err) => console.warn('syllabus_data fetch error in PrintReportsView:', err));

    return () => unsub();
  }, []);

  // Subject / Exams scheduled in ExamCellSchedules.jsx for chosen department, batch & semester
  const activeSubjectInfo = useMemo(() => {
    const targetDeptNorm = normalizeDeptName(selectedDepartment);
    const targetBatch = normalizeBatch(selectedBatch || derivedReportBatch);
    const targetSem = selectedSemester ? parseInt(selectedSemester, 10) : 0;

    const matches = scheduledAssignments.filter((a) => {
      const deptMatch = !targetDeptNorm || normalizeDeptName(a.department) === targetDeptNorm;
      const batchMatch = !targetBatch || normalizeBatch(a.batch) === targetBatch;
      const semMatch = !targetSem || parseInt(String(a.semester), 10) === targetSem;
      return deptMatch && batchMatch && semMatch && a.subjectCode;
    });

    if (matches.length > 0) {
      const uniqueSubjects = new Map<string, string>();
      matches.forEach((m) => {
        if (!uniqueSubjects.has(m.subjectCode)) {
          uniqueSubjects.set(m.subjectCode, `${m.subjectCode} — ${m.subjectName}`);
        }
      });
      return Array.from(uniqueSubjects.values()).join(' | ');
    }

    return 'All Departmental Courses';
  }, [scheduledAssignments, selectedDepartment, selectedBatch, derivedReportBatch, selectedSemester]);

  // Scheduled subject codes with assigned exam dates in IAScheduleCreation.jsx (qp_setter_assignments)
  const batchSubjectCodes = useMemo(() => {
    const targetDeptNorm = normalizeDeptName(selectedDepartment);
    const targetBatch = normalizeBatch(selectedBatch || derivedReportBatch);
    const targetSem = selectedSemester ? parseInt(selectedSemester, 10) : 0;

    const normCleanLocal = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/^departmentof|^department|^deptof|^dept/, '')
        .replace(/^(be|btech|me|mtech|ug|pg)+/, '');

    const extractYr = (s: string) => {
      const m = String(s || '').match(/\d{4}/);
      return m ? m[0] : '';
    };

    const targetDeptClean = normCleanLocal(selectedDepartment);
    const targetBatchYr = extractYr(targetBatch);

    const isNonExam = (code: string, name: string) => {
      const c = String(code || '').trim().toUpperCase();
      const n = String(name || '').trim().toUpperCase();
      if (['PET', 'ICL', 'SK', 'NSS', 'YRC', 'LIBRARY', 'SPORTS'].includes(c)) return true;
      if (n.includes('PHYSICAL EDUCATION') || n.includes('INDIAN CONSTITUTION') || n.includes('SOFT SKILL') || n.includes('VALUE ADDED')) return true;
      return false;
    };

    const uniqueCodes: Array<{ code: string; name: string; examDate: string; session: string }> = [];
    const seen = new Set<string>();

    // 1. Match subjects from qp_setter_assignments (ExamCellSchedules / IAScheduleCreation)
    const matchesQP = scheduledAssignments.filter((a) => {
      const itemDeptNorm = normalizeDeptName(a.department || a.docId);
      const itemDeptClean = normCleanLocal(a.department + ' ' + a.docId);
      const itemBatchYr = extractYr(a.batch + ' ' + a.docId);
      const itemSem = parseInt(String(a.semester), 10);

      const deptMatch =
        !targetDeptNorm ||
        itemDeptNorm === targetDeptNorm ||
        (targetDeptClean && (itemDeptClean.includes(targetDeptClean) || targetDeptClean.includes(itemDeptClean)));

      const batchMatch = !targetBatchYr || !itemBatchYr || itemBatchYr === targetBatchYr;
      const semMatch = !targetSem || !itemSem || itemSem === targetSem;

      return deptMatch && batchMatch && semMatch && a.subjectCode && !isNonExam(a.subjectCode, a.subjectName);
    });

    // Priority 1: Extract ONLY subjects from matchesQP that HAVE an assigned exam date!
    matchesQP.forEach((m) => {
      const codeClean = String(m.subjectCode || '').trim().toUpperCase();
      const dateClean = String(m.examDate || '').trim();
      const isValidDate = Boolean(dateClean && dateClean !== 'undefined' && dateClean !== 'null');

      if (codeClean && isValidDate && !seen.has(codeClean)) {
        seen.add(codeClean);
        uniqueCodes.push({
          code: codeClean,
          name: m.subjectName || '',
          examDate: dateClean,
          session: m.session || 'FN',
        });
      }
    });

    // If subjects with assigned exam dates exist, return STRICTLY THOSE (e.g. GE3751, GE3791, OFD351, OPE353, OMG353)!
    if (uniqueCodes.length > 0) {
      uniqueCodes.sort((a, b) => a.examDate.localeCompare(b.examDate));
      return uniqueCodes;
    }

    // Priority 2: Remaining subjects in matchesQP if exam dates not yet assigned
    matchesQP.forEach((m) => {
      const codeClean = String(m.subjectCode || '').trim().toUpperCase();
      if (codeClean && !seen.has(codeClean)) {
        seen.add(codeClean);
        uniqueCodes.push({
          code: codeClean,
          name: m.subjectName || '',
          examDate: String(m.examDate || '').trim(),
          session: m.session || 'FN',
        });
      }
    });

    return uniqueCodes;
  }, [scheduledAssignments, selectedDepartment, selectedBatch, derivedReportBatch, selectedSemester]);

  // Real-time direct Firestore student listener matching Reports.jsx & Attendance.jsx concept
  const [directFirestoreStudents, setDirectFirestoreStudents] = useState<Student[]>([]);

  useEffect(() => {
    const activeBatch = selectedBatch || derivedReportBatch;
    if (!selectedProgramme || !selectedDepartment || !activeBatch) {
      setDirectFirestoreStudents([]);
      return;
    }

    // Resolve the exact Firestore programme key (e.g. B_E, B_Tech, M_E) — mirrors
    // MarkEntry.jsx / Upload.jsx `formatProgrammeKey`. The students namelist docs are
    // written under `{batch}_{progKey}_{deptKey}` (Upload/MarkEntry) and also under the
    // `{batch}_UG_{progKey}_{deptKey}` admission-flow variant, so we build BOTH.
    const formatProgKeyLocal = (p: string) => {
      const s = String(p || '').trim();
      const u = s.toUpperCase();
      if (u === 'B_E' || u === 'B.E.' || u === 'BE' || u.startsWith('B.E')) return 'B_E';
      if (u === 'B_TECH' || u === 'B.TECH' || u === 'BTECH' || u.startsWith('B.TECH') || u.startsWith('B_TECH')) return 'B_Tech';
      if (u === 'M_E' || u === 'M.E.' || u === 'ME' || u.startsWith('M.E')) return 'M_E';
      if (u === 'M_TECH' || u === 'M.TECH' || u === 'MTECH' || u.startsWith('M.TECH') || u.startsWith('M_TECH')) return 'M_Tech';
      if (u === 'UG' || u === 'PG' || u.includes('MBA') || u.includes('ADMINISTRATION')) return s;
      return s.replace(/[^A-Z0-9]+/gi, '_');
    };

    const sanitizeK = (k: string) => String(k || '').replace(/[.#$[\]]/g, '_');
    const sanitizeKStr = (k: string) => String(k || '').replace(/[.#$[\]/ ]/g, '_');

    const progKey = formatProgKeyLocal(selectedProgramme);
    const progBucket = isPgProgramme(selectedProgramme) ? 'PG' : 'UG';
    const sanitizedBatch = sanitizeK(activeBatch);
    const sanitizedDept = sanitizeK(selectedDepartment);

    const docIdVariants = [
      // Upload / MarkEntry format: {batch}_{progKey}_{dept}[_{Sec-X}]
      `${sanitizedBatch}_${progKey}_${sanitizedDept}`,
      `${sanitizedBatch}_${progKey}_${sanitizedDept}_Sec-A`,
      `${sanitizedBatch}_${progKey}_${sanitizedDept}_Sec-B`,
      `${sanitizedBatch}_${progKey}_${sanitizedDept}_Sec-C`,
      // Admission-flow format: {batch}_{UG|PG}_{progKey}_{dept}[_{Sec-X}]
      `${sanitizedBatch}_${progBucket}_${progKey}_${sanitizedDept}`,
      `${sanitizedBatch}_${progBucket}_${progKey}_${sanitizedDept}_Sec-A`,
      `${sanitizedBatch}_${progBucket}_${progKey}_${sanitizedDept}_Sec-B`,
      `${sanitizedBatch}_${progBucket}_${progKey}_${sanitizedDept}_Sec-C`,
      // Fallback: raw selectedProgramme token in place of programme key
      `${sanitizedBatch}_${sanitizeKStr(selectedProgramme)}_${sanitizedDept}`,
      `${sanitizedBatch}_${sanitizeKStr(selectedProgramme)}_${sanitizedDept}_Sec-A`,
      `${sanitizedBatch}_${sanitizeKStr(selectedProgramme)}_${sanitizedDept}_Sec-B`,
    ];

    const collections = ['students', 'approved_admissions'];
    const unsubs: Array<() => void> = [];
    const docMap = new Map<string, Map<string, Student>>();

    const emitDirectStudents = () => {
      const allDirect: Student[] = [];
      docMap.forEach((studentsInDoc) => {
        studentsInDoc.forEach((s) => allDirect.push(s));
      });
      allDirect.sort((a, b) => {
        const numA = parseInt(a.registerNumber.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(b.registerNumber.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.registerNumber.localeCompare(b.registerNumber);
      });
      setDirectFirestoreStudents(allDirect);
    };

    collections.forEach((collName) => {
      docIdVariants.forEach((docId) => {
        try {
          const docRef = doc(db, collName, docId);
          const unsub = onSnapshot(docRef, (snap) => {
            const keyInDocMap = `${collName}-${docId}`;
            if (snap.exists()) {
              const data = snap.data() || {};
              const meta = data._meta || {};
              const studentsInDoc = new Map<string, Student>();
              Object.entries(data).forEach(([key, val]) => {
                if (!key.startsWith('_')) {
                  const sName = typeof val === 'object' && val !== null ? (val as any).name || '' : String(val || '');
                  if (sName) {
                    const semNum = parseInt(selectedSemester || '7', 10) || 7;
                    studentsInDoc.set(key, {
                      id: `std-direct-${collName}-${docId}-${key}`,
                      name: sName,
                      registerNumber: key,
                      department: (meta.department || selectedDepartment) as Department,
                      programme: selectedProgramme,
                      subjectCode: '',
                      subjectName: '',
                      semester: semNum,
                      year: Math.ceil(semNum / 2),
                      academicYear: selectedAcademicYear || '2026-2027',
                      batch: activeBatch,
                      examDate: selectedExam?.date || '',
                      session: selectedExam?.session || 'FN',
                    });
                  }
                }
              });
              docMap.set(keyInDocMap, studentsInDoc);
            } else {
              docMap.delete(keyInDocMap);
            }
            emitDirectStudents();
          });
          unsubs.push(unsub);
        } catch (e) {
          // ignore
        }
      });
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [selectedProgramme, selectedDepartment, selectedBatch, derivedReportBatch, selectedAcademicYear, selectedSemester, selectedExam]);

  // Department-Wise Attendance Students Data (Aggregated across ALL exam halls)
  const departmentStudentsWithHall = useMemo(() => {
    const normDate = (d?: string) => String(d || '').replace(/[^0-9]/g, '');
    const targetDateNorm = normDate(selectedExam?.date);
    const targetSessNorm = String(selectedExam?.session || '').trim().toUpperCase();
    const hasBatchFilter = !!derivedReportBatch;

    // 1. Get all students of the chosen department / batch appearing for this exam date & session
    // When a batch is derived (UG CSE Sem 7 + AY 2026-2027 → 2023-2027), show THAT batch's full namelist
    // even if its scheduled exam date differs — this is the master branch-strength attendance sheet.
    const targetStudents = students.filter((st) => {
      // Exam date/session binding — skipped when a specific batch is targeted so the master namelist shows
      if (!hasBatchFilter) {
        const stDateNorm = normDate(st.examDate);
        const stSessNorm = String(st.session || '').trim().toUpperCase();
        const matchExam = (!targetDateNorm || stDateNorm === targetDateNorm) && (!targetSessNorm || stSessNorm === targetSessNorm);
        if (!matchExam) return false;
      }

      const normStDept = normalizeDeptName(st.department);

      // Programme / Department filters — UG bucket (from image) must match B.E. + B.Tech.
      if (selectedProgramme && selectedProgramme.trim() !== '' && selectedProgramme !== 'ALL') {
        // Prefer authoritative Firestore programme_departments membership
        const progDeptList = (firestoreDeptMap as any)?.[selectedProgramme];
        if (Array.isArray(progDeptList) && progDeptList.length > 0) {
          const progSet = new Set(progDeptList.map((d: string) => normalizeDeptName(d)));
          if (!progSet.has(normStDept)) {
            // The department is not explicitly listed for this programme — fall back to
            // programme-bucket matching so candidates whose department uses a slightly
            // different label (or isn't listed in the config) are not silently dropped.
            const stProg = getProgrammeForDept(normStDept);
            if (isUgProgramme(selectedProgramme)) {
              if (!(stProg === 'B_E' || stProg === 'B_Tech' || stProg === 'UG')) return false;
            } else if (isPgProgramme(selectedProgramme)) {
              if (!(stProg === 'PG_MBA' || stProg === 'M_E' || stProg === 'M_Tech' || stProg === 'PG')) return false;
            } else {
              return false;
            }
          }
        } else {
          const stProg = getProgrammeForDept(normStDept);
          const selNorm = String(selectedProgramme).trim().toUpperCase();
          if (selNorm === 'UG') {
            if (!(stProg === 'B_E' || stProg === 'B_Tech' || stProg === 'UG')) return false;
          } else if (selNorm === 'PG' || selNorm === 'PG_MBA' || selNorm === 'MBA' || selNorm === 'ADMINISTRATION') {
            if (!(stProg === 'PG_MBA' || stProg === 'M_E' || stProg === 'M_Tech' || stProg === 'PG')) return false;
          } else {
            const matchProg =
              (selNorm === 'B_E' || selNorm === 'BE') ? stProg === 'B_E' :
                (selNorm === 'B_TECH' || selNorm === 'BTECH') ? stProg === 'B_Tech' :
                  (selNorm === 'M_E' || selNorm === 'ME') ? stProg === 'M_E' :
                    (selNorm === 'M_TECH' || selNorm === 'MTECH') ? stProg === 'M_Tech' :
                      stProg === selectedProgramme;
            if (!matchProg) return false;
          }
        }
      }

      // Department filter
      if (selectedDepartment && selectedDepartment.trim() !== '' && selectedDepartment !== 'ALL') {
        const normSelDept = normalizeDeptName(selectedDepartment);
        if (normStDept !== normSelDept && st.department !== selectedDepartment) return false;
      }

      const targetBatch = selectedBatch || derivedReportBatch;
      const isPG = isPgProgramme(selectedProgramme);

      // Strict Batch filter — check st.batch property OR derive from register number (e.g. 420723104001 -> 2023-2027)
      if (targetBatch) {
        const targetBatchNorm = normalizeBatch(targetBatch);
        const stEffectiveBatch = extractCandidateBatch(st, isPG);
        if (targetBatchNorm && stEffectiveBatch !== targetBatchNorm) {
          return false;
        }
      }

      // Strict Academic Year & Semester Coordinated Filter
      if (targetBatch && selectedAcademicYear && selectedSemester) {
        const selSemNum = parseInt(selectedSemester, 10);
        const expectedSem = deriveSemFromBatchAy(targetBatch, selectedAcademicYear, isPG);

        // Check if expected semester for (targetBatch + selectedAcademicYear) matches selectedSemester
        if (expectedSem > 0 && Math.abs(expectedSem - selSemNum) > 1) {
          return false;
        }

        // Check candidate's stored semester if present
        if (st.semester && Math.abs(st.semester - selSemNum) > 1) {
          if (expectedSem > 0 && Math.abs(expectedSem - selSemNum) > 1) {
            return false;
          }
        }
      }

      return true;
    });

    // Merge direct Firestore student query results (matching Reports.jsx & Attendance.jsx concept)
    const candidateMap = new Map<string, Student>();
    targetStudents.forEach((st) => candidateMap.set(st.registerNumber, st));

    const targetBatch = selectedBatch || derivedReportBatch;
    const isPG = isPgProgramme(selectedProgramme);
    const selSemNum = selectedSemester ? parseInt(selectedSemester, 10) : 0;

    directFirestoreStudents.forEach((st) => {
      // Validate directFirestoreStudents against Batch + Academic Year + Semester
      if (targetBatch) {
        const targetBatchNorm = normalizeBatch(targetBatch);
        const stEffectiveBatch = extractCandidateBatch(st, isPG);
        if (targetBatchNorm && stEffectiveBatch !== targetBatchNorm) return;
      }
      if (targetBatch && selectedAcademicYear && selSemNum > 0) {
        const expectedSem = deriveSemFromBatchAy(targetBatch, selectedAcademicYear, isPG);
        if (expectedSem > 0 && Math.abs(expectedSem - selSemNum) > 1) return;
      }

      if (!candidateMap.has(st.registerNumber)) {
        candidateMap.set(st.registerNumber, st);
      }
    });

    const candidateList = Array.from(candidateMap.values());

    // 2. Map with their allocated seat and hall info
    const enrichedList = candidateList.map((st) => {
      const seat = allocatedSeats.find(
        (s) => s.student.id === st.id || s.student.registerNumber === st.registerNumber
      );

      const room = seat ? roomMap.get(seat.roomId) : undefined;

      return {
        student: st,
        seat,
        room,
        hallNumber: room ? room.roomNumber : 'Unallocated',
        hallBlock: room ? `${room.block} - ${room.floor}` : '-',
        deskNumber: seat ? `${seat.deskNumber} (${seat.slotPosition})` : 'Unassigned',
      };
    });

    // 3. Sort based on deptSortBy
    if (deptSortBy === 'regNo') {
      enrichedList.sort((a, b) =>
        a.student.registerNumber.localeCompare(b.student.registerNumber, undefined, { numeric: true })
      );
    } else if (deptSortBy === 'hall') {
      enrichedList.sort((a, b) => {
        if (a.hallNumber !== b.hallNumber) {
          return a.hallNumber.localeCompare(b.hallNumber);
        }
        return a.student.registerNumber.localeCompare(b.student.registerNumber, undefined, { numeric: true });
      });
    } else if (deptSortBy === 'name') {
      enrichedList.sort((a, b) => a.student.name.localeCompare(b.student.name));
    }

    return enrichedList;
  }, [students, allocatedSeats, selectedExam.date, selectedExam.session, selectedProgramme, selectedDepartment, selectedAcademicYear, selectedSemester, derivedReportBatch, deptSortBy, roomMap]);

  // Summary of halls used for this department
  const deptHallDistribution = useMemo(() => {
    const dist: { [hall: string]: number } = {};
    departmentStudentsWithHall.forEach((item) => {
      dist[item.hallNumber] = (dist[item.hallNumber] || 0) + 1;
    });
    return dist;
  }, [departmentStudentsWithHall]);

  // Department counts in this hall
  const deptCounts = useMemo(() => {
    const counts: { [dept in Department]?: number } = {};
    rawHallSeats.forEach((s) => {
      counts[s.student.department] = (counts[s.student.department] || 0) + 1;
    });
    return counts;
  }, [rawHallSeats]);

  // Filtered and Sorted seats for display
  const sortedHallSeats = useMemo(() => {
    let list = [...rawHallSeats];

    if (deptFilter !== 'all') {
      list = list.filter((s) => s.student.department === deptFilter);
    }

    if (sortBy === 'department') {
      list.sort((a, b) => {
        // First sort by Department
        if (a.student.department !== b.student.department) {
          return a.student.department.localeCompare(b.student.department);
        }
        // Then sort by Register Number numerically
        return a.student.registerNumber.localeCompare(b.student.registerNumber, undefined, { numeric: true });
      });
    } else if (sortBy === 'desk') {
      list.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        if (a.col !== b.col) return a.col - b.col;
        return a.slotPosition.localeCompare(b.slotPosition);
      });
    } else if (sortBy === 'regNo') {
      list.sort((a, b) =>
        a.student.registerNumber.localeCompare(b.student.registerNumber, undefined, { numeric: true })
      );
    }

    return list;
  }, [rawHallSeats, deptFilter, sortBy]);

  // Grouped by Department when department sorting is selected
  const groupedSeatsByDept = useMemo(() => {
    const groups: { [dept: string]: { subjectCode: string; subjectName: string; seats: AllocatedSeat[] } } = {};

    sortedHallSeats.forEach((seat) => {
      const dept = seat.student.department;
      if (!groups[dept]) {
        groups[dept] = {
          subjectCode: seat.student.subjectCode,
          subjectName: seat.student.subjectName,
          seats: [],
        };
      }
      groups[dept].seats.push(seat);
    });

    return groups;
  }, [sortedHallSeats]);

  // Question Paper Distribution Data for current Date and Session
  const qpDistributionData = useMemo(() => {
    const examSeats = allocatedSeats.filter(
      (s) => s.student.examDate === selectedExam.date && s.student.session === selectedExam.session
    );

    const roomGroups: {
      room: Room;
      invigilator?: DutyAllocation;
      subjects: {
        key: string;
        department: Department;
        subjectCode: string;
        subjectName: string;
        studentCount: number;
        registerNumbers: string[];
        regNoRange: string;
      }[];
      totalStudents: number;
    }[] = [];

    rooms.forEach((room) => {
      const hallSeats = examSeats.filter((s) => s.roomId === room.id);
      if (hallSeats.length === 0) return;

      // Find assigned invigilator
      const invigilator = dutyAllocations.find(
        (d) => d.roomId === room.id && d.examDate === selectedExam.date && d.session === selectedExam.session
      );

      // Group seats in this hall by department & subjectCode
      const subMap: {
        [key: string]: {
          department: Department;
          subjectCode: string;
          subjectName: string;
          seats: AllocatedSeat[];
        };
      } = {};

      hallSeats.forEach((seat) => {
        const key = `${seat.student.department}___${seat.student.subjectCode}`;
        if (!subMap[key]) {
          subMap[key] = {
            department: seat.student.department,
            subjectCode: seat.student.subjectCode,
            subjectName: seat.student.subjectName,
            seats: [],
          };
        }
        subMap[key].seats.push(seat);
      });

      const subjects = Object.values(subMap).map((item) => {
        const sortedRegs = item.seats
          .map((s) => s.student.registerNumber)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const regNoRange =
          sortedRegs.length === 1
            ? sortedRegs[0]
            : sortedRegs.length > 1
              ? `${sortedRegs[0]} – ${sortedRegs[sortedRegs.length - 1]}`
              : '-';

        const studentCount = item.seats.length;

        return {
          key: `${item.department}___${item.subjectCode}`,
          department: item.department,
          subjectCode: item.subjectCode,
          subjectName: item.subjectName,
          studentCount,
          registerNumbers: sortedRegs,
          regNoRange,
        };
      });

      // Sort subjects alphabetically by department
      subjects.sort((a, b) => a.department.localeCompare(b.department));

      const totalStudents = subjects.reduce((sum, s) => sum + s.studentCount, 0);

      roomGroups.push({
        room,
        invigilator,
        subjects,
        totalStudents,
      });
    });

    // Sort halls numerically by room number
    roomGroups.sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true }));

    return roomGroups;
  }, [allocatedSeats, rooms, dutyAllocations, selectedExam.date, selectedExam.session]);

  // Filtered Hall groups based on selected hall and department filters
  const filteredQpHallGroups = useMemo(() => {
    return qpDistributionData
      .filter((group) => {
        if (qpSelectedHall !== 'all' && group.room.id !== qpSelectedHall) return false;
        if (qpSelectedDept !== 'all' && !group.subjects.some((s) => s.department === qpSelectedDept)) return false;
        return true;
      })
      .map((group) => {
        if (qpSelectedDept === 'all') return group;
        const filteredSubjects = group.subjects.filter((s) => s.department === qpSelectedDept);
        return {
          ...group,
          subjects: filteredSubjects,
          totalStudents: filteredSubjects.reduce((sum, s) => sum + s.studentCount, 0),
        };
      });
  }, [qpDistributionData, qpSelectedHall, qpSelectedDept]);

  // Consolidated Subject-Wise Indent Requirement across all halls
  const qpSubjectConsolidated = useMemo(() => {
    const subjectMap: {
      [code: string]: {
        subjectCode: string;
        subjectName: string;
        departments: Set<Department>;
        halls: { roomNumber: string; studentCount: number }[];
        totalStudents: number;
      };
    } = {};

    qpDistributionData.forEach((group) => {
      group.subjects.forEach((sub) => {
        if (!subjectMap[sub.subjectCode]) {
          subjectMap[sub.subjectCode] = {
            subjectCode: sub.subjectCode,
            subjectName: sub.subjectName,
            departments: new Set(),
            halls: [],
            totalStudents: 0,
          };
        }
        const item = subjectMap[sub.subjectCode];
        item.departments.add(sub.department);
        item.halls.push({
          roomNumber: group.room.roomNumber,
          studentCount: sub.studentCount,
        });
        item.totalStudents += sub.studentCount;
      });
    });

    return Object.values(subjectMap).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
  }, [qpDistributionData]);

  // Overall metric totals for QP Distribution
  const qpTotalCandidates = useMemo(() => {
    return filteredQpHallGroups.reduce((sum, g) => sum + g.totalStudents, 0);
  }, [filteredQpHallGroups]);

  // Invigilator for selected hall
  const hallInvigilator = dutyAllocations.find(
    (d) => d.roomId === selectedHallId && d.examScheduleId === selectedExam.id
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExportCurrentReportCSV = () => {
    if (reportType === 'qp-distribution') {
      if (qpViewMode === 'subject-summary') {
        const headers = [
          'S.No',
          'Subject Code',
          'Subject Title / Course Name',
          'Appearing Departments',
          'Deployed Exam Halls & Counts',
          'Total Candidate Strength / Required QPs',
        ];
        const rows = qpSubjectConsolidated.map((item, idx) => [
          (idx + 1).toString(),
          item.subjectCode,
          item.subjectName,
          Array.from(item.departments).join(', '),
          item.halls.map((h) => `${h.roomNumber} (${h.studentCount})`).join('; '),
          item.totalStudents.toString(),
        ]);
        downloadCSV(
          `QP_Subject_Indent_Summary_${selectedExam.date}_${selectedExam.session}.csv`,
          [headers, ...rows]
        );
      } else {
        const headers = [
          'S.No',
          'Exam Date',
          'Session',
          'Hall Number',
          'Block & Floor',
          'Invigilator Name',
          'Invigilator Dept',
          'Department',
          'Subject Code',
          'Subject Title',
          'Candidate Strength',
          'Register Number Range',
          'Invigilator Signature',
        ];
        let rowIdx = 1;
        const rows: string[][] = [];
        filteredQpHallGroups.forEach((group) => {
          group.subjects.forEach((sub) => {
            rows.push([
              (rowIdx++).toString(),
              selectedExam.date,
              selectedExam.session,
              group.room.roomNumber,
              `${group.room.block} - ${group.room.floor}`,
              group.invigilator?.facultyName || 'To be assigned',
              group.invigilator?.facultyDept || '-',
              sub.department,
              sub.subjectCode,
              sub.subjectName,
              sub.studentCount.toString(),
              sub.regNoRange,
              '',
            ]);
          });
        });
        downloadCSV(
          `QP_Distribution_Master_${selectedExam.date}_${selectedExam.session}.csv`,
          [headers, ...rows]
        );
      }
    } else if (reportType === 'dept-attendance') {
      const headers = [
        'S.No',
        'Department',
        'Register No',
        'Candidate Name',
        'Allocated Exam Hall',
        'Hall Block & Floor',
        'Desk No & Slot',
        'Course / Subject',
        'Exam Date',
        'Session',
        'Candidate Signature',
      ];
      const rows = departmentStudentsWithHall.map((item, idx) => [
        (idx + 1).toString(),
        item.student.department,
        item.student.registerNumber,
        item.student.name,
        item.hallNumber,
        item.hallBlock,
        item.deskNumber,
        `${item.student.subjectCode} - ${item.student.subjectName}`,
        item.student.examDate,
        item.student.session,
        '',
      ]);
      downloadCSV(
        `Department_Attendance_${selectedDepartment}_${selectedExam.date}_${selectedExam.session}.csv`,
        [headers, ...rows]
      );
    } else if (reportType === 'door-notice') {
      const headers = ['S.No', 'Department', 'Register No', 'Candidate Name', 'Desk No', 'Course Code', 'Course Title', 'Exam Date', 'Session', 'Signature'];
      const rows = sortedHallSeats.map((s, idx) => [
        (idx + 1).toString(),
        s.student.department,
        s.student.registerNumber,
        s.student.name,
        `${s.deskNumber} (${s.slotPosition})`,
        s.student.subjectCode,
        s.student.subjectName,
        s.student.examDate,
        s.student.session,
        '',
      ]);
      downloadCSV(`Hall_Door_Notice_${selectedRoom?.roomNumber}_${selectedExam.date}_${sortBy}.csv`, [headers, ...rows]);
    } else if (reportType === 'admin-oversight') {
      const headers = ['Hall Number', 'Block', 'Floor', 'Capacity', 'Allocated Students', 'Utilization %', 'Invigilator Name', 'Department', 'Status'];
      const rows = rooms.map((r) => {
        const seated = allocatedSeats.filter((s) => s.roomId === r.id).length;
        const inv = dutyAllocations.find((d) => d.roomId === r.id && d.examScheduleId === selectedExam.id);
        return [
          r.roomNumber,
          r.block,
          r.floor,
          r.totalCapacity.toString(),
          seated.toString(),
          r.totalCapacity > 0 ? `${Math.round((seated / r.totalCapacity) * 100)}%` : '0%',
          inv?.facultyName || 'Unassigned',
          inv?.facultyDept || '-',
          r.status,
        ];
      });
      downloadCSV(`Exam_Cell_Oversight_Report_${selectedExam.date}.csv`, [headers, ...rows]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Configuration Bar (Hidden on Print) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase">
              <Printer className="w-4 h-4" />
              <span>Automated Report Generator & Print Publisher</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              Examination Charts & Oversight Reports
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              High-resolution printable door notices, desk stickers, absentee statement sheets, and consolidated administrative oversight summaries.
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              id="export-report-csv-btn"
              onClick={handleExportCurrentReportCSV}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              id="print-document-btn"
              onClick={handlePrint}
              className="flex items-center space-x-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print Document (PDF)</span>
            </button>
          </div>
        </div>

        {/* Report Selector Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">
            Document Type:
          </span>

          {[
            { id: 'dept-attendance', label: '1. Department Attendance Report (With Hall No)' },
            { id: 'admin-oversight', label: '2. Admin Oversight Master Report' },
            { id: 'absentee-statement', label: '3. Absentee & Booklet Statement' },
            { id: 'faculty-orders', label: '4. Faculty Duty Memo' },
          ].map((rpt) => (
            <button
              key={rpt.id}
              id={`report-tab-${rpt.id}`}
              onClick={() => setReportType(rpt.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${reportType === rpt.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
            >
              {rpt.label}
            </button>
          ))}
        </div>

        {/* Filters for Question Paper Distribution Report */}
        {reportType === 'qp-distribution' && (
          <div className="space-y-3 pt-3 mt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* View Sub-mode Switcher */}
              <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  id="qp-view-mode-matrix"
                  onClick={() => setQpViewMode('matrix')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${qpViewMode === 'matrix'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  📋 Master Distribution Register
                </button>
                <button
                  id="qp-view-mode-summary"
                  onClick={() => setQpViewMode('subject-summary')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${qpViewMode === 'subject-summary'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  📊 Subject-Wise Indent Summary
                </button>
                <button
                  id="qp-view-mode-slips"
                  onClick={() => setQpViewMode('envelope-slips')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${qpViewMode === 'envelope-slips'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  ✉️ Hall QP Packet Envelope Covers
                </button>
              </div>

              {/* Quick Exam Date & Session Badge */}
              <div className="flex items-center space-x-2 bg-indigo-50 border border-indigo-200/80 px-3 py-1.5 rounded-xl text-indigo-950 font-bold">
                <span>🗓️ {selectedExam.date} ({selectedExam.session})</span>
                <span className="text-indigo-400">•</span>
                <span>{selectedExam.timeSlot}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Hall Selector */}
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-700">Filter Exam Hall:</span>
                <select
                  id="select-qp-hall"
                  value={qpSelectedHall}
                  onChange={(e) => setQpSelectedHall(e.target.value)}
                  aria-label="Filter examination hall for question paper report"
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                >
                  <option value="all">🏢 All Exam Halls ({rooms.length} Halls)</option>
                  {rooms.map((room) => {
                    const seated = allocatedSeats.filter(
                      (s) =>
                        s.roomId === room.id &&
                        s.student.examDate === selectedExam.date &&
                        s.student.session === selectedExam.session
                    ).length;
                    return (
                      <option key={room.id} value={room.id}>
                        {room.roomNumber} ({room.block} - {room.floor}) [{seated} Students]
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Department Filter */}
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-700">Filter Branch:</span>
                <select
                  id="select-qp-dept"
                  value={qpSelectedDept}
                  onChange={(e) => setQpSelectedDept(e.target.value)}
                  aria-label="Filter branch for question paper report"
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                >
                  <option value="all">🎓 All Departments</option>
                  {allExamDepartments.map((d) => (
                    <option key={d} value={d}>
                      Department of {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Filters for Department-Wise Attendance Report */}
        {reportType === 'dept-attendance' && (
          <div className="flex flex-wrap items-center gap-4 pt-3 mt-3 border-t border-slate-100 text-xs">
            {/* Select Programme Dropdown */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Select Programme:</span>
              <select
                id="select-programme-attendance"
                value={selectedProgramme}
                onChange={(e) => {
                  const newProg = e.target.value;
                  setSelectedProgramme(newProg);
                }}
                aria-label="Select programme for attendance sheet"
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none"
              >
                <option value="" disabled hidden>-- Select Programme --</option>
                {availableProgrammes.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Department Dropdown */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Select Department:</span>
              <select
                id="select-dept-attendance-branch"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                aria-label="Select department branch for attendance sheet"
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none"
              >
                <option value="" disabled hidden>-- Select Department --</option>
                {availableDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Batch Dropdown */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Select Batch:</span>
              <select
                id="select-batch-attendance"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                aria-label="Select batch for attendance sheet"
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none"
              >
                <option value="">All Batches</option>
                {availableBatches.map((b) => (
                  <option key={b} value={b}>
                    Batch {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Academic Year Dropdown */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Academic Year:</span>
              <select
                id="select-academic-year-attendance"
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                aria-label="Select academic year for attendance sheet"
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none"
              >
                <option value="">All Academic Years</option>
                {availableAcademicYears.map((ay) => (
                  <option key={ay} value={ay}>
                    {ay}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Dropdown */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Semester:</span>
              <select
                id="select-semester-attendance"
                value={selectedSemester}
                onChange={(e) => {
                  const semVal = e.target.value;
                  setSelectedSemester(semVal);
                  // Map chosen sem -> AY so THAT batch's namelist shows in the form below (image concept)
                  // Scoped to the selected programme/department so CSE Sem 7 picks CSE's AY (2026-2027)
                  if (semVal) {
                    const semNum = parseInt(semVal, 10);
                    const ayCounts = new Map<string, number>();
                    students.forEach((st) => {
                      if (st.semester !== semNum || !st.academicYear) return;
                      const normStDept = normalizeDeptName(st.department);
                      if (selectedProgramme && selectedProgramme.trim() !== '' && selectedProgramme !== 'ALL') {
                        const stProg = getProgrammeForDept(normStDept);
                        const matchProg =
                          (selectedProgramme === 'B_E' || selectedProgramme === 'BE') ? stProg === 'B_E' :
                            (selectedProgramme === 'B_TECH' || selectedProgramme === 'BTECH') ? stProg === 'B_Tech' :
                              (selectedProgramme === 'PG_MBA' || selectedProgramme === 'MBA') ? stProg === 'PG_MBA' :
                                (selectedProgramme === 'M_E' || selectedProgramme === 'ME') ? stProg === 'M_E' :
                                  (selectedProgramme === 'M_TECH' || selectedProgramme === 'MTECH') ? stProg === 'M_Tech' :
                                    stProg === selectedProgramme;
                        if (!matchProg) return;
                      }
                      if (selectedDepartment && selectedDepartment.trim() !== '' && selectedDepartment !== 'ALL') {
                        const normSelDept = normalizeDeptName(selectedDepartment);
                        if (normStDept !== normSelDept && st.department !== selectedDepartment) return;
                      }
                      ayCounts.set(st.academicYear, (ayCounts.get(st.academicYear) || 0) + 1);
                    });
                    if (ayCounts.size > 0) {
                      let bestAy = '';
                      let bestCount = -1;
                      ayCounts.forEach((cnt, ay) => {
                        if (cnt > bestCount) { bestCount = cnt; bestAy = ay; }
                      });
                      setSelectedAcademicYear(bestAy);
                    } else {
                      // No data for that sem+dept — keep the current/derived AY so reverse-engineering still yields a batch
                      // (e.g. UG CSE Sem 7 + AY 2026-2027 → 2023-2027 even if no prior candidate record)
                    }
                  } else {
                    // All Semesters — reset AY to current AY
                    setSelectedAcademicYear(getAcademicYearForDate(new Date()));
                  }
                }}
                aria-label="Select semester for attendance sheet"
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none"
              >
                <option value="">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>
                    Sem {sem}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Sort Candidates By:</span>
              <select
                id="select-dept-sorting"
                value={deptSortBy}
                onChange={(e) => setDeptSortBy(e.target.value as any)}
                aria-label="Sort department candidates"
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
              >
                <option value="regNo">🔢 Register Number (Ascending 01, 02...)</option>
                <option value="hall">🏢 Allocated Exam Hall No (Group by LH-101, LH-201...)</option>
                <option value="name">🔤 Candidate Name (A to Z)</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 ml-auto">
              <input
                id="dept-include-signatures-toggle"
                type="checkbox"
                checked={includeSignatures}
                onChange={(e) => setIncludeSignatures(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <label htmlFor="dept-include-signatures-toggle" className="text-slate-600 font-medium cursor-pointer">
                Include Candidate Signature Column
              </label>
            </div>
          </div>
        )}

        {/* Filters if Hall-specific (Door Notice, Desk Slips, Absentee Statement) */}
        {(reportType === 'door-notice' || reportType === 'desk-slips' || reportType === 'absentee-statement') && (
          <div className="flex flex-wrap items-center gap-4 pt-3 mt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600">Select Exam Hall:</span>
              <select
                id="select-print-hall"
                value={selectedHallId}
                onChange={(e) => setSelectedHallId(e.target.value)}
                aria-label="Select examination hall for printing"
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.roomNumber} ({room.block} - {room.floor}) [{allocatedSeats.filter((s) => s.roomId === room.id).length} Students]
                  </option>
                ))}
              </select>
            </div>

            {/* Sorting Order Selector */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600 flex items-center space-x-1">
                <span>Sort Candidate List:</span>
              </span>
              <select
                id="select-print-sorting"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SeatingSortOrder)}
                aria-label="Select candidate sorting order for attendance report"
                className="px-3 py-1.5 bg-indigo-50/80 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none cursor-pointer"
              >
                <option value="department">🎓 Department-Wise (Sorted by Dept & Reg No)</option>
                <option value="desk">🪑 Physical Desk Order (R1-C1, R1-C2...)</option>
                <option value="regNo">🔢 Register Number Order (Numeric)</option>
              </select>
            </div>

            {/* Department Filter */}
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600">Filter Branch:</span>
              <select
                id="select-print-dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Filter specific department for printing"
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none"
              >
                <option value="all">All Departments ({rawHallSeats.length})</option>
                {hallDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d} ({deptCounts[d] || 0} Students)
                  </option>
                ))}
              </select>
            </div>

            {sortBy === 'department' && (
              <div className="flex items-center space-x-2">
                <input
                  id="group-by-dept-toggle"
                  type="checkbox"
                  checked={groupByDept}
                  onChange={(e) => setGroupByDept(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <label htmlFor="group-by-dept-toggle" className="text-slate-600 font-medium cursor-pointer">
                  Group with Branch Header Banners
                </label>
              </div>
            )}

            <div className="flex items-center space-x-2 ml-auto">
              <input
                id="include-signatures-toggle"
                type="checkbox"
                checked={includeSignatures}
                onChange={(e) => setIncludeSignatures(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <label htmlFor="include-signatures-toggle" className="text-slate-600 font-medium cursor-pointer">
                Include Signatures & Verification Columns
              </label>
            </div>
          </div>
        )}
      </div>

      {/* PRINTABLE CANVAS CONTAINER - outer card removed, namelist shows directly at this place */}
      <div ref={printAreaRef} className="text-slate-900">
        {/* DOCUMENT 1: DEPARTMENT-WISE ATTENDANCE & HALL MAPPING REPORT */}
        {reportType === 'dept-attendance' && (
          <div className="space-y-6">
            {/* Official Header */}
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                {collegeName}
              </h2>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                {examSubTitle}
              </p>
              <div className="pt-2 text-sm font-extrabold uppercase bg-slate-900 text-white py-1.5 rounded-md tracking-wider">
                DEPARTMENT-WISE CANDIDATE ATTENDANCE & HALL ALLOCATION MASTER REPORT
              </div>
            </div>

            {/* Department Meta Information Table */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border border-slate-900 p-3 bg-slate-50/50">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Department / Branch:</span>
                <span className="font-bold text-slate-900 text-sm">
                  {!selectedDepartment || selectedDepartment === 'ALL' ? 'All Engineering Departments' : `Department of ${selectedDepartment}`}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Examination:</span>
                <span className="font-bold text-slate-900">{selectedExam.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Date & Session:</span>
                <span className="font-bold text-slate-900">
                  {selectedExam.date} ({selectedExam.session}) • {selectedExam.timeSlot}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Subject / Course:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {activeSubjectInfo}
                </span>
              </div>
            </div>



            {/* Department Students Table */}
            <div>
              <table className="w-full text-left border-collapse border border-slate-900 text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-2 border-r border-slate-900 text-center w-12">S.No</th>
                    <th className="py-2.5 px-3 border-r border-slate-900 w-36">Register Number</th>
                    <th className="py-2.5 px-3 border-r border-slate-900 min-w-[180px]">Candidate Name</th>
                    {batchSubjectCodes.map((sub) => (
                      <th
                        key={sub.code}
                        title={`${sub.code} — ${sub.name} (${sub.examDate})`}
                        className="py-2 px-2 border-r border-slate-900 text-center min-w-[100px] w-32 font-mono bg-indigo-50/90 text-indigo-950 font-black tracking-tight"
                      >
                        <div className="text-xs font-black text-slate-900">{sub.code}</div>
                        {sub.examDate && (
                          <div className="text-[9px] font-sans font-bold text-indigo-800 mt-0.5 tracking-normal">
                            {sub.examDate}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {departmentStudentsWithHall.length === 0 ? (
                    <tr>
                      <td colSpan={3 + Math.max(0, batchSubjectCodes.length)} className="py-8 text-center text-slate-500 font-semibold italic">
                        No candidate records found for the selected department, batch ({selectedBatch || derivedReportBatch || 'All'}), and semester ({selectedSemester || 'All'}).
                      </td>
                    </tr>
                  ) : (
                    departmentStudentsWithHall.map((item, idx) => (
                      <tr key={item.student.id} className="border-b border-slate-300 hover:bg-slate-50/50">
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-mono font-medium">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-900 font-mono font-bold text-slate-900">
                          {item.student.registerNumber}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-900 font-semibold text-slate-800">
                          {item.student.name}
                        </td>
                        {batchSubjectCodes.map((sub) => (
                          <td
                            key={sub.code}
                            className="py-2 px-2 border-r border-slate-900 text-center text-slate-300 font-mono text-[10px]"
                          >
                            {/* Signature / Attendance space */}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Attendance & Verification Box */}
            <div className="border border-slate-900 p-4 space-y-4 bg-slate-50/50 mt-6">
              <div className="grid grid-cols-4 gap-4 text-xs font-bold">
                <div>Total Candidates: {departmentStudentsWithHall.length}</div>
                <div>Present Count: ________</div>
                <div>Absent Count: ________</div>
                <div>Percentage: ________ %</div>
              </div>

              <div className="pt-8 flex items-center justify-between text-xs font-bold">
                <div>
                  <div className="border-t border-slate-900 pt-1 w-48 text-center">
                    Department Exam Coordinator
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-900 pt-1 w-48 text-center">
                    Head of Department (HOD)
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-900 pt-1 w-48 text-center">
                    Chief Superintendent / COE
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT 2: QUESTION PAPER DISTRIBUTION & INDENT REPORT */}
        {reportType === 'qp-distribution' && (
          <div className="space-y-6">
            {/* Official Header */}
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                {collegeName}
              </h2>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                {examSubTitle}
              </p>
              <div className="pt-2 text-sm font-extrabold uppercase bg-slate-900 text-white py-1.5 rounded-md tracking-wider">
                {qpViewMode === 'subject-summary'
                  ? 'SUBJECT-WISE CONSOLIDATED QUESTION PAPER INDENT SUMMARY'
                  : qpViewMode === 'envelope-slips'
                    ? 'EXAMINATION HALL QUESTION PAPER PACKET DOCKET & COVER SLIPS'
                    : 'QUESTION PAPER DISTRIBUTION & INDENT STATEMENT (HALL / DEPT / SUBJECT-WISE)'}
              </div>
            </div>

            {/* Exam & Session Meta Table */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border border-slate-900 p-3 bg-slate-50/70">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Examination:</span>
                <span className="font-bold text-slate-900">{selectedExam.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Date & Session:</span>
                <span className="font-bold text-slate-900">
                  {selectedExam.date} ({selectedExam.session})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Time Slot:</span>
                <span className="font-bold text-slate-900">{selectedExam.timeSlot}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Candidates / QPs:</span>
                <span className="font-extrabold font-mono text-indigo-900 text-sm">{qpTotalCandidates}</span>
              </div>
            </div>

            {/* VIEW MODE 1: MASTER DISTRIBUTION REGISTER */}
            {qpViewMode === 'matrix' && (
              <div className="space-y-6">
                {filteredQpHallGroups.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 rounded-xl">
                    <p className="text-sm font-bold text-slate-600">
                      No question paper allocations found for the selected hall or department filter.
                    </p>
                  </div>
                ) : (
                  filteredQpHallGroups.map((group) => (
                    <div key={group.room.id} className="border border-slate-900 overflow-hidden">
                      {/* Hall Banner */}
                      <div className="bg-slate-900 text-white px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider">
                        <div className="flex items-center space-x-2">
                          <span className="bg-indigo-500 text-white px-2 py-0.5 rounded text-[11px] font-black">
                            {group.room.roomNumber}
                          </span>
                          <span className="text-slate-200">
                            {group.room.block} — Floor {group.room.floor}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 normal-case font-normal text-[11px]">
                          <span className="text-slate-300">
                            Invigilator:{' '}
                            <strong className="text-white font-bold">
                              {group.invigilator?.facultyName || 'To be assigned'}
                            </strong>{' '}
                            {group.invigilator && `(${group.invigilator.facultyDept})`}
                          </span>
                          <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-white font-mono font-bold">
                            Hall Student Strength: {group.totalStudents}
                          </span>
                        </div>
                      </div>

                      {/* Hall Subjects Table */}
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold uppercase text-[10px]">
                            <th className="py-2 px-2 border-r border-slate-900 text-center w-10">S.No</th>
                            <th className="py-2 px-2 border-r border-slate-900 text-center w-20">Dept</th>
                            <th className="py-2 px-2 border-r border-slate-900 text-center w-28">Subject Code</th>
                            <th className="py-2 px-3 border-r border-slate-900">Subject Title / Course Name</th>
                            <th className="py-2 px-2 border-r border-slate-900 text-center w-28 bg-indigo-50/60 text-indigo-950 font-black">
                              Student Strength
                            </th>
                            <th className="py-2 px-3 border-r border-slate-900 text-center w-56">
                              Register Number Range
                            </th>
                            <th className="py-2 px-3 text-center w-48">
                              Invigilator Signature
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                          {group.subjects.map((sub, idx) => (
                            <tr key={sub.key} className="border-b border-slate-300 hover:bg-slate-50/50">
                              <td className="py-2.5 px-2 border-r border-slate-900 text-center font-mono font-medium">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-2 border-r border-slate-900 text-center font-bold text-slate-800">
                                {sub.department}
                              </td>
                              <td className="py-2.5 px-2 border-r border-slate-900 text-center font-mono font-bold text-indigo-900">
                                {sub.subjectCode}
                              </td>
                              <td className="py-2.5 px-3 border-r border-slate-900 font-semibold text-slate-800">
                                {sub.subjectName}
                              </td>
                              <td className="py-2.5 px-2 border-r border-slate-900 text-center font-black font-mono text-indigo-950 bg-indigo-50/40 text-sm">
                                {sub.studentCount}
                              </td>
                              <td className="py-2.5 px-3 border-r border-slate-900 text-center font-mono text-[11px] text-slate-700">
                                {sub.regNoRange}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300">
                                {/* Invigilator Handover Signature space */}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold border-t-2 border-slate-900 text-slate-900">
                            <td colSpan={4} className="py-2 px-3 border-r border-slate-900 text-right uppercase text-[10px]">
                              Subtotal for Hall {group.room.roomNumber}:
                            </td>
                            <td className="py-2 px-2 border-r border-slate-900 text-center font-mono font-black text-indigo-950 bg-indigo-100/60">
                              {group.totalStudents}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 text-center text-slate-500 text-[10px]">
                              {group.subjects.length} Course{group.subjects.length > 1 ? 's' : ''}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-400 text-[10px]"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))
                )}

                {/* Grand Total Summary Box */}
                <div className="border-2 border-slate-900 p-4 bg-slate-100 text-xs font-bold text-slate-900">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Exam Halls:</span>
                      <span className="text-base font-black text-slate-900 font-mono">{filteredQpHallGroups.length}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Student Strength / QPs:</span>
                      <span className="text-base font-black text-indigo-900 font-mono">{qpTotalCandidates} Candidates</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Distinct Courses:</span>
                      <span className="text-base font-black text-slate-800 font-mono">{qpSubjectConsolidated.length} Subjects</span>
                    </div>
                  </div>
                </div>

                {/* Signatures and Handover Verification */}
                <div className="border border-slate-900 p-4 bg-slate-50/50 space-y-4">
                  <div className="text-[11px] text-slate-600 font-medium">
                    * Certified that the above question papers were verified according to student strength and handed over to the respective Hall Invigilators in the Central Examination Control Room prior to commencement.
                  </div>
                  <div className="pt-8 flex items-center justify-between text-xs font-bold text-slate-900">
                    <div className="text-center">
                      <div className="border-t border-slate-900 pt-1 w-48">
                        Exam Cell Despatch In-Charge
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-slate-900 pt-1 w-48">
                        Chief Superintendent
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-slate-900 pt-1 w-48">
                        Controller of Examinations (COE)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 2: SUBJECT-WISE CONSOLIDATED INDENT SUMMARY */}
            {qpViewMode === 'subject-summary' && (
              <div className="space-y-6">
                <div className="border border-slate-900 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-2 border-r border-slate-700 text-center w-10">S.No</th>
                        <th className="py-2.5 px-3 border-r border-slate-700 w-28">Subject Code</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">Course / Subject Title</th>
                        <th className="py-2.5 px-2 border-r border-slate-700 text-center w-28">Departments</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">Hall Distribution & Count</th>
                        <th className="py-2.5 px-3 text-center w-28 bg-indigo-900 text-indigo-100 font-black">
                          Student Strength
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {qpSubjectConsolidated.map((item, idx) => (
                        <tr key={item.subjectCode} className="border-b border-slate-300 hover:bg-slate-50/50">
                          <td className="py-2.5 px-2 border-r border-slate-900 text-center font-mono font-medium">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-900 font-mono font-black text-indigo-900 text-sm">
                            {item.subjectCode}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-900 font-bold text-slate-800">
                            {item.subjectName}
                          </td>
                          <td className="py-2.5 px-2 border-r border-slate-900 text-center font-semibold text-slate-700">
                            {Array.from(item.departments).join(', ')}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-900 font-mono text-[11px] text-slate-700">
                            <div className="flex flex-wrap gap-1.5">
                              {item.halls.map((h) => (
                                <span key={h.roomNumber} className="bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded text-slate-800">
                                  <strong>{h.roomNumber}</strong>: {h.studentCount}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-black font-mono text-indigo-950 bg-indigo-50 text-sm">
                            {item.totalStudents}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-black border-t-2 border-slate-900 text-slate-900 text-xs">
                        <td colSpan={5} className="py-2.5 px-3 border-r border-slate-900 text-right uppercase">
                          Grand Total Student Strength / QPs:
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-emerald-950 bg-emerald-100/70 text-sm">
                          {qpSubjectConsolidated.reduce((sum, s) => sum + s.totalStudents, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Sign-off Box */}
                <div className="border border-slate-900 p-4 bg-slate-50/50">
                  <div className="pt-8 flex items-center justify-between text-xs font-bold text-slate-900">
                    <div className="text-center">
                      <div className="border-t border-slate-900 pt-1 w-48">
                        Printing & Reprographics Staff
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-slate-900 pt-1 w-48">
                        Confidential Section In-Charge
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-slate-900 pt-1 w-48">
                        Chief Superintendent / COE
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 3: HALL QP PACKET ENVELOPE COVERS */}
            {qpViewMode === 'envelope-slips' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredQpHallGroups.map((group) => (
                  <div
                    key={group.room.id}
                    className="border-2 border-slate-900 p-4 space-y-3 bg-white rounded-xs shadow-xs"
                  >
                    {/* Docket Header */}
                    <div className="text-center border-b border-slate-900 pb-2 space-y-0.5">
                      <h3 className="font-black text-xs uppercase tracking-wider text-slate-900">
                        {collegeName}
                      </h3>
                      <p className="text-[10px] font-bold uppercase text-slate-600">
                        CONFIDENTIAL QUESTION PAPER PACKET COVER DOCKET
                      </p>
                    </div>

                    {/* Hall & Exam Meta */}
                    <div className="grid grid-cols-2 gap-2 text-xs border border-slate-900 p-2 bg-slate-50">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Exam Hall:</span>
                        <span className="font-black text-indigo-900 text-sm font-mono">{group.room.roomNumber}</span>
                        <span className="text-[10px] text-slate-600 block">({group.room.block})</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Date & Session:</span>
                        <span className="font-bold text-slate-900">{selectedExam.date} ({selectedExam.session})</span>
                        <span className="text-[10px] text-slate-600 block">{selectedExam.timeSlot}</span>
                      </div>
                    </div>

                    {/* Invigilator Details */}
                    <div className="text-xs border border-slate-900 p-2 bg-slate-50/50">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Assigned Invigilator:</span>
                      <span className="font-bold text-slate-900">
                        {group.invigilator?.facultyName || 'Faculty To Be Assigned'}
                      </span>
                      {group.invigilator && (
                        <span className="text-slate-600 text-[11px] ml-1">
                          (Dept of {group.invigilator.facultyDept})
                        </span>
                      )}
                    </div>

                    {/* Subjects In this Packet */}
                    <div className="border border-slate-900 overflow-hidden">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-200 text-slate-900 font-bold uppercase text-[9px] border-b border-slate-900">
                            <th className="py-1 px-1.5 border-r border-slate-900">Dept</th>
                            <th className="py-1 px-1.5 border-r border-slate-900">Subject Code</th>
                            <th className="py-1 px-1.5 text-center font-bold">Student Strength</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                          {group.subjects.map((sub) => (
                            <tr key={sub.key} className="border-b border-slate-300">
                              <td className="py-1 px-1.5 border-r border-slate-900 font-bold">{sub.department}</td>
                              <td className="py-1 px-1.5 border-r border-slate-900 font-mono font-bold text-indigo-900">
                                {sub.subjectCode}
                              </td>
                              <td className="py-1 px-1.5 text-center font-mono font-bold">
                                {sub.studentCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Packet Enclosure Summary */}
                    <div className="border border-dashed border-slate-900 p-2 text-xs flex items-center justify-between bg-indigo-50/50">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Papers Sealed:</span>
                        <strong className="text-sm font-mono text-indigo-950">
                          {group.totalStudents} Question Papers
                        </strong>
                      </div>
                      <div className="border border-slate-900 px-2 py-1 bg-white text-center text-[10px] font-black uppercase text-slate-800">
                        SEAL VERIFIED ✓
                      </div>
                    </div>

                    {/* Handover Signatures */}
                    <div className="pt-4 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-800">
                      <div className="border-t border-slate-900 pt-1 text-center">
                        Exam Cell Despatcher
                      </div>
                      <div className="border-t border-slate-900 pt-1 text-center">
                        Invigilator Acknowledgment
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DOCUMENT 3: HALL DOOR SEATING NOTICE (ROOM-WISE) */}
        {reportType === 'door-notice' && (
          <div className="space-y-6">
            {/* Official Header */}
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                {collegeName}
              </h2>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                {examSubTitle}
              </p>
              <div className="pt-2 text-sm font-extrabold uppercase bg-slate-900 text-white py-1 rounded-md tracking-wider">
                STUDENT SEATING ARRANGEMENT & HALL DOOR NOTICE
              </div>
            </div>

            {/* Exam & Hall Meta Table */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border border-slate-900 p-3 bg-slate-50/50">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Examination:</span>
                <span className="font-bold text-slate-900">{selectedExam.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Date & Session:</span>
                <span className="font-bold text-slate-900">
                  {selectedExam.date} ({selectedExam.session}) • {selectedExam.timeSlot}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Hall Number:</span>
                <span className="font-bold text-indigo-700 text-sm">
                  {selectedRoom?.roomNumber} ({selectedRoom?.block})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Hall Invigilator:</span>
                <span className="font-bold text-slate-900">
                  {hallInvigilator ? `${hallInvigilator.facultyName} (${hallInvigilator.facultyDept})` : 'To be assigned'}
                </span>
              </div>
            </div>

            {/* Department Summary Badge Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-900 bg-slate-100/70 px-3 py-2 text-xs">
              <div className="flex items-center space-x-2 font-bold text-slate-800">
                <span>Branch Distribution in this Hall:</span>
                <div className="flex flex-wrap gap-1.5 font-normal">
                  {Object.entries(deptCounts).map(([dept, count]) => (
                    <span key={dept} className="bg-white border border-slate-300 px-2 py-0.5 rounded font-mono font-bold text-slate-900 text-[11px]">
                      {dept}: {count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="font-bold text-slate-900 text-xs">
                Total Seated: <span className="text-indigo-800 font-mono text-sm">{sortedHallSeats.length}</span> Candidates
              </div>
            </div>

            {/* Visual Classroom Desk Grid Matrix Layout */}
            {selectedRoom && (
              <div className="space-y-2.5 my-3">
                <div className="w-full py-1.5 bg-slate-900 text-white rounded-md text-center text-xs font-bold uppercase tracking-wider">
                  [ FRONT PODIUM / BLACKBOARD & CHIEF INVIGILATOR DESK ]
                </div>
                <div
                  className="grid gap-2 p-3 bg-slate-50 border-2 border-slate-900 rounded-md"
                  style={{
                    gridTemplateColumns: `repeat(${selectedRoom.columns}, minmax(130px, 1fr))`,
                  }}
                >
                  {(() => {
                    const maxRows = Math.max(
                      selectedRoom.rows,
                      ...(selectedRoom.columnRows && selectedRoom.columnRows.length > 0
                        ? selectedRoom.columnRows
                        : [selectedRoom.rows])
                    );

                    return Array.from({ length: maxRows }).map((_, rIdx) => {
                      const rowNum = rIdx + 1;
                      return Array.from({ length: selectedRoom.columns }).map((_, cIdx) => {
                        const colNum = cIdx + 1;
                        const colRowCount = selectedRoom.columnRows?.[cIdx] ?? selectedRoom.rows;

                        if (rowNum > colRowCount) {
                          return (
                            <div
                              key={`empty-print-R${rowNum}-C${colNum}`}
                              className="p-2 bg-slate-100/50 border border-dashed border-slate-300 rounded min-h-[70px]"
                            />
                          );
                        }

                        const deskId = `R${rowNum}-C${colNum}`;
                        const isAisle = selectedRoom.disabledDesks?.includes(deskId);
                        const deskSeats = rawHallSeats.filter((s) => s.deskNumber === deskId);
                        const perDesk = selectedRoom.columnStudentsPerDesk?.[cIdx] ?? selectedRoom.studentsPerDesk ?? 1;

                        if (isAisle) {
                          return (
                            <div
                              key={deskId}
                              className="p-2 bg-slate-200 border border-dashed border-slate-400 rounded text-center flex flex-col items-center justify-center min-h-[70px] text-slate-500 text-[10px]"
                            >
                              <span>{deskId}</span>
                              <span className="text-[9px]">Aisle / Pillar</span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={deskId}
                            className="bg-white rounded border border-slate-900 p-1.5 flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-slate-300 text-[9px] font-bold text-slate-700">
                              <span>Desk {deskId}</span>
                              <span className="font-mono text-slate-500">Col {colNum}</span>
                            </div>
                            {perDesk === 1 ? (
                              (() => {
                                const seatA = deskSeats.find((s) => s.slotPosition === 'A' || s.slotPosition === 'Single');
                                return seatA ? (
                                  <div className="p-1 rounded bg-slate-50 border border-slate-300">
                                    <div className="flex items-center justify-between text-[8px]">
                                      <span className="font-bold px-1 rounded bg-slate-800 text-white">{seatA.student.department}</span>
                                      <span className="font-mono font-bold text-indigo-900">{seatA.student.subjectCode}</span>
                                    </div>
                                    <span className="font-mono font-black text-slate-900 text-[11px] block mt-0.5">
                                      {seatA.student.registerNumber}
                                    </span>
                                    <p className="font-medium text-slate-700 text-[9px] truncate">{seatA.student.name}</p>
                                  </div>
                                ) : (
                                  <div className="p-2 text-center text-[9px] text-slate-400 bg-slate-50 rounded border border-dashed border-slate-200">
                                    Vacant
                                  </div>
                                );
                              })()
                            ) : (
                              <div className={`grid grid-cols-${Math.min(perDesk, 3)} gap-1`}>
                                {Array.from({ length: perDesk }).map((_, sIdx) => {
                                  const slotLetter = perDesk === 2 ? (sIdx === 0 ? 'A' : 'B') : String.fromCharCode(65 + sIdx);
                                  const seat = deskSeats.find((s) => s.slotPosition === slotLetter || (perDesk === 2 && sIdx === 0 && s.slotPosition === 'Single'));
                                  return seat ? (
                                    <div key={slotLetter} className="p-1 rounded bg-slate-50 border border-slate-300">
                                      <div className="flex items-center justify-between text-[7px]">
                                        {seat.serialNumber != null && (
                                          <span className="font-bold px-1 rounded bg-slate-900 text-white">#{seat.serialNumber}</span>
                                        )}
                                        <span className="font-bold px-1 rounded bg-indigo-100 text-indigo-900">{seat.student.department}</span>
                                      </div>
                                      <span className="font-mono font-black text-slate-900 text-[9px] block mt-0.5 truncate">
                                        {seat.student.registerNumber}
                                      </span>
                                      <p className="font-medium text-slate-700 text-[8px] truncate">{seat.student.name}</p>
                                    </div>
                                  ) : (
                                    <div key={slotLetter} className="p-1 text-center text-[8px] text-slate-300 bg-slate-50 rounded border border-dashed border-slate-200">
                                      {slotLetter}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      });
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Students Seating Table: Grouped by Department or Continuous */}
            {sortBy === 'department' && groupByDept ? (
              <div className="space-y-5">
                {(Object.entries(groupedSeatsByDept) as [string, DepartmentSeatGroup][]).map(([deptName, group]) => (
                  <div key={deptName} className="space-y-1.5">
                    {/* Department Header Banner */}
                    <div className="bg-slate-800 text-white px-3 py-1.5 rounded-t-sm flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                      <div className="flex items-center space-x-2">
                        <span className="bg-indigo-500 text-white px-2 py-0.5 rounded text-[11px] font-extrabold">
                          {deptName}
                        </span>
                        <span>Department of {deptName === 'CSE' ? 'Computer Science & Engineering' : deptName === 'IT' ? 'Information Technology' : deptName === 'AI&DS' ? 'Artificial Intelligence & Data Science' : deptName === 'ECE' ? 'Electronics & Communication' : deptName === 'MECH' ? 'Mechanical Engineering' : deptName === 'CIVIL' ? 'Civil Engineering' : deptName === 'EEE' ? 'Electrical & Electronics' : deptName}</span>
                      </div>
                      <div className="text-[11px] font-mono font-normal">
                        Course Code: <strong className="text-white font-bold">{group.subjectCode}</strong> ({group.seats.length} Candidates)
                      </div>
                    </div>

                    {/* Department Table */}
                    <table className="w-full text-left border-collapse border border-slate-900 text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold uppercase text-[10px]">
                          <th className="py-2 px-2 border-r border-slate-900 text-center w-12">S.No</th>
                          <th className="py-2 px-2 border-r border-slate-900 text-center w-24">Desk No</th>
                          <th className="py-2 px-3 border-r border-slate-900 w-36">Register Number</th>
                          <th className="py-2 px-3 border-r border-slate-900">Candidate Name</th>
                          <th className="py-2 px-2 border-r border-slate-900 text-center w-16">Dept</th>
                          <th className="py-2 px-2 border-r border-slate-900 text-center w-24">Course Code</th>
                          {includeSignatures && (
                            <th className="py-2 px-4 border-r border-slate-900 text-center w-36">
                              Candidate Signature
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {group.seats.map((seat, idx) => (
                          <tr key={seat.seatId} className="border-b border-slate-300 hover:bg-slate-50/50">
                            <td className="py-2 px-2 border-r border-slate-900 text-center font-mono font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-900 text-center font-bold font-mono text-indigo-900">
                              {seat.deskNumber} {seat.slotPosition !== 'Single' ? `(${seat.slotPosition})` : ''}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 font-mono font-bold">
                              {seat.student.registerNumber}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 font-semibold">
                              {seat.student.name}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-900 text-center font-bold">
                              {seat.student.department}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-900 text-center font-mono">
                              {seat.student.subjectCode}
                            </td>
                            {includeSignatures && (
                              <td className="py-2 px-4 border-r border-slate-900 text-center text-slate-300">
                                {/* Blank for candidate live signature */}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <table className="w-full text-left border-collapse border border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold uppercase text-[10px]">
                      <th className="py-2 px-2 border-r border-slate-900 text-center w-12">S.No</th>
                      <th className="py-2 px-2 border-r border-slate-900 text-center w-24">Desk No</th>
                      <th className="py-2 px-3 border-r border-slate-900 w-36">Register Number</th>
                      <th className="py-2 px-3 border-r border-slate-900">Candidate Name</th>
                      <th className="py-2 px-2 border-r border-slate-900 text-center w-16">Dept</th>
                      <th className="py-2 px-2 border-r border-slate-900 text-center w-24">Course Code</th>
                      {includeSignatures && (
                        <th className="py-2 px-4 border-r border-slate-900 text-center w-36">
                          Candidate Signature
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {sortedHallSeats.map((seat, idx) => (
                      <tr key={seat.seatId} className="border-b border-slate-300">
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-mono font-medium">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-bold font-mono">
                          {seat.deskNumber} {seat.slotPosition !== 'Single' ? `(${seat.slotPosition})` : ''}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-900 font-mono font-bold">
                          {seat.student.registerNumber}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-900 font-semibold">
                          {seat.student.name}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-bold">
                          {seat.student.department}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-mono">
                          {seat.student.subjectCode}
                        </td>
                        {includeSignatures && (
                          <td className="py-2 px-4 border-r border-slate-900">
                            {/* Blank for candidate live signature */}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attendance & Verification Box */}
            <div className="border border-slate-900 p-4 space-y-3 bg-slate-50/50 mt-6">
              <div className="grid grid-cols-3 gap-4 text-xs font-bold">
                <div>Total Candidates Allocated: {sortedHallSeats.length}</div>
                <div>Present Count: ________</div>
                <div>Absent Count: ________</div>
              </div>

              <div className="pt-6 flex items-center justify-between text-xs font-bold">
                <div>
                  <div className="border-t border-slate-900 pt-1 w-48 text-center">
                    Signature of Hall Invigilator
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-900 pt-1 w-48 text-center">
                    Chief Superintendent / Exam Cell
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT 2: STUDENT DESK STICKERS / SLIPS */}
        {reportType === 'desk-slips' && (
          <div className="space-y-4">
            <div className="text-center pb-3 border-b border-slate-300">
              <h3 className="text-base font-bold text-slate-800 uppercase">
                Student Desk Identification Slips — Hall {selectedRoom?.roomNumber}
              </h3>
              <p className="text-xs text-slate-500">
                Print and cut to sticker onto individual examination desks.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sortedHallSeats.map((seat) => (
                <div
                  key={seat.seatId}
                  className="border-2 border-dashed border-slate-800 p-3 rounded-lg bg-white space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                    <span className="font-extrabold text-indigo-800 text-sm">
                      {seat.roomNumber}
                    </span>
                    <span className="font-bold bg-slate-900 text-white px-2 py-0.5 rounded text-[10px]">
                      Desk {seat.deskNumber} {seat.slotPosition !== 'Single' ? `(${seat.slotPosition})` : ''}
                    </span>
                  </div>

                  <div className="font-mono font-bold text-sm text-slate-900 pt-1">
                    {seat.student.registerNumber}
                  </div>
                  <div className="font-semibold text-slate-800 truncate">
                    {seat.student.name}
                  </div>

                  <div className="text-[10px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="font-bold">{seat.student.department}</span>
                    <span>{seat.student.subjectCode}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DOCUMENT 3: ADMIN OVERSIGHT MASTER REPORT */}
        {reportType === 'admin-oversight' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                {collegeName}
              </h2>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                EXAMINATION CELL CONSOLIDATED ADMINISTRATIVE OVERSIGHT REPORT
              </p>
              <div className="text-xs font-bold text-slate-800 pt-1">
                Exam: {selectedExam.name} • Date: {selectedExam.date} ({selectedExam.session}) • Time: {selectedExam.timeSlot}
              </div>
            </div>

            {/* Consolidated Hall Deployment Table */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                1. Hall Occupancy & Invigilator Deployment Matrix
              </h3>
              <table className="w-full text-left border-collapse border border-slate-900 text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-2 px-3 border-r border-slate-900">Hall No</th>
                    <th className="py-2 px-3 border-r border-slate-900">Location</th>
                    <th className="py-2 px-2 border-r border-slate-900 text-center">Capacity</th>
                    <th className="py-2 px-2 border-r border-slate-900 text-center">Seated</th>
                    <th className="py-2 px-2 border-r border-slate-900 text-center">Util %</th>
                    <th className="py-2 px-3 border-r border-slate-900">Assigned Invigilator</th>
                    <th className="py-2 px-2 border-r border-slate-900 text-center">Dept</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {rooms.map((room) => {
                    const seated = allocatedSeats.filter((s) => s.roomId === room.id).length;
                    const duty = dutyAllocations.find(
                      (d) => d.roomId === room.id && d.examScheduleId === selectedExam.id
                    );
                    const util = room.totalCapacity > 0 ? Math.round((seated / room.totalCapacity) * 100) : 0;

                    return (
                      <tr key={room.id} className="border-b border-slate-300">
                        <td className="py-2 px-3 border-r border-slate-900 font-bold">
                          {room.roomNumber}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-900 text-slate-600">
                          {room.block}, {room.floor}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-mono">
                          {room.totalCapacity}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-mono font-bold">
                          {seated}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center font-bold">
                          {util}%
                        </td>
                        <td className="py-2 px-3 border-r border-slate-900 font-semibold">
                          {duty?.facultyName || <span className="text-amber-600">Standby Assignment</span>}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-900 text-center">
                          {duty?.facultyDept || '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-emerald-700">Operational</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-900">
                    <td colSpan={2} className="py-2 px-3 border-r border-slate-900">Total / Summary</td>
                    <td className="py-2 px-2 border-r border-slate-900 text-center">
                      {rooms.reduce((s, r) => s + r.totalCapacity, 0)}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-900 text-center">
                      {allocatedSeats.length}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-900 text-center">
                      {Math.round((allocatedSeats.length / Math.max(1, rooms.reduce((s, r) => s + r.totalCapacity, 0))) * 100)}%
                    </td>
                    <td colSpan={3} className="py-2 px-3">
                      {dutyAllocations.filter((d) => d.examScheduleId === selectedExam.id).length} Faculty Deployed
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Standby Relievers Section */}
            <div className="border border-slate-900 p-4 bg-slate-50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
                2. Standby / Reliever Duty Pool
              </h4>
              <p className="text-xs text-slate-600">
                {dutyAllocations
                  .filter((d) => d.role === 'Reliever / Standby' && d.examScheduleId === selectedExam.id)
                  .map((d) => `${d.facultyName} (${d.facultyDept})`)
                  .join(', ') || 'Prof. Harish Raghavan (EEE) - Standby in Control Cell'}
              </p>
            </div>

            {/* Signatures */}
            <div className="pt-8 flex items-center justify-between text-xs font-bold">
              <div>Exam Cell In-Charge</div>
              <div>Chief Superintendent</div>
              <div>Controller of Examinations</div>
            </div>
          </div>
        )}

        {/* DOCUMENT 4: ABSENTEE & BOOKLET STATEMENT */}
        {reportType === 'absentee-statement' && (
          <div className="space-y-6">
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                {collegeName}
              </h2>
              <div className="text-xs font-extrabold uppercase bg-slate-900 text-white py-1 rounded-md tracking-wider">
                INVIGILATOR'S ABSENTEE STATEMENT & ANSWER BOOKLET ACCOUNT
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border border-slate-900 p-3 text-xs">
              <div>
                <strong>Hall No:</strong> {selectedRoom?.roomNumber}
              </div>
              <div>
                <strong>Date & Session:</strong> {selectedExam.date} ({selectedExam.session})
              </div>
              <div>
                <strong>Invigilator:</strong> {hallInvigilator?.facultyName || 'Staff In-charge'}
              </div>
            </div>

            {/* Account Matrix */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider">Answer Booklets Accounting:</h4>
              <table className="w-full border-collapse border border-slate-900 text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 font-bold">
                    <th className="py-2 px-3 border-r border-slate-900">Particulars</th>
                    <th className="py-2 px-3 border-r border-slate-900 text-center">From Serial No</th>
                    <th className="py-2 px-3 border-r border-slate-900 text-center">To Serial No</th>
                    <th className="py-2 px-3 text-center">Total Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  <tr>
                    <td className="py-2 px-3 border-r border-slate-900 font-semibold">Booklets Received from Exam Cell</td>
                    <td className="py-2 px-3 border-r border-slate-900 text-center">BK-10401</td>
                    <td className="py-2 px-3 border-r border-slate-900 text-center">BK-10460</td>
                    <td className="py-2 px-3 text-center font-bold">{sortedHallSeats.length}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 border-r border-slate-900 font-semibold">Booklets Issued to Candidates</td>
                    <td className="py-2 px-3 border-r border-slate-900 text-center"></td>
                    <td className="py-2 px-3 border-r border-slate-900 text-center"></td>
                    <td className="py-2 px-3 text-center font-bold"></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 border-r border-slate-900 font-semibold">Unused / Blank Booklets Returned</td>
                    <td className="py-2 px-3 border-r border-slate-900 text-center"></td>
                    <td className="py-2 px-3 border-r border-slate-900 text-center"></td>
                    <td className="py-2 px-3 text-center font-bold"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Absentee Register Numbers */}
            <div className="border border-slate-900 p-4 space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider">Absentee Candidates Register Numbers:</h4>
              <div className="h-16 border border-dashed border-slate-400 p-2 text-slate-400">
                (Write Register Numbers of absentees clearly in bold)
              </div>
            </div>

            <div className="pt-8 flex items-center justify-between text-xs font-bold">
              <div>Invigilator Signature: __________________</div>
              <div>Exam Cell Verification: __________________</div>
            </div>
          </div>
        )}

        {/* DOCUMENT 5: FACULTY DUTY MEMO */}
        {reportType === 'faculty-orders' && (
          <div className="space-y-6">
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                {collegeName}
              </h2>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                OFFICE OF THE CONTROLLER OF EXAMINATIONS
              </p>
              <div className="text-sm font-extrabold uppercase bg-slate-900 text-white py-1 rounded-md tracking-wider">
                OFFICIAL INVIGILATION DUTY ORDER & APPOINTMENT MEMO
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              The following faculty member is hereby appointed as <strong>Hall Invigilator / Chief Superintendent</strong> for the upcoming Continuous Internal Assessment (CIA) examination sessions.
            </p>

            <div className="border border-slate-900 p-4 space-y-2 text-xs bg-slate-50">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <strong>Faculty Name:</strong> {hallInvigilator?.facultyName || facultyList[0]?.name}
                </div>
                <div>
                  <strong>Department:</strong> {hallInvigilator?.facultyDept || facultyList[0]?.department}
                </div>
                <div>
                  <strong>Assigned Examination:</strong> {selectedExam.name}
                </div>
                <div>
                  <strong>Date & Time Slot:</strong> {selectedExam.date} ({selectedExam.session}) • {selectedExam.timeSlot}
                </div>
                <div>
                  <strong>Designated Hall:</strong> {selectedRoom?.roomNumber} ({selectedRoom?.block})
                </div>
                <div>
                  <strong>Role:</strong> {hallInvigilator?.role || 'Hall Invigilator'}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1 leading-relaxed">
              <p className="font-bold text-slate-800">Instructions to Invigilators:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Report to the Central Exam Control Cell 30 minutes prior to exam commencement.</li>
                <li>Collect Question Papers and serialized Answer Booklets from the Chief Superintendent.</li>
                <li>Verify candidate identity cards and ensure strictly interleaved branch seating.</li>
                <li>Duty alterations must be formally submitted through the portal 24 hours prior.</li>
              </ul>
            </div>

            <div className="pt-8 flex items-center justify-between text-xs font-bold">
              <div>Faculty Acknowledgment</div>
              <div>Controller of Examinations</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
