import React, { useState } from 'react';
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowRightLeft, 
  ShieldAlert, 
  UserX, 
  Sparkles, 
  Send, 
  FileText, 
  Building2, 
  Check, 
  X,
  History,
  AlertOctagon,
  UserCheck
} from 'lucide-react';
import { 
  DutyAlterationRequest, 
  DutyAllocation, 
  Faculty, 
  ExamSchedule, 
  NotificationLog, 
  Department 
} from '../../../types';

interface DutyAlterationModuleProps {
  alterationRequests: DutyAlterationRequest[];
  onUpdateAlterationRequests: (requests: DutyAlterationRequest[]) => void;
  dutyAllocations: DutyAllocation[];
  onUpdateDutyAllocations: (duties: DutyAllocation[]) => void;
  facultyList: Faculty[];
  onUpdateFacultyList: (faculty: Faculty[]) => void;
  selectedExam: ExamSchedule;
  notifications: NotificationLog[];
  onAddNotification: (notif: Omit<NotificationLog, 'id' | 'timestamp'>) => void;
  preSelectedDutyId?: string;
}

export const DutyAlterationModule: React.FC<DutyAlterationModuleProps> = ({
  alterationRequests,
  onUpdateAlterationRequests,
  dutyAllocations,
  onUpdateDutyAllocations,
  facultyList,
  onUpdateFacultyList,
  selectedExam,
  notifications,
  onAddNotification,
  preSelectedDutyId,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'approvals' | 'emergency' | 'request' | 'history'>('approvals');
  
  // Request Form State
  const [selectedDutyId, setSelectedDutyId] = useState<string>(preSelectedDutyId || dutyAllocations[0]?.id || '');
  const [alterationType, setAlterationType] = useState<DutyAlterationRequest['alterationType']>('Mutual Swap');
  const [replacementFacId, setReplacementFacId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isEmergency, setIsEmergency] = useState<boolean>(false);

  // Filter for approvals
  const [filterStatus, setFilterStatus] = useState<string>('pending');

  // Find assigned duties for current exam
  const currentExamDuties = dutyAllocations.filter((d) => d.examScheduleId === selectedExam.id);
  const selectedDuty = dutyAllocations.find((d) => d.id === selectedDutyId);

  // Standby faculty pool
  const standbyDuties = currentExamDuties.filter((d) => d.role === 'Reliever / Standby');
  const availableStandbyFaculty = facultyList.filter(
    (f) => f.isAvailable && (!currentExamDuties.some((d) => d.facultyId === f.id) || standbyDuties.some((s) => s.facultyId === f.id))
  );

  // Handle New Alteration Request Submission
  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDuty || !reason.trim()) return;

    const reqFaculty = facultyList.find((f) => f.id === selectedDuty.facultyId);
    const repFaculty = facultyList.find((f) => f.id === replacementFacId);

    const newRequest: DutyAlterationRequest = {
      id: `alt-req-${Date.now()}`,
      dutyAllocationId: selectedDuty.id,
      examScheduleId: selectedExam.id,
      date: selectedDuty.date,
      session: selectedDuty.session,
      roomNumber: selectedDuty.roomNumber,
      requestingFacultyId: selectedDuty.facultyId,
      requestingFacultyName: selectedDuty.facultyName,
      requestingFacultyDept: selectedDuty.facultyDept,
      alterationType: alterationType,
      replacementFacultyId: repFaculty?.id,
      replacementFacultyName: repFaculty?.name,
      replacementFacultyDept: repFaculty?.department,
      reason: reason.trim(),
      requestedAt: new Date().toLocaleString(),
      deptApprovalStatus: 'Pending',
      examCellApprovalStatus: 'Pending',
      finalStatus: 'Pending Dept HOD',
      isEmergency: isEmergency,
    };

    // Mark duty status
    const updatedDuties = dutyAllocations.map((d) =>
      d.id === selectedDuty.id ? { ...d, status: 'Alteration Requested' as const } : d
    );
    onUpdateDutyAllocations(updatedDuties);

    onUpdateAlterationRequests([newRequest, ...alterationRequests]);

    onAddNotification({
      title: 'Duty Alteration Requested',
      message: `${selectedDuty.facultyName} (${selectedDuty.facultyDept}) submitted ${alterationType} for Hall ${selectedDuty.roomNumber}. Forwarded to Department HOD.`,
      type: isEmergency ? 'emergency' : 'warning',
      read: false,
    });

    // Reset & redirect to approvals
    setReason('');
    setActiveSubTab('approvals');
  };

  // Step 1: Department HOD Approval Handler
  const handleDeptApproval = (requestId: string, approved: boolean, remarks: string) => {
    const request = alterationRequests.find((r) => r.id === requestId);
    if (!request) return;

    const updated = alterationRequests.map((r) => {
      if (r.id === requestId) {
        return {
          ...r,
          deptApprovalStatus: approved ? ('Approved' as const) : ('Rejected' as const),
          deptApproverName: `HOD (${r.requestingFacultyDept}) / Dept Exam Coordinator`,
          deptApprovalRemarks: remarks || (approved ? 'Endorsed and recommended.' : 'Declined by department.'),
          deptApprovedAt: new Date().toLocaleString(),
          finalStatus: approved ? ('Pending Exam Cell' as const) : ('Rejected' as const),
        };
      }
      return r;
    });

    onUpdateAlterationRequests(updated);

    if (!approved) {
      // Revert duty status back to confirmed
      const revertedDuties = dutyAllocations.map((d) =>
        d.id === request.dutyAllocationId ? { ...d, status: 'Confirmed' as const } : d
      );
      onUpdateDutyAllocations(revertedDuties);
    }

    onAddNotification({
      title: approved ? 'Dept HOD Approved Alteration' : 'Dept HOD Rejected Alteration',
      message: `Request for Hall ${request.roomNumber} was ${approved ? 'endorsed and moved to Central Exam Cell' : 'rejected'}.`,
      type: approved ? 'info' : 'warning',
      read: false,
    });
  };

  // Step 2: Exam Cell Final Approval Handler
  const handleExamCellApproval = (requestId: string, approved: boolean, remarks: string) => {
    const request = alterationRequests.find((r) => r.id === requestId);
    if (!request) return;

    const updated = alterationRequests.map((r) => {
      if (r.id === requestId) {
        return {
          ...r,
          examCellApprovalStatus: approved ? ('Approved' as const) : ('Rejected' as const),
          examCellApproverName: 'Dr. R. K. Ramanathan (Central Exam Cell Chief)',
          examCellApprovalRemarks: remarks || (approved ? 'Approved and Roster updated.' : 'Rejected by Exam Cell.'),
          examCellApprovedAt: new Date().toLocaleString(),
          finalStatus: approved ? ('Approved' as const) : ('Rejected' as const),
        };
      }
      return r;
    });

    onUpdateAlterationRequests(updated);

    if (approved) {
      // Real-time synchronization: Update Duty Allocation Roster
      const updatedDuties = dutyAllocations.map((d) => {
        if (d.id === request.dutyAllocationId) {
          if (request.replacementFacultyId && request.replacementFacultyName && request.replacementFacultyDept) {
            return {
              ...d,
              facultyId: request.replacementFacultyId,
              facultyName: request.replacementFacultyName,
              facultyDept: request.replacementFacultyDept,
              status: 'Substituted' as const,
            };
          }
        }
        return d;
      });
      onUpdateDutyAllocations(updatedDuties);

      onAddNotification({
        title: 'Duty Roster Updated (Exam Cell Signed)',
        message: `Hall ${request.roomNumber} duty reassigned to ${request.replacementFacultyName || 'Substitute'}. Seating door charts updated in real-time.`,
        type: 'success',
        read: false,
      });
    } else {
      // Revert duty status
      const revertedDuties = dutyAllocations.map((d) =>
        d.id === request.dutyAllocationId ? { ...d, status: 'Confirmed' as const } : d
      );
      onUpdateDutyAllocations(revertedDuties);
    }
  };

  // Emergency 1-Click Substitution Handler
  const handleEmergencySubstitution = (duty: DutyAllocation, substituteFaculty: Faculty) => {
    // Instantly update duty allocation
    const updatedDuties = dutyAllocations.map((d) => {
      if (d.id === duty.id) {
        return {
          ...d,
          facultyId: substituteFaculty.id,
          facultyName: substituteFaculty.name,
          facultyDept: substituteFaculty.department,
          status: 'Substituted' as const,
        };
      }
      return d;
    });
    onUpdateDutyAllocations(updatedDuties);

    // Create immediate approved audit record
    const emergencyRecord: DutyAlterationRequest = {
      id: `alt-emerg-${Date.now()}`,
      dutyAllocationId: duty.id,
      examScheduleId: selectedExam.id,
      date: duty.date,
      session: duty.session,
      roomNumber: duty.roomNumber,
      requestingFacultyId: duty.facultyId,
      requestingFacultyName: duty.facultyName,
      requestingFacultyDept: duty.facultyDept,
      alterationType: 'Emergency Substitute',
      replacementFacultyId: substituteFaculty.id,
      replacementFacultyName: substituteFaculty.name,
      replacementFacultyDept: substituteFaculty.department,
      reason: 'Urgent unannounced absence on exam morning. 1-click standby reliever deployment.',
      requestedAt: new Date().toLocaleString(),
      deptApprovalStatus: 'Approved',
      deptApproverName: 'Auto-Endorsed (Emergency Protocol)',
      deptApprovalRemarks: 'Emergency substitution executed by Exam Cell Control Room.',
      deptApprovedAt: new Date().toLocaleString(),
      examCellApprovalStatus: 'Approved',
      examCellApproverName: 'Exam Cell Chief Controller',
      examCellApprovalRemarks: `Dispatched standby faculty ${substituteFaculty.name} immediately.`,
      examCellApprovedAt: new Date().toLocaleString(),
      finalStatus: 'Approved',
      isEmergency: true,
    };

    onUpdateAlterationRequests([emergencyRecord, ...alterationRequests]);

    onAddNotification({
      title: '🚨 Emergency Substitute Deployed',
      message: `Emergency reassignment: ${substituteFaculty.name} (${substituteFaculty.department}) deployed to Hall ${duty.roomNumber}. Live duty charts synced.`,
      type: 'emergency',
      read: false,
    });
  };

  // Filter requests
  const pendingRequests = alterationRequests.filter(
    (r) => r.finalStatus === 'Pending Dept HOD' || r.finalStatus === 'Pending Exam Cell'
  );
  const completedRequests = alterationRequests.filter(
    (r) => r.finalStatus === 'Approved' || r.finalStatus === 'Rejected'
  );

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase">
              <RefreshCw className="w-4 h-4" />
              <span>Real-Time Rescheduling & Compliance</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              Duty Alteration & Emergency Substitution Desk
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Two-tier approval pipeline (Department HOD & Exam Cell) with instant standby reliever deployment for last-minute emergencies.
            </p>
          </div>

          {/* Sub Tab Navigation */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              id="subtab-approvals-btn"
              onClick={() => setActiveSubTab('approvals')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                activeSubTab === 'approvals'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pending Approvals</span>
              {pendingRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                  {pendingRequests.length}
                </span>
              )}
            </button>

            <button
              id="subtab-emergency-btn"
              onClick={() => setActiveSubTab('emergency')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                activeSubTab === 'emergency'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Emergency Substitution</span>
            </button>

            <button
              id="subtab-request-btn"
              onClick={() => setActiveSubTab('request')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'request'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              + Submit Request
            </button>

            <button
              id="subtab-history-btn"
              onClick={() => setActiveSubTab('history')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit History ({completedRequests.length})
            </button>
          </div>
        </div>

        {/* Status Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Pending Department Approvals</span>
            <span className="text-lg font-bold text-amber-600">
              {alterationRequests.filter((r) => r.finalStatus === 'Pending Dept HOD').length} Awaiting HOD
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Pending Exam Cell Sign-off</span>
            <span className="text-lg font-bold text-indigo-600">
              {alterationRequests.filter((r) => r.finalStatus === 'Pending Exam Cell').length} Awaiting Chief
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Active Standby Relievers</span>
            <span className="text-lg font-bold text-emerald-600">
              {availableStandbyFaculty.length} Standby Ready
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Roster Synchronization</span>
            <span className="text-xs font-bold text-emerald-700 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Real-time Live Sync Active</span>
            </span>
          </div>
        </div>
      </div>

      {/* SUB TAB 1: PENDING APPROVALS PIPELINE */}
      {activeSubTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Multi-Tier Approval Pipeline</span>
            </h2>
            <span className="text-xs text-slate-500">
              Step 1: Department HOD Review → Step 2: Exam Cell Final Endorsement
            </span>
          </div>

          {pendingRequests.length > 0 ? (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  id={`alteration-card-${req.id}`}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4"
                >
                  {/* Top line */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                        <ArrowRightLeft className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">
                            Hall {req.roomNumber} ({req.date} {req.session})
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {req.alterationType}
                          </span>
                          {req.isEmergency && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 animate-pulse">
                              Urgent / Emergency
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Requested by: <strong>{req.requestingFacultyName}</strong> ({req.requestingFacultyDept})
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${
                          req.finalStatus === 'Pending Dept HOD'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {req.finalStatus === 'Pending Dept HOD'
                          ? '⏳ Step 1: Awaiting Dept HOD'
                          : '⏳ Step 2: Awaiting Exam Cell Chief'}
                      </span>
                    </div>
                  </div>

                  {/* Details Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Proposed Replacement</span>
                      <span className="font-bold text-slate-800">
                        {req.replacementFacultyName || 'Standby Reliever Assignment'}
                      </span>
                      {req.replacementFacultyDept && (
                        <span className="text-[10px] text-slate-500 block">
                          Dept: {req.replacementFacultyDept}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                      <span className="text-slate-400 block text-[10px]">Stated Justification / Reason</span>
                      <p className="text-slate-700 font-medium italic mt-0.5">"{req.reason}"</p>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Submitted: {req.requestedAt}
                      </span>
                    </div>
                  </div>

                  {/* Two-Tier Action Triggers */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Step 1: Dept HOD View */}
                    {req.finalStatus === 'Pending Dept HOD' ? (
                      <div className="flex items-center space-x-2 w-full justify-between">
                        <span className="text-xs text-slate-500">
                          <strong>Department Coordinator Action:</strong> Endorse this request to forward to Exam Cell.
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            id={`hod-reject-${req.id}`}
                            onClick={() => handleDeptApproval(req.id, false, 'Declined by Department HOD.')}
                            className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold"
                          >
                            Decline
                          </button>
                          <button
                            id={`hod-approve-${req.id}`}
                            onClick={() => handleDeptApproval(req.id, true, 'Endorsed and verified by HOD.')}
                            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
                          >
                            Endorse & Forward to Exam Cell
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Step 2: Exam Cell Final Approval */
                      <div className="flex items-center space-x-2 w-full justify-between">
                        <div>
                          <span className="text-xs text-emerald-700 font-semibold block">
                            ✓ Step 1 Cleared: Endorsed by {req.deptApproverName}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Remarks: "{req.deptApprovalRemarks}"
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            id={`examcell-reject-${req.id}`}
                            onClick={() => handleExamCellApproval(req.id, false, 'Declined by Exam Cell Chief.')}
                            className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold"
                          >
                            Reject
                          </button>
                          <button
                            id={`examcell-approve-${req.id}`}
                            onClick={() => handleExamCellApproval(req.id, true, 'Approved by Central Exam Cell Coordinator.')}
                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Sign-off & Update Live Roster</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-semibold text-slate-700 text-sm">All Clear! No Pending Alterations</p>
              <p className="text-xs text-slate-500">
                All duty assignments for {selectedExam.name} are confirmed and locked.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB 2: EMERGENCY IMMEDIATE SUBSTITUTION DESK */}
      {activeSubTab === 'emergency' && (
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start space-x-3 text-xs text-rose-800">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm text-rose-900">
                Exam Day Emergency Invigilator Substitution Desk
              </h3>
              <p className="mt-0.5 text-rose-700 leading-relaxed">
                Use this desk when an invigilator is unable to attend duty on exam morning (due to sudden transit delay, medical distress, or unexpected absence). Instantly deploy from the active Standby / Reliever pool. Live door sheets and attendance charts are re-tagged immediately.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Active Halls & Assigned Invigilators */}
            <div className="lg:col-span-7 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Active Halls & Assigned Invigilators ({currentExamDuties.filter((d) => d.role === 'Hall Invigilator').length})
              </h3>

              <div className="space-y-2.5">
                {currentExamDuties
                  .filter((d) => d.role === 'Hall Invigilator')
                  .map((duty) => (
                    <div
                      key={duty.id}
                      className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">
                          {duty.roomNumber}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{duty.facultyName}</div>
                          <p className="text-xs text-slate-500">
                            Dept: {duty.facultyDept} • Status:{' '}
                            <span
                              className={`font-semibold ${
                                duty.status === 'Substituted' ? 'text-amber-600' : 'text-emerald-600'
                              }`}
                            >
                              {duty.status}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Substitute Selector Dropdown */}
                      <div className="flex items-center space-x-2">
                        <select
                          id={`emergency-select-${duty.id}`}
                          aria-label={`Select standby faculty for hall ${duty.roomNumber}`}
                          onChange={(e) => {
                            const subFac = facultyList.find((f) => f.id === e.target.value);
                            if (subFac && confirm(`Deploy ${subFac.name} immediately to Hall ${duty.roomNumber}?`)) {
                              handleEmergencySubstitution(duty, subFac);
                            }
                          }}
                          defaultValue=""
                          className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer"
                        >
                          <option value="" disabled>
                            ⚡ 1-Click Replace from Standby...
                          </option>
                          {availableStandbyFaculty.map((sb) => (
                            <option key={sb.id} value={sb.id}>
                              {sb.name} ({sb.department} - {sb.designation})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Right: Standby Reliever Pool Status */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Active Standby Relievers Ready ({availableStandbyFaculty.length})
              </h3>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <p className="text-xs text-slate-500">
                  These faculty members are on active standby duty in the Central Control Cell.
                </p>

                <div className="divide-y divide-slate-100">
                  {availableStandbyFaculty.map((sb) => (
                    <div key={sb.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-800">{sb.name}</div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {sb.department} • {sb.designation} • {sb.phone}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        Standby Ready
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 3: SUBMIT NEW ALTERATION REQUEST */}
      {activeSubTab === 'request' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs max-w-2xl mx-auto space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Submit Faculty Duty Alteration Request
            </h2>
            <p className="text-xs text-slate-500">
              Formal submission routed to your Department HOD and Central Exam Cell coordinator.
            </p>
          </div>

          <form onSubmit={handleSubmitRequest} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Select Your Assigned Exam Duty *
              </label>
              <select
                id="select-alter-duty"
                value={selectedDutyId}
                onChange={(e) => setSelectedDutyId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                {currentExamDuties.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.facultyName} ({d.facultyDept}) - Hall {d.roomNumber} ({d.role}) [{d.date} {d.session}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alteration Category *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`p-3 rounded-xl border cursor-pointer flex items-center space-x-2 ${
                    alterationType === 'Mutual Swap'
                      ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="altType"
                    checked={alterationType === 'Mutual Swap'}
                    onChange={() => setAlterationType('Mutual Swap')}
                    className="text-indigo-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Mutual Swap</span>
                    <span className="text-[10px] text-slate-500">
                      Swap with another specific faculty member
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer flex items-center space-x-2 ${
                    alterationType === 'Exemption & Replacement'
                      ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="altType"
                    checked={alterationType === 'Exemption & Replacement'}
                    onChange={() => setAlterationType('Exemption & Replacement')}
                    className="text-indigo-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Exemption Request</span>
                    <span className="text-[10px] text-slate-500">
                      Request replacement from Standby Pool
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {alterationType === 'Mutual Swap' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nominated Replacement Faculty *
                </label>
                <select
                  id="select-replacement-faculty"
                  value={replacementFacId}
                  onChange={(e) => setReplacementFacId(e.target.value)}
                  required={alterationType === 'Mutual Swap'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="">-- Choose Replacement Faculty --</option>
                  {facultyList
                    .filter((f) => f.id !== selectedDuty?.facultyId)
                    .map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.name} ({fac.department} - {fac.designation})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reason & Official Justification *
              </label>
              <textarea
                id="alteration-reason-input"
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Specify exact medical emergency, official duty, or conference commitment..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                id="emergency-checkbox"
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500"
              />
              <label htmlFor="emergency-checkbox" className="font-medium text-slate-700">
                Mark as High Priority / Urgent
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSubTab('approvals')}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Cancel
              </button>
              <button
                id="submit-alteration-request-btn"
                type="submit"
                className="flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Alteration Request</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUB TAB 4: AUDIT HISTORY */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <History className="w-4 h-4 text-slate-500" />
              <span>Historical Rescheduling & Decision Log</span>
            </h2>
            <span className="text-xs text-slate-500">
              Complete audit trail of all approved and rejected requests.
            </span>
          </div>

          <div className="space-y-3">
            {completedRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800">
                      Hall {req.roomNumber} ({req.date} {req.session})
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        req.finalStatus === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {req.finalStatus}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{req.requestedAt}</span>
                </div>

                <div className="text-slate-600">
                  <strong>{req.requestingFacultyName}</strong> ({req.requestingFacultyDept}) →{' '}
                  <strong>{req.replacementFacultyName || 'Standby Reliever'}</strong>
                </div>

                <p className="italic text-slate-500">"{req.reason}"</p>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-[10px] text-slate-500 gap-2">
                  <span>HOD Sign-off: {req.deptApproverName || 'N/A'}</span>
                  <span>Exam Cell Sign-off: {req.examCellApproverName || 'N/A'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
