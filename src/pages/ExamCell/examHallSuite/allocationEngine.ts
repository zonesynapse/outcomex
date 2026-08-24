import { Room, Student, AllocatedSeat, Faculty, DutyAllocation, Department, ExamSchedule } from '../../../types';

export interface AllocationResult {
  allocatedSeats: AllocatedSeat[];
  unallocatedStudents: Student[];
  totalCapacity: number;
  totalAllocated: number;
  roomStats: {
    roomId: string;
    roomNumber: string;
    capacity: number;
    allocated: number;
    utilizationPercent: number;
    departments: { [dept in Department]?: number };
  }[];
  departmentStats: { [dept in Department]?: number };
}

export type AllocationStrategy = 'interleaved-dept' | 'sequential-dept' | 'alternate-roll';

/**
 * Calculate net usable capacity for a single room accounting for disabled desks and column capacities
 */
export function getRoomNetCapacity(room: Room): number {
  let capacity = 0;
  const colCount = room.columns || 1;
  const defaultPerDesk = Math.max(1, room.studentsPerDesk || 1);

  for (let c = 1; c <= colCount; c++) {
    const colRows = room.columnRows && room.columnRows[c - 1] !== undefined ? room.columnRows[c - 1] : (room.rows || 5);
    const colPerDesk = room.columnStudentsPerDesk && room.columnStudentsPerDesk[c - 1] !== undefined
      ? Math.max(1, Number(room.columnStudentsPerDesk[c - 1]) || 1)
      : defaultPerDesk;

    for (let r = 1; r <= colRows; r++) {
      const deskId = `R${r}-C${c}`;
      if (!room.disabledDesks?.includes(deskId)) {
        capacity += colPerDesk;
      }
    }
  }

  return capacity;
}

/**
 * Automatically select optimal halls to fit a required student strength with minimum seat wastage
 */
export function findOptimalHalls(requiredStrength: number, availableRooms: Room[]): string[] {
  const activeRooms = availableRooms.filter((r) => r.status === 'Active');
  if (activeRooms.length === 0 || requiredStrength <= 0) return [];

  // Sort rooms by floor priority and capacity
  const sortedRooms = [...activeRooms].sort((a, b) => {
    const capA = getRoomNetCapacity(a);
    const capB = getRoomNetCapacity(b);
    return capB - capA; // Larger capacity halls first
  });

  let currentCapacity = 0;
  const selectedIds: string[] = [];

  for (const room of sortedRooms) {
    const cap = getRoomNetCapacity(room);
    if (cap <= 0) continue;

    selectedIds.push(room.id);
    currentCapacity += cap;

    if (currentCapacity >= requiredStrength) {
      break;
    }
  }

  if (currentCapacity < requiredStrength) {
    return activeRooms.map((r) => r.id);
  }

  return selectedIds;
}

/**
 * Intelligent Seating Allocation Engine with Multi-Department Interleaving
 */
export function allocateSeats(
  students: Student[],
  rooms: Room[],
  strategy: AllocationStrategy = 'interleaved-dept'
): AllocationResult {
  const activeRooms = rooms.filter((r) => r.status === 'Active');
  
  let totalCapacity = 0;
  activeRooms.forEach((room) => {
    const colCount = room.columns;
    for (let c = 1; c <= colCount; c++) {
      const colRows = room.columnRows && room.columnRows[c - 1] !== undefined ? room.columnRows[c - 1] : room.rows;
      const colPerDesk = room.columnStudentsPerDesk && room.columnStudentsPerDesk[c - 1] !== undefined
        ? Math.max(1, Number(room.columnStudentsPerDesk[c - 1]) || 1)
        : Math.max(1, room.studentsPerDesk || 1);

      for (let r = 1; r <= colRows; r++) {
        const deskId = `R${r}-C${c}`;
        if (!room.disabledDesks?.includes(deskId)) {
          totalCapacity += colPerDesk;
        }
      }
    }
  });

  let orderedStudents: Student[] = [];

  if (strategy === 'interleaved-dept') {
    const deptMap: { [key: string]: Student[] } = {};
    students.forEach((std) => {
      if (!deptMap[std.department]) deptMap[std.department] = [];
      deptMap[std.department].push(std);
    });

    const depts = Object.keys(deptMap);
    let remaining = true;
    let index = 0;

    while (remaining) {
      remaining = false;
      for (const dept of depts) {
        if (deptMap[dept] && index < deptMap[dept].length) {
          orderedStudents.push(deptMap[dept][index]);
          remaining = true;
        }
      }
      index++;
    }
  } else if (strategy === 'alternate-roll') {
    orderedStudents = [...students].sort((a, b) => a.registerNumber.localeCompare(b.registerNumber));
  } else {
    orderedStudents = [...students].sort((a, b) => {
      if (a.department === b.department) {
        return a.registerNumber.localeCompare(b.registerNumber);
      }
      return a.department.localeCompare(b.department);
    });
  }

  const allocatedSeats: AllocatedSeat[] = [];
  let studentIndex = 0;
  const roomStats: AllocationResult['roomStats'] = [];
  const departmentStats: AllocationResult['departmentStats'] = {};

  students.forEach((s) => {
    departmentStats[s.department] = (departmentStats[s.department] || 0);
  });

  for (const room of activeRooms) {
    let roomAllocated = 0;
    let roomCapacity = 0;
    const roomDeptMap: { [dept in Department]?: number } = {};
    const colCount = room.columns;
    const perDesk = Math.max(1, room.studentsPerDesk || 1);

    const maxRows = Math.max(
      room.rows,
      ...(room.columnRows && room.columnRows.length > 0 ? room.columnRows : [room.rows])
    );

    for (let r = 1; r <= maxRows; r++) {
      for (let c = 1; c <= colCount; c++) {
        const colRows = room.columnRows && room.columnRows[c - 1] !== undefined ? room.columnRows[c - 1] : room.rows;
        if (r > colRows) continue;

        const deskId = `R${r}-C${c}`;
        if (room.disabledDesks?.includes(deskId)) continue;

        const colPerDesk = room.columnStudentsPerDesk && room.columnStudentsPerDesk[c - 1] !== undefined
          ? Math.max(1, Number(room.columnStudentsPerDesk[c - 1]) || 1)
          : perDesk;

        roomCapacity += colPerDesk;

        for (let sIdx = 0; sIdx < colPerDesk; sIdx++) {
          if (studentIndex < orderedStudents.length) {
            const currentStudent = orderedStudents[studentIndex++];
            const slotPos = colPerDesk === 1 
              ? 'Single' 
              : String.fromCharCode(65 + sIdx);
            
            allocatedSeats.push({
              seatId: `${room.id}-${deskId}-${slotPos}`,
              roomId: room.id,
              roomNumber: room.roomNumber,
              deskNumber: deskId,
              row: r,
              col: c,
              slotPosition: slotPos,
              student: currentStudent,
              status: 'Allocated',
            });
            roomAllocated++;
            roomDeptMap[currentStudent.department] = (roomDeptMap[currentStudent.department] || 0) + 1;
            departmentStats[currentStudent.department] = (departmentStats[currentStudent.department] || 0) + 1;
          }
        }
      }
    }

    roomStats.push({
      roomId: room.id,
      roomNumber: room.roomNumber,
      capacity: roomCapacity,
      allocated: roomAllocated,
      utilizationPercent: roomCapacity > 0 ? Math.round((roomAllocated / roomCapacity) * 100) : 0,
      departments: roomDeptMap,
    });
  }

  const unallocatedStudents = orderedStudents.slice(studentIndex);

  return {
    allocatedSeats,
    unallocatedStudents,
    totalCapacity,
    totalAllocated: allocatedSeats.length,
    roomStats,
    departmentStats,
  };
}

/**
 * Auto-assigns faculty duties for active examination halls
 */
export function autoAssignFacultyDuties(
  exam: ExamSchedule,
  usedRooms: Room[],
  facultyList: Faculty[]
): DutyAllocation[] {
  const availableFaculty = facultyList.filter((f) => f.isAvailable);
  const sortedFaculty = [...availableFaculty].sort((a, b) => a.assignedDutiesCount - b.maxDuties);

  const duties: DutyAllocation[] = [];
  let facIndex = 0;

  const seniorFac = sortedFaculty.find(
    (f) => (f.designation === 'Professor' || f.designation === 'Associate Professor') && !f.department.includes('exam')
  ) || sortedFaculty[0];

  if (seniorFac) {
    duties.push({
      id: `duty-${Date.now()}-cs`,
      examScheduleId: exam.id,
      date: exam.date,
      session: exam.session,
      timeSlot: exam.timeSlot,
      roomId: 'all',
      roomNumber: 'Central Exam Control Cell',
      facultyId: seniorFac.id,
      facultyName: seniorFac.name,
      facultyDept: seniorFac.department,
      role: 'Chief Superintendent',
      status: 'Confirmed',
      assignedAt: new Date().toLocaleString(),
    });
  }

  usedRooms.forEach((room) => {
    let assigned = false;
    for (let i = 0; i < sortedFaculty.length; i++) {
      const candidate = sortedFaculty[(facIndex + i) % sortedFaculty.length];
      if (candidate.id !== seniorFac?.id && !duties.some((d) => d.facultyId === candidate.id)) {
        duties.push({
          id: `duty-${Date.now()}-${room.id}`,
          examScheduleId: exam.id,
          date: exam.date,
          session: exam.session,
          timeSlot: exam.timeSlot,
          roomId: room.id,
          roomNumber: room.roomNumber,
          facultyId: candidate.id,
          facultyName: candidate.name,
          facultyDept: candidate.department,
          role: 'Hall Invigilator',
          status: 'Confirmed',
          assignedAt: new Date().toLocaleString(),
        });
        facIndex = (facIndex + i + 1) % sortedFaculty.length;
        assigned = true;
        break;
      }
    }

    if (!assigned && sortedFaculty.length > 0) {
      const fallback = sortedFaculty[facIndex % sortedFaculty.length];
      duties.push({
        id: `duty-${Date.now()}-${room.id}`,
        examScheduleId: exam.id,
        date: exam.date,
        session: exam.session,
        timeSlot: exam.timeSlot,
        roomId: room.id,
        roomNumber: room.roomNumber,
        facultyId: fallback.id,
        facultyName: fallback.name,
        facultyDept: fallback.department,
        role: 'Hall Invigilator',
        status: 'Confirmed',
        assignedAt: new Date().toLocaleString(),
      });
      facIndex++;
    }
  });

  const standbyCount = Math.max(1, Math.ceil(usedRooms.length / 4));
  for (let s = 0; s < standbyCount; s++) {
    const unassigned = sortedFaculty.find((f) => !duties.some((d) => d.facultyId === f.id));
    if (unassigned) {
      duties.push({
        id: `duty-${Date.now()}-sb-${s}`,
        examScheduleId: exam.id,
        date: exam.date,
        session: exam.session,
        timeSlot: exam.timeSlot,
        roomId: 'standby',
        roomNumber: 'Standby / Reliever Pool',
        facultyId: unassigned.id,
        facultyName: unassigned.name,
        facultyDept: unassigned.department,
        role: 'Reliever / Standby',
        status: 'Confirmed',
        assignedAt: new Date().toLocaleString(),
      });
    }
  }

  return duties;
}

/**
 * Export CSV Helper
 */
export function downloadCSV(filename: string, rows: string[][]) {
  const processRow = (row: string[]) =>
    row
      .map((val) => {
        let text = (val || '').toString().replace(/"/g, '""');
        if (text.search(/("|,|\n)/g) >= 0) {
          text = `"${text}"`;
        }
        return text;
      })
      .join(',');

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(processRow).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
