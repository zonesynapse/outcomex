export type Department = 'CSE' | 'IT' | 'AI&DS' | 'ECE' | 'MECH' | 'CIVIL' | 'EEE';

export interface DeskPosition {
  row: number; // 1-based
  col: number; // 1-based
  deskNumber: string; // e.g., "R1-C1" or "D-01"
  isEnabled: boolean; // can disable broken/aisle desks
  maxStudents: number; // user entry capacity
}

export interface Room {
  id: string;
  roomNumber: string;
  block: string;
  floor: string;
  rows: number; // maximum or default rows
  columns: number; // number of columns
  columnRows?: number[]; // Column-wise row counts (e.g., [5, 6, 5] for 3 columns)
  studentsPerDesk: number; // User entry capacity / default capacity (e.g., 1, 2, 3, 4...)
  columnStudentsPerDesk?: number[]; // Column-wise students per desk (e.g., [3, 2, 3] for 3 columns)
  totalCapacity: number;
  type: 'Classroom' | 'Drawing Hall' | 'Seminar Hall' | 'Lab';
  status: 'Active' | 'Maintenance' | 'Reserved';
  disabledDesks?: string[]; // array of deskNumber, e.g. ["R2-C3"]
}

export interface Student {
  id: string;
  registerNumber: string; // e.g. "71762104001"
  name: string;
  department: Department;
  year: number; // 1, 2, 3, 4
  semester: number;
  section: string; // 'A' | 'B'
  subjectCode: string; // e.g. "CS8591"
  subjectName: string; // e.g. "Computer Networks"
  examDate: string;
  session: 'FN' | 'AN';
}

export interface AllocatedSeat {
  seatId: string;
  roomId: string;
  roomNumber: string;
  deskNumber: string; // e.g., "R1-C2"
  row: number;
  col: number;
  slotPosition: 'A' | 'B' | 'Single' | string; // Left (A), Right (B), Single, or letter slot
  student: Student;
  status: 'Allocated' | 'Present' | 'Absent' | 'Malpractice';
  bookletNumber?: string;
}

export interface SubjectStrength {
  department: Department;
  subjectCode: string;
  subjectName: string;
  semester: number;
  year: number;
  studentCount: number;
  regNoPrefix?: string;
  regNoRange?: string;
}

export interface ExamSchedule {
  id: string;
  name: string; // e.g., "Continuous Internal Assessment I (CIA-I) 2026"
  date: string; // YYYY-MM-DD
  session: 'FN' | 'AN';
  timeSlot: string; // e.g., "09:30 AM - 12:30 PM"
  departments: Department[];
  semester: number;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  selectedHallIds?: string[]; // user-allocated hall IDs for this session
}

export interface DeptDutyQuota {
  department: Department;
  requiredCount: number;
  nominatedFacultyIds: string[];
  hodStatus: 'Pending' | 'Nominated';
  hodRemarks?: string;
  nominatedAt?: string;
}

export type DutyWorkflowStatus = 
  | 'Draft' 
  | 'Indent Sent to HODs' 
  | 'Nominations In Progress' 
  | 'Nominations Complete' 
  | 'Hall Mapped' 
  | 'Submitted to Principal' 
  | 'Approved by Principal' 
  | 'Revision Requested';

export interface PrincipalApproval {
  isApproved: boolean;
  approvedBy: string;
  approvedAt: string;
  remarks: string;
  signatureToken: string;
}

export interface ExamDutyWorkflow {
  id: string;
  examScheduleId: string;
  date: string;
  session: 'FN' | 'AN';
  timeSlot: string;
  noOfHalls: number;
  hallSuperintendentCount: number; // equals noOfHalls
  bufferCount: number; // default 1
  totalRequired: number; // hallSuperintendentCount + bufferCount
  deptQuotas: { [dept in Department]?: DeptDutyQuota };
  status: DutyWorkflowStatus;
  coordinatorRemarks?: string;
  issuedAt?: string;
  submittedAt?: string;
  principalApproval?: PrincipalApproval;
}

export interface Faculty {
  id: string;
  staffId: string; // e.g. "FAC-101"
  name: string;
  department: Department;
  designation: 'Professor' | 'Associate Professor' | 'Assistant Professor';
  email: string;
  phone: string;
  maxDuties: number;
  assignedDutiesCount: number;
  isAvailable: boolean;
}

export interface DutyAllocation {
  id: string;
  examScheduleId: string;
  date: string;
  session: 'FN' | 'AN';
  timeSlot: string;
  roomId: string;
  roomNumber: string;
  facultyId: string;
  facultyName: string;
  facultyDept: Department;
  role: 'Chief Superintendent' | 'Hall Invigilator' | 'Reliever / Standby' | 'Squad Member';
  status: 'Confirmed' | 'Alteration Requested' | 'Substituted' | 'Reported' | 'Absent';
  assignedAt: string;
}

export type AlterationType = 'Mutual Swap' | 'Exemption & Replacement' | 'Emergency Substitute';
export type ApprovalStatus = 'Pending Dept HOD' | 'Pending Exam Cell' | 'Approved' | 'Rejected';

export interface DutyAlterationRequest {
  id: string;
  dutyAllocationId: string;
  examScheduleId: string;
  date: string;
  session: 'FN' | 'AN';
  roomNumber: string;
  
  requestingFacultyId: string;
  requestingFacultyName: string;
  requestingFacultyDept: Department;
  
  alterationType: AlterationType;
  replacementFacultyId?: string;
  replacementFacultyName?: string;
  replacementFacultyDept?: Department;
  
  reason: string;
  requestedAt: string;
  
  // Step 1: Department Approval
  deptApprovalStatus: 'Pending' | 'Approved' | 'Rejected';
  deptApproverName?: string;
  deptApprovalRemarks?: string;
  deptApprovedAt?: string;
  
  // Step 2: Exam Cell Central Approval
  examCellApprovalStatus: 'Pending' | 'Approved' | 'Rejected';
  examCellApproverName?: string;
  examCellApprovalRemarks?: string;
  examCellApprovedAt?: string;
  
  finalStatus: ApprovalStatus;
  isEmergency: boolean;
}

export interface NotificationLog {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'emergency';
  read: boolean;
}
