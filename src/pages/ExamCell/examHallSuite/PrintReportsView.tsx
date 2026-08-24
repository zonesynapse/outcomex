import React, { useState, useRef, useMemo } from 'react';
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
import { downloadCSV } from './allocationEngine';

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
  const [selectedDepartment, setSelectedDepartment] = useState<string>('CSE');
  const [deptSortBy, setDeptSortBy] = useState<'regNo' | 'hall' | 'name'>('regNo');
  const [sortBy, setSortBy] = useState<SeatingSortOrder>('department');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [groupByDept, setGroupByDept] = useState<boolean>(true);
  const [includeSignatures, setIncludeSignatures] = useState<boolean>(true);
  const [collegeName, setCollegeName] = useState<string>('C.K. COLLEGE OF ENGINEERING & TECHNOLOGY (AUTONOMOUS)');
  const [examSubTitle, setExamSubTitle] = useState<string>('Office of the Controller of Examinations — Internal Assessment Cell');

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

  // All unique departments appearing in the current active exam date & session across ALL halls
  const allExamDepartments = useMemo(() => {
    const depts = new Set<Department>();
    students
      .filter((s) => s.examDate === selectedExam.date && s.session === selectedExam.session)
      .forEach((s) => depts.add(s.department));
    
    // Also add from allocatedSeats in case
    allocatedSeats
      .filter((s) => s.student.examDate === selectedExam.date && s.student.session === selectedExam.session)
      .forEach((s) => depts.add(s.student.department));

    const arr = Array.from(depts);
    return arr.length > 0 ? arr : (['CSE', 'IT', 'AI&DS', 'ECE', 'MECH', 'CIVIL', 'EEE'] as Department[]);
  }, [students, allocatedSeats, selectedExam.date, selectedExam.session]);

  // Map for fast room lookup
  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    rooms.forEach((r) => map.set(r.id, r));
    return map;
  }, [rooms]);

  // Department-Wise Attendance Students Data (Aggregated across ALL exam halls)
  const departmentStudentsWithHall = useMemo(() => {
    // 1. Get all students of the chosen department (or all departments) appearing for this exam date & session
    const targetStudents = students.filter((st) => {
      const matchExam = st.examDate === selectedExam.date && st.session === selectedExam.session;
      if (!matchExam) return false;
      if (selectedDepartment !== 'ALL' && st.department !== selectedDepartment) return false;
      return true;
    });

    // 2. Map with their allocated seat and hall info
    const enrichedList = targetStudents.map((st) => {
      const seat = allocatedSeats.find(
        (s) =>
          s.student.id === st.id &&
          s.student.examDate === selectedExam.date &&
          s.student.session === selectedExam.session
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
  }, [students, allocatedSeats, selectedExam.date, selectedExam.session, selectedDepartment, deptSortBy, roomMap]);

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
            { id: 'qp-distribution', label: '2. Question Paper Distribution & Indent Report' },
            { id: 'door-notice', label: '3. Hall Door Notice (Room-Wise)' },
            { id: 'desk-slips', label: '4. Student Desk Stickers / Slips' },
            { id: 'admin-oversight', label: '5. Admin Oversight Master Report' },
            { id: 'absentee-statement', label: '6. Absentee & Booklet Statement' },
            { id: 'faculty-orders', label: '7. Faculty Duty Memo' },
          ].map((rpt) => (
            <button
              key={rpt.id}
              id={`report-tab-${rpt.id}`}
              onClick={() => setReportType(rpt.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                reportType === rpt.id
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
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    qpViewMode === 'matrix'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📋 Master Distribution Register
                </button>
                <button
                  id="qp-view-mode-summary"
                  onClick={() => setQpViewMode('subject-summary')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    qpViewMode === 'subject-summary'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📊 Subject-Wise Indent Summary
                </button>
                <button
                  id="qp-view-mode-slips"
                  onClick={() => setQpViewMode('envelope-slips')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    qpViewMode === 'envelope-slips'
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
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Select Department:</span>
              <select
                id="select-dept-attendance-branch"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                aria-label="Select department branch for attendance sheet"
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none"
              >
                {allExamDepartments.map((d) => (
                  <option key={d} value={d}>
                    Department of {d}
                  </option>
                ))}
                <option value="ALL">All Departments (Consolidated)</option>
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

      {/* PRINTABLE CANVAS CONTAINER */}
      <div 
        ref={printAreaRef}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-5xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 text-slate-900"
      >
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
                  {selectedDepartment === 'ALL' ? 'All Engineering Departments' : `Department of ${selectedDepartment}`}
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
                  {departmentStudentsWithHall[0]?.student.subjectCode
                    ? `${departmentStudentsWithHall[0]?.student.subjectCode} — ${departmentStudentsWithHall[0]?.student.subjectName}`
                    : 'All Departmental Courses'}
                </span>
              </div>
            </div>

            {/* Hall Distribution Summary Box */}
            <div className="border border-slate-900 bg-slate-100/80 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-800">Assigned Exam Halls:</span>
                {Object.entries(deptHallDistribution).map(([hallNo, count]) => (
                  <span
                    key={hallNo}
                    className="inline-flex items-center space-x-1 bg-white border border-slate-400 px-2 py-0.5 rounded text-slate-900 font-mono text-[11px]"
                  >
                    <span className="font-bold text-indigo-700">{hallNo}:</span>
                    <span>{count} Students</span>
                  </span>
                ))}
              </div>
              <div className="font-bold text-slate-900 text-xs">
                Total Branch Strength: <span className="text-indigo-800 font-mono text-sm">{departmentStudentsWithHall.length}</span> Candidates
              </div>
            </div>

            {/* Department Students Table */}
            <div>
              <table className="w-full text-left border-collapse border border-slate-900 text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-2 border-r border-slate-900 text-center w-12">S.No</th>
                    <th className="py-2.5 px-3 border-r border-slate-900 w-36">Register Number</th>
                    <th className="py-2.5 px-3 border-r border-slate-900">Candidate Name</th>
                    <th className="py-2.5 px-3 border-r border-slate-900 text-center w-36 bg-indigo-50 text-indigo-950 font-black">
                      Allocated Hall
                    </th>
                    <th className="py-2.5 px-3 border-r border-slate-900 text-center w-28">Desk No</th>
                    {includeSignatures && (
                      <th className="py-2.5 px-4 border-r border-slate-900 text-center w-48">
                        Candidate Signature
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {departmentStudentsWithHall.map((item, idx) => (
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
                      <td className="py-2 px-3 border-r border-slate-900 text-center bg-indigo-50/50">
                        <span className="font-extrabold font-mono text-indigo-900 text-xs">
                          {item.hallNumber}
                        </span>
                        {item.room && (
                          <span className="block text-[9px] text-slate-500 font-sans">
                            {item.room.block} ({item.room.floor})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-900 text-center font-bold font-mono text-slate-800">
                        {item.deskNumber}
                      </td>
                      {includeSignatures && (
                        <td className="py-2 px-4 border-r border-slate-900 text-center text-slate-300">
                          {/* Empty space for Candidate Signature */}
                        </td>
                      )}
                    </tr>
                  ))}
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
