import React, { useState } from "react";
import {
  X,
  GraduationCap,
  BookOpen,
  IndianRupee,
  Clock,
  AlertTriangle,
  Wrench,
} from "lucide-react";
import { formatDepartmentDisplay } from "../lib/utils";
import DepartmentExamFeeDueReport from "./DepartmentExamFeeDueReport";

// ══════════════════════════════════════════════════════════════════
// ACADEMICS FEE DUE SUB-VIEW (UNDER MAINTENANCE)
// ══════════════════════════════════════════════════════════════════
function DepartmentAcademicFeeDueReport({
  department = "",
  userRole = "HOD",
}) {
  return (
    <div className="min-h-[460px] flex items-center justify-center p-6 sm:p-12 bg-slate-50/50">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 text-center shadow-xl shadow-slate-100 flex flex-col items-center relative overflow-hidden">
        {/* Accent top gradient stripe */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500" />

        {/* Maintenance Icon */}
        <div className="relative mb-5 mt-2">
          <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
            <Wrench size={38} className="text-amber-600" />
          </div>
          <span className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm">
            Update
          </span>
        </div>

        {/* Maintenance Pill Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-black uppercase tracking-wider mb-3">
          <AlertTriangle size={13} className="text-amber-600" />
          <span>Under Maintenance</span>
        </div>

        {/* Title */}
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
          Academics Fee Due Portal
        </h3>

        {/* Description */}
        <p className="text-sm font-semibold text-slate-500 leading-relaxed max-w-sm mb-6">
          The Academic & Tuition Fee Due module is currently undergoing maintenance. This section will be activated in an upcoming update.
        </p>

        {/* Status card */}
        <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-600" />
            <span>Module Status</span>
          </div>
          <span className="text-amber-700 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 font-extrabold uppercase text-[11px] tracking-wide">
            Under Maintenance
          </span>
        </div>

        {department && (
          <p className="text-[11px] font-bold text-slate-400 mt-4">
            Department: {formatDepartmentDisplay(department)}
          </p>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN DEPARTMENT FEE DUE POPUP MODAL (Requested by User)
// ══════════════════════════════════════════════════════════════════
export default function DepartmentFeeDueModal({
  isOpen,
  onClose,
  department = "",
  programme = "UG",
  userRole = "HOD",
  userName = "",
}) {
  // 2 options: "exam_fee_due" and "academics_fee_due"
  const [activeTab, setActiveTab] = useState("exam_fee_due");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-7xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header Bar */}
        <div className="bg-gradient-to-r from-[#120c7a] via-indigo-900 to-slate-900 px-6 py-4.5 flex items-center justify-between gap-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-amber-300">
              <IndianRupee size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-base md:text-lg tracking-tight">
                  Department Fee Dues & Collections Portal
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-black uppercase">
                  {userRole} Portal
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] font-extrabold uppercase">
                  Live Firestore Sync
                </span>
              </div>
              <p className="text-xs text-blue-200 font-medium">
                {department ? formatDepartmentDisplay(department) : "Department-level"} &bull; Unified audit tracking for Exam Fee Dues and Academic Fee Dues.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
            title="Close Popup"
          >
            <X size={20} />
          </button>
        </div>

        {/* The 2 Tabs Requested by User: "Exam Fee Due" & "Academics Fee Due" */}
        <div className="bg-slate-100/90 px-6 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            {/* Tab 1: Exam Fee Due */}
            <button
              type="button"
              onClick={() => setActiveTab("exam_fee_due")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === "exam_fee_due"
                  ? "bg-[#120c7a] text-white shadow-md shadow-indigo-950/20 scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <GraduationCap size={16} className={activeTab === "exam_fee_due" ? "text-amber-300" : "text-indigo-600"} />
              <span>Exam Fee Due</span>
              <span
                className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  activeTab === "exam_fee_due" ? "bg-white/20 text-amber-200" : "bg-slate-200 text-slate-700"
                }`}
              >
                ESE Exams
              </span>
            </button>

            {/* Tab 2: Academics Fee Due */}
            <button
              type="button"
              onClick={() => setActiveTab("academics_fee_due")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === "academics_fee_due"
                  ? "bg-[#120c7a] text-white shadow-md shadow-indigo-950/20 scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <BookOpen size={16} className={activeTab === "academics_fee_due" ? "text-amber-300" : "text-indigo-600"} />
              <span>Academics Fee Due</span>
              <span
                className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  activeTab === "academics_fee_due" ? "bg-amber-400 text-slate-950 font-black" : "bg-amber-100 text-amber-800"
                }`}
              >
                Under Maintenance
              </span>
            </button>
          </div>

          <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
            <span>Viewing:</span>
            <span className="text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-extrabold">
              {activeTab === "exam_fee_due" ? "End Semester Examination (ESE) Dues" : "Academics Fee Due (Under Maintenance)"}
            </span>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {activeTab === "exam_fee_due" ? (
            <DepartmentExamFeeDueReport
              department={department}
              programme={programme}
              userRole={userRole}
              userName={userName}
              isModal={true}
            />
          ) : (
            <DepartmentAcademicFeeDueReport
              department={department}
              programme={programme}
              userRole={userRole}
              userName={userName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
