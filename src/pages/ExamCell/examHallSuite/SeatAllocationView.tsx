import React, { useState, useMemo, useEffect } from 'react';
import {
  Grid3X3,
  Sparkles,
  RefreshCw,
  ArrowLeftRight,
  Printer,
  Download,
  CheckCircle2,
  Users,
  Building2,
  Search,
  SlidersHorizontal,
  Info,
  User,
  BookOpen,
  Filter,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  Check,
  ChevronRight,
  School,
  Layers,
  ArrowRight,
  Save
} from 'lucide-react';
const confetti = (opts) => { };
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Room, Student, AllocatedSeat, Department, ExamSchedule, SubjectStrength } from '../../../types';
import { allocateSeats, AllocationStrategy, SeatTraversal, MixGranularity, RoomDeptQuota, downloadCSV, getRoomNetCapacity, findOptimalHalls, detectConflicts } from './allocationEngine';
import { DEPT_SUBJECTS } from './initialData';
import PrincipalIAScheduleView from '../../PrincipalIAScheduleView';

// Helper to normalize room ID / room number for matching across the component
const normRoomStr = (val?: string) => String(val || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

interface SeatAllocationViewProps {
  rooms: Room[];
  students: Student[];
  allocatedSeats: AllocatedSeat[];
  initialRoomDeptQuotaByExam?: Record<string, RoomDeptQuota>;
  initialSelectedHallIdsByExam?: Record<string, string[]>;
  onUpdateAllocatedSeats: (
    seats: AllocatedSeat[],
    updatedQuotaByExam?: Record<string, RoomDeptQuota>,
    updatedHallIdsByExam?: Record<string, string[]>
  ) => void;
  exams: ExamSchedule[];
  selectedExam: ExamSchedule;
  onSelectExam: (exam: ExamSchedule) => void;
  onUpdateExams?: (exams: ExamSchedule[]) => void;
  onUpdateStudents?: (students: Student[]) => void;
  onNavigateToReports: (hallId?: string) => void;
}

const FIRST_NAMES = ['Aarav', 'Diya', 'Kavya', 'Rahul', 'Sneha', 'Rohan', 'Ananya', 'Vikram', 'Pooja', 'Aditya', 'Meera', 'Varun', 'Swathi', 'Gautam', 'Priyanka', 'Siddharth', 'Nisha', 'Manoj', 'Harini', 'Arjun', 'Divya', 'Suresh', 'Keerthi', 'Naveen', 'Pavithra', 'Sanjay', 'Lavanya', 'Deepak', 'Aparna', 'Vignesh'];
const LAST_NAMES = ['Sharma', 'Kumar', 'Patel', 'Sundaram', 'Iyer', 'Reddy', 'Menon', 'Verma', 'Nair', 'Choudhury', 'Rao', 'Krishnan', 'Pillai', 'Deshmukh', 'Gupta', 'Banerjee', 'Bose', 'Chatterjee', 'Mishra', 'Joshi'];

export const SeatAllocationView: React.FC<SeatAllocationViewProps> = ({
  rooms,
  students,
  allocatedSeats,
  initialRoomDeptQuotaByExam,
  initialSelectedHallIdsByExam,
  onUpdateAllocatedSeats,
  exams,
  selectedExam,
  onSelectExam,
  onUpdateExams,
  onUpdateStudents,
  onNavigateToReports,
}) => {
  const [strategy, setStrategy] = useState<AllocationStrategy>('interleaved-dept');
  const [traversal, setTraversal] = useState<SeatTraversal>('column');
  const [mixGranularity, setMixGranularity] = useState<MixGranularity>('department');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [saveToast, setSaveToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setSaveToast({ message, type });
    setTimeout(() => setSaveToast(null), 4000);
  };

  // PROFORMA-1: per-hall per-subject count matrix (Anna Univ Consolidated Hall Allocation)
  // Isolated per exam (selectedExam.id) so oru exam ku potta number adutha exam ku replicate aavadhu — department+subject+exam wise
  const [roomDeptQuotaByExam, setRoomDeptQuotaByExam] = useState<Record<string, RoomDeptQuota>>(
    initialRoomDeptQuotaByExam || {}
  );

  const [selectedHallIdsByExam, setSelectedHallIdsByExam] = useState<Record<string, string[]>>(
    initialSelectedHallIdsByExam || {}
  );

  useEffect(() => {
    if (initialRoomDeptQuotaByExam && Object.keys(initialRoomDeptQuotaByExam).length > 0) {
      setRoomDeptQuotaByExam(initialRoomDeptQuotaByExam);
    }
  }, [initialRoomDeptQuotaByExam]);

  useEffect(() => {
    if (initialSelectedHallIdsByExam && Object.keys(initialSelectedHallIdsByExam).length > 0) {
      setSelectedHallIdsByExam(initialSelectedHallIdsByExam);
    }
  }, [initialSelectedHallIdsByExam]);
  const examQuotaKey = selectedExam?.id || `${selectedExam?.date || 'no-date'}_${selectedExam?.session || 'FN'}`;
  const roomDeptQuota: RoomDeptQuota = roomDeptQuotaByExam[examQuotaKey] || {};
  const setRoomDeptQuota: React.Dispatch<React.SetStateAction<RoomDeptQuota>> = (action) => {
    setRoomDeptQuotaByExam((prev) => {
      const cur = prev[examQuotaKey] || {};
      const nextQuota = typeof action === 'function' ? (action as (p: RoomDeptQuota) => RoomDeptQuota)(cur) : action;
      return { ...prev, [examQuotaKey]: nextQuota };
    });
  };

  // Modals and UI sub-states
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState<boolean>(false);
  const [isAddExamModalOpen, setIsAddExamModalOpen] = useState<boolean>(false);
  const [newSubjectDept, setNewSubjectDept] = useState<Department>('CSE');
  const [newSubjectCode, setNewSubjectCode] = useState<string>('CS8501');
  const [newSubjectName, setNewSubjectName] = useState<string>('Theory of Computation');
  const [newSubjectStrength, setNewSubjectStrength] = useState<number>(30);

  // New Exam Form state
  const [newExamName, setNewExamName] = useState<string>('Continuous Internal Assessment - II (CIA-II)');
  const [newExamDate, setNewExamDate] = useState<string>('2026-08-28');
  const [newExamSession, setNewExamSession] = useState<'FN' | 'AN'>('FN');
  const [newExamSemester, setNewExamSemester] = useState<number>(5);

  // Selected Hall for grid inspection
  const [selectedRoomId, setSelectedRoomId] = useState<string>(() => {
    return selectedExam?.selectedHallIds?.[0] || rooms[0]?.id || '';
  });

  // Swap mode state
  const [swapSourceSeat, setSwapSourceSeat] = useState<AllocatedSeat | null>(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<AllocatedSeat | null>(null);

  // Active rooms in the institution
  const activeRooms = useMemo(() => rooms.filter((r) => r.status === 'Active'), [rooms]);

  // Table-driven students (from Principal view displayScheduledItems) — single source of truth for hall
  const [tableStudents, setTableStudents] = useState<Student[]>([]);

  // Current session's students — prioritize table's filtered list (matches the top table's 4 exams 181) over generatedStudents
  const sessionStudents = useMemo(() => {
    if (tableStudents.length > 0) {
      if (!selectedExam) return tableStudents;
      // tableStudents already filtered by selectedExamDateFilter (09 Sep), but ensure session matches
      return tableStudents.filter((s) => s.examDate === selectedExam.date && s.session === selectedExam.session);
    }
    if (!selectedExam) return [];
    return students.filter(
      (s) => s.examDate === selectedExam.date && s.session === selectedExam.session
    );
  }, [tableStudents, students, selectedExam?.date, selectedExam?.session]);

  // Derive subject-wise student strength for this date & session (unique per department + semester + subject)
  const subjectStrengthList: SubjectStrength[] = useMemo(() => {
    const map = new Map<string, SubjectStrength>();

    sessionStudents.forEach((std) => {
      const key = `${std.department}_Sem${std.semester || '5'}_${std.subjectCode}`;
      if (!map.has(key)) {
        map.set(key, {
          department: std.department,
          programme: std.programme || '',
          subjectCode: std.subjectCode,
          subjectName: std.subjectName,
          semester: std.semester,
          year: std.year,
          studentCount: 0,
          regNoPrefix: std.registerNumber.slice(0, 9),
        });
      }
      map.get(key)!.studentCount += 1;
    });

    const list = Array.from(map.values()).sort((a, b) =>
      a.department.localeCompare(b.department) ||
      (a.semester || 0) - (b.semester || 0) ||
      a.subjectCode.localeCompare(b.subjectCode)
    );

    return list.map((item) => {
      const stds = sessionStudents
        .filter((s) => s.department === item.department && s.subjectCode === item.subjectCode && (s.semester === item.semester || (!s.semester && !item.semester)))
        .sort((a, b) => {
          const numA = parseInt(a.registerNumber.replace(/[^0-9]/g, ''), 10);
          const numB = parseInt(b.registerNumber.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.registerNumber.localeCompare(b.registerNumber);
        });
      const minReg = stds[0]?.registerNumber || '';
      const maxReg = stds[stds.length - 1]?.registerNumber || '';
      return {
        ...item,
        regNoRange: minReg && maxReg ? `${minReg} - ${maxReg}` : `${item.regNoPrefix}001 - ${item.regNoPrefix}${item.studentCount.toString().padStart(3, '0')}`,
      };
    });
  }, [sessionStudents]);

  // Total student strength for current date & session
  const totalRequiredStrength = sessionStudents.length;

  const [activeCandidateCount, setActiveCandidateCount] = useState<number | null>(null);
  const [activeSubjectCount, setActiveSubjectCount] = useState<number | null>(null);

  const displayCandidateStrength = activeCandidateCount !== null ? activeCandidateCount : totalRequiredStrength;
  const displaySubjectCount = activeSubjectCount !== null ? activeSubjectCount : subjectStrengthList.length;

  // Selected Hall IDs for this exam session
  const currentSelectedHallIds = useMemo(() => {
    if (!selectedExam) return [];
    const savedHalls = selectedHallIdsByExam[examQuotaKey];
    if (savedHalls && Array.isArray(savedHalls) && savedHalls.length > 0) {
      return savedHalls;
    }
    if (selectedExam.selectedHallIds && selectedExam.selectedHallIds.length > 0) {
      return selectedExam.selectedHallIds;
    }
    // Fallback: auto-calculate default optimal halls if none set yet
    return findOptimalHalls(displayCandidateStrength || 42, activeRooms);
  }, [selectedExam, examQuotaKey, selectedHallIdsByExam, displayCandidateStrength, activeRooms]);

  // Array of actual Room objects currently selected for this exam
  const selectedHalls = useMemo(() => {
    if (!activeRooms || activeRooms.length === 0) return [];
    if (currentSelectedHallIds.length === 0) {
      const optimalIds = findOptimalHalls(displayCandidateStrength || 42, activeRooms);
      const matchedOptimal = activeRooms.filter((r) => optimalIds.includes(r.id) || optimalIds.includes(r.roomNumber));
      return matchedOptimal.length > 0 ? matchedOptimal : activeRooms.slice(0, 2);
    }
    const set = new Set(currentSelectedHallIds.map(normRoomStr));
    const matched = activeRooms.filter((r) => set.has(normRoomStr(r.id)) || set.has(normRoomStr(r.roomNumber)));
    return matched.length > 0 ? matched : activeRooms.slice(0, 2);
  }, [activeRooms, currentSelectedHallIds, displayCandidateStrength]);

  // Total seat capacity of currently selected halls
  const totalSelectedHallsCapacity = useMemo(() => {
    return selectedHalls.reduce((sum, room) => sum + getRoomNetCapacity(room), 0);
  }, [selectedHalls]);

  // Capacity Difference (Selected Capacity - Required Strength)
  const capacityDifference = totalSelectedHallsCapacity - displayCandidateStrength;

  // ── PROFORMA-1 helpers: quota derived totals & auto-distribute ──
  // Subject composite key = department + '__Sem' + semester + '__' + subjectCode (isolates dept+sem+subject+exam wise)
  const getQuotaSubjectKey = (s: SubjectStrength | Student) => `${(s as SubjectStrength).department || (s as Student).department}__Sem${(s as SubjectStrength).semester || (s as Student).semester || ''}__${(s as SubjectStrength).subjectCode || (s as Student).subjectCode}`;
  const quotaSubjects = useMemo(() => subjectStrengthList, [subjectStrengthList]);
  const quotaSubjectKeys = useMemo(() => quotaSubjects.map((s) => getQuotaSubjectKey(s)), [quotaSubjects]);
  const quotaSubjectStrength = useMemo(() => {
    const m: Record<string, number> = {};
    quotaSubjects.forEach((s) => { m[getQuotaSubjectKey(s)] = s.studentCount; });
    return m;
  }, [quotaSubjects]);
  // Legacy dept names for compatibility
  const quotaDepts = quotaSubjectKeys;
  const quotaDeptStrength = quotaSubjectStrength;

  const getQuotaCell = (hallId: string, subjectKey: string) => {
    const v = roomDeptQuota[hallId]?.[subjectKey];
    return v != null ? Number(v) : 0;
  };
  const handleQuotaCellChange = (hallId: string, subjectKey: string, raw: string) => {
    const n = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
    const hall = activeRooms.find((r) => r.id === hallId) || selectedHalls.find((r) => r.id === hallId);
    const cap = hall ? getRoomNetCapacity(hall) : 9999;
    const need = quotaSubjectStrength[subjectKey] ?? 9999;
    const capped = Math.min(n, cap, need);
    setRoomDeptQuota((prev) => {
      const next: RoomDeptQuota = { ...prev };
      if (!next[hallId]) next[hallId] = {};
      next[hallId] = { ...next[hallId], [subjectKey]: capped };
      return next;
    });
  };

  const quotaColTotals = useMemo(() => {
    const m: Record<string, number> = {};
    selectedHalls.forEach((h) => {
      let tot = 0;
      quotaSubjectKeys.forEach((k) => { tot += getQuotaCell(h.id, k); });
      m[h.id] = tot;
    });
    return m;
  }, [selectedHalls, roomDeptQuota, quotaSubjectKeys]);
  const quotaRowTotals = useMemo(() => {
    const m: Record<string, number> = {};
    quotaSubjectKeys.forEach((k) => {
      let tot = 0;
      selectedHalls.forEach((h) => { tot += getQuotaCell(h.id, k); });
      m[k] = tot;
    });
    return m;
  }, [selectedHalls, roomDeptQuota, quotaSubjectKeys]);
  const quotaGrandTotal = useMemo(() => Object.values(quotaColTotals).reduce((a, b) => a + b, 0), [quotaColTotals]);
  const isQuotaComplete = useMemo(() => {
    if (quotaSubjectKeys.length === 0 || selectedHalls.length === 0) return false;
    return quotaSubjectKeys.every((k) => quotaRowTotals[k] === quotaSubjectStrength[k]) && quotaGrandTotal === totalRequiredStrength;
  }, [quotaSubjectKeys, quotaRowTotals, quotaSubjectStrength, quotaGrandTotal, totalRequiredStrength]);

  const handleAutoDistributeQuota = (mode: 'sequential' | 'even' = 'sequential') => {
    if (selectedHalls.length === 0 || quotaSubjects.length === 0) return;
    const caps: Record<string, number> = {};
    selectedHalls.forEach((h) => { caps[h.id] = getRoomNetCapacity(h); });
    const next: RoomDeptQuota = {};
    selectedHalls.forEach((h) => { next[h.id] = {}; });
    const remainingCap: Record<string, number> = { ...caps };
    if (mode === 'even') {
      // Evenly spread each subject (dept+subject) across halls
      quotaSubjects.forEach((subj) => {
        const key = getQuotaSubjectKey(subj);
        let need = subj.studentCount;
        let hallIdx = 0;
        while (need > 0) {
          let placed = false;
          for (let attempt = 0; attempt < selectedHalls.length && need > 0; attempt++) {
            const h = selectedHalls[hallIdx % selectedHalls.length];
            hallIdx++;
            if (remainingCap[h.id] <= 0) continue;
            next[h.id][key] = (next[h.id][key] || 0) + 1;
            remainingCap[h.id]--;
            need--;
            placed = true;
          }
          if (!placed) break;
        }
      });
    } else {
      // Sequential fill hall-by-hall (Hall 1 gets 15 EEE +10 Mech as in image G202-1)
      let hallPtr = 0;
      quotaSubjects.forEach((subj) => {
        const key = getQuotaSubjectKey(subj);
        let need = subj.studentCount;
        while (need > 0 && hallPtr < selectedHalls.length) {
          const h = selectedHalls[hallPtr];
          const free = remainingCap[h.id];
          if (free <= 0) { hallPtr++; continue; }
          const take = Math.min(need, free);
          next[h.id][key] = (next[h.id][key] || 0) + take;
          remainingCap[h.id] -= take;
          need -= take;
          if (remainingCap[h.id] === 0) hallPtr++;
          if (need === 0) break;
        }
      });
    }
    setRoomDeptQuota(next);
  };

  const handleClearQuota = () => {
    const next: RoomDeptQuota = {};
    selectedHalls.forEach((h) => { next[h.id] = {}; quotaSubjectKeys.forEach((k) => { next[h.id][k] = 0; }); });
    setRoomDeptQuota(next);
  };

  // Active semesters actually registered for this exam session
  const activeSemestersDisplay = useMemo(() => {
    if (!selectedExam) return '';
    const semSet = new Set<number>();
    sessionStudents.forEach((s) => {
      if (s.semester) semSet.add(s.semester);
    });
    if (selectedExam.items && Array.isArray(selectedExam.items)) {
      selectedExam.items.forEach((item) => {
        if (item.semester) semSet.add(item.semester);
      });
    }
    if (semSet.size === 0) return selectedExam.semesterDisplay || String(selectedExam.semester || 5);
    const sorted = Array.from(semSet).sort((a, b) => a - b);
    return sorted.join(', ');
  }, [selectedExam, sessionStudents]);

  // Subject student strength lookup map for schedule view
  const studentStrengthMap = useMemo(() => {
    const map: Record<string, number> = {};
    subjectStrengthList.forEach((sg) => {
      const normC = sg.subjectCode.toLowerCase().replace(/[^a-z0-9]/g, '');
      map[normC] = sg.studentCount;
    });
    return map;
  }, [subjectStrengthList]);

  // Ensure current active room tab points to a valid selected hall
  const currentViewingRoom = useMemo(() => {
    return (
      rooms.find((r) => r.id === selectedRoomId) ||
      selectedHalls[0] ||
      activeRooms[0] ||
      rooms[0]
    );
  }, [rooms, selectedRoomId, selectedHalls, activeRooms]);

  // ── Strict live-candidate validation: hall must show ONLY the exact register numbers
  //    of students who actually have exam on the selected date & session (e.g. MBA 420725631xxx
  //    for 15 Sep, not stale EEE 420723105xxx). If saved allocation contains foreign regs
  //    or count mismatch, auto-preview the correct live allocation.
  // Helper for robust exam session matching across date, ID & session formats
  const isMatchingSession = (seatOrStudent: any, exam: ExamSchedule | undefined) => {
    if (!seatOrStudent || !exam) return false;
    
    // Top-level seat or student metadata check
    const std = seatOrStudent.student || seatOrStudent;
    const examId = seatOrStudent.examId || std?.examId;
    const examKey = seatOrStudent.examKey || std?.examKey;
    
    if (examId && examId === exam.id) return true;
    if (examKey && (examKey === `${exam.date}_${exam.session}` || examKey === exam.id)) return true;

    const stdDate = std?.examDate || seatOrStudent.examDate;
    const stdSession = std?.session || seatOrStudent.session;

    if (stdDate === exam.date && stdSession === exam.session) return true;

    const stdDateNorm = String(stdDate || '').replace(/[^0-9]/g, '');
    const examDateNorm = String(exam.date || '').replace(/[^0-9]/g, '');
    const stdSessNorm = String(stdSession || '').trim().toUpperCase();
    const examSessNorm = String(exam.session || '').trim().toUpperCase();
    
    if (stdDateNorm && examDateNorm && stdDateNorm === examDateNorm && stdSessNorm === examSessNorm) return true;

    return false;
  };

  // ── Strict live-candidate validation & saved plan preservation
  const activeSessionAllocatedSeats = useMemo(() => {
    if (!selectedExam) return [];

    // Filter saved seats for this exam session
    const savedForSession = allocatedSeats.filter(
      (s) => isMatchingSession(s, selectedExam)
    );

    // If candidates and halls are available, generate live allocation respecting active traversal ('column')
    if (sessionStudents.length > 0 && selectedHalls.length > 0) {
      try {
        const quotaOpt = isQuotaComplete ? roomDeptQuota : null;
        const res = allocateSeats(sessionStudents, selectedHalls, strategy, { traversal, mixGranularity, roomDeptQuota: quotaOpt });
        if (res.allocatedSeats.length > 0) {
          return res.allocatedSeats.map((s) => ({
            ...s,
            examId: selectedExam.id,
            examDate: selectedExam.date,
            session: selectedExam.session,
            examKey: `${selectedExam.date}_${selectedExam.session}`,
            student: {
              ...s.student,
              examId: selectedExam.id,
              examDate: selectedExam.date,
              session: selectedExam.session,
              examKey: `${selectedExam.date}_${selectedExam.session}`,
            },
          }));
        }
      } catch {
        // Fall back to savedForSession if allocation fails
      }
    }

    if (savedForSession.length > 0) {
      return savedForSession;
    }

    return [];
  }, [allocatedSeats, selectedExam, sessionStudents, selectedHalls, strategy, traversal, mixGranularity, roomDeptQuota, isQuotaComplete]);

  // Seats allocated for the current exam session and current viewing hall (validated)
  const currentViewingHallSeats = useMemo(() => {
    if (!selectedExam || !currentViewingRoom) return [];
    const targetIdNorm = normRoomStr(currentViewingRoom.id);
    const targetNumNorm = normRoomStr(currentViewingRoom.roomNumber);

    return activeSessionAllocatedSeats.filter((s) => {
      const sIdNorm = normRoomStr(s.roomId);
      const sNumNorm = normRoomStr(s.roomNumber);
      return (
        (targetIdNorm && sIdNorm === targetIdNorm) ||
        (targetNumNorm && sNumNorm === targetNumNorm) ||
        (targetNumNorm && sIdNorm === targetNumNorm) ||
        (targetIdNorm && sNumNorm === targetIdNorm)
      );
    });
  }, [activeSessionAllocatedSeats, currentViewingRoom]);

  // Adjacency conflict validation for the current viewing hall
  const currentHallConflicts = useMemo(
    () => detectConflicts(currentViewingHallSeats),
    [currentViewingHallSeats]
  );

  // Filtered seats for searching in the active hall
  const filteredHallSeats = useMemo(() => {
    return currentViewingHallSeats.filter((seat) => {
      const matchSearch =
        seat.student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        seat.student.registerNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        seat.deskNumber.toLowerCase().includes(searchTerm.toLowerCase());

      const matchDept = filterDept === 'all' || seat.student.department === filterDept;
      return matchSearch && matchDept;
    });
  }, [currentViewingHallSeats, searchTerm, filterDept]);

  // Department & Semester Breakdown (Image 1 summary bar) — aggregated by Department + Semester only
  const deptSemBreakdown = useMemo(() => {
    const map = new Map<string, { department: string; semester?: number | string; studentCount: number }>();
    sessionStudents.forEach((std) => {
      const semVal = std.semester || '—';
      const key = `${std.department}_Sem${semVal}`;
      if (!map.has(key)) {
        map.set(key, {
          department: std.department,
          semester: std.semester,
          studentCount: 0,
        });
      }
      map.get(key)!.studentCount += 1;
    });
    return Array.from(map.values()).sort(
      (a, b) => a.department.localeCompare(b.department) || (Number(a.semester) || 0) - (Number(b.semester) || 0)
    );
  }, [sessionStudents]);

  // Department, Semester & Subject breakdown inside current viewing hall (Image 2 requirement)
  const currentHallSubjectBreakdown = useMemo(() => {
    const map = new Map<string, { department: Department; semester?: number | string; subjectCode: string; subjectName?: string; count: number }>();
    currentViewingHallSeats.forEach((seat) => {
      const semVal = seat.student.semester || '5';
      const subCode = seat.student.subjectCode || 'SUB';
      const key = `${seat.student.department}_Sem${semVal}_${subCode}`;
      if (!map.has(key)) {
        map.set(key, {
          department: seat.student.department,
          semester: seat.student.semester,
          subjectCode: subCode,
          subjectName: seat.student.subjectName,
          count: 0,
        });
      }
      map.get(key)!.count += 1;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.department.localeCompare(b.department) ||
      (Number(a.semester) || 0) - (Number(b.semester) || 0) ||
      a.subjectCode.localeCompare(b.subjectCode)
    );
  }, [currentViewingHallSeats]);

  // Legacy department breakdown inside current viewing hall
  const currentHallDeptBreakdown = useMemo(() => {
    const counts: { [dept in Department]?: number } = {};
    currentViewingHallSeats.forEach((seat) => {
      counts[seat.student.department] = (counts[seat.student.department] || 0) + 1;
    });
    return counts;
  }, [currentViewingHallSeats]);

  // Department, Semester & Subject Register Number Range Summary for Hall Door Notice
  const currentHallSubjectSummary = useMemo(() => {
    const map = new Map<string, { department: string; semester: string; subjectCode: string; subjectName: string; regs: string[]; count: number }>();
    currentViewingHallSeats.forEach((seat) => {
      const std = seat.student;
      const key = `${std.department}_Sem${std.semester || '5'}_${std.subjectCode}`;
      if (!map.has(key)) {
        map.set(key, {
          department: std.department,
          semester: String(std.semester || '5'),
          subjectCode: std.subjectCode || '—',
          subjectName: std.subjectName || '',
          regs: [],
          count: 0,
        });
      }
      const item = map.get(key)!;
      if (std.registerNumber) item.regs.push(std.registerNumber);
      item.count++;
    });

    return Array.from(map.values()).map((item) => {
      item.regs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const minReg = item.regs[0] || '—';
      const maxReg = item.regs[item.regs.length - 1] || '—';
      return {
        ...item,
        regRange: item.regs.length > 1 ? `${minReg} TO ${maxReg}` : minReg,
      };
    });
  }, [currentViewingHallSeats]);

  // Handle Hall Checkbox Toggle
  const handleToggleHall = (roomId: string) => {
    let nextSelected: string[];
    if (currentSelectedHallIds.includes(roomId)) {
      nextSelected = currentSelectedHallIds.filter((id) => id !== roomId);
    } else {
      nextSelected = [...currentSelectedHallIds, roomId];
    }

    const updatedHallsByExam = {
      ...selectedHallIdsByExam,
      [examQuotaKey]: nextSelected,
    };
    setSelectedHallIdsByExam(updatedHallsByExam);

    if (onUpdateExams) {
      const updatedExams = exams.map((ex) =>
        ex.id === selectedExam.id ? { ...ex, selectedHallIds: nextSelected } : ex
      );
      onUpdateExams(updatedExams);
    }
  };

  // Auto-Select Optimal Halls based on Student Strength
  const handleAutoSelectOptimalHalls = () => {
    const optimalIds = findOptimalHalls(totalRequiredStrength, activeRooms);
    const updatedHallsByExam = {
      ...selectedHallIdsByExam,
      [examQuotaKey]: optimalIds,
    };
    setSelectedHallIdsByExam(updatedHallsByExam);

    if (onUpdateExams) {
      const updatedExams = exams.map((ex) =>
        ex.id === selectedExam.id ? { ...ex, selectedHallIds: optimalIds } : ex
      );
      onUpdateExams(updatedExams);
    }
    if (optimalIds[0]) {
      setSelectedRoomId(optimalIds[0]);
    }
  };

  // Adjust Student Strength for a Subject
  const handleAdjustSubjectStrength = (dept: Department, subjectCode: string, newCount: number) => {
    if (newCount < 1 || !onUpdateStudents) return;

    const existingForSub = students.filter(
      (s) =>
        s.examDate === selectedExam.date &&
        s.session === selectedExam.session &&
        s.department === dept &&
        s.subjectCode === subjectCode
    );

    const otherStudents = students.filter(
      (s) =>
        !(
          s.examDate === selectedExam.date &&
          s.session === selectedExam.session &&
          s.department === dept &&
          s.subjectCode === subjectCode
        )
    );

    let updatedSubStudents: Student[] = [];

    if (newCount <= existingForSub.length) {
      // Truncate to new count
      updatedSubStudents = existingForSub.slice(0, newCount);
    } else {
      // Generate additional students
      updatedSubStudents = [...existingForSub];
      const deptPrefix =
        dept === 'CSE' ? '717621104' :
          dept === 'IT' ? '717621205' :
            dept === 'AI&DS' ? '717621306' :
              dept === 'ECE' ? '717621106' :
                dept === 'MECH' ? '717621114' :
                  dept === 'CIVIL' ? '717621103' :
                    dept === 'MBA' ? '420725631' : '717621105';

      const subName = existingForSub[0]?.subjectName || `${dept} Course`;
      const sem = existingForSub[0]?.semester || selectedExam.semester;
      const yr = existingForSub[0]?.year || Math.ceil(sem / 2);

      for (let i = existingForSub.length + 1; i <= newCount; i++) {
        const regNo = `${deptPrefix}${i.toString().padStart(3, '0')}`;
        const fName = FIRST_NAMES[(i + updatedSubStudents.length) % FIRST_NAMES.length];
        const lName = LAST_NAMES[(i * 3) % LAST_NAMES.length];

        updatedSubStudents.push({
          id: `std-dyn-${Date.now()}-${i}`,
          registerNumber: regNo,
          name: `${fName} ${lName}`,
          department: dept,
          year: yr,
          semester: sem,
          section: i <= 20 ? 'A' : 'B',
          subjectCode: subjectCode,
          subjectName: subName,
          examDate: selectedExam.date,
          session: selectedExam.session,
        });
      }
    }

    onUpdateStudents([...otherStudents, ...updatedSubStudents]);
  };

  // Remove Subject from this Exam Date & Session
  const handleRemoveSubject = (dept: Department, subjectCode: string) => {
    if (!onUpdateStudents) return;
    if (confirm(`Remove ${dept} (${subjectCode}) from this exam session?`)) {
      const remainingStudents = students.filter(
        (s) =>
          !(
            s.examDate === selectedExam.date &&
            s.session === selectedExam.session &&
            s.department === dept &&
            s.subjectCode === subjectCode
          )
      );
      onUpdateStudents(remainingStudents);
    }
  };

  // Add New Subject with Custom Strength
  const handleAddNewSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateStudents) return;

    const deptPrefix =
      newSubjectDept === 'CSE' ? '717621104' :
        newSubjectDept === 'IT' ? '717621205' :
          newSubjectDept === 'AI&DS' ? '717621306' :
            newSubjectDept === 'ECE' ? '717621106' :
              newSubjectDept === 'MECH' ? '717621114' :
                newSubjectDept === 'CIVIL' ? '717621103' :
                  newSubjectDept === 'MBA' ? '420725631' : '717621105';

    const newCandidates: Student[] = [];
    const yr = Math.ceil(selectedExam.semester / 2);

    for (let i = 1; i <= newSubjectStrength; i++) {
      const regNo = `${deptPrefix}${i.toString().padStart(3, '0')}`;
      const fName = FIRST_NAMES[(i * 2) % FIRST_NAMES.length];
      const lName = LAST_NAMES[(i * 4) % LAST_NAMES.length];

      newCandidates.push({
        id: `std-new-${Date.now()}-${i}`,
        registerNumber: regNo,
        name: `${fName} ${lName}`,
        department: newSubjectDept,
        year: yr,
        semester: selectedExam.semester,
        section: i <= 20 ? 'A' : 'B',
        subjectCode: newSubjectCode.trim().toUpperCase(),
        subjectName: newSubjectName.trim(),
        examDate: selectedExam.date,
        session: selectedExam.session,
      });
    }

    onUpdateStudents([...students, ...newCandidates]);
    setIsAddSubjectModalOpen(false);
  };

  // Add New Exam Date & Session
  const handleCreateExamSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateExams) return;

    const newExamId = `exam-${Date.now()}`;
    const newExam: ExamSchedule = {
      id: newExamId,
      name: newExamName.trim(),
      date: newExamDate,
      session: newExamSession,
      timeSlot: newExamSession === 'FN' ? '09:30 AM - 12:30 PM' : '01:30 PM - 04:30 PM',
      departments: ['CSE', 'IT', 'ECE', 'AI&DS', 'MECH'],
      semester: newExamSemester,
      status: 'Scheduled',
      selectedHallIds: ['room-101', 'room-102'],
    };

    onUpdateExams([...exams, newExam]);
    onSelectExam(newExam);
    setIsAddExamModalOpen(false);
  };

  // Run Auto Allocation for the Selected Halls & Date/Session (respects PROFORMA-1 quota if user fixed it)
  const handleRunAutoAllocation = () => {
    if (selectedHalls.length === 0) {
      alert('Please select at least one Exam Hall to allocate seats.');
      return;
    }

    if (sessionStudents.length === 0) {
      alert('No registered candidates found for this date & session. Add subjects or adjust student strength first.');
      return;
    }

    // If user has started fixing the matrix, require it to be complete (each dept row = need, no hall overflow)
    if (quotaGrandTotal > 0 && !isQuotaComplete) {
      alert('Please fix the PROFORMA-1 matrix: each department row total must equal its need and no hall may exceed capacity. Use Auto-Fill or correct the counts before executing.');
      return;
    }

    const quotaOpt = isQuotaComplete ? roomDeptQuota : null;
    // Allocate specifically sessionStudents into selectedHalls
    const result = allocateSeats(sessionStudents, selectedHalls, strategy, { traversal, mixGranularity, roomDeptQuota: quotaOpt });

    // Keep allocated seats of OTHER exam dates intact, and update current exam's seats
    const otherExamSeats = allocatedSeats.filter(
      (s) =>
        s.student.examDate !== selectedExam.date ||
        s.student.session !== selectedExam.session
    );

    onUpdateAllocatedSeats([...otherExamSeats, ...result.allocatedSeats]);

    // Ensure viewing room is one of the allocated halls
    if (selectedHalls[0]) {
      setSelectedRoomId(selectedHalls[0].id);
    }

    // Confetti effect
    try {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
      });
    } catch (e) {
      // Ignore
    }
  };

  // Save PROFORMA-1 Quota Matrix to Firestore
  const handleSaveQuotaMatrix = async () => {
    try {
      const updatedQuotaByExam = {
        ...roomDeptQuotaByExam,
        [examQuotaKey]: roomDeptQuota,
      };
      const updatedHallsByExam = {
        ...selectedHallIdsByExam,
        [examQuotaKey]: currentSelectedHallIds,
      };
      await setDoc(
        doc(db, 'exam_cell_settings', 'seating_allocation'),
        {
          roomDeptQuotaByExam: updatedQuotaByExam,
          selectedHallIdsByExam: updatedHallsByExam,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      if (onUpdateAllocatedSeats) {
        onUpdateAllocatedSeats(allocatedSeats, updatedQuotaByExam, updatedHallsByExam);
      }
      triggerToast('✓ PROFORMA-1 Allocation Matrix & Selected Halls saved successfully!');
    } catch (err) {
      console.error('Save matrix failed:', err);
      triggerToast('Failed to save allocation matrix to database.', 'error');
    }
  };

  // Save Seating Arrangement Plan to Firestore
  const handleSaveSeatingPlan = async () => {
    try {
      if (!selectedExam) {
        triggerToast('No active exam session selected to save seating plan.', 'error');
        return;
      }

      // Preserve exact live displayed seats (including candidate seat swaps & active strategy layout)
      let currentExamSeats = activeSessionAllocatedSeats.map((s) => ({
        ...s,
        examId: selectedExam.id,
        examDate: selectedExam.date,
        session: selectedExam.session,
        examKey: `${selectedExam.date}_${selectedExam.session}`,
        student: {
          ...s.student,
          examId: selectedExam.id,
          examDate: selectedExam.date,
          session: selectedExam.session,
          examKey: `${selectedExam.date}_${selectedExam.session}`,
        },
      }));

      // Fallback: if no active seats yet, generate allocation preview
      if (currentExamSeats.length === 0 && sessionStudents.length > 0 && selectedHalls.length > 0) {
        const quotaOpt = isQuotaComplete ? roomDeptQuota : null;
        const res = allocateSeats(sessionStudents, selectedHalls, strategy, { traversal, mixGranularity, roomDeptQuota: quotaOpt });
        currentExamSeats = res.allocatedSeats.map((s) => ({
          ...s,
          examId: selectedExam.id,
          examDate: selectedExam.date,
          session: selectedExam.session,
          examKey: `${selectedExam.date}_${selectedExam.session}`,
          student: {
            ...s.student,
            examId: selectedExam.id,
            examDate: selectedExam.date,
            session: selectedExam.session,
            examKey: `${selectedExam.date}_${selectedExam.session}`,
          },
        }));
      }

      if (currentExamSeats.length === 0) {
        triggerToast('No seats allocated to save for this exam session.', 'error');
        return;
      }

      const otherExamSeats = allocatedSeats.filter(
        (s) => !isMatchingSession(s, selectedExam)
      );

      // Deduplicate seats array to prevent Firestore array explosion
      const seatSlotMap = new Map<string, AllocatedSeat>();
      [...otherExamSeats, ...currentExamSeats].forEach((s) => {
        if (!s || !s.student || (!s.student.registerNumber && !s.student.name)) return;
        const d = s.examDate || s.student?.examDate || 'd';
        const sess = s.session || s.student?.session || 's';
        const r = s.roomId || s.roomNumber || 'r';
        const key = `${d}_${sess}_${r}_${s.deskNumber}_${s.slotPosition}`;
        seatSlotMap.set(key, s);
      });
      const fullNewSeats = Array.from(seatSlotMap.values());

      const updatedByExam = {
        ...roomDeptQuotaByExam,
        [examQuotaKey]: roomDeptQuota,
      };
      const updatedHallsByExam = {
        ...selectedHallIdsByExam,
        [examQuotaKey]: currentSelectedHallIds,
      };

      await setDoc(
        doc(db, 'exam_cell_settings', 'seating_allocation'),
        {
          allocatedSeats: fullNewSeats,
          roomDeptQuotaByExam: updatedByExam,
          selectedHallIdsByExam: updatedHallsByExam,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      if (onUpdateAllocatedSeats) {
        onUpdateAllocatedSeats(fullNewSeats, updatedByExam, updatedHallsByExam);
      }
      triggerToast(`✓ Seating Arrangement Plan & Selected Halls saved successfully (${currentExamSeats.length} seats allocated)!`);
    } catch (err) {
      console.error('Save seating plan failed:', err);
      triggerToast('Failed to save seating plan to database.', 'error');
    }
  };

  // Handle seat swap
  const handleSeatClick = (seat: AllocatedSeat) => {
    if (!swapSourceSeat) {
      setSelectedStudentDetail(seat);
    } else {
      if (swapSourceSeat.seatId === seat.seatId) {
        setSwapSourceSeat(null);
        return;
      }

      // Base swap on activeSessionAllocatedSeats so swap operates on live displayed seats
      const baseList = activeSessionAllocatedSeats.length > 0 ? activeSessionAllocatedSeats : allocatedSeats;

      const updatedSessionSeats = baseList.map((s) => {
        if (s.seatId === swapSourceSeat.seatId) {
          return { ...s, student: seat.student };
        }
        if (s.seatId === seat.seatId) {
          return { ...s, student: swapSourceSeat.student };
        }
        return s;
      });

      // Recalculate adjacency conflicts on the swapped seating layout
      const newConflicts = detectConflicts(updatedSessionSeats);
      const conflictSet = new Set(newConflicts.flatMap((c) => [c.seatA, c.seatB]));
      const finalSeats = updatedSessionSeats.map((s) => ({
        ...s,
        hasConflict: conflictSet.has(s.seatId),
      }));

      // Keep allocated seats of OTHER exam dates/sessions intact
      const otherExamSeats = allocatedSeats.filter(
        (s) =>
          s.student.examDate !== selectedExam.date ||
          s.student.session !== selectedExam.session
      );

      onUpdateAllocatedSeats([...otherExamSeats, ...finalSeats]);
      setSwapSourceSeat(null);
    }
  };

  // Export CSV for this date & session
  const handleExportCSV = () => {
    const sessionSeats = activeSessionAllocatedSeats;

    const headers = [
      'Hall Number',
      'Desk Number',
      'Row',
      'Column',
      'Slot',
      'Serial Number',
      'Register Number',
      'Student Name',
      'Department',
      'Subject Code',
      'Subject Name',
      'Exam Date',
      'Session',
    ];

    const rows = sessionSeats.map((s) => [
      s.roomNumber,
      s.deskNumber,
      s.row.toString(),
      s.col.toString(),
      s.slotPosition,
      s.serialNumber != null ? s.serialNumber.toString() : '',
      s.student.registerNumber,
      s.student.name,
      s.student.department,
      s.student.subjectCode,
      s.student.subjectName,
      s.student.examDate,
      s.student.session,
    ]);

    downloadCSV(`CKCET_Seating_Allocation_${selectedExam.date}_${selectedExam.session}.csv`, [
      headers,
      ...rows,
    ]);
  };

  // Dedicated Single-Page A4 Landscape Hall Door Notice print window handler
  const handlePrintDoorNotice = () => {
    if (!currentViewingRoom || currentViewingHallSeats.length === 0) {
      triggerToast('No candidate seating data available in this room to print.', 'error');
      return;
    }

    const printWin = window.open('', '_blank', 'width=1100,height=800');
    if (!printWin) {
      window.print();
      return;
    }

    const summaryRows = currentHallSubjectSummary
      .map(
        (item, idx) => `
      <tr style="border-bottom: 1px solid #1e293b; font-weight: bold; text-align: center; font-size: 9.5px;">
        <td style="border: 1px solid #1e293b; padding: 2px 4px;">${idx + 1}</td>
        <td style="border: 1px solid #1e293b; padding: 2px 6px; text-align: left; font-weight: 900;">${item.department}</td>
        <td style="border: 1px solid #1e293b; padding: 2px 4px;">Sem ${item.semester}</td>
        <td style="border: 1px solid #1e293b; padding: 2px 6px; text-align: left; font-family: monospace; font-weight: 900; color: #0f172a;">${item.subjectCode}</td>
        <td style="border: 1px solid #1e293b; padding: 2px 6px; font-family: monospace; font-weight: 900; color: #1e1b4b;">${item.regRange}</td>
        <td style="border: 1px solid #1e293b; padding: 2px 4px; font-weight: 900; font-size: 11px;">${item.count}</td>
      </tr>`
      )
      .join('');

    const maxRows = Math.max(
      currentViewingRoom.rows,
      ...(currentViewingRoom.columnRows && currentViewingRoom.columnRows.length > 0
        ? currentViewingRoom.columnRows
        : [currentViewingRoom.rows])
    );

    let deskGridHtml = '';
    for (let rIdx = 0; rIdx < maxRows; rIdx++) {
      const rowNum = rIdx + 1;
      for (let cIdx = 0; cIdx < currentViewingRoom.columns; cIdx++) {
        const colNum = cIdx + 1;
        const colRowCount = currentViewingRoom.columnRows?.[cIdx] ?? currentViewingRoom.rows;
        if (rowNum > colRowCount) {
          deskGridHtml += `<div style="border: 1px dashed #cbd5e1; min-height: 24px; background: #f8fafc; border-radius: 3px;"></div>`;
          continue;
        }

        const deskId = `R${rowNum}-C${colNum}`;
        const isAisle = currentViewingRoom.disabledDesks?.includes(deskId);
        const deskSeats = currentViewingHallSeats.filter((s) => s.deskNumber === deskId);
        const perDesk = currentViewingRoom.columnStudentsPerDesk?.[cIdx] ?? currentViewingRoom.studentsPerDesk ?? 1;

        if (isAisle) {
          deskGridHtml += `
            <div style="border: 1px dashed #94a3b8; background: #f1f5f9; text-align: center; padding: 2px; font-size: 9px; color: #64748b; border-radius: 4px;">
              <strong>${deskId}</strong> Aisle
            </div>`;
          continue;
        }

        let seatsInnerHtml = '';
        if (perDesk === 1) {
          const seatA = deskSeats.find((s) => s.slotPosition === 'A' || s.slotPosition === 'Single');
          if (seatA) {
            seatsInnerHtml = `
              <div style="padding: 2px 4px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 10px; text-align: center;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: #64748b; font-size: 8px; font-weight: bold;">Single</span>
                  ${seatA.serialNumber != null ? `<span style="background: #120c7a; color: white; padding: 0 3px; border-radius: 2px; font-weight: bold; font-size: 8px;">S${seatA.serialNumber}</span>` : ''}
                </div>
                <div style="font-family: monospace; font-weight: 900; color: #000000; font-size: 11.5px; margin-top: 1px;">${seatA.student.registerNumber}</div>
              </div>`;
          } else {
            seatsInnerHtml = `<div style="text-align: center; font-size: 8.5px; color: #cbd5e1; padding: 4px; border: 1px dashed #e2e8f0; border-radius: 3px;">Vacant</div>`;
          }
        } else {
          let slotsHtml = '';
          for (let sIdx = 0; sIdx < perDesk; sIdx++) {
            const slotLetter = String.fromCharCode(65 + sIdx);
            const seat = deskSeats.find((s) => s.slotPosition === slotLetter);
            if (seat) {
              slotsHtml += `
                <div style="padding: 2px 3px; background: #f8fafc; border: 1px solid #64748b; border-radius: 3px; text-align: center;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #64748b; font-size: 7.5px; font-weight: bold;">${slotLetter}</span>
                    ${seat.serialNumber != null ? `<span style="background: #120c7a; color: white; padding: 0 2px; border-radius: 2px; font-size: 7px; font-weight: bold;">S${seat.serialNumber}</span>` : ''}
                  </div>
                  <div style="font-family: monospace; font-weight: 900; color: #000000; font-size: 11px; margin-top: 1px; letter-spacing: -0.3px;">${seat.student.registerNumber}</div>
                </div>`;
            } else {
              slotsHtml += `<div style="padding: 2px 1px; text-align: center; font-size: 7.5px; color: #cbd5e1; border: 1px dashed #e2e8f0; border-radius: 2px;">${slotLetter}</div>`;
            }
          }
          seatsInnerHtml = `<div style="display: grid; grid-template-columns: repeat(${perDesk}, 1fr); gap: 2px;">${slotsHtml}</div>`;
        }

        const startLane = (currentViewingRoom.columnStudentsPerDesk || []).slice(0, cIdx).reduce((acc, val) => acc + (val || perDesk), 0) + 1;
        const endLane = startLane + perDesk - 1;
        const laneLabel = perDesk === 1 ? `Col ${startLane}` : `Cols ${startLane}–${endLane}`;

        deskGridHtml += `
          <div style="background: white; border: 1px solid #0f172a; border-radius: 4px; padding: 3px; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="display: flex; justify-content: space-between; font-size: 8.5px; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 1px; margin-bottom: 2px;">
              <span>Desk ${deskId}</span>
              <span style="color: #4338ca; font-weight: 900;">${laneLabel}</span>
            </div>
            ${seatsInnerHtml}
          </div>`;
      }
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Door Notice - Hall ${currentViewingRoom.roomNumber}</title>
        <style>
          @page { size: A4 landscape; margin: 4mm 6mm; }
          html, body { font-family: 'Times New Roman', Times, serif; margin: 0; padding: 0; color: #0f172a; background: white; width: 100%; height: 100%; box-sizing: border-box; }
          .header { border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 4px; text-align: center; }
          .logo-img { height: 48px; width: auto; object-fit: contain; margin: 0 auto; display: block; }
          .sub-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0f172a; margin: 2px 0 4px 0; text-align: center; }
          .title-tag { background: #0f172a; color: white; padding: 4px 8px; font-size: 12.5px; font-weight: 900; text-transform: uppercase; border-radius: 4px; letter-spacing: 0.8px; text-align: center; margin: 3px 0; }
          .meta-bar { display: flex; justify-content: space-between; font-size: 9.5px; font-weight: bold; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 3px; }
          .summary-table { width: 100%; border-collapse: collapse; border: 1.5px solid #0f172a; margin: 4px 0; font-size: 9.5px; }
          .summary-table th { background: #0f172a; color: white; padding: 2.5px 4px; text-transform: uppercase; font-size: 8.5px; border: 1px solid #1e293b; }
          .podium-bar { background: #1e293b; color: white; text-align: center; padding: 2px; font-size: 9px; font-weight: 900; letter-spacing: 1px; border-radius: 3px; margin: 4px 0; text-transform: uppercase; }
          .grid-container { display: grid; grid-template-columns: repeat(${currentViewingRoom.columns}, minmax(0, 1fr)); gap: 4px; padding: 3px; background: #f8fafc; border: 1.5px solid #0f172a; border-radius: 4px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 4px; border-top: 1.5px solid #0f172a; font-size: 9.5px; font-weight: bold; }
          .sig-box { text-align: center; min-width: 140px; }
          .sig-space { height: 32px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="text-align: center; margin-bottom: 2px;">
            <img src="/logo.png" class="logo-img" alt="CKCET Logo" onerror="this.style.display='none'" />
          </div>
          <div class="sub-title">CONTINUES INTERNAL ASSESSMENT</div>
          <div class="title-tag">
            EXAMINATION HALL DOOR SEATING NOTICE — HALL ${currentViewingRoom.roomNumber}
          </div>
          <div class="meta-bar">
            <span>Date & Session: <strong>${selectedExam?.date || '—'} (${selectedExam?.session || 'FN'})</strong></span>
            <span>Time: <strong>${selectedExam?.timeSlot || '09:30 AM - 12:30 PM'}</strong></span>
            <span>Location: <strong>${currentViewingRoom.block} (${currentViewingRoom.floor})</strong></span>
            <span>Total Seated: <strong>${currentViewingHallSeats.length} Candidates</strong></span>
          </div>
        </div>

        <div style="font-size: 9px; font-weight: 900; text-transform: uppercase; margin-bottom: 1px;">Candidate Allocation Summary by Department & Exam Subject:</div>
        <table class="summary-table">
          <thead>
            <tr>
              <th style="width: 20px;">#</th>
              <th style="text-align: left;">Department</th>
              <th style="width: 40px;">Sem</th>
              <th style="text-align: left; width: 110px;">Subject Code</th>
              <th>Register Number Range</th>
              <th style="width: 40px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>

        <div class="podium-bar">[ FRONT PODIUM / BLACKBOARD & CHIEF INVIGILATOR DESK ]</div>

        <div class="grid-container">
          ${deskGridHtml}
        </div>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-space"></div>
            <span>Hall Invigilator / Superintendent</span>
          </div>
          <div class="sig-box">
            <div class="sig-space"></div>
            <span>Exam Cell Coordinator</span>
          </div>
          <div class="sig-box">
            <div class="sig-space"></div>
            <span>Controller of Examinations (COE)</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 50);
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // Dedicated A4 Landscape PROFORMA-1 Print Window Handler
  const handlePrintProforma1 = () => {
    if (selectedHalls.length === 0 || subjectStrengthList.length === 0) {
      triggerToast('No active halls or subjects to print PROFORMA-1 matrix.', 'error');
      return;
    }

    const printWin = window.open('', '_blank', 'width=1100,height=800');
    if (!printWin) {
      window.print();
      return;
    }

    // Build Table Headers (Hall Columns)
    const hallHeaders = selectedHalls
      .map((h) => {
        const cap = getRoomNetCapacity(h);
        const allocated = quotaColTotals[h.id] || 0;
        return `<th style="border: 1px solid #1e293b; padding: 5px 6px; text-align: center; background: #0f172a; color: white;">
          <div style="font-size: 11px; font-weight: 900;">${h.roomNumber}</div>
          <div style="font-size: 8.5px; opacity: 0.85;">${allocated}/${cap}</div>
        </th>`;
      })
      .join('');

    // Build Table Body Rows
    const tableRows = subjectStrengthList
      .map((subj) => {
        const key = getQuotaSubjectKey(subj);
        const need = subj.studentCount;
        const totalAllocated = quotaRowTotals[key] || 0;
        const isComplete = totalAllocated === need;

        const hallCells = selectedHalls
          .map((h) => {
            const count = getQuotaCell(h.id, key);
            return `<td style="border: 1px solid #1e293b; padding: 5px 6px; text-align: center; font-weight: 900; font-size: 11px; ${count > 0 ? 'background: #f8fafc; color: #1e1b4b;' : 'color: #cbd5e1;'}">
              ${count}
            </td>`;
          })
          .join('');

        return `
        <tr style="border-bottom: 1px solid #1e293b; font-size: 10px;">
          <td style="border: 1px solid #1e293b; padding: 5px 8px; text-align: left;">
            <div style="font-weight: 900; color: #0f172a; font-size: 10.5px;">${subj.department} <span style="font-size: 9px; background: #e0e7ff; color: #3730a3; padding: 1px 4px; border-radius: 3px; font-weight: bold;">Sem ${subj.semester || '—'}</span></div>
            <div style="font-family: monospace; font-weight: 900; color: #2563eb; font-size: 10px; margin-top: 1px;">${subj.subjectCode} ${subj.subjectTitle ? `— ${subj.subjectTitle}` : ''}</div>
          </td>
          ${hallCells}
          <td style="border: 1px solid #1e293b; padding: 5px 6px; text-align: center; font-weight: 900; font-size: 11px; ${isComplete ? 'background: #ecfdf5; color: #047857;' : 'color: #b91c1c;'}">
            ${totalAllocated} / ${need} ${isComplete ? '✓' : ''}
          </td>
        </tr>`;
      })
      .join('');

    // Build Table Footer (Hall Capacity & Totals)
    const hallFooters = selectedHalls
      .map((h) => {
        const cap = getRoomNetCapacity(h);
        const allocated = quotaColTotals[h.id] || 0;
        return `<td style="border: 1px solid #1e293b; padding: 5px 6px; text-align: center; font-weight: 900; font-size: 11px; background: #047857; color: white;">
          ${allocated} / ${cap}
        </td>`;
      })
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PROFORMA - 1 Consolidated Hall Allocation</title>
        <style>
          @page { size: A4 landscape; margin: 5mm 8mm; }
          html, body { font-family: 'Times New Roman', Times, serif; margin: 0; padding: 0; color: #0f172a; background: white; box-sizing: border-box; }
          .header { text-align: center; border-bottom: 1.5px solid #0f172a; padding-bottom: 4px; margin-bottom: 6px; }
          .logo-img { height: 46px; width: auto; object-fit: contain; margin: 0 auto 3px auto; display: block; }
          .sub-title { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0f172a; margin-bottom: 4px; text-align: center; }
          .title-tag { background: #0f172a; color: white; padding: 4px 8px; font-size: 12px; font-weight: 900; text-transform: uppercase; border-radius: 4px; letter-spacing: 0.8px; text-align: center; margin: 3px 0; }
          .meta-bar { display: flex; justify-content: space-between; font-size: 9.5px; font-weight: bold; border-top: 1px solid #cbd5e1; padding-top: 3px; margin-top: 3px; }
          .matrix-table { width: 100%; border-collapse: collapse; border: 2px solid #0f172a; margin: 8px 0; font-size: 10px; }
          .matrix-table th { border: 1px solid #1e293b; }
          .signatures { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 6px; border-top: 1.5px solid #0f172a; font-size: 9.5px; font-weight: bold; }
          .sig-box { text-align: center; min-width: 140px; }
          .sig-space { height: 32px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="/logo.png" class="logo-img" alt="CKCET Logo" onerror="this.style.display='none'" />
          <div class="sub-title">CONTINUES INTERNAL ASSESSMENT</div>
          <div class="title-tag">
            PROFORMA - 1 &nbsp;•&nbsp; CONSOLIDATED HALL ALLOCATION MATRIX
          </div>
          <div class="meta-bar">
            <span>Center: <strong>4207 - CKCET</strong></span>
            <span>Date & Session: <strong>${selectedExam?.date || '—'} (${selectedExam?.session || 'FN'})</strong></span>
            <span>Time: <strong>${selectedExam?.timeSlot || '09:30 AM - 11:30 AM'}</strong></span>
            <span>Total Candidates: <strong>${totalRequiredStrength}</strong></span>
          </div>
        </div>

        <table class="matrix-table">
          <thead>
            <tr>
              <th style="border: 1px solid #1e293b; padding: 6px; text-align: left; background: #0f172a; color: white; width: 260px;">
                Dept / Semester / Subject
              </th>
              ${hallHeaders}
              <th style="border: 1px solid #1e293b; padding: 6px; text-align: center; background: #0f172a; color: white; width: 90px;">
                Row Total / Need
              </th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background: #047857; color: white; font-weight: 900;">
              <td style="border: 1px solid #1e293b; padding: 6px 8px; text-align: left; font-size: 10.5px;">
                Hall Total / Capacity
              </td>
              ${hallFooters}
              <td style="border: 1px solid #1e293b; padding: 6px; text-align: center; font-size: 11px; background: #047857; color: white;">
                ${quotaGrandTotal} / ${totalRequiredStrength}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-space"></div>
            <span>Exam Cell Superintendent</span>
          </div>
          <div class="sig-box">
            <div class="sig-space"></div>
            <span>Exam Cell Coordinator</span>
          </div>
          <div class="sig-box">
            <div class="sig-space"></div>
            <span>Controller of Examinations (COE)</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 50);
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // Department colors — handles both short codes (CIVIL) and full labels (B.E. Civil Engineering) dynamically
  const getDeptColor = (dept: any) => {
    const d = String(dept || '').toLowerCase();
    if (d.includes('mba') || d.includes('business') || d.includes('administration')) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (d.includes('bme') || d.includes('bio') || d.includes('medical')) return 'bg-pink-100 text-pink-800 border-pink-200';
    if (d === 'cse' || d.includes('computer') || d.includes('cse')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    if (d === 'it' || d.includes('information')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (d.includes('ai&ds') || d.includes('aids') || d.includes('artificial')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (d.includes('electrical') || d === 'eee') return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    if (d.includes('electronics') || d === 'ece') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (d.includes('mech') || d.includes('mechanical')) return 'bg-rose-100 text-rose-800 border-rose-200';
    if (d.includes('civil')) return 'bg-teal-100 text-teal-800 border-teal-200';
    switch (dept) {
      case 'CSE':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'IT':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'AI&DS':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'ECE':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'MECH':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'CIVIL':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'EEE':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'BME':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'MBA':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  // Total Student Column Lanes (e.g. 3 Desk Columns x 3 Seats/Desk = 9 Student Columns)
  const totalStudentLanes = useMemo(() => {
    if (!currentViewingRoom) return 0;
    const colCount = currentViewingRoom.columns || 1;
    const defaultPerDesk = Math.max(1, currentViewingRoom.studentsPerDesk || 1);
    let sum = 0;
    for (let c = 0; c < colCount; c++) {
      const p = currentViewingRoom.columnStudentsPerDesk?.[c] ?? defaultPerDesk;
      sum += p;
    }
    return sum;
  }, [currentViewingRoom]);

  return (
    <div className="space-y-6">
      {/* Toast Alert Banner */}
      {saveToast && (
        <div className={`px-4 py-3 rounded-2xl flex items-center justify-between font-bold text-xs shadow-md transition-all ${saveToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveToast.message}</span>
          </div>
          <button onClick={() => setSaveToast(null)} className="opacity-80 hover:opacity-100 font-black cursor-pointer px-2">✕</button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: EXAMINATION TIMETABLE & SCHEDULES (SAME AS EXAM SCHEDULES PAGE)
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-zinc-200 shadow-sm">
        <PrincipalIAScheduleView 
          showApproveButton={false} 
          hideApproveButton={true} 
          hideDetailsCols={true} 
          hideBatchFilter={true}
          studentStrengthMap={studentStrengthMap}
          onTotalCandidatesChange={(count, subjCount) => {
            setActiveCandidateCount(count);
            setActiveSubjectCount(subjCount);
          }}
          onExamDateFilterChange={(stdDate) => {
            // Keep the hall grid bound to the exact date pill the user selected,
            // so only that date's real candidate register numbers fill the seats.
            if (!stdDate) return;
            const normDate = (d: any) => String(d || '').includes('T') ? String(d).split('T')[0] : String(d || '');
            const next = exams.find((e) => normDate(e.date) === normDate(stdDate));
            if (next && onSelectExam) {
              onSelectExam(next);
            }
          }}
          onRegisterNumbersChange={setTableStudents}
        />
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: HALL ALLOCATION & CAPACITY DEMAND BALANCING
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-zinc-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-3">
            <span className="w-9 h-9 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-black text-zinc-900">
                Hall Allocation for Candidate Strength
              </h2>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Select examination halls to accommodate the <strong>{displayCandidateStrength} candidates</strong> registered for this date & session.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="auto-select-halls-btn"
              onClick={handleAutoSelectOptimalHalls}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md transition-all cursor-pointer"
              title="Automatically choose the best fitting halls for this candidate strength"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Select Optimal Halls</span>
            </button>
          </div>
        </div>

        {/* Live Capacity vs Demand Gauge */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs">
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
            <span className="text-zinc-500 block text-[11px] font-semibold">Total Candidate Strength</span>
            <span className="text-xl font-black text-zinc-900">{displayCandidateStrength} Candidates</span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-0.5">{displaySubjectCount} Subjects in this session</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
            <span className="text-zinc-500 block text-[11px] font-semibold">Selected Halls Capacity</span>
            <span className="text-xl font-black text-[#120c7a]">{totalSelectedHallsCapacity} Seats</span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-0.5">{selectedHalls.length} Halls Allocated</span>
          </div>

          <div className={`p-4 rounded-xl border ${capacityDifference >= 0
            ? capacityDifference === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
            <span className="block text-[11px] font-bold">Allocation Capacity Status</span>
            <div className="flex items-center space-x-1.5 mt-1">
              {capacityDifference >= 0 ? (
                <CheckCircle2 className={`w-5 h-5 ${capacityDifference === 0 ? 'text-emerald-600' : 'text-blue-600'}`} />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              )}
              <span className="text-base font-black">
                {capacityDifference === 0
                  ? 'Perfect Fit (Exact 100%)'
                  : capacityDifference > 0
                    ? `Sufficient (+${capacityDifference} Buffer Seats)`
                    : `Deficit (Short by ${Math.abs(capacityDifference)} Seats)`}
              </span>
            </div>
            <span className="text-[10px] block opacity-80 mt-0.5">
              {capacityDifference < 0
                ? 'Please check additional halls below to seat all candidates.'
                : 'All registered candidates will receive assigned desk slots.'}
            </span>
          </div>
        </div>

        {/* Interactive Hall Cards Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Choose Exam Halls to Allocate:</span>
            <span>{selectedHalls.length} of {activeRooms.length} active halls selected</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeRooms.map((room) => {
              const isChecked = currentSelectedHallIds.includes(room.id);
              const netCap = getRoomNetCapacity(room);
              const isCKCETPreset = room.columns === 3 && room.columnRows?.[0] === 5 && room.columnRows?.[1] === 6 && room.columnRows?.[2] === 5;

              return (
                <div
                  key={room.id}
                  id={`hall-card-${room.id}`}
                  onClick={() => handleToggleHall(room.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${isChecked
                    ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${isChecked
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                          }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{room.roomNumber}</h3>
                        <span className="text-[10px] text-slate-500">{room.block} • {room.floor}</span>
                      </div>
                    </div>

                    <span className="font-bold text-xs bg-white text-slate-800 border border-slate-200 px-2 py-0.5 rounded-lg shadow-2xs">
                      {netCap} Seats
                    </span>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {isCKCETPreset ? 'CKCET Standard (3 Col: 5×3 | 6×2 | 5×3)' : `${room.columns} Cols • ${room.rows} Rows`}
                    </span>
                    <span className={`font-semibold ${isChecked ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                      {isChecked ? 'Allocated' : 'Unallocated'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PROFORMA-1: Consolidated Hall Allocation (ANNA UNIVERSITY) ── */}
        <div className="rounded-2xl border border-zinc-200 overflow-hidden shadow-sm bg-white">
          <div className="bg-gradient-to-r from-[#120c7a] via-blue-800 to-indigo-900 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-white">
            <div>
              <h3 className="text-sm font-black tracking-wide">PROFORMA - 1 &nbsp;•&nbsp; Consolidated Hall Allocation</h3>
              <p className="text-[11px] text-blue-100 font-medium">Center: 4207 - CKCET &nbsp;|&nbsp; Date: {selectedExam?.date || '-'} &nbsp;|&nbsp; Session: {selectedExam?.session || '-'} &nbsp;|&nbsp; Time: {selectedExam?.timeSlot || '-'}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => handleAutoDistributeQuota('sequential')} disabled={selectedHalls.length === 0 || subjectStrengthList.length === 0} className="px-3 py-1.5 rounded-xl bg-white text-[#120c7a] text-[11px] font-black shadow disabled:opacity-40 cursor-pointer" title="Fill halls sequentially like image: G202-1 gets 15+10, G210 mixed">Auto-Fill (Sequential)</button>
              <button onClick={() => handleAutoDistributeQuota('even')} disabled={selectedHalls.length === 0 || subjectStrengthList.length === 0} className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-black shadow disabled:opacity-40 cursor-pointer" title="Distribute each dept evenly across halls">Auto-Distribute (Even)</button>
              <button onClick={handleClearQuota} className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[11px] font-bold cursor-pointer">Clear</button>
              <button onClick={handleSaveQuotaMatrix} className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black shadow-md cursor-pointer flex items-center gap-1.5 transition-all" title="Save PROFORMA-1 matrix configuration permanently to database">
                <Save className="w-3.5 h-3.5" />
                <span>Save Matrix</span>
              </button>
              <button onClick={handlePrintProforma1} className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black shadow-md cursor-pointer flex items-center gap-1.5 transition-all" title="Print official PROFORMA-1 Consolidated Hall Allocation report">
                <Printer className="w-3.5 h-3.5" />
                <span>Print PROFORMA-1</span>
              </button>
            </div>
          </div>

          {/* Department & Semester Breakdown Bar (Image 1: Dept + Sem wise candidate count) */}
          {deptSemBreakdown.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-50 border-b border-zinc-200 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-black text-slate-700 mr-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#120c7a]" /> Dept & Semester Breakdown ({deptSemBreakdown.length} Batches):
              </span>
              {deptSemBreakdown.map((item) => (
                <span key={`${item.department}_Sem${item.semester}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-extrabold shadow-2xs">
                  <span className="text-indigo-800 font-black">{item.department}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">Sem {item.semester || '—'}</span>
                  <span className="ml-1 px-2 py-0.2 rounded-full bg-slate-900 text-white font-black text-[10px]">{item.studentCount} candidates</span>
                </span>
              ))}
            </div>
          )}

          {selectedHalls.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500 font-semibold">Select halls above to configure the allocation matrix.</div>
          ) : subjectStrengthList.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500 font-semibold">No subjects for this date & session.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="text-left px-3 py-2 font-black text-zinc-700 whitespace-nowrap border-r border-zinc-200 min-w-[180px]">Dept / Semester / Subject</th>
                    {selectedHalls.map((h) => {
                      const cap = getRoomNetCapacity(h);
                      const colTot = quotaColTotals[h.id] || 0;
                      const over = colTot > cap;
                      return (
                        <th key={h.id} className="text-center px-2 py-2 font-black border-r border-zinc-200 min-w-[90px]">
                          <div className="text-[#120c7a]">{h.roomNumber}</div>
                          <div className={`text-[10px] font-bold ${over ? 'text-rose-600' : 'text-zinc-500'}`}>{colTot}/{cap} {over ? 'OVER' : ''}</div>
                        </th>
                      );
                    })}
                    <th className="text-center px-3 py-2 font-black text-zinc-700 bg-amber-50 whitespace-nowrap min-w-[95px]">Row Total / Need</th>
                  </tr>
                </thead>
                <tbody>
                  {quotaSubjects.map((subj) => {
                    const dept = subj.department;
                    const need = subj.studentCount;
                    const subjKey = getQuotaSubjectKey(subj);
                    const rowTot = quotaRowTotals[subjKey] || 0;
                    const rowOk = rowTot === need;
                    const rowOver = rowTot > need;
                    return (
                      <tr key={subjKey} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                        <td className="px-3 py-2 border-r border-zinc-200">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-black text-zinc-900 leading-tight">{dept}</span>
                            {subj.semester && (
                              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                                Sem {subj.semester}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-[#120c7a] mt-0.5">{subj.subjectCode}</div>
                          <div className="text-[10px] text-zinc-500 leading-tight truncate max-w-[170px]">{subj.subjectName}</div>
                          <div className={`text-[10px] font-black mt-0.5 ${rowOk ? 'text-emerald-600' : rowOver ? 'text-rose-600' : 'text-amber-600'}`}>{rowTot} / {need} {rowOk ? '✓' : '•'}</div>
                        </td>
                        {selectedHalls.map((h) => (
                          <td key={h.id} className="px-2 py-2 text-center border-r border-zinc-100">
                            <input
                              type="number"
                              min={0}
                              max={Math.min(getRoomNetCapacity(h), need)}
                              value={getQuotaCell(h.id, subjKey)}
                              onChange={(e) => handleQuotaCellChange(h.id, subjKey, e.target.value)}
                              className={`w-[72px] text-center px-2 py-1.5 rounded-lg border text-xs font-black focus:outline-none focus:ring-2 ${rowOk ? 'border-zinc-200 focus:ring-indigo-200' : 'border-amber-200 focus:ring-amber-200 bg-amber-50/50'}`}
                              placeholder="0"
                            />
                          </td>
                        ))}
                        <td className={`text-center px-2 py-2 font-black whitespace-nowrap ${rowOk ? 'bg-emerald-50 text-emerald-700' : rowOver ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                          {rowTot} / {need}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-900 text-white font-black">
                    <td className="px-3 py-2 text-left">Hall Total / Capacity</td>
                    {selectedHalls.map((h) => {
                      const cap = getRoomNetCapacity(h);
                      const colTot = quotaColTotals[h.id] || 0;
                      return (
                        <td key={h.id} className={`text-center px-2 py-2 ${colTot > cap ? 'bg-rose-600' : colTot === cap ? 'bg-emerald-600' : 'bg-zinc-800'}`}>
                          {colTot} / {cap}
                        </td>
                      );
                    })}
                    <td className={`text-center px-3 py-2 ${quotaGrandTotal === totalRequiredStrength ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                      {quotaGrandTotal} / {totalRequiredStrength}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="px-4 py-2.5 bg-amber-50/70 border-t border-zinc-200 flex flex-wrap items-center gap-2 text-[11px]">
            {!isQuotaComplete ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-bold text-amber-800"> Fix the matrix so each department row total = need and each hall does not exceed capacity. Then Execute Allocation will use these exact per-hall dept counts.</span>
                <span className="text-zinc-500">• Sequential fills like image (G202-1: 15 EEE +10 Mech); Even spreads evenly.</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-black text-emerald-700"> Matrix complete — each hall will receive exactly the counts you fixed above, seat numbers column-wise C1-R1(A)=#1, C1-R2(A)=#2.</span>
              </>
            )}
          </div>
        </div>

        {/* Strategy and Action Execution Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-100 bg-slate-50/50 p-4 rounded-xl">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center space-x-1.5">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="font-bold text-slate-700">Interleaving Strategy:</span>
              <select
                id="allocation-strategy-select"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as AllocationStrategy)}
                aria-label="Select student distribution strategy"
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
              >
                <option value="anna-univ-9lane-column">🏛️ Anna Univ Student-Column Lane Interleaving (9-Lane Column-Wise)</option>
                <option value="interleaved-dept">⚡ Multi-Department Desegregated Interleaving (Anna Univ Standard)</option>
                <option value="random-interleave">🎲 Anti-Malpractice Randomized Interleave (Group Shuffle)</option>
                <option value="alternate-department">🔄 Strict Department Alternation Sequence</option>
                <option value="reverse-interleave">🔀 Reverse Round-Robin Interleave</option>
                <option value="dept-then-roll">🔢 Department Reverse-Roll Interleave</option>
                <option value="alternate-roll">📋 Pure Register Number / Roll Order</option>
                <option value="sequential-dept">🏛️ Sequential Block by Department</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5">
              <Grid3X3 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="font-bold text-slate-700">Seat Matrix Layout:</span>
              <select
                id="seat-traversal-select"
                value={traversal}
                onChange={(e) => setTraversal(e.target.value as SeatTraversal)}
                aria-label="Select seat matrix fill order"
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
              >
                <option value="serpentine-column">🐍 Serpentine Column (Anna Univ Zig-Zag Top→Bottom→Top)</option>
                <option value="serpentine-reverse-start">🔄 Reverse Serpentine Column (Rightmost Column First)</option>
                <option value="column">⬇️ Straight Column-Major (Top to Bottom)</option>
                <option value="from-back-column">⬆️ Bottom-to-Top Column-Major (Back Desk First)</option>
                <option value="row">➡️ Straight Row-Major (Left to Right)</option>
                <option value="serpentine-row">〰️ Serpentine Row-Major (Row Zig-Zag)</option>
                <option value="diagonal">📐 Staircase Anti-Diagonal Fill</option>
                <option value="spiral">🌀 Clockwise Concentric Spiral Ring Fill</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="font-bold text-slate-700">Grouping:</span>
              <select
                id="mix-granularity-select"
                value={mixGranularity}
                onChange={(e) => setMixGranularity(e.target.value as MixGranularity)}
                aria-label="Select mixing granularity"
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
              >
                <option value="department">By Department (e.g. CSE vs IT vs ECE vs MBA)</option>
                <option value="department-section">By Dept + Section (e.g. CSE-A vs CSE-B vs IT-A)</option>
              </select>
            </div>

            {currentHallConflicts.length > 0 && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{currentHallConflicts.length} same-dept adjacency conflicts</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="run-allocation-btn"
              onClick={handleRunAutoAllocation}
              className="flex items-center space-x-2 px-4 py-2.5 bg-[#120c7a] hover:bg-[#0f0a66] text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Execute Allocation for Selected Halls</span>
            </button>

            <button
              id="save-seating-plan-btn"
              onClick={handleSaveSeatingPlan}
              className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              title="Save current seating allocation plan permanently to database"
            >
              <Save className="w-4 h-4" />
              <span>Save Seating Plan</span>
            </button>

            <button
              id="export-seating-csv-btn"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors shadow-2xs"
              title="Download full allocation as CSV spreadsheet"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: HALL SEATING MATRIX & VISUAL DESK INSPECTION
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Hall Selector Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 flex items-center space-x-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>Active Halls:</span>
          </span>
          {selectedHalls.map((room) => {
            const isSelected = currentViewingRoom?.id === room.id;
            const seatedCount = activeSessionAllocatedSeats.filter(
              (s) => s.roomId === room.id
            ).length;
            const netCap = getRoomNetCapacity(room);

            return (
              <button
                key={room.id}
                id={`select-hall-tab-${room.id}`}
                onClick={() => setSelectedRoomId(room.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-2 ${isSelected
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
              >
                <span>{room.roomNumber}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                >
                  {seatedCount}/{netCap}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Controls */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              id="search-candidate-input"
              type="text"
              placeholder="Search Reg No / Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 w-44"
            />
          </div>

          <select
            id="filter-department-select"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            aria-label="Filter seating by department"
            className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="all">All Depts</option>
            <option value="CSE">CSE</option>
            <option value="IT">IT</option>
            <option value="AI&DS">AI&DS</option>
            <option value="ECE">ECE</option>
            <option value="MECH">MECH</option>
            <option value="CIVIL">CIVIL</option>
            <option value="EEE">EEE</option>
            <option value="MBA">MBA</option>
          </select>

          <button
            id="print-hall-chart-btn"
            onClick={handlePrintDoorNotice}
            className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Instant print visual A4 door notice for this examination hall"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print Door Notice</span>
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            font-family: 'Times New Roman', Times, serif !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-hall-seating-stage, #printable-hall-seating-stage * {
            visibility: visible !important;
          }
          #printable-hall-seating-stage {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Swap Mode Indicator Banner */}
      {swapSourceSeat && (
        <div className="bg-amber-500 text-white px-4 py-2.5 rounded-xl shadow-md flex items-center justify-between text-xs animate-pulse">
          <div className="flex items-center space-x-2 font-medium">
            <ArrowLeftRight className="w-4 h-4" />
            <span>
              <strong>Seat Swap Active:</strong> Selected candidate{' '}
              <strong>{swapSourceSeat.student.name}</strong> ({swapSourceSeat.student.registerNumber}) at desk{' '}
              <strong>{swapSourceSeat.deskNumber} ({swapSourceSeat.slotPosition})</strong>. Click another seat to swap.
            </span>
          </div>
          <button
            id="cancel-swap-btn"
            onClick={() => setSwapSourceSeat(null)}
            className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white font-bold"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Seating Layout Visual Stage */}
      {currentViewingRoom && (
        <div id="printable-hall-seating-stage" className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
          {/* Print Only Banner Header (Hall Door Notice Header) */}
          <div className="hidden print:block text-center pb-2 mb-2 border-b-2 border-slate-900 space-y-1">
            <div className="flex justify-center mb-1">
              <img src="/logo.png" className="h-12 w-auto object-contain mx-auto" alt="CKCET Logo" />
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-900">
              CONTINUES INTERNAL ASSESSMENT
            </p>
            <div className="py-1 text-sm font-black uppercase bg-slate-900 text-white rounded tracking-wider my-1">
              EXAMINATION HALL DOOR SEATING NOTICE — HALL {currentViewingRoom.roomNumber}
            </div>
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 pt-1 border-t border-slate-300 px-1">
              <span>Date & Session: <strong>{selectedExam?.date} ({selectedExam?.session})</strong></span>
              <span>Time: <strong>{selectedExam?.timeSlot || '09:30 AM - 12:30 PM'}</strong></span>
              <span>Location: <strong>{currentViewingRoom.block} ({currentViewingRoom.floor})</strong></span>
              <span>Total Seated: <strong>{currentViewingHallSeats.length} Candidates</strong></span>
            </div>
          </div>

          {/* Department & Register Number Range Summary Table (Door Notice Summary Table) */}
          {currentHallSubjectSummary.length > 0 && (
            <div className="hidden print:block my-3">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900 mb-1">
                Candidate Allocation Summary by Department & Exam Subject:
              </h4>
              <table className="w-full text-xs border-collapse border-2 border-slate-900 text-center">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase">
                    <th className="border border-slate-800 py-1 px-1.5 w-8">#</th>
                    <th className="border border-slate-800 py-1 px-2 text-left">Department</th>
                    <th className="border border-slate-800 py-1 px-1.5 w-14">Sem</th>
                    <th className="border border-slate-800 py-1 px-2 text-left">Subject Code & Name</th>
                    <th className="border border-slate-800 py-1 px-2">Register Number Range</th>
                    <th className="border border-slate-800 py-1 px-1.5 w-16">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHallSubjectSummary.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-800 font-bold text-[11px]">
                      <td className="border border-slate-800 py-1 px-1.5">{idx + 1}</td>
                      <td className="border border-slate-800 py-1 px-2 text-left font-black">{item.department}</td>
                      <td className="border border-slate-800 py-1 px-1.5 font-bold">Sem {item.semester}</td>
                      <td className="border border-slate-800 py-1 px-2 text-left font-mono font-bold">{item.subjectCode} {item.subjectName ? `— ${item.subjectName}` : ''}</td>
                      <td className="border border-slate-800 py-1 px-2 font-mono font-black text-indigo-950">{item.regRange}</td>
                      <td className="border border-slate-800 py-1 px-1.5 font-black text-sm">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Hall Meta Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2 print:hidden">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-slate-900">
                  {currentViewingRoom.roomNumber} Seating Arrangement
                </h3>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                  {currentViewingRoom.block} • {currentViewingRoom.floor}
                </span>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                  <span>{getRoomNetCapacity(currentViewingRoom)} Capacity</span>
                  <span className="text-[10px] text-indigo-800 font-black">• {currentViewingRoom.columns} Desk Cols ({totalStudentLanes} Student Columns / Lanes 1–{totalStudentLanes})</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Total {currentViewingHallSeats.length} students allocated for {selectedExam?.date} ({selectedExam?.session}).
              </p>
            </div>

            {/* Department, Semester & Subject Breakdown Badges for this specific Hall (Image 2) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {currentHallSubjectBreakdown.map((item) => (
                <span
                  key={`${item.department}_${item.semester}_${item.subjectCode}`}
                  className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 shadow-2xs ${getDeptColor(
                    item.department
                  )}`}
                >
                  <span className="font-black">{item.department}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/70 font-bold border border-black/10">Sem {item.semester || '—'}</span>
                  <span className="font-mono text-[10.5px] font-bold">{item.subjectCode}</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-white font-black text-[10px]">{item.count}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Blackboard / Invigilator Podium Indicator */}
          <div className="w-full py-2 bg-slate-800 text-slate-300 rounded-xl text-center text-xs font-semibold tracking-wider flex items-center justify-center space-x-2 shadow-xs">
            <span>[ FRONT PODIUM / BLACKBOARD & CHIEF INVIGILATOR DESK ]</span>
          </div>

          {/* Classroom Desks Matrix */}
          <div className="overflow-x-auto pb-4">
            <div
              className="grid gap-3 min-w-[700px] p-4 bg-slate-50/70 rounded-2xl border border-slate-200"
              style={{
                gridTemplateColumns: `repeat(${currentViewingRoom.columns}, minmax(140px, 1fr))`,
              }}
            >
              {(() => {
                const maxRows = Math.max(
                  currentViewingRoom.rows,
                  ...(currentViewingRoom.columnRows && currentViewingRoom.columnRows.length > 0
                    ? currentViewingRoom.columnRows
                    : [currentViewingRoom.rows])
                );

                return Array.from({ length: maxRows }).map((_, rIdx) => {
                  const rowNum = rIdx + 1;
                  return Array.from({ length: currentViewingRoom.columns }).map((_, cIdx) => {
                    const colNum = cIdx + 1;
                    const colRowCount = currentViewingRoom.columnRows?.[cIdx] ?? currentViewingRoom.rows;

                    if (rowNum > colRowCount) {
                      return (
                        <div
                          key={`empty-alloc-R${rowNum}-C${colNum}`}
                          className="p-3 bg-slate-100/40 border border-dashed border-slate-200 rounded-xl min-h-[90px]"
                        />
                      );
                    }

                    const deskId = `R${rowNum}-C${colNum}`;
                    const isAisle = currentViewingRoom.disabledDesks?.includes(deskId);

                    // Find seats on this desk
                    const deskSeats = currentViewingHallSeats.filter((s) => s.deskNumber === deskId);
                    const perDesk = currentViewingRoom.columnStudentsPerDesk?.[cIdx] ?? currentViewingRoom.studentsPerDesk ?? 1;

                    if (isAisle) {
                      return (
                        <div
                          key={deskId}
                          className="p-3 bg-slate-200/60 border border-dashed border-slate-300 rounded-xl text-center flex flex-col items-center justify-center min-h-[90px] text-slate-400 select-none"
                        >
                          <span className="text-[10px] font-semibold">{deskId}</span>
                          <span className="text-[9px]">Aisle / Pillar</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={deskId}
                        className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-md transition-shadow p-2 flex flex-col justify-between"
                      >
                        {/* Desk Header */}
                        {(() => {
                          const startLane = (currentViewingRoom.columnStudentsPerDesk || []).slice(0, cIdx).reduce((acc, val) => acc + (val || perDesk), 0) + 1;
                          const endLane = startLane + perDesk - 1;
                          const laneLabel = perDesk === 1 ? `Col ${startLane}` : `Cols ${startLane}–${endLane}`;
                          return (
                            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-500">
                              <span>Desk {deskId}</span>
                              <span className="text-[9.5px] text-indigo-700 font-black bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/80">
                                {laneLabel} ({perDesk} Seats)
                              </span>
                            </div>
                          );
                        })()}

                        {/* Seats Content */}
                        {perDesk === 1 ? (
                          (() => {
                            const seatA = deskSeats.find((s) => s.slotPosition === 'A' || s.slotPosition === 'Single');
                            return seatA ? (
                              <div
                                onClick={() => handleSeatClick(seatA)}
                                className={`p-2 rounded-lg border transition-all cursor-pointer ${swapSourceSeat?.seatId === seatA.seatId
                                  ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                  : 'bg-slate-50/80 hover:bg-indigo-50/60 border-slate-200 hover:border-indigo-300'
                                  }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getDeptColor(
                                      seatA.student.department
                                    )}`}
                                  >
                                    {seatA.student.department}
                                  </span>
                                  {seatA.serialNumber != null && (
                                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-[#120c7a] text-white font-mono">
                                      S{seatA.serialNumber}
                                    </span>
                                  )}
                                  <span className="text-[9px] font-bold text-blue-700 font-mono">
                                    {seatA.student.subjectCode}
                                  </span>
                                </div>
                                <span className="font-mono font-black text-[#120c7a] text-xs block truncate mt-1">
                                  {seatA.student.registerNumber}
                                </span>
                                <p className="font-bold text-slate-800 text-[10.5px] truncate mt-0.5" title={seatA.student.name}>
                                  {seatA.student.name}
                                </p>
                              </div>
                            ) : (
                              <div className="p-3 text-center text-[10px] text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                Vacant Seat
                              </div>
                            );
                          })()
                        ) : perDesk === 2 ? (
                          (() => {
                            const seatA = deskSeats.find((s) => s.slotPosition === 'A' || s.slotPosition === 'Single');
                            const seatB = deskSeats.find((s) => s.slotPosition === 'B');

                            return (
                              <div className="grid grid-cols-2 gap-1.5">
                                {/* Seat Slot A (Left) */}
                                {seatA ? (
                                  <div
                                    onClick={() => handleSeatClick(seatA)}
                                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${swapSourceSeat?.seatId === seatA.seatId
                                      ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                      : seatA.hasConflict
                                        ? 'bg-red-50 border-red-400 ring-1 ring-red-300'
                                        : 'bg-slate-50/80 hover:bg-indigo-50/60 border-slate-200 hover:border-indigo-300'
                                      }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] font-bold text-slate-400">L</span>
                                      {seatA.serialNumber != null && (
                                        <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-[#120c7a] text-white">
                                          S{seatA.serialNumber}
                                        </span>
                                      )}
                                      <span
                                        className={`text-[8px] font-bold px-1 py-0.2 rounded border ${getDeptColor(
                                          seatA.student.department
                                        )}`}
                                      >
                                        {seatA.student.department}
                                      </span>
                                    </div>
                                    <span className="font-mono font-black text-[#120c7a] text-[10px] block truncate mt-0.5">
                                      {seatA.student.registerNumber}
                                    </span>
                                    <p className="font-bold text-slate-800 text-[9.5px] truncate mt-0.5" title={seatA.student.name}>
                                      {seatA.student.name}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-2 text-center text-[8px] text-slate-300 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    L Vacant
                                  </div>
                                )}

                                {/* Seat Slot B (Right) */}
                                {seatB ? (
                                  <div
                                    onClick={() => handleSeatClick(seatB)}
                                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${swapSourceSeat?.seatId === seatB.seatId
                                      ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                      : seatB.hasConflict
                                        ? 'bg-red-50 border-red-400 ring-1 ring-red-300'
                                        : 'bg-slate-50/80 hover:bg-indigo-50/60 border-slate-200 hover:border-indigo-300'
                                      }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] font-bold text-slate-400">R</span>
                                      {seatB.serialNumber != null && (
                                        <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-[#120c7a] text-white">
                                          S{seatB.serialNumber}
                                        </span>
                                      )}
                                      <span
                                        className={`text-[8px] font-bold px-1 py-0.2 rounded border ${getDeptColor(
                                          seatB.student.department
                                        )}`}
                                      >
                                        {seatB.student.department}
                                      </span>
                                    </div>
                                    <span className="font-mono font-black text-[#120c7a] text-[10px] block truncate mt-0.5">
                                      {seatB.student.registerNumber}
                                    </span>
                                    <p className="font-bold text-slate-800 text-[9.5px] truncate mt-0.5" title={seatB.student.name}>
                                      {seatB.student.name}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-2 text-center text-[8px] text-slate-300 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    R Vacant
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          /* Multi-Seat Capacity (3+ per desk, e.g. CKCET 3-student desk) */
                          <div className="grid grid-cols-3 gap-1">
                            {Array.from({ length: perDesk }).map((_, sIdx) => {
                              const slotLetter = String.fromCharCode(65 + sIdx);
                              const seat = deskSeats.find((s) => s.slotPosition === slotLetter);

                              return seat ? (
                                <div
                                  key={slotLetter}
                                  onClick={() => handleSeatClick(seat)}
                                  className={`p-1 rounded-md border transition-all cursor-pointer ${swapSourceSeat?.seatId === seat.seatId
                                    ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                    : seat.hasConflict
                                      ? 'bg-red-50 border-red-400 ring-1 ring-red-300'
                                      : 'bg-slate-50 hover:bg-indigo-50 border-slate-200'
                                    }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-bold text-slate-400">{slotLetter}</span>
                                    {seat.serialNumber != null && (
                                      <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-[#120c7a] text-white">
                                        S{seat.serialNumber}
                                      </span>
                                    )}
                                    <span
                                      className={`text-[7px] font-bold px-1 py-0.2 rounded border ${getDeptColor(
                                        seat.student.department
                                      )}`}
                                    >
                                      {seat.student.department}
                                    </span>
                                  </div>
                                  <span className="font-mono font-black text-[#120c7a] text-[9px] block truncate tracking-tight mt-0.5" title={`${seat.student.name} (${seat.student.registerNumber})`}>
                                    {seat.student.registerNumber}
                                  </span>
                                  <p className="font-bold text-slate-800 text-[8.5px] truncate mt-0.5" title={seat.student.name}>
                                    {seat.student.name}
                                  </p>
                                </div>
                              ) : (
                                <div
                                  key={slotLetter}
                                  className="p-1 text-center text-[8px] text-slate-300 bg-slate-50 rounded border border-dashed border-slate-200"
                                >
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

          {/* Footer Guide & Tips */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
            <div className="flex items-center space-x-2 text-slate-600">
              <Info className="w-4 h-4 text-indigo-500" />
              <span>
                <strong>Tip:</strong> Click on any candidate to inspect details or initiate a manual seat swap.
              </span>
            </div>
            <div className="flex items-center space-x-3 text-[11px]">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>CSE</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>IT</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>AI&DS</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>ECE</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>MECH</span>
              </span>
            </div>
          </div>

          {/* Official Signatures Row for Print (Door Notice) */}
          <div className="hidden print:flex items-center justify-between pt-6 text-xs font-bold text-slate-900 border-t-2 border-slate-900 mt-6">
            <div className="text-center">
              <div className="h-8"></div>
              <span>Hall Invigilator / Superintendent</span>
            </div>
            <div className="text-center">
              <div className="h-8"></div>
              <span>Exam Cell Coordinator</span>
            </div>
            <div className="text-center">
              <div className="h-8"></div>
              <span>Controller of Examinations (COE)</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: ADD SUBJECT & STUDENT STRENGTH TO THIS EXAM
          ───────────────────────────────────────────────────────────── */}
      {isAddSubjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add Subject & Candidate Strength</h3>
                <p className="text-xs text-slate-500">
                  Register a subject for {selectedExam.date} ({selectedExam.session})
                </p>
              </div>
              <button
                onClick={() => setIsAddSubjectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewSubject} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Department</label>
                <select
                  value={newSubjectDept}
                  onChange={(e) => {
                    const d = e.target.value as Department;
                    setNewSubjectDept(d);
                    const subInfo = (DEPT_SUBJECTS[selectedExam.semester] && DEPT_SUBJECTS[selectedExam.semester][d]) || { code: `${d}501`, name: `${d} Core Course` };
                    setNewSubjectCode(subInfo.code);
                    setNewSubjectName(subInfo.name);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                >
                  <option value="CSE">Computer Science & Engineering (CSE)</option>
                  <option value="IT">Information Technology (IT)</option>
                  <option value="AI&DS">Artificial Intelligence & Data Science (AI&DS)</option>
                  <option value="ECE">Electronics & Communication (ECE)</option>
                  <option value="MECH">Mechanical Engineering (MECH)</option>
                  <option value="CIVIL">Civil Engineering (CIVIL)</option>
                  <option value="EEE">Electrical & Electronics (EEE)</option>
                  <option value="MBA">Master of Business Administration (MBA)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subject Code</label>
                  <input
                    type="text"
                    required
                    value={newSubjectCode}
                    onChange={(e) => setNewSubjectCode(e.target.value)}
                    placeholder="e.g. CS8591"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Registered Student Count</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={200}
                    value={newSubjectStrength}
                    onChange={(e) => setNewSubjectStrength(parseInt(e.target.value) || 1)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-700"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Subject Course Title</label>
                <input
                  type="text"
                  required
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Computer Networks"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-indigo-800">
                This will automatically generate {newSubjectStrength} student register numbers for {newSubjectDept} for this examination date and session.
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSubjectModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-xs"
                >
                  Add Subject Roster
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: ADD NEW EXAM DATE & SESSION
          ───────────────────────────────────────────────────────────── */}
      {isAddExamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Schedule New Examination Date</h3>
                <p className="text-xs text-slate-500">Create a date & session entry for seating management</p>
              </div>
              <button
                onClick={() => setIsAddExamModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExamSchedule} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Exam Title / Description</label>
                <input
                  type="text"
                  required
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Exam Date</label>
                  <input
                    type="date"
                    required
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Session</label>
                  <select
                    value={newExamSession}
                    onChange={(e) => setNewExamSession(e.target.value as 'FN' | 'AN')}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="FN">FN (Forenoon 09:30 AM - 12:30 PM)</option>
                    <option value="AN">AN (Afternoon 01:30 PM - 04:30 PM)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Semester</label>
                <select
                  value={newExamSemester}
                  onChange={(e) => setNewExamSemester(parseInt(e.target.value) || 1)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value={1}>Semester 1 (1st Year)</option>
                  <option value={2}>Semester 2 (1st Year)</option>
                  <option value={3}>Semester 3 (2nd Year)</option>
                  <option value={4}>Semester 4 (2nd Year)</option>
                  <option value={5}>Semester 5 (3rd Year)</option>
                  <option value={6}>Semester 6 (3rd Year)</option>
                  <option value={7}>Semester 7 (4th Year)</option>
                  <option value={8}>Semester 8 (4th Year)</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExamModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-xs"
                >
                  Create & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: STUDENT DETAIL & SEAT SWAP MODAL
          ───────────────────────────────────────────────────────────── */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-base">
                  {selectedStudentDetail.student.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {selectedStudentDetail.student.name}
                  </h3>
                  <span className="text-xs font-mono text-slate-500">
                    Reg No: {selectedStudentDetail.student.registerNumber}
                  </span>
                </div>
              </div>
              <button
                id="close-student-detail-modal"
                onClick={() => setSelectedStudentDetail(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Department & Year</span>
                <span className="font-bold text-slate-800">
                  {selectedStudentDetail.student.department} • Year {selectedStudentDetail.student.year} (Sem {selectedStudentDetail.student.semester})
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Exam Session</span>
                <span className="font-bold text-slate-800">
                  {selectedStudentDetail.student.examDate} ({selectedStudentDetail.student.session})
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 col-span-2">
                <span className="text-slate-400 block text-[10px]">Course / Subject Code</span>
                <span className="font-bold text-indigo-700 block">
                  {selectedStudentDetail.student.subjectCode} - {selectedStudentDetail.student.subjectName}
                </span>
              </div>
              <div className="bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100 col-span-2 flex items-center justify-between">
                <div>
                  <span className="text-indigo-600 block text-[10px] font-semibold">Assigned Location</span>
                  <span className="font-bold text-slate-900">
                    Hall {selectedStudentDetail.roomNumber} • Desk {selectedStudentDetail.deskNumber} ({selectedStudentDetail.slotPosition === 'Single' ? 'Single Seat' : `Slot ${selectedStudentDetail.slotPosition}`})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500">Row {selectedStudentDetail.row} / Col {selectedStudentDetail.col}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                id="start-swap-btn"
                onClick={() => {
                  setSwapSourceSeat(selectedStudentDetail);
                  setSelectedStudentDetail(null);
                }}
                className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Swap This Candidate's Seat</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
