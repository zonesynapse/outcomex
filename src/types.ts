export interface PartConfig {
  name: string;
  marksPerQuestion: number;
  numberOfQuestions: number;
  hasInternalChoice: boolean;
}

export interface CIAConfig {
  id?: string;
  program: string;
  department: string;
  batch: string;
  academicYear: string;
  semester: string;
  examName: string;
  totalMarks: number;
  createdAt: string;
}

export interface QuestionPaper {
  id?: string;
  configId: string;
  program: string;
  department: string;
  batch: string;
  academicYear: string;
  semester: string;
  examName: string;
  parts: {
    name: string;
    marks: number;
  }[];
  totalMarks: number;
  createdAt: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  block: string;
  floor: string;
  rows: number;
  columns: number;
  columnRows?: number[];
  studentsPerDesk: number;
  columnStudentsPerDesk?: number[];
  totalCapacity: number;
  type: 'Classroom' | 'Lab' | 'Auditorium' | 'Seminar Hall' | 'Drawing Hall' | string;
  status: 'Active' | 'Maintenance' | 'Inactive' | 'Reserved' | string;
  disabledDesks?: string[];
}

export type Department = 'CSE' | 'IT' | 'AI&DS' | 'ECE' | 'MECH' | 'CIVIL' | 'EEE' | 'BME' | 'MBA';

export interface DeskPosition {
  row: number;
  col: number;
  deskNumber: string;
  isEnabled: boolean;
  maxStudents: number;
}

export interface Student {
  id: string;
  registerNumber: string;
  name: string;
  department: Department;
  programme?: string;
  year: number;
  semester: number;
  section: string;
  subjectCode: string;
  subjectName: string;
  academicYear?: string;
  batch?: string;
  examDate: string;
  session: 'FN' | 'AN';
}

export interface AllocatedSeat {
  seatId: string;
  roomId: string;
  roomNumber: string;
  deskNumber: string;
  row: number;
  col: number;
  slotPosition: string;
  student: Student;
  status: 'Allocated' | 'Reserved' | 'Blocked';
  serialNumber?: number;
  hasConflict?: boolean;
}

export interface SubjectStrength {
  department: Department;
  programme?: string;
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
  name: string;
  date: string;
  session: 'FN' | 'AN';
  timeSlot: string;
  departments: Department[];
  semester: number;
  semesterDisplay?: string;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  selectedHallIds?: string[];
  items?: Array<{
    code: string;
    name: string;
    department: Department;
    programme: string;
    semester: number;
    batch: string;
    examDate: string;
    session: 'FN' | 'AN';
  }>;
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
  hallSuperintendentCount: number;
  bufferCount: number;
  totalRequired: number;
  deptQuotas: { [dept in Department]?: DeptDutyQuota };
  status: DutyWorkflowStatus;
  coordinatorRemarks?: string;
  issuedAt?: string;
  deadlineDate?: string;
  deadlineTime?: string;
  submittedAt?: string;
  principalApproval?: PrincipalApproval;
}

export interface Faculty {
  id: string;
  staffId: string;
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
  deptApprovalStatus: 'Pending' | 'Approved' | 'Rejected';
  deptApproverName?: string;
  deptApprovalRemarks?: string;
  deptApprovedAt?: string;
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
