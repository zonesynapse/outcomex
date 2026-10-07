import React, { useState } from "react";
import { X, CheckCircle2, FileWarning, Printer, Ban, Loader2, AlertCircle, Check } from "lucide-react";
import { formatDepartmentDisplay } from "../lib/utils";

const PROBLEM_CATEGORIES = [
  {
    id: "script_missing",
    title: "1. Script Missing",
    description: "The photocopy of the answer script has not been received at all for the requested subject(s)."
  },
  {
    id: "pages_missing",
    title: "2. Page(s) Missing",
    description: "One or more pages are missing in the received photocopy of the answer script (e.g., skipped pages, incomplete scanning)."
  },
  {
    id: "wrong_script",
    title: "3. Wrong Answer Script",
    description: "The photocopy received does not belong to the student (i.e., contains another student's answers or incorrect register number/subject)."
  },
  {
    id: "other",
    title: "4. Other (Provide detailed description of the issue clearly)",
    description: "Any issue not covered under the listed categories. The student must clearly describe the problem in detail (e.g., mixed pages, improper sequencing, duplicate pages, etc.)."
  },
  {
    id: "question_not_valued",
    title: "5. Question Not Valued",
    description: "One or more answers written by the student have not been evaluated (no marks awarded or left blank without correction/remarks)."
  },
  {
    id: "total_mistake",
    title: "6. Total Mistake",
    description: "Error in totalling of marks on the answer script (e.g., incorrect addition of marks leading to wrong total)."
  },
  {
    id: "content_not_clear",
    title: "7. Photocopy Content Not Clear",
    description: "The photocopy is unclear, blurred, faint, cut off, or unreadable, making it difficult to verify answers or marks."
  },
  {
    id: "grade_mismatch",
    title: "8. Result / Grade Mismatch",
    description: "Mismatch between the marks/grade shown in the result and the marks visible in the answer script photocopy."
  }
];

export default function PhotocopyProblemModal({
  open,
  app,
  onClose,
  isHod = false,
  isExamCell = false,
  onMoveToExamCell,
  onRevoke
}) {
  const [processing, setProcessing] = useState(false);

  if (!open || !app) return null;

  const selectedProblems = app.selectedProblems || [];
  const subjects = app.subjects || [];

  const handlePrint = () => {
    window.print();
  };

  const statusColor = (st) => {
    switch (st) {
      case 'Moved to Exam Cell':
      case 'Recommended to Exam Cell':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Revoked by HOD':
      case 'Revoked by Exam Cell':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Submitted to HOD':
      default:
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/75 z-[220] flex items-center justify-center p-2 md:p-4 overflow-y-auto backdrop-blur-sm print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:w-full print:rounded-none">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-900 px-6 py-4 flex items-center justify-between text-white shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileWarning size={22} className="text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Photocopy Problem Discrepancy Application</h3>
              <p className="text-xs text-blue-200">Candidate: {app.studentName} ({app.regNo || app.admissionNo})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Printable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 print:p-4 print:overflow-visible">
          
          {/* Banner Title */}
          <div className="border-b-2 border-slate-900 pb-4 text-center">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-wide">
              ANNA UNIVERSITY / CONTROLLER OF EXAMINATIONS
            </h2>
            <h3 className="text-base font-bold text-[#120c7a] uppercase mt-1">
              Answer Script Photocopy Discrepancy Representation Form
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ref No: <span className="font-mono font-bold text-slate-800">{app.id}</span> | Date: {new Date(app.createdAt?.seconds ? app.createdAt.seconds * 1000 : app.createdAt || Date.now()).toLocaleDateString('en-IN')}
            </p>
          </div>

          {/* Revoke Banner if applicable */}
          {app.revokeReason && (app.status === 'Revoked by HOD' || app.status === 'Revoked by Exam Cell') && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex items-start gap-3 print:hidden">
              <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-rose-900 text-sm">Application Revoked ({app.status})</h4>
                <p className="text-xs font-semibold text-rose-800 mt-0.5">Reason: {app.revokeReason}</p>
              </div>
            </div>
          )}

          {/* Candidate Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Student Name</span>
              <span className="font-bold text-slate-900 text-sm">{app.studentName || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Register / Adm No</span>
              <span className="font-mono font-bold text-[#120c7a] text-sm">{app.regNo || app.admissionNo || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Department</span>
              <span className="font-semibold text-slate-800">{formatDepartmentDisplay(app.department) || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Batch & Year</span>
              <span className="font-semibold text-slate-800">{app.batch || '—'} ({app.academicYear || ''})</span>
            </div>
          </div>

          {/* Subject(s) & Per-Subject Discrepancy Category Checklists */}
          <div className="space-y-6">
            <h4 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
              <span className="w-2 h-2 rounded-full bg-[#120c7a]"></span>
              Subject Discrepancy Reports ({subjects.length} Subject{subjects.length > 1 ? 's' : ''})
            </h4>

            {subjects.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-xl">
                No subject specified
              </div>
            ) : (
              subjects.map((s, idx) => {
                const subjProblems = Array.isArray(s.selectedProblems) && s.selectedProblems.length > 0
                  ? s.selectedProblems
                  : selectedProblems;
                return (
                  <div key={idx} className="border-2 border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    
                    {/* Subject Header & Info */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-[#120c7a] text-white font-bold text-[11px]">
                          #{idx + 1}
                        </span>
                        <span className="font-mono font-bold text-[#120c7a] text-sm">{s.subjectCode || s.code}</span>
                        <span className="text-slate-400">|</span>
                        <span className="font-bold text-slate-800">{s.subjectTitle || s.title || s.name || '—'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-600 font-semibold">
                        <span>Sem: <strong className="text-slate-900">{s.semesterNo || s.sem || '—'}</strong></span>
                        <span>Exam: <strong className="text-slate-900">{s.examName || 'End Semester Exam'}</strong></span>
                      </div>
                    </div>

                    {/* Per-Subject Discrepancy Category Checklist */}
                    <div>
                      <h5 className="font-bold text-[11px] text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Discrepancy Category Checklist for {s.subjectCode || `Subject #${idx+1}`} ({subjProblems.length} Selected)
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {PROBLEM_CATEGORIES.map((cat) => {
                          const isChecked = subjProblems.includes(cat.id) || subjProblems.includes(cat.title);
                          return (
                            <div
                              key={cat.id}
                              className={`p-2.5 rounded-xl border text-[11px] transition-all ${
                                isChecked
                                  ? 'bg-amber-50 border-amber-300 text-slate-900 font-medium shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-400 opacity-60'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  isChecked ? 'bg-amber-500 border-amber-600 text-white' : 'border-slate-300 bg-white'
                                }`}>
                                  {isChecked && <Check size={10} strokeWidth={3} />}
                                </div>
                                <div>
                                  <p className={`font-bold leading-tight ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>{cat.title}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{cat.description}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Per-Subject Explanation */}
                    {s.detailedDescription && (
                      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 text-xs">
                        <span className="font-bold text-amber-950 uppercase text-[10px] tracking-wider block mb-0.5">
                          Detailed Description for {s.subjectCode}:
                        </span>
                        <p className="text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                          {s.detailedDescription}
                        </p>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>

          {/* Top-Level Detailed Description Fallback */}
          {app.detailedDescription && !subjects.some(s => s.detailedDescription) && (
            <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 text-xs">
              <h5 className="font-bold text-amber-900 uppercase text-[10px] tracking-wider mb-1">
                Student Detailed Explanation / Remarks
              </h5>
              <p className="text-slate-800 whitespace-pre-wrap font-medium leading-relaxed">
                {app.detailedDescription}
              </p>
            </div>
          )}

          {/* Status & Approvals Section */}
          <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 uppercase">Application Status:</span>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${statusColor(app.status)}`}>
                {app.status || 'Submitted to HOD'}
              </span>
            </div>
            
            {/* Signature Box */}
            <div className="flex gap-8 text-center text-[11px]">
              <div>
                <div className="h-10 border-b border-slate-300 flex items-end justify-center pb-1">
                  <span className="font-mono text-slate-700 italic font-semibold">{app.studentName}</span>
                </div>
                <span className="text-slate-400 font-bold mt-1 block">Candidate Signature</span>
              </div>
              <div>
                <div className="h-10 border-b border-slate-300 flex items-end justify-center pb-1">
                  {app.status === 'Moved to Exam Cell' || app.status === 'Recommended to Exam Cell' ? (
                    <span className="font-mono text-emerald-700 font-bold">Verified & Recommended</span>
                  ) : (
                    <span className="text-slate-300 italic">Pending</span>
                  )}
                </div>
                <span className="text-slate-400 font-bold mt-1 block">HOD Signature / Seal</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl text-xs hover:bg-slate-300 transition-all flex items-center gap-2"
          >
            <Printer size={16} /> Print Application
          </button>

          <div className="flex items-center gap-2">
            {isHod && (app.status === 'Submitted to HOD' || app.status === 'Applied') && (
              <>
                <button
                  onClick={() => onRevoke && onRevoke(app)}
                  disabled={processing}
                  className="px-4 py-2 bg-rose-100 text-rose-800 hover:bg-rose-200 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
                >
                  <Ban size={15} /> Revoke
                </button>
                <button
                  onClick={async () => {
                    setProcessing(true);
                    await onMoveToExamCell && onMoveToExamCell(app);
                    setProcessing(false);
                  }}
                  disabled={processing}
                  className="px-5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Move to Exam Cell
                </button>
              </>
            )}

            {isExamCell && (
              <button
                onClick={() => onRevoke && onRevoke(app)}
                disabled={processing}
                className="px-4 py-2 bg-rose-100 text-rose-800 hover:bg-rose-200 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
              >
                <Ban size={15} /> Revoke
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-all"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
