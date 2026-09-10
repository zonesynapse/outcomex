import React, { useState } from 'react';
import { 
  UserX, 
  UserCheck, 
  Search, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Printer, 
  QrCode, 
  RefreshCw, 
  FileSpreadsheet, 
  Sparkles,
  ShieldAlert,
  Users
} from 'lucide-react';
import { Room, Student, AllocatedSeat, ExamSchedule } from '../../../types';
import { db } from '../../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import PrincipalIAScheduleView from '../../PrincipalIAScheduleView';

interface AbsentMarkViewProps {
  rooms: Room[];
  students: Student[];
  allocatedSeats: AllocatedSeat[];
  onUpdateAllocatedSeats: (seats: AllocatedSeat[]) => void;
  selectedExam: ExamSchedule;
}

export const AbsentMarkView: React.FC<AbsentMarkViewProps> = ({
  rooms,
  students,
  allocatedSeats,
  onUpdateAllocatedSeats,
  selectedExam,
}) => {
  const [selectedHallId, setSelectedHallId] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Absent' | 'Present' | 'Allocated'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Quick Register Number scan/input
  const [quickRegNo, setQuickRegNo] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync seats to Firestore helper
  const saveSeatsToFirestore = async (newSeats: AllocatedSeat[]) => {
    try {
      const docRef = doc(db, 'exam_cell_settings', 'seating_allocation');
      await setDoc(docRef, { allocatedSeats: newSeats, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error('Failed to sync seating allocation to Firestore:', err);
    }
  };

  const handleUpdateStatus = (seatId: string, newStatus: AllocatedSeat['status']) => {
    const updated = allocatedSeats.map((s) => (s.seatId === seatId ? { ...s, status: newStatus } : s));
    onUpdateAllocatedSeats(updated);
    saveSeatsToFirestore(updated);
  };

  // Quick Register Number Submit
  const handleQuickMarkAbsent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRegNo.trim()) return;

    const queryClean = quickRegNo.trim().toLowerCase();
    const targetSeat = allocatedSeats.find(
      (s) =>
        s.student.registerNumber.toLowerCase() === queryClean ||
        s.student.name.toLowerCase().includes(queryClean)
    );

    if (!targetSeat) {
      setFeedbackMessage({
        type: 'error',
        text: `Student "${quickRegNo}" not found in allocated seating for this exam.`,
      });
      return;
    }

    handleUpdateStatus(targetSeat.seatId, 'Absent');
    setFeedbackMessage({
      type: 'success',
      text: `✓ ${targetSeat.student.name} (${targetSeat.student.registerNumber}) in Hall ${targetSeat.roomNumber} marked as ABSENT.`,
    });
    setQuickRegNo('');

    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleMarkAllUnmarkedAsPresent = () => {
    const updated = allocatedSeats.map((s) => {
      if ((selectedHallId === 'ALL' || s.roomId === selectedHallId) && s.status === 'Allocated') {
        return { ...s, status: 'Present' as const };
      }
      return s;
    });
    onUpdateAllocatedSeats(updated);
    saveSeatsToFirestore(updated);
  };

  const handleResetHallAttendance = () => {
    if (!window.confirm('Reset all attendance statuses in selected hall back to Allocated (unmarked)?')) return;
    const updated = allocatedSeats.map((s) => {
      if (selectedHallId === 'ALL' || s.roomId === selectedHallId) {
        return { ...s, status: 'Allocated' as const };
      }
      return s;
    });
    onUpdateAllocatedSeats(updated);
    saveSeatsToFirestore(updated);
  };

  // Metrics
  const totalAllocated = allocatedSeats.length;
  const totalAbsent = allocatedSeats.filter((s) => s.status === 'Absent').length;
  const totalPresent = allocatedSeats.filter((s) => s.status === 'Present').length;
  const totalPending = allocatedSeats.filter((s) => s.status === 'Allocated').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2 text-blue-200 font-bold text-xs uppercase tracking-wider mb-1">
              <UserX className="w-4 h-4 text-blue-300" />
              <span>Exam Cell Hall Suite — Attendance Console</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Absentee Marking & Register Desk
            </h2>
            <p className="text-xs md:text-sm text-blue-100/90 mt-1 max-w-2xl font-medium">
              Record live hall absentees, search register numbers, manage invigilator attendance statements, and auto-sync status across exam halls.
            </p>
          </div>

          {/* Quick Register Number Entry Card */}
          <form 
            onSubmit={handleQuickMarkAbsent}
            className="bg-white/10 border border-white/20 p-3.5 rounded-2xl shadow-lg backdrop-blur-md flex flex-col gap-2 min-w-[320px]"
          >
            <label className="text-[11px] font-bold text-blue-100 uppercase tracking-wider flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-blue-200" />
              Quick Scan / Mark Absentee
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={quickRegNo}
                onChange={(e) => setQuickRegNo(e.target.value)}
                placeholder="Type Reg No or Name..."
                className="w-full bg-white/10 border border-white/30 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-blue-200/60 focus:outline-none focus:border-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 border border-rose-400/30"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Mark Absent</span>
              </button>
            </div>
            {feedbackMessage && (
              <div 
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                  feedbackMessage.type === 'success' 
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' 
                    : 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                }`}
              >
                {feedbackMessage.text}
              </div>
            )}
          </form>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/15">
          <div className="bg-white/10 rounded-2xl p-3.5 border border-white/15 backdrop-blur-xs">
            <span className="text-[11px] font-bold text-blue-200 block uppercase">Total Allocated</span>
            <span className="text-2xl font-black text-white mt-0.5 block">{totalAllocated}</span>
          </div>

          <div className="bg-emerald-500/20 rounded-2xl p-3.5 border border-emerald-400/30 backdrop-blur-xs">
            <span className="text-[11px] font-bold text-emerald-200 block uppercase">Present Students</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-300 mt-0.5 block">{totalPresent}</span>
              <span className="text-xs text-emerald-200/80 font-bold">
                ({totalAllocated > 0 ? Math.round((totalPresent / totalAllocated) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="bg-rose-500/20 rounded-2xl p-3.5 border border-rose-400/30 backdrop-blur-xs">
            <span className="text-[11px] font-bold text-rose-200 block uppercase">Total Absentees</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-300 mt-0.5 block">{totalAbsent}</span>
              <span className="text-xs text-rose-200 font-bold">
                ({totalAllocated > 0 ? Math.round((totalAbsent / totalAllocated) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="bg-amber-500/20 rounded-2xl p-3.5 border border-amber-400/30 backdrop-blur-xs">
            <span className="text-[11px] font-bold text-amber-200 block uppercase">Pending / Unmarked</span>
            <span className="text-2xl font-black text-amber-300 mt-0.5 block">{totalPending}</span>
          </div>
        </div>
      </div>

      {/* Examination Schedules Table (Matches Reference Image Exactly) */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-zinc-200 shadow-sm">
        <PrincipalIAScheduleView 
          showApproveButton={false} 
          hideApproveButton={true} 
          hideDetailsCols={true} 
          hideBatchFilter={true}
          enableAttendanceModal={true}
        />
      </div>
    </div>
  );
};
