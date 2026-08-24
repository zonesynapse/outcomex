import React, { useState, useMemo } from 'react';
import { 
  UserCheck, 
  Sparkles, 
  Plus, 
  Calendar, 
  Clock, 
  Building2, 
  ShieldCheck, 
  Download, 
  Users, 
  Phone, 
  CheckCircle2, 
  ArrowRightLeft,
  X,
  Send,
  Award,
  Printer,
  ChevronRight,
  Sliders,
  Building,
  Check,
  Zap,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { 
  Faculty, 
  DutyAllocation, 
  ExamSchedule, 
  Room, 
  Department, 
  ExamDutyWorkflow, 
  DeptDutyQuota,
  DutyWorkflowStatus,
  AllocatedSeat,
  NotificationLog
} from '../types';
import { downloadCSV } from '../utils/allocationEngine';

const ALL_DEPARTMENTS: Department[] = ['CSE', 'IT', 'AI&DS', 'ECE', 'MECH', 'CIVIL', 'EEE'];

interface FacultyDutyViewProps {
  facultyList: Faculty[];
  onUpdateFacultyList: (list: Faculty[]) => void;
  dutyAllocations: DutyAllocation[];
  onUpdateDutyAllocations: (duties: DutyAllocation[]) => void;
  dutyWorkflows: ExamDutyWorkflow[];
  onUpdateDutyWorkflows: (workflows: ExamDutyWorkflow[]) => void;
  selectedExam: ExamSchedule;
  onSelectExamId?: (id: string) => void;
  exams: ExamSchedule[];
  rooms: Room[];
  allocatedSeats: AllocatedSeat[];
  onNavigateToAlteration: (dutyId?: string) => void;
  onAddNotification?: (notif: Omit<NotificationLog, 'id' | 'timestamp'>) => void;
}

export const FacultyDutyView: React.FC<FacultyDutyViewProps> = ({
  facultyList,
  onUpdateFacultyList,
  dutyAllocations,
  onUpdateDutyAllocations,
  dutyWorkflows,
  onUpdateDutyWorkflows,
  selectedExam,
  onSelectExamId,
  exams,
  rooms,
  allocatedSeats,
  onNavigateToAlteration,
  onAddNotification,
}) => {
  // Main workflow tab
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<'coordinator' | 'hod-portal' | 'principal-approval' | 'roster-grid'>('coordinator');

  // Selected HOD Department in HOD Portal mode
  const [selectedHodDept, setSelectedHodDept] = useState<Department>('CSE');

  // Modals
  const [isAddDutyModalOpen, setIsAddDutyModalOpen] = useState<boolean>(false);
  const [isFacultyMasterModalOpen, setIsFacultyMasterModalOpen] = useState<boolean>(false);
  const [isPrincipalModalOpen, setIsPrincipalModalOpen] = useState<boolean>(false);
  const [principalRemarksInput, setPrincipalRemarksInput] = useState<string>('Approved. Ensure all Hall Superintendents and Standby Relievers report to the Central Exam Control Room 30 minutes prior to exam commencement.');
  const [principalNameInput, setPrincipalNameInput] = useState<string>('Dr. S. K. Narayanan, Ph.D.');

  // Filters for Roster Table
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterDept, setFilterDept] = useState<string>('all');

  // Manual duty form
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(facultyList[0]?.id || '');
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || '');
  const [selectedRole, setSelectedRole] = useState<DutyAllocation['role']>('Hall Invigilator');

  const activeRooms = useMemo(() => rooms.filter((r) => r.status === 'Active'), [rooms]);

  // Calculate Date-wise & Session-wise Exam Hall counts and requirements for ALL exams
  const dateWiseHallRequirements = useMemo(() => {
    return exams.map((exam) => {
      // Count distinct rooms used in allocated seats or selectedHallIds
      const seatsForExam = allocatedSeats.filter(
        (s) => s.student.examDate === exam.date && s.student.session === exam.session
      );
      const usedRoomIdsFromSeats = Array.from(new Set(seatsForExam.map((s) => s.roomId)));
      
      let hallCount = usedRoomIdsFromSeats.length;
      if (hallCount === 0) {
        hallCount = exam.selectedHallIds?.length || 2; // fallback
      }

      const hallSuperintendentRequirement = hallCount;
      const bufferRequirement = 1; // 1 buffer superintendent
      const totalRequired = hallSuperintendentRequirement + bufferRequirement;

      // Find or build existing workflow
      let wf = dutyWorkflows.find((w) => w.examScheduleId === exam.id);
      if (!wf) {
        // Create initial default workflow object
        const initialQuotas: { [dept in Department]?: DeptDutyQuota } = {};
        const deptsToUse = exam.departments.length > 0 ? exam.departments : ALL_DEPARTMENTS;
        
        deptsToUse.forEach((dept, idx) => {
          const share = Math.floor(totalRequired / deptsToUse.length) + (idx < totalRequired % deptsToUse.length ? 1 : 0);
          initialQuotas[dept] = {
            department: dept,
            requiredCount: share,
            nominatedFacultyIds: [],
            hodStatus: 'Pending',
          };
        });

        wf = {
          id: `wf-${exam.id}`,
          examScheduleId: exam.id,
          date: exam.date,
          session: exam.session,
          timeSlot: exam.timeSlot,
          noOfHalls: hallCount,
          hallSuperintendentCount: hallCount,
          bufferCount: bufferRequirement,
          totalRequired: totalRequired,
          deptQuotas: initialQuotas,
          status: 'Draft',
          coordinatorRemarks: `Exam Cell Indent: ${hallCount} Hall Superintendents + ${bufferRequirement} Buffer required.`,
        };
      }

      return {
        exam,
        hallCount,
        hallSuperintendentRequirement,
        bufferRequirement,
        totalRequired,
        workflow: wf,
      };
    });
  }, [exams, allocatedSeats, dutyWorkflows]);

  // Current active exam requirement info
  const currentRequirement = useMemo(() => {
    return (
      dateWiseHallRequirements.find((r) => r.exam.id === selectedExam.id) ||
      dateWiseHallRequirements[0]
    );
  }, [dateWiseHallRequirements, selectedExam.id]);

  // Current workflow for selected exam
  const currentWorkflow = useMemo<ExamDutyWorkflow>(() => {
    return currentRequirement.workflow;
  }, [currentRequirement]);

  // Helper to update workflow for ANY exam schedule
  const updateWorkflowForExam = (examId: string, updated: Partial<ExamDutyWorkflow>) => {
    const req = dateWiseHallRequirements.find((r) => r.exam.id === examId);
    const existingWf = req?.workflow || currentWorkflow;

    const newWorkflow: ExamDutyWorkflow = {
      ...existingWf,
      ...updated,
    };

    const exists = dutyWorkflows.some((w) => w.examScheduleId === examId);
    const updatedList = exists
      ? dutyWorkflows.map((w) => (w.examScheduleId === examId ? newWorkflow : w))
      : [...dutyWorkflows, newWorkflow];

    onUpdateDutyWorkflows(updatedList);
    return newWorkflow;
  };

  // Helper to adjust department quota for ANY exam date in the matrix table
  const handleSetExamDeptQuota = (examId: string, dept: Department, value: number) => {
    const req = dateWiseHallRequirements.find((r) => r.exam.id === examId);
    if (!req) return;

    const wf = req.workflow;
    const newCount = Math.max(0, Math.floor(value || 0));

    const updatedQuotas = {
      ...wf.deptQuotas,
      [dept]: {
        department: dept,
        requiredCount: newCount,
        nominatedFacultyIds: wf.deptQuotas[dept]?.nominatedFacultyIds || [],
        hodStatus: ((wf.deptQuotas[dept]?.nominatedFacultyIds.length || 0) >= newCount && newCount > 0 ? 'Nominated' : 'Pending') as any,
        hodRemarks: wf.deptQuotas[dept]?.hodRemarks,
      },
    };

    updateWorkflowForExam(examId, { deptQuotas: updatedQuotas });
  };

  const handleAdjustExamDeptQuota = (examId: string, dept: Department, delta: number) => {
    const req = dateWiseHallRequirements.find((r) => r.exam.id === examId);
    if (!req) return;

    const wf = req.workflow;
    const currentQuota = wf.deptQuotas[dept]?.requiredCount || 0;
    const newCount = Math.max(0, currentQuota + delta);
    handleSetExamDeptQuota(examId, dept, newCount);
  };

  // Automated Quota Division Handler for a specific exam
  const handleAutoDistributeExamQuota = (examId: string) => {
    const req = dateWiseHallRequirements.find((r) => r.exam.id === examId);
    if (!req) return;

    const totalNeeded = req.totalRequired;
    const depts = req.exam.departments.length > 0 ? req.exam.departments : ALL_DEPARTMENTS;

    const newQuotas: { [dept in Department]?: DeptDutyQuota } = {};
    
    // Distribute quota across departments
    depts.forEach((d, idx) => {
      const quota = Math.floor(totalNeeded / depts.length) + (idx < totalNeeded % depts.length ? 1 : 0);
      newQuotas[d] = {
        department: d,
        requiredCount: quota,
        nominatedFacultyIds: req.workflow.deptQuotas[d]?.nominatedFacultyIds || [],
        hodStatus: req.workflow.deptQuotas[d]?.hodStatus || 'Pending',
        hodRemarks: req.workflow.deptQuotas[d]?.hodRemarks,
      };
    });

    updateWorkflowForExam(examId, {
      deptQuotas: newQuotas,
      coordinatorRemarks: `Auto-distributed ${totalNeeded} superintendents (${req.hallCount} halls + ${req.bufferRequirement} buffer) across ${depts.length} departments.`,
    });
  };

  // Auto-distribute quotas for ALL exams in one click
  const handleAutoDistributeAllExams = () => {
    const updatedWorkflows: ExamDutyWorkflow[] = dateWiseHallRequirements.map((req) => {
      const totalNeeded = req.totalRequired;
      const depts = req.exam.departments.length > 0 ? req.exam.departments : ALL_DEPARTMENTS;
      const newQuotas: { [dept in Department]?: DeptDutyQuota } = {};

      depts.forEach((d, idx) => {
        const quota = Math.floor(totalNeeded / depts.length) + (idx < totalNeeded % depts.length ? 1 : 0);
        newQuotas[d] = {
          department: d,
          requiredCount: quota,
          nominatedFacultyIds: req.workflow.deptQuotas[d]?.nominatedFacultyIds || [],
          hodStatus: req.workflow.deptQuotas[d]?.hodStatus || 'Pending',
          hodRemarks: req.workflow.deptQuotas[d]?.hodRemarks,
        };
      });

      return {
        ...req.workflow,
        deptQuotas: newQuotas,
        coordinatorRemarks: `Auto-balanced ${totalNeeded} superintendents across departments.`,
      };
    });

    onUpdateDutyWorkflows(updatedWorkflows);
    alert('✅ Auto-balanced Superintendent quotas across all exam dates and departments.');
  };

  // Issue Indent for a specific exam
  const handleSendExamIndentToHods = (examId: string) => {
    const req = dateWiseHallRequirements.find((r) => r.exam.id === examId);
    if (!req) return;

    const quotas = Object.values(req.workflow.deptQuotas || {}) as (DeptDutyQuota | undefined)[];
    const totalAllocated = quotas.reduce((sum, q) => sum + (q?.requiredCount || 0), 0);

    if (totalAllocated !== req.totalRequired) {
      alert(`For ${req.exam.date} (${req.exam.session}), the sum of department quotas (${totalAllocated}) must equal the total required superintendents (${req.totalRequired} = ${req.hallCount} Halls + ${req.bufferRequirement} Buffer). Please adjust before sending.`);
      return;
    }

    const timestamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    updateWorkflowForExam(examId, {
      status: 'Indent Sent to HODs',
      issuedAt: timestamp,
    });

    if (onAddNotification) {
      onAddNotification({
        title: 'Duty Indent Sent to HODs',
        message: `Exam Cell issued duty indent of ${req.totalRequired} superintendents for ${req.exam.name} (${req.exam.date} ${req.exam.session}).`,
        type: 'info',
        read: false,
      });
    }

    alert(`✅ Duty Indent for ${req.exam.date} (${req.exam.session}) successfully dispatched to respective Department HODs.`);
  };

  // Issue Indent for ALL exams
  const handleSendAllIndentsToHods = () => {
    let unallocatedCount = 0;
    dateWiseHallRequirements.forEach((req) => {
      const quotas = Object.values(req.workflow.deptQuotas || {}) as (DeptDutyQuota | undefined)[];
      const sum = quotas.reduce((s, q) => s + (q?.requiredCount || 0), 0);
      if (sum !== req.totalRequired) {
        unallocatedCount++;
      }
    });

    if (unallocatedCount > 0) {
      if (!confirm(`Warning: ${unallocatedCount} exam session(s) do not have exact balanced quotas yet. Do you want to auto-balance them first and issue indents to all HODs?`)) {
        return;
      }
    }

    const timestamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const updatedWorkflows = dateWiseHallRequirements.map((req) => {
      const totalNeeded = req.totalRequired;
      const depts = req.exam.departments.length > 0 ? req.exam.departments : ALL_DEPARTMENTS;
      const newQuotas = { ...req.workflow.deptQuotas };

      // Ensure balanced
      const quotas = Object.values(newQuotas) as (DeptDutyQuota | undefined)[];
      const currentSum = quotas.reduce((s, q) => s + (q?.requiredCount || 0), 0);
      if (currentSum !== totalNeeded) {
        depts.forEach((d, idx) => {
          const quota = Math.floor(totalNeeded / depts.length) + (idx < totalNeeded % depts.length ? 1 : 0);
          newQuotas[d] = {
            department: d,
            requiredCount: quota,
            nominatedFacultyIds: newQuotas[d]?.nominatedFacultyIds || [],
            hodStatus: newQuotas[d]?.hodStatus || 'Pending',
          };
        });
      }

      return {
        ...req.workflow,
        deptQuotas: newQuotas,
        status: 'Indent Sent to HODs' as const,
        issuedAt: timestamp,
      };
    });

    onUpdateDutyWorkflows(updatedWorkflows);

    if (onAddNotification) {
      onAddNotification({
        title: 'Master Duty Indent Issued to All HODs',
        message: `Exam Cell has dispatched invigilation requisitions across all ${dateWiseHallRequirements.length} examination dates.`,
        type: 'info',
        read: false,
      });
    }

    alert(`✅ Master Indent successfully dispatched to HODs of all departments for all ${dateWiseHallRequirements.length} exam dates!`);
  };

  // Quota Sum calculations for selected exam
  const totalAllocatedQuota = useMemo(() => {
    const quotas = Object.values(currentWorkflow.deptQuotas || {}) as (DeptDutyQuota | undefined)[];
    return quotas.reduce((sum, q) => sum + (q?.requiredCount || 0), 0);
  }, [currentWorkflow.deptQuotas]);

  const totalNominatedFacultyCount = useMemo(() => {
    const quotas = Object.values(currentWorkflow.deptQuotas || {}) as (DeptDutyQuota | undefined)[];
    return quotas.reduce((sum, q) => sum + (q?.nominatedFacultyIds.length || 0), 0);
  }, [currentWorkflow.deptQuotas]);

  // Overall statistics across all dates
  const aggregateStats = useMemo(() => {
    let totalHalls = 0;
    let totalSuperintendentsReq = 0;
    let totalBufferReq = 0;
    const deptTotalQuotas: { [dept in Department]?: number } = {};
    const deptTotalNominated: { [dept in Department]?: number } = {};

    ALL_DEPARTMENTS.forEach((d) => {
      deptTotalQuotas[d] = 0;
      deptTotalNominated[d] = 0;
    });

    dateWiseHallRequirements.forEach((item) => {
      totalHalls += item.hallCount;
      totalSuperintendentsReq += item.hallSuperintendentRequirement;
      totalBufferReq += item.bufferRequirement;

      ALL_DEPARTMENTS.forEach((d) => {
        const q = item.workflow.deptQuotas[d];
        if (q) {
          deptTotalQuotas[d] = (deptTotalQuotas[d] || 0) + (q.requiredCount || 0);
          deptTotalNominated[d] = (deptTotalNominated[d] || 0) + (q.nominatedFacultyIds?.length || 0);
        }
      });
    });

    return {
      totalHalls,
      totalSuperintendentsReq,
      totalBufferReq,
      totalRequired: totalSuperintendentsReq + totalBufferReq,
      deptTotalQuotas,
      deptTotalNominated,
    };
  }, [dateWiseHallRequirements]);

  // HOD Faculty Nomination Handlers
  const currentDeptQuota = currentWorkflow.deptQuotas[selectedHodDept] || {
    department: selectedHodDept,
    requiredCount: 0,
    nominatedFacultyIds: [],
    hodStatus: 'Pending',
  };

  const deptFacultyMembers = useMemo(() => {
    return facultyList.filter((f) => f.department === selectedHodDept);
  }, [facultyList, selectedHodDept]);

  const handleToggleNominateFaculty = (facultyId: string) => {
    const currentNominated = currentDeptQuota.nominatedFacultyIds;
    let newNominated: string[];

    if (currentNominated.includes(facultyId)) {
      newNominated = currentNominated.filter((id) => id !== facultyId);
    } else {
      if (currentNominated.length >= currentDeptQuota.requiredCount && currentDeptQuota.requiredCount > 0) {
        alert(`Department quota of ${currentDeptQuota.requiredCount} faculties already reached for ${selectedHodDept}. Remove a nominated faculty before adding another.`);
        return;
      }
      newNominated = [...currentNominated, facultyId];
    }

    const isComplete = newNominated.length >= currentDeptQuota.requiredCount && currentDeptQuota.requiredCount > 0;

    const updatedQuotas = {
      ...currentWorkflow.deptQuotas,
      [selectedHodDept]: {
        ...currentDeptQuota,
        nominatedFacultyIds: newNominated,
        hodStatus: isComplete ? 'Nominated' : 'Pending',
        nominatedAt: isComplete ? new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : undefined,
      },
    };

    const allDone = (Object.entries(updatedQuotas) as [string, DeptDutyQuota | undefined][]).every(
      ([_, q]) => (q?.requiredCount || 0) === 0 || (q?.nominatedFacultyIds.length || 0) >= (q?.requiredCount || 0)
    );

    updateWorkflowForExam(selectedExam.id, {
      deptQuotas: updatedQuotas,
      status: allDone ? 'Nominations Complete' : 'Nominations In Progress',
    });
  };

  // HOD Submit Nominations
  const [hodRemarksInput, setHodRemarksInput] = useState<string>('');
  const handleSubmitHodNomination = () => {
    if (currentDeptQuota.nominatedFacultyIds.length < currentDeptQuota.requiredCount) {
      alert(`Please nominate all ${currentDeptQuota.requiredCount} required faculties before submitting (currently ${currentDeptQuota.nominatedFacultyIds.length}/${currentDeptQuota.requiredCount} nominated).`);
      return;
    }

    const timestamp = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const updatedQuotas = {
      ...currentWorkflow.deptQuotas,
      [selectedHodDept]: {
        ...currentDeptQuota,
        hodStatus: 'Nominated' as const,
        hodRemarks: hodRemarksInput || `Nominated ${currentDeptQuota.nominatedFacultyIds.length} faculties by HOD ${selectedHodDept}.`,
        nominatedAt: timestamp,
      },
    };

    const allDone = (Object.entries(updatedQuotas) as [string, DeptDutyQuota | undefined][]).every(
      ([_, q]) => (q?.requiredCount || 0) === 0 || (q?.nominatedFacultyIds.length || 0) >= (q?.requiredCount || 0)
    );

    updateWorkflowForExam(selectedExam.id, {
      deptQuotas: updatedQuotas,
      status: allDone ? 'Nominations Complete' : 'Nominations In Progress',
    });

    if (onAddNotification) {
      onAddNotification({
        title: `HOD ${selectedHodDept} Submitted Duty Nominations`,
        message: `${selectedHodDept} Department nominated ${currentDeptQuota.nominatedFacultyIds.length} faculty members for ${selectedExam.name} (${selectedExam.date} ${selectedExam.session}).`,
        type: 'success',
        read: false,
      });
    }

    alert(`✅ Faculty nominations from HOD ${selectedHodDept} successfully endorsed and submitted to Exam Cell.`);
  };

  // Compile and Map Nominated Faculty to Exam Halls & Buffer
  const handleCompileAndMapHalls = () => {
    const allNominatedIds: string[] = [];
    (Object.values(currentWorkflow.deptQuotas) as (DeptDutyQuota | undefined)[]).forEach((q) => {
      if (q?.nominatedFacultyIds) {
        allNominatedIds.push(...q.nominatedFacultyIds);
      }
    });

    if (allNominatedIds.length === 0) {
      alert('No nominated faculties found. Please have HODs nominate faculties or assign quotas first.');
      return;
    }

    const nominatedFacultyObjects = allNominatedIds
      .map((id) => facultyList.find((f) => f.id === id))
      .filter((f): f is Faculty => f !== undefined);

    const seatsForExam = allocatedSeats.filter(
      (s) => s.student.examDate === selectedExam.date && s.student.session === selectedExam.session
    );
    const roomIdsFromSeats = Array.from(new Set(seatsForExam.map((s) => s.roomId)));
    const targetRooms = roomIdsFromSeats.length > 0
      ? rooms.filter((r) => roomIdsFromSeats.includes(r.id))
      : activeRooms.slice(0, currentWorkflow.noOfHalls);

    const newDuties: DutyAllocation[] = [];
    let facIdx = 0;

    // 1. Chief Superintendent
    const chiefCandidate = nominatedFacultyObjects.find(
      (f) => f.designation === 'Professor' || f.designation === 'Associate Professor'
    ) || facultyList.find((f) => f.designation === 'Professor') || facultyList[0];

    if (chiefCandidate) {
      newDuties.push({
        id: `duty-${selectedExam.id}-cs`,
        examScheduleId: selectedExam.id,
        date: selectedExam.date,
        session: selectedExam.session,
        timeSlot: selectedExam.timeSlot,
        roomId: 'all',
        roomNumber: 'Central Exam Control Cell',
        facultyId: chiefCandidate.id,
        facultyName: chiefCandidate.name,
        facultyDept: chiefCandidate.department,
        role: 'Chief Superintendent',
        status: 'Confirmed',
        assignedAt: new Date().toLocaleString(),
      });
    }

    // 2. Hall Superintendents for each active hall
    targetRooms.forEach((room) => {
      const fac = nominatedFacultyObjects[facIdx % nominatedFacultyObjects.length];
      if (fac) {
        newDuties.push({
          id: `duty-${selectedExam.id}-${room.id}`,
          examScheduleId: selectedExam.id,
          date: selectedExam.date,
          session: selectedExam.session,
          timeSlot: selectedExam.timeSlot,
          roomId: room.id,
          roomNumber: room.roomNumber,
          facultyId: fac.id,
          facultyName: fac.name,
          facultyDept: fac.department,
          role: 'Hall Invigilator',
          status: 'Confirmed',
          assignedAt: new Date().toLocaleString(),
        });
        facIdx++;
      }
    });

    // 3. Buffer Superintendent (Standby / Reliever)
    const bufferFac = nominatedFacultyObjects[facIdx % nominatedFacultyObjects.length] || nominatedFacultyObjects[0];
    if (bufferFac) {
      newDuties.push({
        id: `duty-${selectedExam.id}-buffer-1`,
        examScheduleId: selectedExam.id,
        date: selectedExam.date,
        session: selectedExam.session,
        timeSlot: selectedExam.timeSlot,
        roomId: 'standby',
        roomNumber: 'Exam Cell Buffer / Standby',
        facultyId: bufferFac.id,
        facultyName: bufferFac.name,
        facultyDept: bufferFac.department,
        role: 'Reliever / Standby',
        status: 'Confirmed',
        assignedAt: new Date().toLocaleString(),
      });
    }

    // Merge duties
    const otherExamDuties = dutyAllocations.filter((d) => d.examScheduleId !== selectedExam.id);
    const combinedDuties = [...otherExamDuties, ...newDuties];
    onUpdateDutyAllocations(combinedDuties);

    // Update faculty duty counts
    const updatedFaculty = facultyList.map((fac) => {
      const count = combinedDuties.filter((d) => d.facultyId === fac.id).length;
      return {
        ...fac,
        assignedDutiesCount: count,
      };
    });
    onUpdateFacultyList(updatedFaculty);

    updateWorkflowForExam(selectedExam.id, {
      status: 'Hall Mapped',
      coordinatorRemarks: `Mapped ${targetRooms.length} Hall Superintendents and 1 Buffer Superintendent from HOD nominated list.`,
    });

    alert(`✅ Consolidated duty schedule generated: ${targetRooms.length} Hall Superintendents and 1 Buffer Standby assigned.`);
  };

  // Submit to Principal
  const handleSubmitToPrincipal = () => {
    const timestamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    updateWorkflowForExam(selectedExam.id, {
      status: 'Submitted to Principal',
      submittedAt: timestamp,
    });

    if (onAddNotification) {
      onAddNotification({
        title: 'Master Duty Roster Submitted to Principal',
        message: `Consolidated duty schedule for ${selectedExam.name} (${selectedExam.date} ${selectedExam.session}) has been forwarded for Principal sanction.`,
        type: 'info',
        read: false,
      });
    }

    alert('✅ Master Duty Roster successfully forwarded to Principal for formal executive approval.');
  };

  // Principal Approve Action
  const handlePrincipalApprove = () => {
    const timestamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const token = `PRIN-AUTH-${selectedExam.date.replace(/-/g, '')}-${selectedExam.session}-${Math.floor(1000 + Math.random() * 9000)}`;

    updateWorkflowForExam(selectedExam.id, {
      status: 'Approved by Principal',
      principalApproval: {
        isApproved: true,
        approvedBy: `${principalNameInput} (Principal)`,
        approvedAt: timestamp,
        remarks: principalRemarksInput,
        signatureToken: token,
      },
    });

    setIsPrincipalModalOpen(false);

    if (onAddNotification) {
      onAddNotification({
        title: 'Duty Roster Approved by Principal',
        message: `The Principal has officially approved and sanctioned the invigilation duty roster for ${selectedExam.name} (${selectedExam.date} ${selectedExam.session}).`,
        type: 'success',
        read: false,
      });
    }

    alert(`🎉 Invigilation Duty Roster officially APPROVED and signed by Principal.\nAuthorization Token: ${token}`);
  };

  // Current exam duties list
  const currentExamDuties = useMemo(() => {
    return dutyAllocations.filter((d) => d.examScheduleId === selectedExam.id);
  }, [dutyAllocations, selectedExam.id]);

  const filteredDuties = useMemo(() => {
    return currentExamDuties.filter((duty) => {
      const matchRole = filterRole === 'all' || duty.role === filterRole;
      const matchDept = filterDept === 'all' || duty.facultyDept === filterDept;
      return matchRole && matchDept;
    });
  }, [currentExamDuties, filterRole, filterDept]);

  // Export Consolidated Duty CSV
  const handleExportDutyCSV = () => {
    const headers = [
      'S.No',
      'Exam Name',
      'Date',
      'Session',
      'Time Slot',
      'Assigned Hall / Location',
      'Faculty Name',
      'Staff ID',
      'Department',
      'Designation',
      'Contact Phone',
      'Duty Role',
      'Approval Status',
    ];

    const rows = currentExamDuties.map((d, idx) => {
      const fac = facultyList.find((f) => f.id === d.facultyId);
      return [
        (idx + 1).toString(),
        selectedExam.name,
        d.date,
        d.session,
        d.timeSlot,
        d.roomNumber,
        d.facultyName,
        fac?.staffId || '',
        d.facultyDept,
        fac?.designation || '',
        fac?.phone || '',
        d.role,
        currentWorkflow.status,
      ];
    });

    downloadCSV(
      `Consolidated_Master_Duty_Roster_${selectedExam.date}_${selectedExam.session}.csv`,
      [headers, ...rows]
    );
  };

  const handlePrintDutyMemo = () => {
    window.print();
  };

  const handleAddManualDuty = (e: React.FormEvent) => {
    e.preventDefault();
    const fac = facultyList.find((f) => f.id === selectedFacultyId);
    const room = rooms.find((r) => r.id === selectedRoomId);
    if (!fac) return;

    const newDuty: DutyAllocation = {
      id: `duty-${Date.now()}`,
      examScheduleId: selectedExam.id,
      date: selectedExam.date,
      session: selectedExam.session,
      timeSlot: selectedExam.timeSlot,
      roomId: room?.id || 'standby',
      roomNumber: selectedRole === 'Reliever / Standby' ? 'Exam Cell Buffer / Standby' : (room?.roomNumber || 'Central Hall'),
      facultyId: fac.id,
      facultyName: fac.name,
      facultyDept: fac.department,
      role: selectedRole,
      status: 'Confirmed',
      assignedAt: new Date().toLocaleString(),
    };

    const updatedDuties = [...dutyAllocations, newDuty];
    onUpdateDutyAllocations(updatedDuties);

    const updatedFaculty = facultyList.map((f) =>
      f.id === fac.id ? { ...f, assignedDutiesCount: f.assignedDutiesCount + 1 } : f
    );
    onUpdateFacultyList(updatedFaculty);
    setIsAddDutyModalOpen(false);
  };

  const handleDeleteDuty = (dutyId: string, facultyId: string) => {
    if (confirm('Are you sure you want to remove this duty assignment?')) {
      const updatedDuties = dutyAllocations.filter((d) => d.id !== dutyId);
      onUpdateDutyAllocations(updatedDuties);

      const updatedFaculty = facultyList.map((f) =>
        f.id === facultyId ? { ...f, assignedDutiesCount: Math.max(0, f.assignedDutiesCount - 1) } : f
      );
      onUpdateFacultyList(updatedFaculty);
    }
  };

  const handleToggleFacultyAvailability = (facId: string) => {
    const updated = facultyList.map((f) => (f.id === facId ? { ...f, isAvailable: !f.isAvailable } : f));
    onUpdateFacultyList(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase">
              <UserCheck className="w-4 h-4" />
              <span>Exam Cell Faculty Duty Allocation Workflow</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">
              Faculty Duty Allocation & Approval System
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Date-wise No. of Halls (Superintendents + 1 Buffer) ➔ Dept Quota Matrix ➔ HOD Faculty Allocation ➔ Consolidated Report ➔ Principal Approval
            </p>
          </div>

          {/* Quick Actions & Pool Master */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="faculty-pool-master-btn"
              onClick={() => setIsFacultyMasterModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Faculty Pool ({facultyList.length})</span>
            </button>

            <button
              id="export-duty-csv-btn"
              onClick={handleExportDutyCSV}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              title="Export Master Duty Roster CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV Export</span>
            </button>

            <button
              id="print-duty-memo-btn"
              onClick={handlePrintDutyMemo}
              className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors"
              title="Print Official Master Duty Order"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Official Order</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PROMINENT DATE & SESSION SELECTION BAR (USER REQUESTED)                     */}
        {/* ========================================================================= */}
        <div className="pt-4 pb-1 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Select Active Examination Date & Session:</span>
            </div>

            <span className="text-[11px] text-slate-500">
              Active: <strong className="text-indigo-900 font-mono">{selectedExam.date} ({selectedExam.session})</strong> • {currentWorkflow.noOfHalls} Halls • {currentWorkflow.totalRequired} Total Invigilators
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {dateWiseHallRequirements.map((item) => {
              const isSelected = item.exam.id === selectedExam.id;
              const wf = item.workflow;
              const quotas = Object.values(wf?.deptQuotas || {}) as (DeptDutyQuota | undefined)[];
              const quotaSum = quotas.reduce((s, q) => s + (q?.requiredCount || 0), 0);
              const isBalanced = quotaSum === item.totalRequired;

              return (
                <button
                  key={item.exam.id}
                  id={`date-selector-btn-${item.exam.id}`}
                  onClick={() => onSelectExamId && onSelectExamId(item.exam.id)}
                  className={`px-3.5 py-2 rounded-xl text-left border transition-all whitespace-nowrap flex items-center space-x-2.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/30'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-black font-mono">
                      {item.exam.date} ({item.exam.session})
                    </span>
                    <span className={`text-[10px] ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {item.hallCount} Halls + 1 Buffer = {item.totalRequired} Req
                    </span>
                  </div>

                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : isBalanced
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {wf.status === 'Approved by Principal' ? '✓ Approved' : isBalanced ? `${quotaSum}/${item.totalRequired}` : '⚠️ Adjust'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4-Step Academic Workflow Navigation Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-4">
          {/* Tab 1: Exam Cell Indent & Quota */}
          <button
            id="tab-btn-coordinator"
            onClick={() => setActiveWorkflowTab('coordinator')}
            className={`p-3 rounded-xl text-left border transition-all ${
              activeWorkflowTab === 'coordinator'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-1 text-indigo-700">
              <span className="flex items-center space-x-1">
                <Sliders className="w-3.5 h-3.5" />
                <span>Step 1: Exam Cell</span>
              </span>
              <span className="text-[10px] font-mono bg-indigo-100 px-1.5 py-0.5 rounded">
                Matrix Mode
              </span>
            </div>
            <div className="font-bold text-xs">Date-wise Halls & Dept Columns</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Halls count + 1 Buffer divided across departments
            </p>
          </button>

          {/* Tab 2: HOD Faculty Allocation Portal */}
          <button
            id="tab-btn-hod-portal"
            onClick={() => setActiveWorkflowTab('hod-portal')}
            className={`p-3 rounded-xl text-left border transition-all ${
              activeWorkflowTab === 'hod-portal'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-1 text-emerald-700">
              <span className="flex items-center space-x-1">
                <Building className="w-3.5 h-3.5" />
                <span>Step 2: HOD Portal</span>
              </span>
              <span className="text-[10px] font-mono bg-emerald-100 px-1.5 py-0.5 rounded">
                {totalNominatedFacultyCount}/{currentWorkflow.totalRequired} Nominated
              </span>
            </div>
            <div className="font-bold text-xs">HOD Faculty Allocation</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Respective HOD allocates faculties for assigned duties
            </p>
          </button>

          {/* Tab 3: Consolidated Roster & Principal Approval */}
          <button
            id="tab-btn-principal-approval"
            onClick={() => setActiveWorkflowTab('principal-approval')}
            className={`p-3 rounded-xl text-left border transition-all ${
              activeWorkflowTab === 'principal-approval'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-1 text-purple-700">
              <span className="flex items-center space-x-1">
                <Award className="w-3.5 h-3.5" />
                <span>Step 3: Principal Desk</span>
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                currentWorkflow.principalApproval?.isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {currentWorkflow.principalApproval?.isApproved ? 'Approved' : 'Pending Sign-off'}
              </span>
            </div>
            <div className="font-bold text-xs">Consolidated Report & Approval</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Master institutional report & Principal sanction
            </p>
          </button>

          {/* Tab 4: Live Hall Deployment Grid */}
          <button
            id="tab-btn-roster-grid"
            onClick={() => setActiveWorkflowTab('roster-grid')}
            className={`p-3 rounded-xl text-left border transition-all ${
              activeWorkflowTab === 'roster-grid'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-700">
              <span className="flex items-center space-x-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>Roster Grid</span>
              </span>
              <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 rounded">
                {currentExamDuties.length} Deployed
              </span>
            </div>
            <div className="font-bold text-xs">Hall-wise Invigilator Table</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hall mapping & duty alteration overrides
            </p>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: EXAM CELL COORDINATOR - DATE-WISE HALLS & ALL DEPTS IN COLUMN      */}
      {/* ========================================================================= */}
      {activeWorkflowTab === 'coordinator' && (
        <div className="space-y-6">
          {/* Main Date-wise Department Quota Matrix Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Central Master Requisition Matrix</span>
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-0.5">
                  Date-wise Exam Hall Requirements & Department Quota Matrix
                </h2>
                <p className="text-xs text-slate-500">
                  Requirement per date = <strong className="text-slate-800">No. of Active Halls (Superintendents) + 1 Standby Buffer</strong>. Quotas can be adjusted directly in each department column below.
                </p>
              </div>

              {/* Master Bulk Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="auto-distribute-all-btn"
                  onClick={handleAutoDistributeAllExams}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors"
                  title="Auto-balance all exam dates proportionally"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Balance All Dates</span>
                </button>

                <button
                  id="send-all-indents-btn"
                  onClick={handleSendAllIndentsToHods}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  title="Issue duty indents for all exam sessions to HODs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Issue Indent for All Dates to HODs</span>
                </button>
              </div>
            </div>

            {/* UNIFIED DATE-WISE MATRIX TABLE (All Depts in Column as requested) */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200 tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">Active</th>
                    <th className="py-3 px-3 whitespace-nowrap">Exam Date & Session</th>
                    <th className="py-3 px-3 whitespace-nowrap">Exam Name</th>
                    <th className="py-3 px-2 text-center bg-indigo-50/70 text-indigo-950 font-black">
                      No. of Halls
                    </th>
                    <th className="py-3 px-2 text-center bg-emerald-50/70 text-emerald-950 font-black">
                      Req (+1 Buf)
                    </th>
                    
                    {/* ALL DEPARTMENTS IN COLUMN */}
                    {ALL_DEPARTMENTS.map((dept) => (
                      <th
                        key={dept}
                        className="py-3 px-2 text-center bg-slate-50 border-l border-slate-200/80 font-black text-slate-800 min-w-[85px]"
                      >
                        {dept}
                      </th>
                    ))}

                    <th className="py-3 px-3 text-center border-l border-slate-200 font-black bg-purple-50/50 text-purple-950">
                      Divided / Total
                    </th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateWiseHallRequirements.map((item) => {
                    const isSelected = item.exam.id === selectedExam.id;
                    const wf = item.workflow;
                    const quotas = Object.values(wf?.deptQuotas || {}) as (DeptDutyQuota | undefined)[];
                    const quotaSum = quotas.reduce((s, q) => s + (q?.requiredCount || 0), 0);
                    const isBalanced = quotaSum === item.totalRequired;

                    return (
                      <tr
                        key={item.exam.id}
                        onClick={() => onSelectExamId && onSelectExamId(item.exam.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/40 ring-1 ring-inset ring-indigo-400 font-semibold'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Radio indicator */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="radio"
                            name="selected-exam-date"
                            checked={isSelected}
                            onChange={() => onSelectExamId && onSelectExamId(item.exam.id)}
                            className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Date & Session */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-900">
                            {item.exam.date} <span className="text-indigo-600">({item.exam.session})</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal block">
                            {item.exam.timeSlot}
                          </span>
                        </td>

                        {/* Exam Name */}
                        <td className="py-3 px-3 text-slate-800 text-[11px] max-w-[160px] truncate" title={item.exam.name}>
                          {item.exam.name}
                        </td>

                        {/* No of Halls */}
                        <td className="py-3 px-2 text-center font-mono font-bold text-indigo-900 bg-indigo-50/30 text-xs">
                          {item.hallCount} Halls
                        </td>

                        {/* Total Required: Halls + 1 Buffer */}
                        <td className="py-3 px-2 text-center font-mono font-black text-emerald-900 bg-emerald-50/30 text-xs">
                          {item.hallSuperintendentRequirement} + {item.bufferRequirement} = <span className="underline">{item.totalRequired}</span>
                        </td>

                        {/* Department Quota Columns with direct text box input for any department */}
                        {ALL_DEPARTMENTS.map((dept) => {
                          const quota = wf.deptQuotas[dept]?.requiredCount ?? 0;

                          return (
                            <td
                              key={dept}
                              className="py-2 px-1.5 text-center border-l border-slate-100 bg-slate-50/30"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center">
                                <input
                                  id={`quota-input-${item.exam.id}-${dept}`}
                                  type="number"
                                  min="0"
                                  value={quota === 0 ? '' : quota}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    handleSetExamDeptQuota(item.exam.id, dept, isNaN(val) ? 0 : val);
                                  }}
                                  className="w-12 h-8 text-center font-mono font-black text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 shadow-2xs hover:border-slate-400 transition-all placeholder:text-slate-300"
                                  title={`Enter duty allocation number for ${dept}`}
                                />
                              </div>
                            </td>
                          );
                        })}

                        {/* Divided Quota vs Total Required */}
                        <td className="py-3 px-3 text-center border-l border-slate-200 font-mono">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold inline-block ${
                              isBalanced
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {quotaSum} / {item.totalRequired}
                          </span>
                        </td>

                        {/* Workflow Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            wf.status === 'Approved by Principal'
                              ? 'bg-emerald-100 text-emerald-800'
                              : wf.status === 'Submitted to Principal'
                              ? 'bg-purple-100 text-purple-800'
                              : wf.status === 'Nominations Complete' || wf.status === 'Hall Mapped'
                              ? 'bg-blue-100 text-blue-800'
                              : wf.status === 'Indent Sent to HODs'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {wf.status}
                          </span>
                        </td>

                        {/* Quick Row Actions */}
                        <td className="py-3 px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              id={`row-auto-balance-${item.exam.id}`}
                              onClick={() => handleAutoDistributeExamQuota(item.exam.id)}
                              className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold border border-slate-200 transition-colors"
                              title="Auto-balance quotas for this date"
                            >
                              Auto
                            </button>

                            <button
                              id={`row-send-indent-${item.exam.id}`}
                              onClick={() => handleSendExamIndentToHods(item.exam.id)}
                              disabled={!isBalanced}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                                isBalanced
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                              title={isBalanced ? 'Dispatch indent to HODs' : 'Balance quota first'}
                            >
                              Send
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Table Footer: Totals Row across all dates */}
                <tfoot>
                  <tr className="bg-slate-200/80 text-slate-900 font-bold border-t-2 border-slate-300 text-xs">
                    <td colSpan={3} className="py-3 px-3 font-black uppercase text-[11px]">
                      Institutional Total Across All Exam Dates
                    </td>
                    <td className="py-3 px-2 text-center font-mono font-black text-indigo-900">
                      {aggregateStats.totalHalls} Halls
                    </td>
                    <td className="py-3 px-2 text-center font-mono font-black text-emerald-900">
                      {aggregateStats.totalRequired} Total
                    </td>

                    {/* Department Totals */}
                    {ALL_DEPARTMENTS.map((dept) => {
                      const totalQuotaForDept = aggregateStats.deptTotalQuotas[dept] || 0;
                      const availCount = facultyList.filter((f) => f.department === dept && f.isAvailable).length;

                      return (
                        <td key={dept} className="py-3 px-2 text-center font-mono border-l border-slate-300">
                          <span className="font-black text-slate-900 block">{totalQuotaForDept}</span>
                          <span className="text-[9px] text-slate-500 font-normal">
                            ({availCount} pool)
                          </span>
                        </td>
                      );
                    })}

                    <td className="py-3 px-3 text-center font-mono font-black text-purple-950 border-l border-slate-300">
                      {aggregateStats.totalRequired} Quotas
                    </td>
                    <td colSpan={2} className="py-3 px-3 text-center">
                      <span className="text-[10px] text-slate-600 font-semibold">
                        {dateWiseHallRequirements.length} Exam Dates
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bottom Direct Link to Next Step */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
              <div className="text-slate-500">
                Current Active Selection: <strong className="text-slate-800">{selectedExam.name} ({selectedExam.date} {selectedExam.session})</strong> • Next: Respective Department HODs nominate specific faculty.
              </div>

              <div className="flex items-center space-x-2">
                <button
                  id="go-to-hod-portal-btn"
                  onClick={() => setActiveWorkflowTab('hod-portal')}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-xs transition-colors"
                >
                  <span>Open HOD Faculty Allocation Portal</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: HOD FACULTY NOMINATION PORTAL - RESPECTIVE HOD ALLOCATES DUTIES   */}
      {/* ========================================================================= */}
      {activeWorkflowTab === 'hod-portal' && (
        <div className="space-y-6">
          {/* HOD Department Switcher Header */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center space-x-1">
                  <Building className="w-3.5 h-3.5" />
                  <span>Department HOD Invigilation Nomination Portal</span>
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-0.5">
                  Allocate Department Faculty for Assigned Quota
                </h2>
                <p className="text-xs text-slate-500">
                  Select your department to view the Exam Cell duty indent and nominate available faculty members.
                </p>
              </div>

              {/* Department Selector Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {ALL_DEPARTMENTS.map((dept) => {
                  const q = currentWorkflow.deptQuotas[dept]?.requiredCount || 0;
                  const nominatedCount = currentWorkflow.deptQuotas[dept]?.nominatedFacultyIds?.length || 0;
                  const isComplete = nominatedCount >= q && q > 0;

                  return (
                    <button
                      key={dept}
                      id={`hod-dept-tab-${dept}`}
                      onClick={() => setSelectedHodDept(dept)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                        selectedHodDept === dept
                          ? 'bg-white text-indigo-900 shadow-xs ring-1 ring-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{dept}</span>
                      <span className={`text-[10px] font-mono px-1 rounded ${
                        isComplete ? 'bg-emerald-100 text-emerald-800' : q > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {nominatedCount}/{q}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Department Call Letter / Indent Summary Card */}
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-emerald-950 text-sm">
                    Department of {selectedHodDept} — Exam Cell Indent
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentDeptQuota.hodStatus === 'Nominated' && currentDeptQuota.nominatedFacultyIds.length >= currentDeptQuota.requiredCount
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-amber-200 text-amber-900'
                  }`}>
                    {currentDeptQuota.hodStatus === 'Nominated' ? '✓ Quota Fulfilled' : '⏳ Action Required'}
                  </span>
                </div>
                <p className="text-xs text-emerald-900/80">
                  <strong>Examination:</strong> {selectedExam.name} ({selectedExam.date} {selectedExam.session} • {selectedExam.timeSlot})
                </p>
                <p className="text-xs text-emerald-900/80">
                  <strong>Assigned Quota:</strong> Please nominate{' '}
                  <span className="font-black underline">{currentDeptQuota.requiredCount} Faculty Member(s)</span> for Hall Invigilation / Buffer duties.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="text-right">
                  <span className="text-[10px] text-emerald-700 uppercase font-bold block">Nomination Progress</span>
                  <span className="text-lg font-black font-mono text-emerald-950">
                    {currentDeptQuota.nominatedFacultyIds.length} / {currentDeptQuota.requiredCount} Selected
                  </span>
                </div>

                <button
                  id="submit-hod-nomination-btn"
                  onClick={handleSubmitHodNomination}
                  disabled={currentDeptQuota.nominatedFacultyIds.length < currentDeptQuota.requiredCount || currentDeptQuota.requiredCount === 0}
                  className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs ${
                    currentDeptQuota.nominatedFacultyIds.length >= currentDeptQuota.requiredCount && currentDeptQuota.requiredCount > 0
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Endorse & Submit to Exam Cell</span>
                </button>
              </div>
            </div>
          </div>

          {/* Department Faculty Pool & Nomination Selection Grid */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Available Faculty Members in {selectedHodDept} Department
                </h3>
                <p className="text-xs text-slate-500">
                  Click on faculty cards to allocate/deallocate them for the required {currentDeptQuota.requiredCount} duty slot(s).
                </p>
              </div>

              <span className="text-xs font-mono font-bold text-slate-600">
                {deptFacultyMembers.length} Faculty in Department
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {deptFacultyMembers.map((fac) => {
                const isNominated = currentDeptQuota.nominatedFacultyIds.includes(fac.id);
                const isOverloaded = fac.assignedDutiesCount >= fac.maxDuties;

                return (
                  <div
                    key={fac.id}
                    id={`faculty-card-${fac.id}`}
                    onClick={() => {
                      if (!fac.isAvailable) {
                        alert(`${fac.name} is marked On-Leave. Update availability in Faculty Pool before nominating.`);
                        return;
                      }
                      handleToggleNominateFaculty(fac.id);
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                      isNominated
                        ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                        : fac.isAvailable
                        ? 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                        : 'bg-slate-100 border-slate-200 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{fac.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {fac.designation} • {fac.staffId}
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          isNominated
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 bg-white text-transparent'
                        }`}>
                          ✓
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-500 flex items-center space-x-2">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{fac.phone}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${
                        isOverloaded ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        Duty Load: {fac.assignedDutiesCount}/{fac.maxDuties}
                      </span>

                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        fac.isAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {fac.isAvailable ? 'Available' : 'On Leave'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* HOD Remarks Input */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <label htmlFor="hod-remarks-input" className="block text-xs font-bold text-slate-700">
                HOD Endorsement & Special Notes for Exam Cell (Optional):
              </label>
              <input
                id="hod-remarks-input"
                type="text"
                value={hodRemarksInput}
                onChange={(e) => setHodRemarksInput(e.target.value)}
                placeholder="e.g., Faculty members verified. Both staff are available and assigned."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Bottom Next Step Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200/80 text-xs">
            <div className="text-slate-500">
              Total Nominated Across All Departments:{' '}
              <strong className="text-slate-800 font-mono">
                {totalNominatedFacultyCount} / {currentWorkflow.totalRequired} Faculties
              </strong>
            </div>

            <div className="flex items-center space-x-2">
              <button
                id="compile-and-map-btn"
                onClick={handleCompileAndMapHalls}
                className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Map Nominated Faculty to Exam Halls & Buffer</span>
              </button>

              <button
                id="view-principal-desk-btn"
                onClick={() => setActiveWorkflowTab('principal-approval')}
                className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-xs transition-colors"
              >
                <span>Principal Approval Desk</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: CONSOLIDATED MASTER REPORT & PRINCIPAL EXECUTIVE APPROVAL DESK   */}
      {/* ========================================================================= */}
      {activeWorkflowTab === 'principal-approval' && (
        <div className="space-y-6">
          {/* Executive Approval Status Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center space-x-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>Executive Governance & Principal Approval</span>
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-0.5">
                  Master Invigilation Duty Sanction & Official Order
                </h2>
                <p className="text-xs text-slate-500">
                  Review the compiled duty roster for <strong className="text-slate-800">{selectedExam.name} ({selectedExam.date} {selectedExam.session})</strong> with hall mappings and grant Principal approval.
                </p>
              </div>

              {/* Principal Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {currentWorkflow.status !== 'Approved by Principal' ? (
                  <>
                    <button
                      id="submit-to-principal-btn"
                      onClick={handleSubmitToPrincipal}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit to Principal</span>
                    </button>

                    <button
                      id="open-principal-sign-modal-btn"
                      onClick={() => setIsPrincipalModalOpen(true)}
                      className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-xs transition-colors"
                    >
                      <Award className="w-4 h-4" />
                      <span>Approve & Sign Roster (Principal)</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center space-x-2">
                    <div className="px-4 py-2 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2 text-emerald-900 text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Approved by Principal • {currentWorkflow.principalApproval?.signatureToken}</span>
                    </div>

                    <button
                      id="re-sign-principal-btn"
                      onClick={() => setIsPrincipalModalOpen(true)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                    >
                      Edit Remarks
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Principal Approval Stamp if Approved */}
            {currentWorkflow.principalApproval?.isApproved && (
              <div className="p-4 bg-emerald-50 rounded-xl border-2 border-emerald-300 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-xs">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                      Official Principal Sanction Recorded
                    </div>
                    <div className="text-sm font-black text-emerald-950">
                      {currentWorkflow.principalApproval.approvedBy}
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      Sanctioned at: {currentWorkflow.principalApproval.approvedAt} • Auth Ref: {currentWorkflow.principalApproval.signatureToken}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-emerald-900 bg-white/80 p-3 rounded-lg border border-emerald-200 max-w-md">
                  <strong className="block text-[10px] uppercase text-emerald-700">Executive Remarks:</strong>
                  "{currentWorkflow.principalApproval.remarks}"
                </div>
              </div>
            )}
          </div>

          {/* Printable Consolidated Master Report Container */}
          <div className="bg-white rounded-2xl p-8 border border-slate-300 shadow-sm print:p-0 print:border-none print:shadow-none space-y-6">
            {/* Official Institutional Header */}
            <div className="text-center pb-6 border-b-2 border-slate-900 space-y-1">
              <div className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Office of the Controller of Examinations & Central Exam Cell
              </div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                Master Invigilation Duty Allocation Roster
              </h1>
              <div className="text-xs font-semibold text-slate-700">
                {selectedExam.name} • Session: {selectedExam.date} ({selectedExam.session}) • {selectedExam.timeSlot}
              </div>
            </div>

            {/* Summary Statistics Table */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border border-slate-900 p-4 bg-slate-50">
              <div>
                <span className="text-slate-500 uppercase text-[10px] font-bold block">Examination Date:</span>
                <strong className="text-slate-900 font-mono text-sm">{selectedExam.date} ({selectedExam.session})</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px] font-bold block">Active Exam Halls:</span>
                <strong className="text-indigo-900 font-mono text-sm">{currentWorkflow.noOfHalls} Halls</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px] font-bold block">Superintendents + Buffer:</span>
                <strong className="text-emerald-900 font-mono text-sm">
                  {currentWorkflow.hallSuperintendentCount} Halls + {currentWorkflow.bufferCount} Buffer = {currentWorkflow.totalRequired} Total
                </strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px] font-bold block">Principal Approval Ref:</span>
                <strong className="text-purple-900 font-mono text-xs">
                  {currentWorkflow.principalApproval?.signatureToken || 'Pending Sanction'}
                </strong>
              </div>
            </div>

            {/* Department Quota Division Summary */}
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                1. Department Quota Distribution & Nomination Summary
              </h3>
              <div className="overflow-x-auto border border-slate-900">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-200 text-slate-900 font-bold uppercase text-[10px] border-b border-slate-900">
                      <th className="py-2 px-3 border-r border-slate-900">Department</th>
                      <th className="py-2 px-3 border-r border-slate-900 text-center">Assigned Quota</th>
                      <th className="py-2 px-3 border-r border-slate-900 text-center">Nominated Count</th>
                      <th className="py-2 px-3 border-r border-slate-900">Nominated Faculty Names</th>
                      <th className="py-2 px-3 text-center">HOD Endorsement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {ALL_DEPARTMENTS.filter((d) => (currentWorkflow.deptQuotas[d]?.requiredCount || 0) > 0).map((dept) => {
                      const q = currentWorkflow.deptQuotas[dept];
                      const names = q?.nominatedFacultyIds
                        .map((id) => facultyList.find((f) => f.id === id)?.name)
                        .filter(Boolean)
                        .join(', ');

                      return (
                        <tr key={dept} className="border-b border-slate-300">
                          <td className="py-2 px-3 border-r border-slate-900 font-bold text-slate-900">{dept}</td>
                          <td className="py-2 px-3 border-r border-slate-900 text-center font-mono font-bold">{q?.requiredCount}</td>
                          <td className="py-2 px-3 border-r border-slate-900 text-center font-mono font-bold">{q?.nominatedFacultyIds?.length || 0}</td>
                          <td className="py-2 px-3 border-r border-slate-900 text-slate-800">{names || '-'}</td>
                          <td className="py-2 px-3 text-center font-bold text-[10px] text-emerald-800">
                            {q?.hodStatus === 'Nominated' ? '✓ Endorsed' : 'Pending'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Master Consolidated Faculty Duty Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                2. Consolidated Hall-wise Duty Allocation Chart
              </h3>
              <div className="overflow-x-auto border border-slate-900">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-200 text-slate-900 font-bold uppercase text-[10px] border-b border-slate-900">
                      <th className="py-2.5 px-3 border-r border-slate-900 text-center w-12">S.No</th>
                      <th className="py-2.5 px-3 border-r border-slate-900">Assigned Hall / Location</th>
                      <th className="py-2.5 px-3 border-r border-slate-900">Superintendent Name</th>
                      <th className="py-2.5 px-3 border-r border-slate-900 text-center w-20">Dept</th>
                      <th className="py-2.5 px-3 border-r border-slate-900">Designation & Staff ID</th>
                      <th className="py-2.5 px-3 border-r border-slate-900 text-center w-28">Contact No</th>
                      <th className="py-2.5 px-3 border-r border-slate-900 text-center w-36">Role</th>
                      <th className="py-2.5 px-3 text-center w-32">Signature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {currentExamDuties.length > 0 ? (
                      currentExamDuties.map((duty, idx) => {
                        const fac = facultyList.find((f) => f.id === duty.facultyId);

                        return (
                          <tr key={duty.id} className="border-b border-slate-300">
                            <td className="py-2 px-3 border-r border-slate-900 text-center font-mono font-bold">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 font-bold text-slate-900">
                              {duty.roomNumber}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 font-bold text-slate-900">
                              {duty.facultyName}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 text-center font-bold">
                              {duty.facultyDept}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 text-[11px] text-slate-700">
                              {fac?.designation || 'Faculty'} ({fac?.staffId || '-'})
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 text-center font-mono text-[11px]">
                              {fac?.phone || '-'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-900 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                duty.role === 'Chief Superintendent'
                                  ? 'bg-purple-100 text-purple-900'
                                  : duty.role === 'Reliever / Standby'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-blue-100 text-blue-900'
                              }`}>
                                {duty.role}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center text-slate-300">
                              {/* Physical sign space */}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No duties mapped yet. Click "Map Nominated Faculty to Exam Halls & Buffer" above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Signatures Row */}
            <div className="pt-12 grid grid-cols-3 gap-8 text-center text-xs font-bold text-slate-900 border-t border-slate-300">
              <div>
                <div className="h-10"></div>
                <div className="border-t border-slate-900 pt-1">
                  Exam Cell Coordinator
                </div>
                <span className="text-[10px] text-slate-500 font-normal">Autonomous Exam Cell</span>
              </div>

              <div>
                <div className="h-10"></div>
                <div className="border-t border-slate-900 pt-1">
                  Controller of Examinations (CoE)
                </div>
                <span className="text-[10px] text-slate-500 font-normal">Institutional Evaluation Office</span>
              </div>

              <div>
                <div className="h-10 flex items-center justify-center">
                  {currentWorkflow.principalApproval?.isApproved && (
                    <span className="text-[10px] font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-400 rounded">
                      APPROVED ✓ ({currentWorkflow.principalApproval.signatureToken})
                    </span>
                  )}
                </div>
                <div className="border-t border-slate-900 pt-1">
                  Principal / Head of Institution
                </div>
                <span className="text-[10px] text-slate-500 font-normal">
                  {currentWorkflow.principalApproval?.approvedBy || 'Dr. S. K. Narayanan, Ph.D.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: LIVE HALL INVIGILATOR GRID & MANUAL OVERRIDE                      */}
      {/* ========================================================================= */}
      {activeWorkflowTab === 'roster-grid' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
                Filter:
              </span>
              
              <select
                id="duty-role-filter"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="Chief Superintendent">Chief Superintendent</option>
                <option value="Hall Invigilator">Hall Invigilator</option>
                <option value="Reliever / Standby">Reliever / Standby</option>
              </select>

              <select
                id="duty-dept-filter"
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="all">All Departments</option>
                {ALL_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                id="add-manual-duty-btn"
                onClick={() => setIsAddDutyModalOpen(true)}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Override Duty</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3 px-4">Exam Hall</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDuties.length > 0 ? (
                    filteredDuties.map((duty) => {
                      const fac = facultyList.find((f) => f.id === duty.facultyId);

                      return (
                        <tr key={duty.id} id={`duty-row-${duty.id}`} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <div className="flex items-center space-x-2">
                              <Building2 className="w-4 h-4 text-indigo-500" />
                              <span>{duty.roomNumber}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                duty.role === 'Chief Superintendent'
                                  ? 'bg-purple-100 text-purple-800'
                                  : duty.role === 'Reliever / Standby'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>{duty.role}</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{duty.facultyName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {fac?.designation || 'Faculty'} • {fac?.staffId || ''}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[10px]">
                              {duty.facultyDept}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                duty.status === 'Confirmed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : duty.status === 'Alteration Requested'
                                  ? 'bg-amber-100 text-amber-700 animate-pulse'
                                  : 'bg-indigo-100 text-indigo-700'
                              }`}
                            >
                              {duty.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                id={`request-alteration-${duty.id}`}
                                onClick={() => onNavigateToAlteration(duty.id)}
                                className="flex items-center space-x-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-semibold text-[11px] transition-colors"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>Alter</span>
                              </button>

                              <button
                                id={`delete-duty-${duty.id}`}
                                onClick={() => handleDeleteDuty(duty.id, duty.facultyId)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No faculty duty assignments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PRINCIPAL APPROVAL & DIGITAL SANCTION DIALOG                       */}
      {/* ========================================================================= */}
      {isPrincipalModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-purple-700">
                <Award className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Principal Executive Sanction</h3>
              </div>
              <button
                onClick={() => setIsPrincipalModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-950 space-y-1">
              <p>
                <strong>Examination:</strong> {selectedExam.name}
              </p>
              <p>
                <strong>Date & Session:</strong> {selectedExam.date} ({selectedExam.session}) • {selectedExam.timeSlot}
              </p>
              <p>
                <strong>Superintendents Required:</strong> {currentWorkflow.noOfHalls} Halls + {currentWorkflow.bufferCount} Buffer = {currentWorkflow.totalRequired} Total
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Principal / Head of Institution Name *
                </label>
                <input
                  type="text"
                  value={principalNameInput}
                  onChange={(e) => setPrincipalNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Executive Approval Remarks & Instructions *
                </label>
                <textarea
                  rows={3}
                  value={principalRemarksInput}
                  onChange={(e) => setPrincipalRemarksInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium text-slate-800 focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setIsPrincipalModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Cancel
              </button>
              <button
                id="confirm-principal-approval-btn"
                type="button"
                onClick={handlePrincipalApprove}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-xs flex items-center space-x-1.5"
              >
                <Award className="w-4 h-4" />
                <span>Officially Sanction & Stamp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Duty Modal */}
      {isAddDutyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Assign Faculty Duty</h3>
              <button
                onClick={() => setIsAddDutyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualDuty} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Faculty Member *
                </label>
                <select
                  id="select-faculty-duty"
                  value={selectedFacultyId}
                  onChange={(e) => setSelectedFacultyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                >
                  {facultyList.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      {fac.name} ({fac.department} - {fac.designation}) [Duties: {fac.assignedDutiesCount}/{fac.maxDuties}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Duty Role *
                </label>
                <select
                  id="select-role-duty"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="Hall Invigilator">Hall Invigilator (Hall Superintendent)</option>
                  <option value="Chief Superintendent">Chief Superintendent</option>
                  <option value="Reliever / Standby">Buffer / Standby Superintendent</option>
                  <option value="Squad Member">Flying Squad Member</option>
                </select>
              </div>

              {selectedRole !== 'Reliever / Standby' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Assign to Exam Hall
                  </label>
                  <select
                    id="select-hall-duty"
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.roomNumber} ({room.block} - Capacity: {room.totalCapacity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddDutyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  id="confirm-assign-duty-btn"
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs"
                >
                  Assign Duty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Faculty Pool Master Modal */}
      {isFacultyMasterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Faculty Master & Workload Tracker</h3>
                <p className="text-xs text-slate-500">
                  Manage invigilation quotas, current assignments, and availability status.
                </p>
              </div>
              <button
                onClick={() => setIsFacultyMasterModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 text-xs">
              {facultyList.map((fac) => {
                const isOverloaded = fac.assignedDutiesCount >= fac.maxDuties;

                return (
                  <div key={fac.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 text-sm">{fac.name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                          {fac.department}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {fac.designation}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-3">
                        <span>{fac.email}</span>
                        <span>•</span>
                        <span>{fac.phone}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Duty Quota</span>
                        <span
                          className={`font-bold ${
                            isOverloaded ? 'text-amber-600' : 'text-slate-700'
                          }`}
                        >
                          {fac.assignedDutiesCount} / {fac.maxDuties} Assigned
                        </span>
                      </div>

                      <button
                        onClick={() => handleToggleFacultyAvailability(fac.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-colors ${
                          fac.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}
                      >
                        {fac.isAvailable ? 'Available' : 'On Leave'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsFacultyMasterModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
