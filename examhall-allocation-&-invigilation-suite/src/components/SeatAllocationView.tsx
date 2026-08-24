import React, { useState, useMemo } from 'react';
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
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Room, Student, AllocatedSeat, Department, ExamSchedule, SubjectStrength } from '../types';
import { allocateSeats, AllocationStrategy, downloadCSV, getRoomNetCapacity, findOptimalHalls } from '../utils/allocationEngine';
import { DEPT_SUBJECTS } from '../data/initialData';

interface SeatAllocationViewProps {
  rooms: Room[];
  students: Student[];
  allocatedSeats: AllocatedSeat[];
  onUpdateAllocatedSeats: (seats: AllocatedSeat[]) => void;
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
  onUpdateAllocatedSeats,
  exams,
  selectedExam,
  onSelectExam,
  onUpdateExams,
  onUpdateStudents,
  onNavigateToReports,
}) => {
  const [strategy, setStrategy] = useState<AllocationStrategy>('interleaved-dept');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('all');
  
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
    return selectedExam.selectedHallIds?.[0] || rooms[0]?.id || '';
  });

  // Swap mode state
  const [swapSourceSeat, setSwapSourceSeat] = useState<AllocatedSeat | null>(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<AllocatedSeat | null>(null);

  // Active rooms in the institution
  const activeRooms = useMemo(() => rooms.filter((r) => r.status === 'Active'), [rooms]);

  // Current session's students
  const sessionStudents = useMemo(() => {
    return students.filter(
      (s) => s.examDate === selectedExam.date && s.session === selectedExam.session
    );
  }, [students, selectedExam.date, selectedExam.session]);

  // Derive subject-wise student strength for this date & session
  const subjectStrengthList: SubjectStrength[] = useMemo(() => {
    const map = new Map<string, SubjectStrength>();

    sessionStudents.forEach((std) => {
      const key = `${std.department}_${std.subjectCode}`;
      if (!map.has(key)) {
        map.set(key, {
          department: std.department,
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

    return Array.from(map.values()).sort((a, b) => b.studentCount - a.studentCount);
  }, [sessionStudents]);

  // Total student strength for current date & session
  const totalRequiredStrength = sessionStudents.length;

  // Selected Hall IDs for this exam session
  const currentSelectedHallIds = useMemo(() => {
    if (selectedExam.selectedHallIds && selectedExam.selectedHallIds.length > 0) {
      return selectedExam.selectedHallIds;
    }
    // Fallback: auto-calculate default optimal halls if none set yet
    return findOptimalHalls(totalRequiredStrength || 42, activeRooms);
  }, [selectedExam.selectedHallIds, totalRequiredStrength, activeRooms]);

  // Array of actual Room objects currently selected for this exam
  const selectedHalls = useMemo(() => {
    return activeRooms.filter((r) => currentSelectedHallIds.includes(r.id));
  }, [activeRooms, currentSelectedHallIds]);

  // Total seat capacity of currently selected halls
  const totalSelectedHallsCapacity = useMemo(() => {
    return selectedHalls.reduce((sum, room) => sum + getRoomNetCapacity(room), 0);
  }, [selectedHalls]);

  // Capacity Difference (Selected Capacity - Required Strength)
  const capacityDifference = totalSelectedHallsCapacity - totalRequiredStrength;

  // Ensure current active room tab points to a valid selected hall
  const currentViewingRoom = useMemo(() => {
    return (
      rooms.find((r) => r.id === selectedRoomId) ||
      selectedHalls[0] ||
      activeRooms[0] ||
      rooms[0]
    );
  }, [rooms, selectedRoomId, selectedHalls, activeRooms]);

  // Seats allocated for the current exam session and current viewing hall
  const currentViewingHallSeats = useMemo(() => {
    return allocatedSeats.filter(
      (s) =>
        s.roomId === currentViewingRoom?.id &&
        s.student.examDate === selectedExam.date &&
        s.student.session === selectedExam.session
    );
  }, [allocatedSeats, currentViewingRoom?.id, selectedExam.date, selectedExam.session]);

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

  // Department breakdown inside current viewing hall
  const currentHallDeptBreakdown = useMemo(() => {
    const counts: { [dept in Department]?: number } = {};
    currentViewingHallSeats.forEach((seat) => {
      counts[seat.student.department] = (counts[seat.student.department] || 0) + 1;
    });
    return counts;
  }, [currentViewingHallSeats]);

  // Handle Hall Checkbox Toggle
  const handleToggleHall = (roomId: string) => {
    let nextSelected: string[];
    if (currentSelectedHallIds.includes(roomId)) {
      nextSelected = currentSelectedHallIds.filter((id) => id !== roomId);
    } else {
      nextSelected = [...currentSelectedHallIds, roomId];
    }

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
        dept === 'CIVIL' ? '717621103' : '717621105';

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
      newSubjectDept === 'CIVIL' ? '717621103' : '717621105';

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

  // Run Auto Allocation for the Selected Halls & Date/Session
  const handleRunAutoAllocation = () => {
    if (selectedHalls.length === 0) {
      alert('Please select at least one Exam Hall to allocate seats.');
      return;
    }

    if (sessionStudents.length === 0) {
      alert('No registered candidates found for this date & session. Add subjects or adjust student strength first.');
      return;
    }

    // Allocate specifically sessionStudents into selectedHalls
    const result = allocateSeats(sessionStudents, selectedHalls, strategy);

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

  // Handle seat swap
  const handleSeatClick = (seat: AllocatedSeat) => {
    if (!swapSourceSeat) {
      setSelectedStudentDetail(seat);
    } else {
      if (swapSourceSeat.seatId === seat.seatId) {
        setSwapSourceSeat(null);
        return;
      }

      // Perform candidate swap
      const updated = allocatedSeats.map((s) => {
        if (s.seatId === swapSourceSeat.seatId) {
          return { ...s, student: seat.student };
        }
        if (s.seatId === seat.seatId) {
          return { ...s, student: swapSourceSeat.student };
        }
        return s;
      });

      onUpdateAllocatedSeats(updated);
      setSwapSourceSeat(null);
    }
  };

  // Export CSV for this date & session
  const handleExportCSV = () => {
    const sessionSeats = allocatedSeats.filter(
      (s) =>
        s.student.examDate === selectedExam.date &&
        s.student.session === selectedExam.session
    );

    const headers = [
      'Hall Number',
      'Desk Number',
      'Row',
      'Column',
      'Slot',
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

  // Department colors
  const getDeptColor = (dept: Department) => {
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
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: DATE & SESSION SELECTOR + EXAM METADATA
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Calendar className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Exam Date & Subject-Wise Strength Allocation
                </h1>
                <p className="text-xs text-slate-500">
                  Select examination date, review subject candidate strength, and allocate halls dynamically based on capacity demand.
                </p>
              </div>
            </div>
          </div>

          {/* Date & Session Switcher Pills */}
          <div className="flex items-center flex-wrap gap-2">
            {exams.map((exam) => {
              const isSelected = exam.id === selectedExam.id;
              const countForExam = students.filter(
                (s) => s.examDate === exam.date && s.session === exam.session
              ).length;

              return (
                <button
                  key={exam.id}
                  id={`exam-tab-${exam.id}`}
                  onClick={() => {
                    onSelectExam(exam);
                    if (exam.selectedHallIds && exam.selectedHallIds[0]) {
                      setSelectedRoomId(exam.selectedHallIds[0]);
                    }
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="font-mono">{exam.date}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {exam.session}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {countForExam} Stud.
                  </span>
                </button>
              );
            })}

            <button
              id="add-exam-date-btn"
              onClick={() => setIsAddExamModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              title="Add another examination date or session"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Date</span>
            </button>
          </div>
        </div>

        {/* Selected Exam Information Bar */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900 text-sm">
              {selectedExam.name}
            </span>
            <span className="text-slate-400">•</span>
            <span className="flex items-center space-x-1 text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <strong className="text-slate-800">{selectedExam.date}</strong>
            </span>
            <span className="text-slate-400">•</span>
            <span className="flex items-center space-x-1 text-slate-600">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Session: <strong className="text-indigo-600 font-bold">{selectedExam.session === 'FN' ? 'Forenoon (FN)' : 'Afternoon (AN)'}</strong> ({selectedExam.timeSlot})</span>
            </span>
            <span className="text-slate-400">•</span>
            <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-md text-[11px]">
              Semester {selectedExam.semester}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Session Demand:</span>
            <span className="font-bold text-sm text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              {totalRequiredStrength} Registered Candidates
            </span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: SUBJECT-WISE CANDIDATE STRENGTH BREAKDOWN
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Date-Wise Subject & Student Strength Roster</span>
            </h2>
            <p className="text-xs text-slate-500">
              Review and customize candidate strength for each subject. Hall capacity will balance against these student numbers.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="add-subject-to-session-btn"
              onClick={() => {
                const available = DEPT_SUBJECTS[selectedExam.semester] || DEPT_SUBJECTS[5];
                const firstDept = (Object.keys(available)[0] as Department) || 'CSE';
                setNewSubjectDept(firstDept);
                setNewSubjectCode(available[firstDept]?.code || 'CS8591');
                setNewSubjectName(available[firstDept]?.name || 'Course Name');
                setNewSubjectStrength(28);
                setIsAddSubjectModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Subject / Branch</span>
            </button>
          </div>
        </div>

        {/* Subjects Strength Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <th className="py-2.5 px-3 rounded-l-xl">Department</th>
                <th className="py-2.5 px-3">Subject Code & Course Title</th>
                <th className="py-2.5 px-3">Semester</th>
                <th className="py-2.5 px-3">Candidate Register Prefix</th>
                <th className="py-2.5 px-3 text-center">Registered Strength</th>
                <th className="py-2.5 px-3 text-right rounded-r-xl">Quick Adjust / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjectStrengthList.map((item) => {
                return (
                  <tr key={`${item.department}_${item.subjectCode}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-1 rounded-md font-bold text-[11px] border ${getDeptColor(item.department)}`}>
                        {item.department}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">
                        <span className="font-mono text-indigo-600 mr-1.5 font-bold">{item.subjectCode}</span>
                        {item.subjectName}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      Sem {item.semester} (Yr {item.year})
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500">
                      {item.regNoPrefix}001 - {item.regNoPrefix}{item.studentCount.toString().padStart(3, '0')}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center space-x-1 font-bold text-sm text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.studentCount}</span>
                        <span className="text-[10px] text-slate-500 font-normal">Students</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          id={`strength-minus-${item.department}-${item.subjectCode}`}
                          onClick={() => handleAdjustSubjectStrength(item.department, item.subjectCode, Math.max(1, item.studentCount - 2))}
                          className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                          title="Reduce strength by 2"
                        >
                          -2
                        </button>
                        <button
                          id={`strength-plus-${item.department}-${item.subjectCode}`}
                          onClick={() => handleAdjustSubjectStrength(item.department, item.subjectCode, item.studentCount + 2)}
                          className="w-7 h-7 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
                          title="Increase strength by 2"
                        >
                          +2
                        </button>
                        <button
                          id={`remove-sub-${item.department}-${item.subjectCode}`}
                          onClick={() => handleRemoveSubject(item.department, item.subjectCode)}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-2"
                          title="Remove subject from this session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {subjectStrengthList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No subjects registered for this date & session. Click "+ Add Subject / Branch" to add candidates.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: HALL ALLOCATION & CAPACITY DEMAND BALANCING
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <Building2 className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Hall Allocation for Candidate Strength
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select examination halls to accommodate the <strong>{totalRequiredStrength} candidates</strong> registered for this date & session.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="auto-select-halls-btn"
              onClick={handleAutoSelectOptimalHalls}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              title="Automatically choose the best fitting halls for this candidate strength"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Select Optimal Halls</span>
            </button>
          </div>
        </div>

        {/* Live Capacity vs Demand Gauge */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200 text-xs">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-slate-500 block text-[11px]">Total Candidate Strength</span>
            <span className="text-xl font-bold text-slate-900">{totalRequiredStrength} Candidates</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">{subjectStrengthList.length} Subjects in this session</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-slate-500 block text-[11px]">Selected Halls Capacity</span>
            <span className="text-xl font-bold text-indigo-700">{totalSelectedHallsCapacity} Seats</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">{selectedHalls.length} Halls Allocated</span>
          </div>

          <div className={`p-3.5 rounded-xl border ${
            capacityDifference >= 0 
              ? capacityDifference === 0 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-blue-50 border-blue-200 text-blue-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <span className="block text-[11px] font-semibold">Allocation Capacity Status</span>
            <div className="flex items-center space-x-1.5 mt-1">
              {capacityDifference >= 0 ? (
                <CheckCircle2 className={`w-5 h-5 ${capacityDifference === 0 ? 'text-emerald-600' : 'text-blue-600'}`} />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              )}
              <span className="text-base font-bold">
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
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isChecked
                      ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                          isChecked
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

        {/* Strategy and Action Execution Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100 bg-slate-50/50 p-4 rounded-xl">
          <div className="flex items-center space-x-3 text-xs">
            <span className="font-bold text-slate-700 flex items-center space-x-1.5">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <span>Interleaving Strategy:</span>
            </span>
            <select
              id="allocation-strategy-select"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as AllocationStrategy)}
              aria-label="Select student distribution strategy"
              className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="interleaved-dept">Multi-Department Interleaving (Anti-Malpractice Standard)</option>
              <option value="sequential-dept">Sequential by Department</option>
              <option value="alternate-roll">Alternate Roll Number Order</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="run-allocation-btn"
              onClick={handleRunAutoAllocation}
              className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Execute Allocation for Selected Halls</span>
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
            const seatedCount = allocatedSeats.filter(
              (s) =>
                s.roomId === room.id &&
                s.student.examDate === selectedExam.date &&
                s.student.session === selectedExam.session
            ).length;
            const netCap = getRoomNetCapacity(room);

            return (
              <button
                key={room.id}
                id={`select-hall-tab-${room.id}`}
                onClick={() => setSelectedRoomId(room.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-2 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{room.roomNumber}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
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
          </select>

          <button
            id="print-hall-chart-btn"
            onClick={() => onNavigateToReports(currentViewingRoom?.id)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
            title="Generate print-ready door chart for this hall"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print Door Notice</span>
          </button>
        </div>
      </div>

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
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
          {/* Hall Meta Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-slate-900">
                  {currentViewingRoom.roomNumber} Seating Arrangement
                </h3>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                  {currentViewingRoom.block} • {currentViewingRoom.floor}
                </span>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                  {getRoomNetCapacity(currentViewingRoom)} Total Capacity
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Total {currentViewingHallSeats.length} students allocated for {selectedExam.date} ({selectedExam.session}).
              </p>
            </div>

            {/* Department Breakdown Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(currentHallDeptBreakdown).map(([dept, count]) => (
                <span
                  key={dept}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getDeptColor(
                    dept as Department
                  )}`}
                >
                  {dept}: {count}
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
                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-500">
                          <span>Desk {deskId}</span>
                          <span className="text-[9px] text-slate-400 font-normal">
                            Col {colNum} • {perDesk} Seats
                          </span>
                        </div>

                        {/* Seats Content */}
                        {perDesk === 1 ? (
                          (() => {
                            const seatA = deskSeats.find((s) => s.slotPosition === 'A' || s.slotPosition === 'Single');
                            return seatA ? (
                              <div
                                onClick={() => handleSeatClick(seatA)}
                                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                                  swapSourceSeat?.seatId === seatA.seatId
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
                                  <span className="text-[9px] font-mono text-slate-500">
                                    {seatA.student.registerNumber.slice(-4)}
                                  </span>
                                </div>
                                <p className="font-semibold text-slate-800 text-[11px] truncate mt-1">
                                  {seatA.student.name}
                                </p>
                                <span className="text-[9px] text-slate-400 block font-mono">
                                  {seatA.student.registerNumber}
                                </span>
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
                                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                      swapSourceSeat?.seatId === seatA.seatId
                                        ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                        : 'bg-slate-50/80 hover:bg-indigo-50/60 border-slate-200 hover:border-indigo-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] font-bold text-slate-400">L</span>
                                      <span
                                        className={`text-[8px] font-bold px-1 py-0.2 rounded border ${getDeptColor(
                                          seatA.student.department
                                        )}`}
                                      >
                                        {seatA.student.department}
                                      </span>
                                    </div>
                                    <p className="font-bold text-slate-800 text-[10px] truncate mt-0.5">
                                      {seatA.student.name.split(' ')[0]}
                                    </p>
                                    <span className="text-[8px] text-slate-500 font-mono block">
                                      ...{seatA.student.registerNumber.slice(-4)}
                                    </span>
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
                                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                      swapSourceSeat?.seatId === seatB.seatId
                                        ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                        : 'bg-slate-50/80 hover:bg-indigo-50/60 border-slate-200 hover:border-indigo-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] font-bold text-slate-400">R</span>
                                      <span
                                        className={`text-[8px] font-bold px-1 py-0.2 rounded border ${getDeptColor(
                                          seatB.student.department
                                        )}`}
                                      >
                                        {seatB.student.department}
                                      </span>
                                    </div>
                                    <p className="font-bold text-slate-800 text-[10px] truncate mt-0.5">
                                      {seatB.student.name.split(' ')[0]}
                                    </p>
                                    <span className="text-[8px] text-slate-500 font-mono block">
                                      ...{seatB.student.registerNumber.slice(-4)}
                                    </span>
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
                                  className={`p-1 rounded-md border transition-all cursor-pointer ${
                                    swapSourceSeat?.seatId === seat.seatId
                                      ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                                      : 'bg-slate-50 hover:bg-indigo-50 border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-bold text-slate-400">{slotLetter}</span>
                                    <span
                                      className={`text-[7px] font-bold px-1 py-0.2 rounded border ${getDeptColor(
                                        seat.student.department
                                      )}`}
                                    >
                                      {seat.student.department}
                                    </span>
                                  </div>
                                  <p className="font-bold text-slate-800 text-[9px] truncate mt-0.5">
                                    {seat.student.name.split(' ')[0]}
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
