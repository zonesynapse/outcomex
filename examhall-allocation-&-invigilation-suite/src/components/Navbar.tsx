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
import { ExamSchedule, NotificationLog } from '../types';

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
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  ExamHall OS
                </span>
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Internal Exam Cell
                </span>
              </div>
              <p className="text-xs text-slate-400 font-normal">
                Seat Grid Allocation & Real-time Invigilation Suite
              </p>
            </div>
          </div>

          {/* Center Exam Selector */}
          <div className="hidden lg:flex items-center space-x-3 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <select
              id="exam-selector-select"
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              aria-label="Select examination session"
              className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-2"
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id} className="bg-slate-800 text-white">
                  {exam.name} ({exam.date} - {exam.session})
                </option>
              ))}
            </select>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center space-x-1 text-xs text-indigo-300">
              <Clock className="w-3.5 h-3.5" />
              <span>{selectedExam?.timeSlot}</span>
            </div>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center space-x-2.5">
            {/* Quick Student Finder */}
            <button
              id="quick-student-lookup-btn"
              onClick={onOpenStudentLookup}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors"
              title="Search Student Roll No for Hall & Desk"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Find Student</span>
            </button>

            {/* Notification Bell */}
            <button
              id="notifications-toggle-btn"
              onClick={onOpenNotifications}
              aria-label="View system notifications"
              className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="System Alerts & Alteration Logs"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifs > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 border-t border-slate-800/80 overflow-x-auto py-1 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white text-indigo-700' : 'bg-rose-500 text-white'
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
    </header>
  );
};
