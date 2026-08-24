import React from 'react';
import { 
  Building2, 
  Grid3X3, 
  UserCheck, 
  RefreshCw, 
  Printer, 
  Activity, 
  Search, 
  Bell, 
  ShieldCheck,
  Calendar,
  Clock
} from 'lucide-react';
import { ExamSchedule, NotificationLog } from '../../../types';

interface NavbarProps {
  activeTab: 'rooms' | 'seating' | 'duty' | 'alteration' | 'reports' | 'live';
  setActiveTab: (tab: 'rooms' | 'seating' | 'duty' | 'alteration' | 'reports' | 'live') => void;
  exams: ExamSchedule[];
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
  pendingAlterationsCount: number;
  onOpenStudentLookup: () => void;
  notifications: NotificationLog[];
  onOpenNotifications: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  exams,
  selectedExamId,
  setSelectedExamId,
  pendingAlterationsCount,
  onOpenStudentLookup,
  notifications,
  onOpenNotifications,
}) => {
  const selectedExam = exams.find((e) => e.id === selectedExamId) || exams[0];
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  interface NavItem {
    id: 'rooms' | 'seating' | 'duty' | 'alteration' | 'reports' | 'live';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const navItems: NavItem[] = [
    { id: 'seating', label: 'Seat Allocation', icon: Grid3X3 },
    { id: 'rooms', label: 'Room Master', icon: Building2 },
    { id: 'duty', label: 'Faculty Duty', icon: UserCheck },
    { 
      id: 'alteration', 
      label: 'Duty Alterations', 
      icon: RefreshCw, 
      badge: pendingAlterationsCount > 0 ? pendingAlterationsCount : undefined 
    },
    { id: 'reports', label: 'Printable Reports', icon: Printer },
    { id: 'live', label: 'Exam Control Desk', icon: Activity },
  ];

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 md:p-5 mb-6 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
        {/* Module Sub-Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#120c7a] flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-base text-zinc-900 tracking-tight">
                ExamHall Allocation Suite
              </span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-[#120c7a] border border-blue-200">
                Internal Exam Cell
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium">
              Continuous Internal Assessment & Hall Invigilation Sub-System
            </p>
          </div>
        </div>

        {/* Center Exam Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200">
            <Calendar className="w-4 h-4 text-[#120c7a]" />
            <select
              id="exam-selector-select"
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              aria-label="Select examination session"
              className="bg-transparent text-xs font-bold text-zinc-800 focus:outline-none cursor-pointer pr-2"
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id} className="bg-white text-zinc-800">
                  {exam.name} ({exam.date} - {exam.session})
                </option>
              ))}
            </select>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex items-center space-x-1 text-xs text-[#120c7a] font-bold">
              <Clock className="w-3.5 h-3.5" />
              <span>{selectedExam?.timeSlot}</span>
            </div>
          </div>

          {/* Tools */}
          <div className="flex items-center space-x-2">
            <button
              id="quick-student-lookup-btn"
              onClick={onOpenStudentLookup}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#120c7a] border border-blue-200 text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Search Student Roll No for Hall & Desk"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Find Student</span>
            </button>

            <button
              id="notifications-toggle-btn"
              onClick={onOpenNotifications}
              aria-label="View system notifications"
              className="relative p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all cursor-pointer border border-zinc-200"
              title="System Alerts & Alteration Logs"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation Buttons */}
      <nav className="flex space-x-2 overflow-x-auto pt-3 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-extrabold rounded-xl whitespace-nowrap transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#120c7a] text-white shadow-md'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 border border-zinc-200/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500'}`} />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white text-[#120c7a]' : 'bg-rose-500 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
