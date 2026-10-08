import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs, setDoc, addDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  FileWarning, AlertCircle, Loader2, Check, Send,
  Plus, Trash2, Eye, History, HelpCircle, CheckCircle2, Clock, XCircle, Lock
} from "lucide-react";
import { formatDepartmentDisplay, sanitizeKey } from "../../lib/utils";
import PhotocopyProblemModal from "../../components/PhotocopyProblemModal";

export const PROBLEM_CATEGORIES = [
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

export default function PhotocopyProblem() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Form State
  const [subjects, setSubjects] = useState([
    {
      semesterNo: "",
      subjectCode: "",
      subjectTitle: "",
      examName: "End Semester Exam",
      selectedProblems: [],
      detailedDescription: ""
    }
  ]);
  const [editingAppId, setEditingAppId] = useState(null);
  const [revokedBanner, setRevokedBanner] = useState(null);

  // My Applications History
  const [myApplications, setMyApplications] = useState([]);
  const [viewAppModal, setViewAppModal] = useState({ open: false, app: null });

  const [windowStatus, setWindowStatus] = useState({ open: true, label: "Applications Open" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3500);
  };

  // Subscribe to Exam Cell Photocopy Problem Window Setting
  useEffect(() => {
    const evaluateWindow = (d) => {
      if (!d || d.isOpen === false) {
        setWindowStatus({ open: false, label: "Applications Closed" });
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (d.fromDate && today < d.fromDate) {
        setWindowStatus({ open: false, label: `Opens on ${d.fromDate}` });
        return;
      }
      if (d.toDate && today > d.toDate) {
        setWindowStatus({ open: false, label: "Application Window Closed" });
        return;
      }
      setWindowStatus({ open: true, label: "Applications Open" });
    };

    const unsub = onSnapshot(doc(db, "exam_cell_settings", "photocopy_problem"), (snap) => {
      if (snap.exists()) {
        evaluateWindow(snap.data());
      } else {
        // Fallback to photocopy window setting if problem window doc does not exist yet
        getDoc(doc(db, "exam_cell_settings", "photocopy")).then(fSnap => {
          if (fSnap.exists()) evaluateWindow(fSnap.data());
        });
      }
    }, () => {});

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          let reg = uData.regNo || uData.reg || '';
          
          // Resolve additional profile details if available
          let studentDocId = '';
          if (reg) {
            try {
              const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
              if (idxSnap.exists()) {
                studentDocId = idxSnap.data().studentDocId || '';
              }
            } catch (_) {}
          }
          setStudentData({ ...uData, regNo: reg, studentDocId });
        }
      } catch (err) {
        console.error("Error loading student profile:", err);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const [photocopyAppliedSubjects, setPhotocopyAppliedSubjects] = useState([]);
  const [hasAutoLoadedPhotocopy, setHasAutoLoadedPhotocopy] = useState(false);

  // Automatically fetch student's applied photocopy subjects from Photocopy.jsx (photocopy_applications)
  useEffect(() => {
    if (!studentData) return;
    const studentKeys = [
      studentData.regNo,
      studentData.reg,
      studentData.admissionNo,
      studentData.admNo,
      studentData.uid,
      auth.currentUser?.uid,
      auth.currentUser?.email
    ].filter(Boolean).map(k => String(k).trim().toLowerCase());

    const unsub = onSnapshot(collection(db, "photocopy_applications"), (snap) => {
      const extractedSubjects = [];
      const seenCodes = new Set();

      snap.forEach(d => {
        const data = d.data();
        const matches = studentKeys.some(sk =>
          String(data.regNo || '').trim().toLowerCase() === sk ||
          String(data.studentUid || '').trim().toLowerCase() === sk ||
          String(data.email || '').trim().toLowerCase() === sk
        );

        if (matches && Array.isArray(data.subjects)) {
          data.subjects.forEach(s => {
            const cleanCode = String(s.subjectCode || s.code || '').replace(/\s+/g, '').toUpperCase();
            if (cleanCode && !seenCodes.has(cleanCode)) {
              seenCodes.add(cleanCode);
              extractedSubjects.push({
                semesterNo: s.semesterNo || s.semester || "",
                subjectCode: cleanCode,
                subjectTitle: s.subjectTitle || s.name || s.subjectName || "",
                examName: s.examName || "End Semester Exam",
                selectedProblems: [],
                detailedDescription: ""
              });
            }
          });
        }
      });

      if (extractedSubjects.length > 0) {
        setPhotocopyAppliedSubjects(extractedSubjects);
      }
    });

    return () => unsub();
  }, [studentData]);

  // Auto-prefill subject cards from photocopy applications on load
  useEffect(() => {
    if (!editingAppId && photocopyAppliedSubjects.length > 0 && !hasAutoLoadedPhotocopy) {
      setSubjects(photocopyAppliedSubjects);
      setHasAutoLoadedPhotocopy(true);
    }
  }, [photocopyAppliedSubjects, editingAppId, hasAutoLoadedPhotocopy]);

  // Listen to student's submitted photocopy problem applications
  useEffect(() => {
    if (!studentData) return;
    const studentKeys = [
      studentData.regNo,
      studentData.reg,
      studentData.admissionNo,
      studentData.admNo,
      studentData.uid,
      auth.currentUser?.uid
    ].filter(Boolean).map(k => String(k).trim());

    const unsub = onSnapshot(collection(db, "photocopy_problem_applications"), (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        const matches = studentKeys.some(sk => 
          String(data.regNo || '').trim() === sk ||
          String(data.admissionNo || '').trim() === sk ||
          String(data.uid || '').trim() === sk
        );
        if (matches) {
          list.push({ id: d.id, ...data });
        }
      });

      list.sort((a, b) => {
        const at = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const bt = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return bt - at;
      });

      setMyApplications(list);

      // Check if there is an active revoked application needing editing
      const revoked = list.find(a => a.status === 'Revoked by HOD' || a.status === 'Revoked by Exam Cell');
      if (revoked && !editingAppId) {
        setRevokedBanner(revoked);
        setEditingAppId(revoked.id);
        if (Array.isArray(revoked.subjects) && revoked.subjects.length > 0) {
          setSubjects(revoked.subjects.map(s => ({
            semesterNo: s.semesterNo || "",
            subjectCode: s.subjectCode || "",
            subjectTitle: s.subjectTitle || "",
            examName: s.examName || "End Semester Exam",
            selectedProblems: Array.isArray(s.selectedProblems) ? s.selectedProblems : (revoked.selectedProblems || []),
            detailedDescription: s.detailedDescription || revoked.detailedDescription || ""
          })));
        }
      }
    });

    return () => unsub();
  }, [studentData]);

  const toggleSubjectProblem = (subjectIndex, problemId) => {
    setSubjects(prev => {
      const updated = [...prev];
      const curSelected = updated[subjectIndex].selectedProblems || [];
      const newSelected = curSelected.includes(problemId)
        ? curSelected.filter(p => p !== problemId)
        : [...curSelected, problemId];
      updated[subjectIndex] = { ...updated[subjectIndex], selectedProblems: newSelected };
      return updated;
    });
  };

  const handleAddSubjectRow = () => {
    setSubjects(prev => [
      ...prev,
      {
        semesterNo: "",
        subjectCode: "",
        subjectTitle: "",
        examName: "End Semester Exam",
        selectedProblems: [],
        detailedDescription: ""
      }
    ]);
  };

  const handleRemoveSubjectRow = (index) => {
    if (subjects.length <= 1) return;
    setSubjects(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubjectChange = (index, field, value) => {
    setSubjects(prev => {
      const updated = [...prev];
      let val = value;
      // Strictly prevent spaces and force uppercase for subject code
      if (field === 'subjectCode') {
        val = String(value).replace(/\s+/g, '').toUpperCase();
      }
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentData) return;

    const validSubjects = subjects.filter(s => s.subjectCode.trim());
    if (validSubjects.length === 0) {
      showToast("Please enter at least one subject code.", "error");
      return;
    }

    // Check that every added subject has at least 1 discrepancy selected
    for (let i = 0; i < validSubjects.length; i++) {
      const s = validSubjects[i];
      if (!s.selectedProblems || s.selectedProblems.length === 0) {
        showToast(`Please select at least one discrepancy checkbox for Subject ${i + 1} (${s.subjectCode || 'No Code'}).`, "error");
        return;
      }
      if (s.selectedProblems.includes("other") && (!s.detailedDescription || !s.detailedDescription.trim())) {
        showToast(`Please provide a detailed description for Subject ${i + 1} (${s.subjectCode}) when selecting 'Other'.`, "error");
        return;
      }
    }

    // Compute unique set of all selected problems across all subjects for top-level backward compatibility
    const allSelectedProblems = Array.from(new Set(validSubjects.flatMap(s => s.selectedProblems || [])));
    const mergedDescriptions = validSubjects
      .map(s => `${s.subjectCode}: ${s.detailedDescription || 'N/A'}`)
      .filter(d => !d.endsWith('N/A'))
      .join('\n');

    setSubmitting(true);
    try {
      const payload = {
        uid: auth.currentUser?.uid || '',
        studentName: studentData.displayName || studentData.studentName || studentData.name || '',
        regNo: studentData.regNo || studentData.reg || studentData.admissionNo || '',
        admissionNo: studentData.admissionNo || studentData.admNo || '',
        department: studentData.department || studentData.dept || '',
        programme: studentData.programme || '',
        batch: studentData.batch || '',
        academicYear: studentData.academicYear || '',
        selectedProblems: allSelectedProblems,
        detailedDescription: mergedDescriptions,
        subjects: validSubjects,
        status: "Submitted to HOD",
        updatedAt: serverTimestamp(),
      };

      if (editingAppId) {
        await setDoc(doc(db, "photocopy_problem_applications", editingAppId), {
          ...payload,
          revokeReason: null,
          history: [
            ...(revokedBanner?.history || []),
            { action: "Resubmitted by Student", timestamp: new Date().toISOString() }
          ]
        }, { merge: true });
        showToast("Application updated & re-submitted to HOD successfully!", "success");
        setEditingAppId(null);
        setRevokedBanner(null);
      } else {
        await addDoc(collection(db, "photocopy_problem_applications"), {
          ...payload,
          createdAt: serverTimestamp(),
          history: [{ action: "Submitted to HOD", timestamp: new Date().toISOString() }]
        });
        showToast("Photocopy problem discrepancy application submitted to HOD!", "success");
      }

      // Reset form
      setSubjects([{
        semesterNo: "",
        subjectCode: "",
        subjectTitle: "",
        examName: "End Semester Exam",
        selectedProblems: [],
        detailedDescription: ""
      }]);

    } catch (err) {
      console.error("Submission error:", err);
      showToast("Failed to submit application: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadAppToEdit = (app) => {
    setEditingAppId(app.id);
    setRevokedBanner(app);
    if (Array.isArray(app.subjects) && app.subjects.length > 0) {
      setSubjects(app.subjects.map(s => ({
        semesterNo: s.semesterNo || "",
        subjectCode: s.subjectCode || "",
        subjectTitle: s.subjectTitle || "",
        examName: s.examName || "End Semester Exam",
        selectedProblems: Array.isArray(s.selectedProblems) ? s.selectedProblems : (app.selectedProblems || []),
        detailedDescription: s.detailedDescription || app.detailedDescription || ""
      })));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 font-sans">
      
      {/* Toast Banner */}
      {toast.show && (
        <div className={`fixed top-6 right-6 z-[250] px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white transition-all animate-in slide-in-from-top-5 ${
          toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
        }`}>
          {toast.type === "error" ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          {toast.message}
        </div>
      )}

      {/* Header Card Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-amber-400/10 blur-2xl"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-300">
              <FileWarning size={32} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Answer Script Photocopy Problem</h1>
              <p className="text-xs md:text-sm text-blue-200 mt-1">
                Report discrepancies, missing pages, wrong scripts, or valuation errors in received answer script photocopies.
              </p>
            </div>
          </div>
          <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-sm self-start md:self-auto ${
            windowStatus.open ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' : 'bg-rose-400/20 text-rose-200 border border-rose-400/30'
          }`}>
            {windowStatus.label}
          </span>
        </div>
      </div>

      {/* Main Form Card / Applications Closed Card */}
      {!windowStatus.open ? (
        <div className="bg-white rounded-3xl shadow-xl p-8 md:p-14 text-center border border-rose-100 space-y-4 animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
            <Lock size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-900">Photocopy Problem Discrepancy Representation Closed</h3>
          <p className="text-sm font-semibold text-slate-600 max-w-lg mx-auto leading-relaxed">
            Answer script photocopy problem discrepancy representations are currently closed ({windowStatus.label}). Please contact the Exam Cell for schedule and announcements.
          </p>
        </div>
      ) : (
        <>
          {/* Revoked Feedback Banner */}
          {revokedBanner && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl shrink-0 mt-0.5">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-200 text-rose-900 border border-rose-300">
                    Action Required — Application Revoked
                  </span>
                  <h3 className="font-bold text-rose-950 text-base mt-1">Feedback / Reason from Approver:</h3>
                  <p className="text-sm font-semibold text-rose-800 mt-0.5 bg-white/80 p-3 rounded-xl border border-rose-200">
                    "{revokedBanner.revokeReason || "Please review and correct your problem details."}"
                  </p>
                  <p className="text-xs text-rose-600 mt-2 font-medium">
                    Edit your selections below and click <strong>"Save & Submit to HOD"</strong> to re-submit for review.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Main Form Card */}
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden space-y-6">
        
        {/* Candidate Info Pre-fill Header */}
        <div className="bg-slate-50 border-b border-slate-200 p-6 md:p-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#120c7a]"></span>
            Candidate Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block uppercase">Student Name</span>
              <span className="font-bold text-slate-900 text-base mt-0.5 block truncate">
                {studentData?.displayName || studentData?.studentName || studentData?.name || '—'}
              </span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block uppercase">Register / Adm No</span>
              <span className="font-mono font-bold text-[#120c7a] text-base mt-0.5 block">
                {studentData?.regNo || studentData?.reg || studentData?.admissionNo || '—'}
              </span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block uppercase">Department</span>
              <span className="font-bold text-slate-800 text-sm mt-0.5 block truncate">
                {formatDepartmentDisplay(studentData?.department || studentData?.dept) || '—'}
              </span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block uppercase">Batch</span>
              <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                {studentData?.batch || '—'} ({studentData?.programme || ''})
              </span>
            </div>
          </div>
        </div>

        {/* Section: Dynamic Subject Cards with Per-Subject 8 Discrepancy Points */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">1. Subject(s) Related to Discrepancy & Checklists</h2>
              <p className="text-xs text-slate-500 mt-0.5">Specify subject details and tick the discrepancy points for each subject individually.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {photocopyAppliedSubjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSubjects(photocopyAppliedSubjects);
                    showToast(`Loaded ${photocopyAppliedSubjects.length} subject(s) from your Photocopy Application!`, 'success');
                  }}
                  className="px-3.5 py-2.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold rounded-2xl text-xs transition-all flex items-center gap-1.5 border border-emerald-200 cursor-pointer shadow-sm"
                  title="Auto-fill subjects from your applied Photocopy Application"
                >
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  Auto-fill from Photocopy App ({photocopyAppliedSubjects.length})
                </button>
              )}
              <button
                type="button"
                onClick={handleAddSubjectRow}
                className="px-4 py-2.5 bg-indigo-50 text-[#120c7a] hover:bg-indigo-100 font-bold rounded-2xl text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus size={16} /> Add Subject
              </button>
            </div>
          </div>

          <div className="space-y-8">
            {subjects.map((subj, idx) => (
              <div key={idx} className="p-6 bg-slate-50/80 rounded-3xl border-2 border-slate-200 space-y-6 shadow-sm">
                
                {/* Subject Header */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-[#120c7a] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      #{idx + 1}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      Subject {idx + 1} {subj.subjectCode ? `— ${subj.subjectCode}` : ''}
                    </h3>
                  </div>
                  {subjects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSubjectRow(idx)}
                      className="px-3 py-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-100/80 font-bold rounded-xl text-xs transition-all flex items-center gap-1 border border-rose-200 cursor-pointer"
                    >
                      <Trash2 size={14} /> Remove Subject
                    </button>
                  )}
                </div>

                {/* Subject Primary Details Row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Semester</label>
                    <input
                      type="text"
                      placeholder="e.g. 5"
                      value={subj.semesterNo}
                      onChange={(e) => handleSubjectChange(idx, "semesterNo", e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#120c7a]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Subject Code * (No Spaces)</label>
                    <input
                      type="text"
                      placeholder="e.g. CS3351"
                      value={subj.subjectCode}
                      onKeyDown={(e) => {
                        if (e.key === ' ') e.preventDefault();
                      }}
                      onChange={(e) => handleSubjectChange(idx, "subjectCode", e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-[#120c7a] focus:outline-none focus:border-[#120c7a]"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Subject Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Digital Principles and System Design"
                      value={subj.subjectTitle}
                      onChange={(e) => handleSubjectChange(idx, "subjectTitle", e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#120c7a]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Exam</label>
                    <input
                      type="text"
                      placeholder="End Semester Exam"
                      value={subj.examName}
                      onChange={(e) => handleSubjectChange(idx, "examName", e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#120c7a]"
                    />
                  </div>
                </div>

                {/* Per-Subject 8 Discrepancy Points Checklist */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Discrepancy Category Checklist for Subject #{idx + 1}
                    </h4>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      {(subj.selectedProblems || []).length} Points Selected
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PROBLEM_CATEGORIES.map((cat) => {
                      const isChecked = (subj.selectedProblems || []).includes(cat.id);
                      return (
                        <div
                          key={cat.id}
                          onClick={() => toggleSubjectProblem(idx, cat.id)}
                          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                            isChecked
                              ? 'bg-amber-50/90 border-amber-500 shadow-sm ring-1 ring-amber-400/30'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-100/50'
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                            isChecked ? 'bg-amber-500 border-amber-600 text-white shadow-xs' : 'border-slate-300 bg-white'
                          }`}>
                            {isChecked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div>
                            <h5 className={`text-xs font-bold ${isChecked ? 'text-amber-950' : 'text-slate-800'}`}>
                              {cat.title}
                            </h5>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                              {cat.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Per-Subject Detailed Explanation */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Detailed Explanation / Remarks for Subject #{idx + 1}
                  </label>
                  <textarea
                    rows={2}
                    value={subj.detailedDescription || ""}
                    onChange={(e) => handleSubjectChange(idx, "detailedDescription", e.target.value)}
                    placeholder="Provide specific details regarding missing pages, question numbers not valued, total mistakes, etc. for this subject..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-2xl text-xs text-slate-800 font-medium focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/15 transition-all"
                  />
                </div>

              </div>
            ))}
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            {editingAppId && (
              <button
                type="button"
                onClick={() => {
                  setEditingAppId(null);
                  setRevokedBanner(null);
                  setSubjects([{
                    semesterNo: "",
                    subjectCode: "",
                    subjectTitle: "",
                    examName: "End Semester Exam",
                    selectedProblems: [],
                    detailedDescription: ""
                  }]);
                }}
                className="px-5 py-3 rounded-2xl bg-slate-200 text-slate-800 font-bold text-xs hover:bg-slate-300 transition-all"
              >
                Cancel Edit
              </button>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-900 to-[#120c7a] text-white font-bold text-sm shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Submitting to HOD...
                </>
              ) : (
                <>
                  <Send size={18} /> {editingAppId ? "Save & Re-submit to HOD" : "Submit Discrepancy Form to HOD"}
                </>
              )}
            </button>
          </div>
        </div>

      </form>
        </>
      )}

      {/* Section 4: My Submissions History */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-[#120c7a] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <History size={20} className="text-amber-300" />
            <h2 className="font-bold text-lg">My Discrepancy Submissions ({myApplications.length})</h2>
          </div>
        </div>

        {myApplications.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium italic">
            No photocopy problem discrepancy applications submitted yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Submitted Date</th>
                  <th className="px-6 py-4">Subjects</th>
                  <th className="px-6 py-4">Reported Issues</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myApplications.map((app) => {
                  const dateStr = new Date(app.createdAt?.seconds ? app.createdAt.seconds * 1000 : app.createdAt || Date.now()).toLocaleDateString('en-IN');
                  const isRevoked = app.status === 'Revoked by HOD' || app.status === 'Revoked by Exam Cell';
                  return (
                    <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-700">{dateStr}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          {app.subjects?.map((s, idx) => (
                            <span key={idx} className="font-mono font-bold text-[#120c7a]">{s.subjectCode}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate font-medium text-slate-600">
                        {app.selectedProblems?.map(p => p.replace(/^\d+\.\s*/, '')).join(", ") || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          app.status === 'Moved to Exam Cell' || app.status === 'Recommended to Exam Cell'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isRevoked
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        }`}>
                          {app.status || 'Submitted to HOD'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setViewAppModal({ open: true, app })}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all flex items-center gap-1"
                          >
                            <Eye size={14} /> View Form
                          </button>
                          {isRevoked && (
                            <button
                              onClick={() => handleLoadAppToEdit(app)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-sm transition-all"
                            >
                              Edit & Re-submit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable View Form Modal */}
      <PhotocopyProblemModal
        open={viewAppModal.open}
        app={viewAppModal.app}
        onClose={() => setViewAppModal({ open: false, app: null })}
      />

    </div>
  );
}
