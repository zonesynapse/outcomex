import { Room, Student, ExamSchedule, Faculty, DutyAllocation, DutyAlterationRequest, NotificationLog, Department, ExamDutyWorkflow } from '../../../types';

export const INITIAL_ROOMS: Room[] = [
  {
    id: 'room-101',
    roomNumber: 'LH-101',
    block: 'CKCET Main Academic Block',
    floor: 'Ground Floor',
    rows: 6,
    columns: 3,
    columnRows: [5, 6, 5],
    studentsPerDesk: 3,
    columnStudentsPerDesk: [3, 2, 3],
    totalCapacity: 42,
    type: 'Classroom',
    status: 'Active',
    disabledDesks: [],
  },
  {
    id: 'room-102',
    roomNumber: 'LH-102',
    block: 'CKCET Main Academic Block',
    floor: 'Ground Floor',
    rows: 6,
    columns: 3,
    columnRows: [5, 6, 5],
    studentsPerDesk: 3,
    columnStudentsPerDesk: [3, 2, 3],
    totalCapacity: 42,
    type: 'Classroom',
    status: 'Active',
    disabledDesks: [],
  },
  {
    id: 'room-201',
    roomNumber: 'LH-201',
    block: 'CKCET Technology Block',
    floor: '1st Floor',
    rows: 6,
    columns: 3,
    columnRows: [5, 6, 5],
    studentsPerDesk: 3,
    columnStudentsPerDesk: [3, 2, 3],
    totalCapacity: 42,
    type: 'Classroom',
    status: 'Active',
    disabledDesks: [],
  },
  {
    id: 'room-202',
    roomNumber: 'LH-202',
    block: 'CKCET Technology Block',
    floor: '1st Floor',
    rows: 6,
    columns: 3,
    columnRows: [5, 6, 5],
    studentsPerDesk: 3,
    columnStudentsPerDesk: [3, 2, 3],
    totalCapacity: 42,
    type: 'Classroom',
    status: 'Active',
    disabledDesks: [],
  },
  {
    id: 'room-301',
    roomNumber: 'DH-301',
    block: 'CKCET Mechanical Block',
    floor: '2nd Floor',
    rows: 4,
    columns: 8,
    columnRows: [4, 4, 4, 4, 4, 4, 4, 4],
    studentsPerDesk: 1,
    columnStudentsPerDesk: [1, 1, 1, 1, 1, 1, 1, 1],
    totalCapacity: 32,
    type: 'Drawing Hall',
    status: 'Active',
    disabledDesks: [],
  },
  {
    id: 'room-302',
    roomNumber: 'SH-302',
    block: 'CKCET Central Block',
    floor: '3rd Floor',
    rows: 6,
    columns: 4,
    columnRows: [6, 6, 6, 6],
    studentsPerDesk: 2,
    columnStudentsPerDesk: [2, 2, 2, 2],
    totalCapacity: 48,
    type: 'Seminar Hall',
    status: 'Active',
    disabledDesks: [],
  },
];

export const INITIAL_EXAMS: ExamSchedule[] = [
  {
    id: 'exam-1',
    name: 'Continuous Internal Assessment - I (CIA-I)',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    departments: ['CSE', 'IT', 'AI&DS', 'ECE', 'MECH'],
    semester: 5,
    status: 'Scheduled',
    selectedHallIds: ['room-101', 'room-102', 'room-201'],
  },
  {
    id: 'exam-2',
    name: 'Continuous Internal Assessment - I (CIA-I)',
    date: '2026-08-25',
    session: 'AN',
    timeSlot: '01:30 PM - 04:30 PM',
    departments: ['CSE', 'IT', 'ECE'],
    semester: 3,
    status: 'Scheduled',
    selectedHallIds: ['room-101', 'room-102'],
  },
  {
    id: 'exam-3',
    name: 'Continuous Internal Assessment - I (CIA-I)',
    date: '2026-08-26',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    departments: ['AI&DS', 'MECH', 'CIVIL', 'EEE'],
    semester: 7,
    status: 'Scheduled',
    selectedHallIds: ['room-101', 'room-102', 'room-201'],
  },
  {
    id: 'exam-4',
    name: 'Model Theory Examination',
    date: '2026-08-27',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    departments: ['CSE', 'ECE'],
    semester: 6,
    status: 'Scheduled',
    selectedHallIds: ['room-101', 'room-102'],
  },
];

export const DEPT_SUBJECTS: { [sem: number]: { [dept: string]: { code: string; name: string } } } = {
  3: {
    CSE: { code: 'CS8391', name: 'Data Structures & Algorithms' },
    IT: { code: 'IT8301', name: 'Object Oriented Programming' },
    ECE: { code: 'EC8352', name: 'Signals and Systems' },
    MECH: { code: 'ME8351', name: 'Manufacturing Technology-I' },
    'AI&DS': { code: 'AD8301', name: 'Design and Analysis of Algorithms' },
    CIVIL: { code: 'CE8301', name: 'Strength of Materials-I' },
    EEE: { code: 'EE8351', name: 'Digital Logic Circuits' },
  },
  5: {
    CSE: { code: 'CS8591', name: 'Computer Networks' },
    IT: { code: 'IT8501', name: 'Web Technology' },
    'AI&DS': { code: 'AD8551', name: 'Machine Learning Concepts' },
    ECE: { code: 'EC8553', name: 'Discrete-Time Signal Processing' },
    MECH: { code: 'ME8595', name: 'Thermal Engineering-II' },
    CIVIL: { code: 'CE8502', name: 'Structural Analysis I' },
    EEE: { code: 'EE8501', name: 'Power System Analysis' },
  },
  6: {
    CSE: { code: 'CS8651', name: 'Internet Programming' },
    ECE: { code: 'EC8691', name: 'Wireless Communication' },
    IT: { code: 'IT8601', name: 'Computational Intelligence' },
    MECH: { code: 'ME8691', name: 'Design of Transmission Systems' },
    'AI&DS': { code: 'AD8601', name: 'Deep Learning & Neural Networks' },
  },
  7: {
    'AI&DS': { code: 'AD8701', name: 'Deep Learning & NLP' },
    MECH: { code: 'ME8792', name: 'Power Plant Engineering' },
    CIVIL: { code: 'CE8701', name: 'Estimation, Costing & Valuation' },
    EEE: { code: 'EE8701', name: 'High Voltage Engineering' },
    CSE: { code: 'CS8791', name: 'Cloud Computing Architecture' },
    ECE: { code: 'EC8701', name: 'Antennas and Microwave Engineering' },
  },
};

const FIRST_NAMES = ['Aarav', 'Diya', 'Kavya', 'Rahul', 'Sneha', 'Rohan', 'Ananya', 'Vikram', 'Pooja', 'Aditya', 'Meera', 'Varun', 'Swathi', 'Gautam', 'Priyanka', 'Siddharth', 'Nisha', 'Manoj', 'Harini', 'Arjun', 'Divya', 'Suresh', 'Keerthi', 'Naveen', 'Pavithra', 'Sanjay', 'Lavanya', 'Deepak', 'Aparna', 'Vignesh', 'Karthik', 'Swetha', 'Tharun', 'Preethi'];
const LAST_NAMES = ['Sharma', 'Kumar', 'Patel', 'Sundaram', 'Iyer', 'Reddy', 'Menon', 'Verma', 'Nair', 'Choudhury', 'Rao', 'Krishnan', 'Pillai', 'Deshmukh', 'Gupta', 'Banerjee', 'Bose', 'Chatterjee', 'Mishra', 'Joshi', 'Narayanan', 'Venkatesh'];

export function generateSampleStudents(): Student[] {
  const students: Student[] = [];
  let idCounter = 1;

  const exam1Batches: Array<{ dept: Department; count: number }> = [
    { dept: 'CSE', count: 32 },
    { dept: 'ECE', count: 28 },
    { dept: 'IT', count: 24 },
    { dept: 'AI&DS', count: 22 },
    { dept: 'MECH', count: 20 },
  ];

  exam1Batches.forEach((batch, deptIdx) => {
    const deptPrefix = batch.dept === 'CSE' ? '717621104' : batch.dept === 'IT' ? '717621205' : batch.dept === 'AI&DS' ? '717621306' : batch.dept === 'ECE' ? '717621106' : '717621114';
    const sub = DEPT_SUBJECTS[5][batch.dept] || { code: 'SUB501', name: `${batch.dept} Core Course` };

    for (let i = 1; i <= batch.count; i++) {
      const regNo = `${deptPrefix}${i.toString().padStart(3, '0')}`;
      const fName = FIRST_NAMES[(deptIdx * 7 + i) % FIRST_NAMES.length];
      const lName = LAST_NAMES[(deptIdx * 4 + i) % LAST_NAMES.length];

      students.push({
        id: `std-${idCounter++}`,
        registerNumber: regNo,
        name: `${fName} ${lName}`,
        department: batch.dept,
        year: 3,
        semester: 5,
        section: i <= 16 ? 'A' : 'B',
        subjectCode: sub.code,
        subjectName: sub.name,
        academicYear: '2026-2027',
        batch: '2023-2027',
        examDate: '2026-08-25',
        session: 'FN',
      });
    }
  });

  const exam2Batches: Array<{ dept: Department; count: number }> = [
    { dept: 'CSE', count: 32 },
    { dept: 'IT', count: 26 },
    { dept: 'ECE', count: 26 },
  ];

  exam2Batches.forEach((batch, deptIdx) => {
    const deptPrefix = batch.dept === 'CSE' ? '717622104' : batch.dept === 'IT' ? '717622205' : '717622106';
    const sub = DEPT_SUBJECTS[3][batch.dept] || { code: 'SUB301', name: `${batch.dept} Core Course` };

    for (let i = 1; i <= batch.count; i++) {
      const regNo = `${deptPrefix}${i.toString().padStart(3, '0')}`;
      const fName = FIRST_NAMES[(deptIdx * 5 + i + 10) % FIRST_NAMES.length];
      const lName = LAST_NAMES[(deptIdx * 3 + i + 5) % LAST_NAMES.length];

      students.push({
        id: `std-${idCounter++}`,
        registerNumber: regNo,
        name: `${fName} ${lName}`,
        department: batch.dept,
        year: 2,
        semester: 3,
        section: i <= 15 ? 'A' : 'B',
        subjectCode: sub.code,
        subjectName: sub.name,
        academicYear: '2026-2027',
        batch: '2024-2028',
        examDate: '2026-08-25',
        session: 'AN',
      });
    }
  });

  const exam3Batches: Array<{ dept: Department; count: number }> = [
    { dept: 'CSE', count: 30 },
    { dept: 'AI&DS', count: 26 },
    { dept: 'MECH', count: 22 },
    { dept: 'CIVIL', count: 18 },
    { dept: 'EEE', count: 18 },
  ];

  exam3Batches.forEach((batch, deptIdx) => {
    const deptPrefix = batch.dept === 'CSE' ? '717623104' : batch.dept === 'AI&DS' ? '717620306' : batch.dept === 'MECH' ? '717620114' : batch.dept === 'CIVIL' ? '717620103' : '717620105';
    const sub = DEPT_SUBJECTS[7][batch.dept] || { code: 'SUB701', name: `${batch.dept} Advanced Course` };

    for (let i = 1; i <= batch.count; i++) {
      const regNo = `${deptPrefix}${i.toString().padStart(3, '0')}`;
      const fName = FIRST_NAMES[(deptIdx * 6 + i + 3) % FIRST_NAMES.length];
      const lName = LAST_NAMES[(deptIdx * 4 + i + 8) % LAST_NAMES.length];

      students.push({
        id: `std-${idCounter++}`,
        registerNumber: regNo,
        name: `${fName} ${lName}`,
        department: batch.dept,
        year: 4,
        semester: 7,
        section: 'A',
        subjectCode: sub.code,
        subjectName: sub.name,
        academicYear: '2026-2027',
        batch: '2023-2027',
        examDate: '2026-08-26',
        session: 'FN',
      });
    }
  });

  const exam4Batches: Array<{ dept: Department; count: number }> = [
    { dept: 'CSE', count: 30 },
    { dept: 'ECE', count: 26 },
  ];

  exam4Batches.forEach((batch, deptIdx) => {
    const deptPrefix = batch.dept === 'CSE' ? '717621104' : '717621106';
    const sub = DEPT_SUBJECTS[6][batch.dept] || { code: 'SUB601', name: `${batch.dept} Special Elective` };

    for (let i = 1; i <= batch.count; i++) {
      const regNo = `${deptPrefix}${i.toString().padStart(3, '0')}`;
      const fName = FIRST_NAMES[(deptIdx * 8 + i + 12) % FIRST_NAMES.length];
      const lName = LAST_NAMES[(deptIdx * 5 + i + 15) % LAST_NAMES.length];

      students.push({
        id: `std-${idCounter++}`,
        registerNumber: regNo,
        name: `${fName} ${lName}`,
        department: batch.dept,
        year: 3,
        semester: 6,
        section: 'A',
        subjectCode: sub.code,
        subjectName: sub.name,
        academicYear: '2026-2027',
        batch: '2023-2027',
        examDate: '2026-08-27',
        session: 'FN',
      });
    }
  });

  return students;
}

export const INITIAL_FACULTY: Faculty[] = [
  {
    id: 'fac-1',
    staffId: 'STF-CSE-01',
    name: 'Dr. R. K. Ramanathan',
    department: 'CSE',
    designation: 'Professor',
    email: 'ramanathan.rk@institution.edu',
    phone: '+91 98401 23456',
    maxDuties: 4,
    assignedDutiesCount: 2,
    isAvailable: true,
  },
  {
    id: 'fac-2',
    staffId: 'STF-CSE-02',
    name: 'Prof. S. Meenakshi',
    department: 'CSE',
    designation: 'Associate Professor',
    email: 'meenakshi.s@institution.edu',
    phone: '+91 98402 34567',
    maxDuties: 4,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
  {
    id: 'fac-3',
    staffId: 'STF-IT-01',
    name: 'Dr. Anand Chandrasekar',
    department: 'IT',
    designation: 'Associate Professor',
    email: 'anand.c@institution.edu',
    phone: '+91 98403 45678',
    maxDuties: 4,
    assignedDutiesCount: 2,
    isAvailable: true,
  },
  {
    id: 'fac-4',
    staffId: 'STF-IT-02',
    name: 'Prof. Geetha Lakshmi',
    department: 'IT',
    designation: 'Assistant Professor',
    email: 'geetha.l@institution.edu',
    phone: '+91 98404 56789',
    maxDuties: 5,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
  {
    id: 'fac-5',
    staffId: 'STF-ECE-01',
    name: 'Dr. V. Karthikeyan',
    department: 'ECE',
    designation: 'Professor',
    email: 'karthikeyan.v@institution.edu',
    phone: '+91 98405 67890',
    maxDuties: 4,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
  {
    id: 'fac-6',
    staffId: 'STF-ECE-02',
    name: 'Prof. Preethi Venkatesh',
    department: 'ECE',
    designation: 'Assistant Professor',
    email: 'preethi.v@institution.edu',
    phone: '+91 98406 78901',
    maxDuties: 5,
    assignedDutiesCount: 2,
    isAvailable: true,
  },
  {
    id: 'fac-7',
    staffId: 'STF-AIDS-01',
    name: 'Dr. Suresh Balaji',
    department: 'AI&DS',
    designation: 'Associate Professor',
    email: 'suresh.b@institution.edu',
    phone: '+91 98407 89012',
    maxDuties: 4,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
  {
    id: 'fac-8',
    staffId: 'STF-AIDS-02',
    name: 'Prof. Deepa Nambiar',
    department: 'AI&DS',
    designation: 'Assistant Professor',
    email: 'deepa.n@institution.edu',
    phone: '+91 98408 90123',
    maxDuties: 5,
    assignedDutiesCount: 2,
    isAvailable: true,
  },
  {
    id: 'fac-9',
    staffId: 'STF-MECH-01',
    name: 'Dr. M. Senthil Kumar',
    department: 'MECH',
    designation: 'Professor',
    email: 'senthil.m@institution.edu',
    phone: '+91 98409 01234',
    maxDuties: 4,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
  {
    id: 'fac-10',
    staffId: 'STF-MECH-02',
    name: 'Prof. Rajesh Khanna',
    department: 'MECH',
    designation: 'Assistant Professor',
    email: 'rajesh.k@institution.edu',
    phone: '+91 98410 12345',
    maxDuties: 5,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
  {
    id: 'fac-11',
    staffId: 'STF-CIVIL-01',
    name: 'Dr. Sunita Deshpande',
    department: 'CIVIL',
    designation: 'Associate Professor',
    email: 'sunita.d@institution.edu',
    phone: '+91 98411 23456',
    maxDuties: 4,
    assignedDutiesCount: 0,
    isAvailable: true,
  },
  {
    id: 'fac-12',
    staffId: 'STF-EEE-01',
    name: 'Prof. Harish Raghavan',
    department: 'EEE',
    designation: 'Assistant Professor',
    email: 'harish.r@institution.edu',
    phone: '+91 98412 34567',
    maxDuties: 5,
    assignedDutiesCount: 1,
    isAvailable: true,
  },
];

export const INITIAL_DUTY_ALLOCATIONS: DutyAllocation[] = [
  {
    id: 'duty-101',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    roomId: 'room-101',
    roomNumber: 'LH-101',
    facultyId: 'fac-3',
    facultyName: 'Dr. Anand Chandrasekar',
    facultyDept: 'IT',
    role: 'Hall Invigilator',
    status: 'Confirmed',
    assignedAt: '2026-08-20 10:00 AM',
  },
  {
    id: 'duty-102',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    roomId: 'room-102',
    roomNumber: 'LH-102',
    facultyId: 'fac-6',
    facultyName: 'Prof. Preethi Venkatesh',
    facultyDept: 'ECE',
    role: 'Hall Invigilator',
    status: 'Alteration Requested',
    assignedAt: '2026-08-20 10:00 AM',
  },
  {
    id: 'duty-103',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    roomId: 'room-201',
    roomNumber: 'LH-201',
    facultyId: 'fac-8',
    facultyName: 'Prof. Deepa Nambiar',
    facultyDept: 'AI&DS',
    role: 'Hall Invigilator',
    status: 'Confirmed',
    assignedAt: '2026-08-20 10:00 AM',
  },
  {
    id: 'duty-104',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    roomId: 'room-202',
    roomNumber: 'LH-202',
    facultyId: 'fac-10',
    facultyName: 'Prof. Rajesh Khanna',
    facultyDept: 'MECH',
    role: 'Hall Invigilator',
    status: 'Confirmed',
    assignedAt: '2026-08-20 10:00 AM',
  },
  {
    id: 'duty-105',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    roomId: 'room-101',
    roomNumber: 'All Halls (Ground Flr)',
    facultyId: 'fac-1',
    facultyName: 'Dr. R. K. Ramanathan',
    facultyDept: 'CSE',
    role: 'Chief Superintendent',
    status: 'Confirmed',
    assignedAt: '2026-08-20 10:00 AM',
  },
  {
    id: 'duty-106',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    roomId: 'room-101',
    roomNumber: 'Standby Pool',
    facultyId: 'fac-12',
    facultyName: 'Prof. Harish Raghavan',
    facultyDept: 'EEE',
    role: 'Reliever / Standby',
    status: 'Confirmed',
    assignedAt: '2026-08-20 10:00 AM',
  },
];

export const INITIAL_ALTERATION_REQUESTS: DutyAlterationRequest[] = [
  {
    id: 'alt-req-001',
    dutyAllocationId: 'duty-102',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    roomNumber: 'LH-102',
    requestingFacultyId: 'fac-6',
    requestingFacultyName: 'Prof. Preethi Venkatesh',
    requestingFacultyDept: 'ECE',
    alterationType: 'Mutual Swap',
    replacementFacultyId: 'fac-11',
    replacementFacultyName: 'Dr. Sunita Deshpande',
    replacementFacultyDept: 'CIVIL',
    reason: 'Scheduled PhD Viva-Voce Committee meeting on 25-Aug Forenoon.',
    requestedAt: '2026-08-21 09:15 AM',
    deptApprovalStatus: 'Approved',
    deptApproverName: 'Dr. V. Karthikeyan (HOD - ECE)',
    deptApprovalRemarks: 'Verified committee notice. Mutual swap with Dr. Sunita Deshpande endorsed.',
    deptApprovedAt: '2026-08-21 11:30 AM',
    examCellApprovalStatus: 'Pending',
    finalStatus: 'Pending Exam Cell',
    isEmergency: false,
  },
  {
    id: 'alt-req-002',
    dutyAllocationId: 'duty-104',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    roomNumber: 'LH-202',
    requestingFacultyId: 'fac-10',
    requestingFacultyName: 'Prof. Rajesh Khanna',
    requestingFacultyDept: 'MECH',
    alterationType: 'Exemption & Replacement',
    reason: 'Sudden high fever and medical consultation required.',
    requestedAt: '2026-08-21 08:30 AM',
    deptApprovalStatus: 'Approved',
    deptApproverName: 'Dr. M. Senthil Kumar (HOD - MECH)',
    deptApprovalRemarks: 'Medical certificate attached. Recommended for standby reliever allocation.',
    deptApprovedAt: '2026-08-21 08:45 AM',
    examCellApprovalStatus: 'Approved',
    examCellApproverName: 'Dr. R. K. Ramanathan (Exam Cell Coordinator)',
    examCellApprovalRemarks: 'Assigned standby faculty Prof. Harish Raghavan as substitute.',
    examCellApprovedAt: '2026-08-21 09:00 AM',
    finalStatus: 'Approved',
    isEmergency: true,
  },
];

export const INITIAL_NOTIFICATIONS: NotificationLog[] = [
  {
    id: 'notif-1',
    title: 'Emergency Alteration Approved',
    message: 'Prof. Rajesh Khanna replaced by Prof. Harish Raghavan for LH-202 (25-Aug FN). Roster updated in real-time.',
    timestamp: '2026-08-21 09:00 AM',
    type: 'success',
    read: false,
  },
  {
    id: 'notif-2',
    title: 'New Alteration Awaiting Exam Cell Sign-off',
    message: 'Prof. Preethi Venkatesh (LH-102) requested swap with Dr. Sunita Deshpande. Approved by ECE HOD.',
    timestamp: '2026-08-21 11:30 AM',
    type: 'warning',
    read: false,
  },
];

export const INITIAL_DUTY_WORKFLOWS: ExamDutyWorkflow[] = [
  {
    id: 'wf-exam-1',
    examScheduleId: 'exam-1',
    date: '2026-08-25',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    noOfHalls: 3,
    hallSuperintendentCount: 3,
    bufferCount: 1,
    totalRequired: 4,
    deptQuotas: {
      CSE: {
        department: 'CSE',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-1'],
        hodStatus: 'Nominated',
        hodRemarks: 'Dr. R. K. Ramanathan nominated as requested.',
        nominatedAt: '2026-08-21 10:00 AM',
      },
      IT: {
        department: 'IT',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-3'],
        hodStatus: 'Nominated',
        hodRemarks: 'Dr. Anand Chandrasekar nominated for Hall duty.',
        nominatedAt: '2026-08-21 10:15 AM',
      },
      ECE: {
        department: 'ECE',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-6'],
        hodStatus: 'Nominated',
        hodRemarks: 'Prof. Preethi Venkatesh nominated.',
        nominatedAt: '2026-08-21 10:30 AM',
      },
      'AI&DS': {
        department: 'AI&DS',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-8'],
        hodStatus: 'Nominated',
        hodRemarks: 'Prof. Deepa Nambiar nominated.',
        nominatedAt: '2026-08-21 11:00 AM',
      },
    },
    status: 'Approved by Principal',
    coordinatorRemarks: 'All department nominations completed and mapped to LH-101, LH-102, LH-201 with 1 Standby buffer.',
    issuedAt: '2026-08-20 09:00 AM',
    submittedAt: '2026-08-21 02:00 PM',
    principalApproval: {
      isApproved: true,
      approvedBy: 'Dr. S. K. Narayanan, Ph.D. (Principal)',
      approvedAt: '2026-08-21 04:30 PM',
      remarks: 'Approved. Ensure hall superintendents report at Exam Cell by 08:45 AM.',
      signatureToken: 'PRIN-AUTH-20260825-FN-9812',
    },
  },
  {
    id: 'wf-exam-2',
    examScheduleId: 'exam-2',
    date: '2026-08-25',
    session: 'AN',
    timeSlot: '01:30 PM - 04:30 PM',
    noOfHalls: 2,
    hallSuperintendentCount: 2,
    bufferCount: 1,
    totalRequired: 3,
    deptQuotas: {
      CSE: {
        department: 'CSE',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-2'],
        hodStatus: 'Nominated',
        hodRemarks: 'Prof. S. Meenakshi nominated.',
        nominatedAt: '2026-08-21 03:00 PM',
      },
      IT: {
        department: 'IT',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-4'],
        hodStatus: 'Nominated',
        hodRemarks: 'Prof. Geetha Lakshmi nominated.',
        nominatedAt: '2026-08-21 03:15 PM',
      },
      ECE: {
        department: 'ECE',
        requiredCount: 1,
        nominatedFacultyIds: ['fac-5'],
        hodStatus: 'Nominated',
        hodRemarks: 'Dr. V. Karthikeyan nominated.',
        nominatedAt: '2026-08-21 03:30 PM',
      },
    },
    status: 'Nominations Complete',
    coordinatorRemarks: 'Awaiting final hall mapping before submission to Principal.',
    issuedAt: '2026-08-20 09:00 AM',
  },
  {
    id: 'wf-exam-3',
    examScheduleId: 'exam-3',
    date: '2026-08-26',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    noOfHalls: 3,
    hallSuperintendentCount: 3,
    bufferCount: 1,
    totalRequired: 4,
    deptQuotas: {
      'AI&DS': {
        department: 'AI&DS',
        requiredCount: 1,
        nominatedFacultyIds: [],
        hodStatus: 'Pending',
      },
      MECH: {
        department: 'MECH',
        requiredCount: 1,
        nominatedFacultyIds: [],
        hodStatus: 'Pending',
      },
      CIVIL: {
        department: 'CIVIL',
        requiredCount: 1,
        nominatedFacultyIds: [],
        hodStatus: 'Pending',
      },
      EEE: {
        department: 'EEE',
        requiredCount: 1,
        nominatedFacultyIds: [],
        hodStatus: 'Pending',
      },
    },
    status: 'Indent Sent to HODs',
    coordinatorRemarks: 'Requisition indents issued to AI&DS, MECH, CIVIL, EEE HODs. Awaiting nominations.',
    issuedAt: '2026-08-21 09:30 AM',
  },
  {
    id: 'wf-exam-4',
    examScheduleId: 'exam-4',
    date: '2026-08-27',
    session: 'FN',
    timeSlot: '09:30 AM - 12:30 PM',
    noOfHalls: 2,
    hallSuperintendentCount: 2,
    bufferCount: 1,
    totalRequired: 3,
    deptQuotas: {
      CSE: {
        department: 'CSE',
        requiredCount: 2,
        nominatedFacultyIds: [],
        hodStatus: 'Pending',
      },
      ECE: {
        department: 'ECE',
        requiredCount: 1,
        nominatedFacultyIds: [],
        hodStatus: 'Pending',
      },
    },
    status: 'Draft',
    coordinatorRemarks: 'Exam cell quota drafted. Ready to send requisition to HODs.',
  },
];
