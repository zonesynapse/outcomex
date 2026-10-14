import React, { useRef } from "react";
import { Printer, X, ShieldCheck, Download, ExternalLink, Calendar, BookOpen, Layers } from "lucide-react";

/**
 * Reusable Appointment Order Copy Modal matching the official CKCET COE Autonomous format.
 */
export default function AppointmentOrderCopyModal({ assignment, onClose }) {
  const printRef = useRef(null);

  if (!assignment) return null;

  const setterName = assignment.setterName || "External Setter";
  const examSession = assignment.examSession || "Nov./Dec. 2026";
  const numSets = Number(assignment.numSets) || 1;
  const deadline = assignment.submissionDeadline
    ? (new Date(assignment.submissionDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))
    : "Within 10 Days";

  const degree = assignment.degree || (assignment.programme?.includes("M.E.") ? "M.E." : assignment.programme?.includes("MBA") ? "MBA" : "B.E.");
  const programme = assignment.programme || assignment.department || "Engineering";
  const regulation = assignment.regulation || "AU - R2021";
  const semester = assignment.semester || "III";
  const duration = assignment.duration || assignment.submittedPaper?.duration || "3 Hrs";
  const maxMarks = assignment.maxMarks || assignment.submittedPaper?.maxMarks || 100;
  const subjectCode = assignment.subjectCode || "—";
  const subjectTitle = assignment.subjectTitle || "—";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col my-auto max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:rounded-none">

        {/* Top Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-black tracking-wide">Official Appointment Order</h3>
              <p className="text-[11px] text-slate-300 font-semibold">
                Autonomous Theory Examinations • {examSession}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div ref={printRef} className="overflow-y-auto p-6 sm:p-10 text-slate-900 bg-white space-y-6 print:p-6 print:overflow-visible font-sans">

          {/* Institutional Header Banner */}
          <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between gap-4">
            <div className="h-20 sm:h-24 shrink-0 flex items-center">
              <img
                src="/logo.png"
                alt="CKCET Logo Banner"
                className="h-full w-auto max-w-[340px] sm:max-w-[460px] object-contain"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
            <div className="text-right text-slate-700 space-y-0.5">
              <span className="text-[10px] sm:text-xs font-black uppercase text-[#120c7a] block tracking-wider">
                Office of the Controller of Examinations
              </span>
              <span className="text-[9px] sm:text-[11px] text-slate-500 block font-semibold">
                Jayaram Nagar, Chellangkuppam, Cuddalore - 607 003
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-500 block">
                Approved by AICTE, Affiliated to Anna University, Accredited by NAAC 'A'
              </span>
            </div>
          </div>

          {/* Salutation */}
          <div className="space-y-1 pt-2">
            <p className="text-sm sm:text-base font-bold text-slate-900">
              Dear Prof. <span className="underline font-extrabold text-[#120c7a]">{setterName}</span>
            </p>
            <p className="text-xs sm:text-sm font-semibold text-slate-800">
              Good Day!
            </p>
          </div>

          {/* Greetings & Subject */}
          <div className="space-y-2">
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              Greetings from C.K. College of Engineering & Technology, Cuddalore!
            </p>
            <p className="text-xs sm:text-sm font-extrabold text-[#120c7a] leading-relaxed">
              Sub: End Semester Examinations – {examSession} – Appointment of Question Paper Setter & Digital QP Setting Portal – Reg.
            </p>
          </div>

          {/* Introduction Paragraph */}
          <p className="text-xs sm:text-[13px] leading-relaxed text-slate-800 text-justify">
            I am, by direction, to inform you that you have been appointed as a <strong>Question Paper Setter</strong> for the <strong>End Semester Theory Examinations to be held in {examSession}</strong>, under the Autonomous Scheme of <strong>C.K. College of Engineering & Technology</strong>, for the subject mentioned below. You are requested to kindly set the question paper as per the prescribed format, syllabus, regulations and examination requirements.
          </p>

          <p className="text-xs sm:text-[13px] font-bold text-slate-900">
            The details of the question paper assignment are as follows:
          </p>

          {/* Table 1: Question Paper Details */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#120c7a]">
              Question Paper Details
            </h4>
            <div className="overflow-x-auto border border-slate-800">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-extrabold border-b border-slate-800">
                    <th className="p-2 border-r border-slate-800">Degree</th>
                    <th className="p-2 border-r border-slate-800">Programme</th>
                    <th className="p-2 border-r border-slate-800">Regulations</th>
                    <th className="p-2 border-r border-slate-800">Semester</th>
                    <th className="p-2 border-r border-slate-800">Duration</th>
                    <th className="p-2">Max. Marks</th>
                  </tr>
                </thead>
                <tbody className="font-semibold text-slate-800">
                  <tr className="divide-x divide-slate-800">
                    <td className="p-2">{degree}</td>
                    <td className="p-2">{programme}</td>
                    <td className="p-2">{regulation}</td>
                    <td className="p-2">{semester}</td>
                    <td className="p-2 font-bold">{duration}</td>
                    <td className="p-2 font-bold">{maxMarks}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Subject Details */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#120c7a]">
              Subject Details
            </h4>
            <div className="overflow-x-auto border border-slate-800">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-extrabold border-b border-slate-800">
                    <th className="p-2 border-r border-slate-800">Subject Code</th>
                    <th className="p-2 border-r border-slate-800">Subject Name</th>
                    <th className="p-2 border-r border-slate-800">No. of Question Papers</th>
                    <th className="p-2">Last Date for Submission</th>
                  </tr>
                </thead>
                <tbody className="font-semibold text-slate-800">
                  <tr className="divide-x divide-slate-800">
                    <td className="p-2 font-mono font-bold text-[#120c7a]">{subjectCode}</td>
                    <td className="p-2 text-left font-bold">{subjectTitle}</td>
                    <td className="p-2">
                      <span className="inline-block px-2 py-0.5 rounded font-black text-xs bg-amber-100 text-amber-950">
                        {numSets} {numSets === 2 ? "(Set A & Set B)" : "(Set A)"}
                      </span>
                    </td>
                    <td className="p-2 font-bold text-rose-700">{deadline}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Instructions and Guidelines */}
          <div className="space-y-2.5 text-xs sm:text-[13px] leading-relaxed text-slate-800 text-justify">
            <p>
              A copy of the <strong>syllabus, question paper pattern and necessary instructions</strong> will also be available through the portal for your reference. The question paper shall be submitted <strong>only through the Digital QP Setting Portal</strong> on or before <strong className="underline text-[#120c7a]">{deadline}</strong>.
            </p>

            <p>
              If any of your <strong>relatives are appearing for the above examination</strong>, you are requested to kindly <strong>decline the assignment</strong> and inform the Controller of Examinations immediately.
            </p>

            <p className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 font-medium">
              The remuneration for setting <strong>two Question Papers (Set A & Set B) is Rs. 3,000/-</strong>, while the remuneration for setting <strong>a single Question Paper (either Set A or Set B) is Rs. 2,000/-</strong>.
            </p>

            <p>
              The appointment, login credentials, question paper contents and all related information shall be treated as <strong>STRICLY CONFIDENTIAL</strong>.
            </p>

            <p>
              We sincerely appreciate your valuable academic contribution and look forward to your <strong>cooperation and timely submission</strong> of the question paper through the new digital platform.
            </p>
          </div>

          {/* Signature Block */}
          <div className="pt-6 border-t border-slate-200 flex items-end justify-between text-xs sm:text-sm">
            <div>
              <p className="font-semibold text-slate-600">With regards,</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="font-extrabold text-slate-900 text-sm sm:text-base">Dr. N. Kamalakannan</p>
              <p className="font-bold text-[#120c7a]">Controller of Examinations</p>
              <p className="text-xs text-slate-600">C.K. College of Engineering & Technology</p>
              <p className="text-xs text-slate-600">Cuddalore – 607 003</p>
              <p className="text-xs font-bold text-slate-800">Contact: 94884 93434</p>
            </div>
          </div>

        </div>

        {/* Modal Footer (Hidden in Print) */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-zinc-200 flex items-center justify-between text-xs text-slate-500 font-semibold print:hidden">
          <span>Official Autonomous Examination Wing • CKCET</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
