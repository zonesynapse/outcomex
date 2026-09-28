import React, { useState, useEffect } from "react";
import { X, CheckCircle2, FileText, Check, ShieldCheck, Printer, Ban, Loader2 } from "lucide-react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, onSnapshot } from "firebase/firestore";

const formatDepartment = (dept, programme) => {
  let raw = (dept || '').trim();
  if (!raw && programme) raw = programme.trim();
  if (!raw) return '—';

  raw = raw
    .replace(/\bB_E_\b/gi, 'B.E.')
    .replace(/\bB_Tech_\b/gi, 'B.Tech.')
    .replace(/\bM_E_\b/gi, 'M.E.')
    .replace(/\bM_Tech_\b/gi, 'M.Tech.')
    .replace(/\bM_B_A_\b/gi, 'M.B.A.')
    .replace(/\bM_C_A_\b/gi, 'M.C.A.')
    .replace(/\bPh_D_\b/gi, 'Ph.D.');

  raw = raw.replace(/([A-Za-z])_([A-Za-z])/g, '$1.$2.');
  raw = raw.replace(/_/g, ' ');
  return raw.replace(/\s+/g, ' ').trim();
};

const formatDisplayDate = (dateVal) => {
  if (!dateVal) return new Date().toLocaleDateString('en-IN');
  if (typeof dateVal === 'object' && dateVal.toDate) {
    return dateVal.toDate().toLocaleDateString('en-IN');
  }
  if (typeof dateVal === 'object' && dateVal.seconds) {
    return new Date(dateVal.seconds * 1000).toLocaleDateString('en-IN');
  }
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? String(dateVal) : d.toLocaleDateString('en-IN');
};

const formatDueDate = (dateVal) => {
  if (!dateVal) return '30.09.2026';
  if (typeof dateVal === 'string' && dateVal.includes('-')) {
    const parts = dateVal.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
  }
  return formatDisplayDate(dateVal);
};

const getSubjectDetails = (r) => {
  if (!r) {
    return { sem: '', code: '', title: '', grade: '', result: '' };
  }
  let sem = r.semesterNo || r.sem || '';
  let code = (r.subjectCode || r.code || '').trim();
  let title = (r.subjectTitle || r.title || r.name || '').trim();
  let grade = r.grade || '';
  let result = r.result || '';

  if (code && !title) {
    const spaceIdx = code.indexOf(' ');
    if (spaceIdx > 0) {
      title = code.substring(spaceIdx + 1).trim();
      code = code.substring(0, spaceIdx).trim();
    }
  }

  return { sem, code, title, grade, result };
};

export default function AnnaUniversityPhotocopyModal({
  app,
  onClose,
  onRecommend,
  onUpdateStatus,
  isHod = false,
  isExamCell = false,
  hodSignatureUrl,
  processing = false,
}) {
  const [fetchedHodSigUrl, setFetchedHodSigUrl] = useState('');

  useEffect(() => {
    if (app?.hodSignatureUrl) {
      setFetchedHodSigUrl(app.hodSignatureUrl);
      return;
    }
    if (hodSignatureUrl) {
      setFetchedHodSigUrl(hodSignatureUrl);
      return;
    }

    if (app?.status === 'Recommended by HOD' || app?.hodSignature) {
      let isMounted = true;
      const fetchSig = async () => {
        try {
          if (app.hodRecommendedBy) {
            const q = query(collection(db, 'users'), where('email', '==', app.hodRecommendedBy));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const uData = snap.docs[0].data();
              if (uData.signatureUrl && isMounted) {
                setFetchedHodSigUrl(uData.signatureUrl);
                return;
              }
            }
          }
          if (app.department) {
            const q = query(collection(db, 'users'), where('department', '==', app.department));
            const snap = await getDocs(q);
            const hodUser = snap.docs.find(d => {
              const role = (d.data().role || '').toUpperCase();
              return role === 'HOD' && d.data().signatureUrl;
            });
            if (hodUser && isMounted) {
              setFetchedHodSigUrl(hodUser.data().signatureUrl);
              return;
            }
          }
          const qAll = query(collection(db, 'users'));
          const snapAll = await getDocs(qAll);
          const matchUser = snapAll.docs.find(d => {
            const ud = d.data();
            const role = (ud.role || '').toUpperCase();
            return ud.signatureUrl && (
              role === 'HOD' ||
              (ud.displayName && app.hodSignature && ud.displayName.toLowerCase().includes(app.hodSignature.toLowerCase()))
            );
          });
          if (matchUser && isMounted) {
            setFetchedHodSigUrl(matchUser.data().signatureUrl);
          }
        } catch (err) {
          console.error("Error fetching fallback HOD signature:", err);
        }
      };
      fetchSig();
      return () => { isMounted = false; };
    }
  }, [app, hodSignatureUrl]);

  const [photocopyConfig, setPhotocopyConfig] = useState({ feePerSubject: 350, toDate: '2026-09-30' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "exam_cell_settings", "photocopy"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setPhotocopyConfig({
          feePerSubject: d.feePerSubject ?? 350,
          toDate: d.toDate || '2026-09-30',
        });
      }
    });
    return () => unsub();
  }, []);

  const dynamicFee = app?.feePerSubject || photocopyConfig.feePerSubject || 350;
  const dynamicDueDate = formatDueDate(photocopyConfig.toDate);

  const finalHodSigUrl = app?.hodSignatureUrl || hodSignatureUrl || fetchedHodSigUrl;

  const subjects = Array.isArray(app.subjects) ? app.subjects : [];
  const rowsToRender = Array.from({ length: Math.max(5, subjects.length) }, (_, i) => subjects[i] || null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200 printable-modal-overlay">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 3mm 5mm 3mm 5mm;
          }
          html, body {
            height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          .no-print, .no-print * {
            display: none !important;
          }
          .printable-form-area, .printable-form-area * {
            visibility: visible !important;
          }
          .printable-modal-overlay {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100vh !important;
            max-height: 100vh !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            display: block !important;
            z-index: 999999 !important;
          }
          .printable-modal-content {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100vh !important;
            max-height: 100vh !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .printable-form-area {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 100vh !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full my-auto overflow-hidden border border-slate-300 flex flex-col max-h-[92vh] printable-modal-content">
        {/* Top Control Bar */}
        <div className="bg-[#120c7a] px-6 py-3 text-white flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-amber-300" />
            <h3 className="font-extrabold text-sm md:text-base">
              Official End Semester Answer Script Application
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-blue-200 hover:text-white rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Official Form Area */}
        <div className="p-4 md:p-8 overflow-y-auto space-y-4 text-slate-900 font-sans text-xs md:text-sm bg-white print:p-0 printable-form-area">
          {/* Form Header Box */}
          <div className="border-2 border-slate-900 p-3 sm:p-4 print:p-2.5 relative">
            <div className="flex items-center justify-between gap-3 border-b-2 border-slate-900 pb-2 print:pb-1.5">
              {/* College Logo Banner */}
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <img
                  src="/logo.png"
                  alt="CK College of Engineering & Technology"
                  className="max-h-14 md:max-h-16 print:max-h-11 w-auto object-contain mx-auto mb-1"
                />
                <p className="text-[13px] sm:text-[15px] print:text-[12px] font-bold underline tracking-wider uppercase text-slate-900 leading-tight">
                  APPLICATION FOR PHOTOCOPY / REVALUATION
                </p>
                <p className="text-[11px] sm:text-[13px] print:text-[10px] font-bold text-slate-700 uppercase mt-0.5 tracking-wider leading-tight">
                  END SEMESTER EXAMINATIONS - APRIL / MAY - 2026
                </p>
              </div>

              {/* P Badge */}
              <div className="w-12 h-12 md:w-14 md:h-14 print:w-11 print:h-11 border-2 border-slate-900 flex items-center justify-center font-serif text-xl md:text-2xl print:text-xl font-black text-slate-900 shrink-0">
                P
              </div>
            </div>

            {/* Instruction to Candidates */}
            <div className="mt-2.5 print:mt-1.5 space-y-1 print:space-y-0.5">
              <h5 className="text-center font-black text-xs print:text-[11px] underline uppercase tracking-wider text-slate-900">
                INSTRUCTION TO CANDIDATES
              </h5>
              <ol className="list-decimal list-inside text-[10.5px] print:text-[9px] font-medium text-slate-800 space-y-1 print:space-y-0.5 leading-tight px-1">
                <li>Candidates who wish to apply for revaluation must first apply for the photocopy of the answer script by paying a fee of Rs. {dynamicFee}/- per course. Candidates are eligible to apply irrespective of the grade secured in the End Semester Examination.</li>
                <li>The application for the photocopy of the answer script shall be submitted to the Controller of Examinations only through the Institute OBE Portal on or before {dynamicDueDate}.</li>
                <li>Revaluation is not applicable for Practical / Project Courses.</li>
                <li>Incomplete, incorrect, or defective applications will be rejected. The fee once paid will neither be refunded nor adjusted against any other fee or dues payable to the Institution.</li>
                <li>No application will be accepted after the prescribed due date under any circumstances.</li>
              </ol>
            </div>

            {/* Candidate Details Table */}
            <div className="mt-2.5 print:mt-1.5 border-2 border-slate-900 text-xs print:text-[10px]">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b-2 border-slate-900">
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">1.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">Name</td>
                    <td className="p-1.5 print:py-0.5 print:px-1 font-black text-slate-900 uppercase">{app.studentName || '—'}</td>
                  </tr>
                  <tr className="border-b-2 border-slate-900">
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">2.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">Register Number</td>
                    <td className="p-1.5 print:py-0.5 print:px-1 font-black font-mono text-slate-900">{app.regNo || '—'}</td>
                  </tr>
                  <tr className="border-b-2 border-slate-900">
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">3.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">College Code / Name</td>
                    <td className="p-1.5 print:py-0.5 print:px-1 font-bold text-slate-900">4207 - CK COLLEGE OF ENGINEERING AND TECHNOLOGY</td>
                  </tr>
                  <tr className="border-b-2 border-slate-900">
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">4.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">Degree & Branch</td>
                    <td className="p-1.5 print:py-0.5 print:px-1 font-bold text-slate-900">{formatDepartment(app.department, app.programme)}</td>
                  </tr>
                  <tr className="border-b-2 border-slate-900">
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">5.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">Month & Year of Examination</td>
                    <td className="p-1.5 print:py-0.5 print:px-1 font-bold text-slate-900">APR/MAY 2026</td>
                  </tr>
                  <tr className="border-b-2 border-slate-900">
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">6.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">No. of Subjects applied for Revaluation/Photocopy</td>
                    <td className="p-1.5 print:py-0.5 print:px-1 font-black text-slate-900">{app.subjectCount || subjects.length}</td>
                  </tr>
                  <tr>
                    <td className="w-8 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-center">7.</td>
                    <td className="w-56 border-r-2 border-slate-900 p-1.5 print:py-0.5 print:px-1 font-bold text-slate-800">Amount of fee paid to the College</td>
                    <td className="p-1.5 print:py-0.5 print:px-1">
                      <div className="flex flex-col gap-1 print:gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs print:text-[11px] text-slate-900">
                            Rs. {app.feeAmount || 350}/-
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] print:text-[8.5px] font-black text-emerald-800 bg-emerald-100 border border-emerald-400 px-1.5 py-0.5 rounded shadow-sm">
                            ✓ ELECTRONIC PAYMENT BILL ATTACHED
                          </span>
                        </div>
                        <div className="bg-emerald-50/70 border border-emerald-300 rounded p-1.5 print:p-1 text-[9.5px] print:text-[8.5px] text-slate-800 font-mono leading-tight space-y-0.5">
                          <p><span className="font-bold text-slate-900">Receipt No:</span> {app.receiptNo || app.electronicBill?.receiptNo || `REC-EXAM-${app.orderId || 'ONLINE'}`}</p>
                          <p><span className="font-bold text-slate-900">Txn ID:</span> {app.transactionId || app.electronicBill?.transactionId || 'TXN_ONLINE_PAID'}</p>
                          <p><span className="font-bold text-slate-900">Gateway:</span> HDFC SmartGateway (Exam Cell Account #76983)</p>
                          <p><span className="font-bold text-slate-900">Status:</span> <span className="font-bold text-emerald-700 uppercase">PAID & VERIFIED</span> {app.paidAt ? `(${formatDisplayDate(app.paidAt)})` : ''}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Subjects Table */}
            <div className="mt-2.5 print:mt-1.5 border-2 border-slate-900 text-xs print:text-[10px]">
              <p className="p-1.5 print:p-1 font-bold border-b-2 border-slate-900 text-slate-900 bg-slate-50 print:text-[10px]">
                8. Subjects for which revaluation of valued answer scripts required:
              </p>
              <table className="w-full border-collapse text-center">
                <thead>
                  <tr className="border-b-2 border-slate-900 font-bold bg-slate-100 text-slate-900">
                    <th className="w-24 border-r-2 border-slate-900 p-2 print:py-1 print:px-1 text-center">Semester No.</th>
                    <th className="w-36 border-r-2 border-slate-900 p-2 print:py-1 print:px-1 text-center">Subject Code</th>
                    <th className="border-r-2 border-slate-900 p-2 print:py-1 print:px-1 text-left">Subject Title</th>
                    <th className="w-20 border-r-2 border-slate-900 p-2 print:py-1 print:px-1 text-center">Grade</th>
                    <th className="w-20 p-2 print:py-1 print:px-1 text-center">Result</th>
                  </tr>
                </thead>
                <tbody className="font-bold text-slate-900">
                  {rowsToRender.map((r, idx) => {
                    const info = getSubjectDetails(r, idx);
                    return (
                      <tr key={idx} className="h-8 print:h-6 border-b-2 border-slate-900 last:border-b-0">
                        <td className="border-r-2 border-slate-900 p-1 print:py-0.5 print:px-1 text-center font-bold">
                          {info.sem ? `${info.sem}.` : ''}
                        </td>
                        <td className="border-r-2 border-slate-900 p-1 print:py-0.5 print:px-1 text-center font-mono font-bold uppercase">{info.code}</td>
                        <td className="border-r-2 border-slate-900 p-1 print:py-0.5 print:px-1 text-left font-bold uppercase">{info.title}</td>
                        <td className="border-r-2 border-slate-900 p-1 print:py-0.5 print:px-1 text-center font-black text-indigo-900">{info.grade}</td>
                        <td className="p-1 print:py-0.5 print:px-1 text-center font-black">{info.result}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Section 9: HOD Recommendation & Signatures */}
            <div className="mt-2.5 print:mt-1.5 border-2 border-slate-900 p-2.5 print:p-1.5 space-y-2.5 print:space-y-1 text-xs print:text-[10px]">
              <p className="font-bold text-slate-900">9. Recommendations of the HOD:</p>

              <div className="bg-slate-50 border border-slate-300 p-2 print:p-1 rounded text-[10.5px] print:text-[9px] font-semibold text-slate-700">
                {app.status === 'Recommended by HOD' || app.hodSignature ? (
                  <p className="text-emerald-800 font-bold">
                    ✓ Verified subject codes, titles, grades, and fee receipt. Recommended for Photocopy / Revaluation issuance.
                  </p>
                ) : (
                  <p className="text-amber-800 font-semibold italic">
                    Subject details and candidate eligibility pending HOD recommendation...
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 print:gap-3 pt-2 print:pt-1">
                {/* HOD Signature Box */}
                <div className="border border-slate-300 p-2 print:p-1 rounded relative text-center space-y-1 print:space-y-0.5">
                  <span className="font-bold block text-slate-800">Signature of the HOD</span>
                  {app.status === 'Recommended by HOD' || app.hodSignature || finalHodSigUrl || (isHod && hodSignatureUrl) ? (
                    <div className="py-1.5 print:py-0.5 px-2 bg-blue-50/80 border border-blue-200 rounded text-center flex flex-col items-center justify-center space-y-0.5">
                      {finalHodSigUrl && (
                        <img
                          src={finalHodSigUrl}
                          alt="HOD Digital Signature"
                          className="h-8 md:h-10 print:h-7 max-w-[140px] object-contain mx-auto border-b border-blue-200/80 pb-0.5 mb-0.5"
                        />
                      )}
                      <span className="font-serif font-black text-blue-900 text-xs print:text-[11px] block italic">
                        {app.hodSignature || 'HOD Signature'}
                      </span>
                      <span className="text-[9.5px] print:text-[8.5px] font-bold text-blue-700 block">
                        Digitally Recommended • {formatDisplayDate(app.hodRecommendedAt)}
                      </span>
                    </div>
                  ) : (
                    <div className="py-3 print:py-2 border-2 border-dashed border-slate-300 rounded text-slate-400 font-bold italic text-[11px] print:text-[9px]">
                      [ Signature Pending ]
                    </div>
                  )}
                </div>

                {/* Candidate Signature Box */}
                <div className="border border-slate-300 p-2 print:p-1 rounded relative text-center space-y-1 print:space-y-0.5">
                  <span className="font-bold block text-slate-800">Signature of the Candidate</span>
                  <div className="py-1.5 print:py-0.5 bg-emerald-50/80 border border-emerald-200 rounded text-center">
                    <span className="font-serif font-black text-emerald-900 text-xs print:text-[11px] block italic">
                      {app.studentName}
                    </span>
                    <span className="text-[9.5px] print:text-[8.5px] font-bold text-emerald-700 block">
                      Digitally Verified • {formatDisplayDate(app.appliedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Station, Date, Principal, Seal */}
              <div className="grid grid-cols-2 gap-4 pt-2 print:pt-1 border-t border-slate-300 text-[10px] print:text-[9px] font-bold">
                <div>
                  <p>Station : <span className="font-black text-slate-900">CUDDALORE</span></p>
                  <p className="mt-1">Date : <span className="font-black text-slate-900">{formatDisplayDate(app.appliedAt)}</span></p>
                </div>
                <div className="text-right space-y-0.5">
                  {/* <p>Signature of the Principal : <span className="font-black text-[#120c7a]">APPROVED</span></p> */}
                  <p>College Seal : <span className="font-black text-slate-700">[ CKCET OFFICIAL SEAL ]</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions Bar */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${app.status === 'Recommended by HOD' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>
              {app.status}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>

            {isHod && app.status !== 'Recommended by HOD' && (
              <button
                onClick={() => onRecommend(app)}
                disabled={processing}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              >
                {processing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Recommend & Submit to Exam Cell
              </button>
            )}

            {isExamCell && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateStatus(app.id, 'Copy Issued')}
                  disabled={processing || app.status === 'Copy Issued'}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Check size={14} /> Issue Copy
                </button>
                <button
                  onClick={() => onUpdateStatus(app.id, 'Closed')}
                  disabled={processing || app.status === 'Closed'}
                  className="flex items-center gap-1.5 px-4 py-2 bg-zinc-700 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Ban size={14} /> Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
