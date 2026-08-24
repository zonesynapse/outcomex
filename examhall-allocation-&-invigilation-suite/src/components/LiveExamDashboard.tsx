import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Clock, 
  Users, 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Search, 
  UserCheck, 
  Maximize2,
  FileCheck,
  Radio,
  Sparkles
} from 'lucide-react';
import { Room, Student, AllocatedSeat, DutyAllocation, ExamSchedule, NotificationLog } from '../types';

interface LiveExamDashboardProps {
  rooms: Room[];
  students: Student[];
  allocatedSeats: AllocatedSeat[];
  onUpdateAllocatedSeats: (seats: AllocatedSeat[]) => void;
  dutyAllocations: DutyAllocation[];
  selectedExam: ExamSchedule;
  notifications: NotificationLog[];
  onNavigateToSeating: (roomId?: string) => void;
  onNavigateToAlteration: () => void;
}

export const LiveExamDashboard: React.FC<LiveExamDashboardProps> = ({
  rooms,
  students,
  allocatedSeats,
  onUpdateAllocatedSeats,
  dutyAllocations,
  selectedExam,
  notifications,
  onNavigateToSeating,
  onNavigateToAlteration,
}) => {
  const [activeHallForAttendance, setActiveHallForAttendance] = useState<Room | null>(null);
  const [searchRegNo, setSearchRegNo] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeRooms = rooms.filter((r) => r.status === 'Active');
  const currentExamDuties = dutyAllocations.filter((d) => d.examScheduleId === selectedExam.id);

  // Attendance metrics
  const totalAllocated = allocatedSeats.length;
  const presentCount = allocatedSeats.filter((s) => s.status === 'Present').length;
  const absentCount = allocatedSeats.filter((s) => s.status === 'Absent').length;
  const pendingAttendance = allocatedSeats.filter((s) => s.status === 'Allocated').length;

  const handleToggleAttendance = (seatId: string, newStatus: AllocatedSeat['status']) => {
    const updated = allocatedSeats.map((s) => (s.seatId === seatId ? { ...s, status: newStatus } : s));
    onUpdateAllocatedSeats(updated);
  };

  const handleMarkAllPresentInHall = (hallId: string) => {
    const updated = allocatedSeats.map((s) =>
      s.roomId === hallId && s.status === 'Allocated' ? { ...s, status: 'Present' as const } : s
    );
    onUpdateAllocatedSeats(updated);
  };

  return (
    <div className="space-y-6">
      {/* Control Room Live Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase">
              <Radio className="w-4 h-4 text-rose-500 animate-ping" />
              <span>Real-Time Examination Control Desk</span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">
              Live Examination Hall Monitoring & Attendance Desk
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live status across all examination halls, real-time candidate attendance tracking, invigilator presence, and emergency alerts.
            </p>
          </div>

          <div className="flex items-center space-x-4 bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">SYSTEM CLOCK</span>
              <span className="text-lg font-mono font-bold text-indigo-300">{currentTime}</span>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div className="text-left">
              <span className="text-[10px] text-emerald-400 block font-bold flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span>ACTIVE SESSION</span>
              </span>
              <span className="text-xs font-bold text-white">
                {selectedExam.session} • {selectedExam.timeSlot}
              </span>
            </div>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[11px]">Total Active Halls</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{activeRooms.length} Halls</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[11px]">Total Seated</span>
            <span className="text-xl font-bold text-indigo-400 mt-0.5 block">{totalAllocated} Students</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[11px]">Present Marked</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 block">{presentCount}</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[11px]">Absentees</span>
            <span className="text-xl font-bold text-rose-400 mt-0.5 block">{absentCount}</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[11px]">Invigilators Deployed</span>
            <span className="text-xl font-bold text-white mt-0.5 block">
              {currentExamDuties.length} Faculty
            </span>
          </div>
        </div>
      </div>

      {/* Emergency Notifications Ticker */}
      {notifications.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-bold">Latest Alert:</span>
            <span>{notifications[0].title} — {notifications[0].message}</span>
          </div>
          <button
            onClick={onNavigateToAlteration}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] whitespace-nowrap ml-2"
          >
            Review Alterations
          </button>
        </div>
      )}

      {/* Real-time Hall Monitor Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Examination Hall Live Stations</span>
          </h2>
          <span className="text-xs text-slate-500">
            Click on any hall station to record live attendance or view seating.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeRooms.map((room) => {
            const hallSeats = allocatedSeats.filter((s) => s.roomId === room.id);
            const invigilator = currentExamDuties.find((d) => d.roomId === room.id);
            const present = hallSeats.filter((s) => s.status === 'Present').length;
            const absent = hallSeats.filter((s) => s.status === 'Absent').length;
            const util = room.totalCapacity > 0 ? Math.round((hallSeats.length / room.totalCapacity) * 100) : 0;

            return (
              <div
                key={room.id}
                id={`live-hall-${room.id}`}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition-shadow space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-lg text-slate-900">
                        {room.roomNumber}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {room.block}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Floor: {room.floor} • Capacity: {room.totalCapacity}
                    </p>
                  </div>

                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                    {util}% Filled
                  </span>
                </div>

                {/* Invigilator Info */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Invigilator on Duty:</span>
                    <span className="font-bold text-slate-800">
                      {invigilator ? invigilator.facultyName : 'Standby Assignment'}
                    </span>
                  </div>
                  {invigilator && (
                    <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-600">
                      {invigilator.facultyDept}
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span>Candidates Seated: {hallSeats.length}</span>
                    <span>
                      P: <strong className="text-emerald-600">{present}</strong> | A:{' '}
                      <strong className="text-rose-600">{absent}</strong>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${(present / Math.max(1, hallSeats.length)) * 100}%` }}
                    />
                    <div
                      className="bg-rose-500 h-full transition-all"
                      style={{ width: `${(absent / Math.max(1, hallSeats.length)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs font-semibold">
                  <button
                    id={`open-attendance-${room.id}`}
                    onClick={() => setActiveHallForAttendance(room)}
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-center shadow-xs transition-colors flex items-center justify-center space-x-1"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Mark Attendance</span>
                  </button>

                  <button
                    id={`view-seating-hall-${room.id}`}
                    onClick={() => onNavigateToSeating(room.id)}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl transition-colors"
                    title="Open Visual Seating Layout"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Attendance Marking Sheet Modal */}
      {activeHallForAttendance && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Live Attendance Logger — Hall {activeHallForAttendance.roomNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Mark Present, Absent, or Malpractice in real-time.
                </p>
              </div>
              <button
                onClick={() => setActiveHallForAttendance(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl text-xs">
              <span className="font-semibold text-slate-700">
                Total Candidates: {allocatedSeats.filter((s) => s.roomId === activeHallForAttendance.id).length}
              </span>
              <button
                onClick={() => handleMarkAllPresentInHall(activeHallForAttendance.id)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs text-xs"
              >
                ✓ Mark All Remaining as Present
              </button>
            </div>

            {/* Candidates Attendance List */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 text-xs">
              {allocatedSeats
                .filter((s) => s.roomId === activeHallForAttendance.id)
                .map((seat) => (
                  <div key={seat.seatId} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-800">
                          {seat.student.registerNumber}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {seat.student.name}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold">
                          {seat.student.department}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Desk {seat.deskNumber} ({seat.slotPosition}) • {seat.student.subjectCode}
                      </span>
                    </div>

                    {/* Attendance State Pills */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleToggleAttendance(seat.seatId, 'Present')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          seat.status === 'Present'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Present
                      </button>

                      <button
                        onClick={() => handleToggleAttendance(seat.seatId, 'Absent')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          seat.status === 'Absent'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Absent
                      </button>

                      <button
                        onClick={() => handleToggleAttendance(seat.seatId, 'Malpractice')}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          seat.status === 'Malpractice'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                        title="Flag Malpractice Record"
                      >
                        Flag
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setActiveHallForAttendance(null)}
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
