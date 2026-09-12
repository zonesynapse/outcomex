import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  User, Calendar, Briefcase, BookOpen, Award, CheckCircle2,
  Plus, Trash2, Save, Send, AlertTriangle, FileText, Sparkles,
  UploadCloud, Paperclip, Check, Loader2, RefreshCw, Layers, Target, TrendingUp
} from "lucide-react";
import Layout from "../components/Layout";
import { uploadFile, userStoragePath } from "../utils/fileUpload";

export default function HODAppraisal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAppraisal, setExistingAppraisal] = useState(null);
  const [uploadingMap, setUploadingMap] = useState({});
  const [isEditingSubmitted, setIsEditingSubmitted] = useState(false);

  // General Form Header State
  const [academicYear, setAcademicYear] = useState("2024-2025");
  const [appraisalSchedule, setAppraisalSchedule] = useState(null);
  const [isPortalOpen, setIsPortalOpen] = useState(true);
  const [checkingSchedule, setCheckingSchedule] = useState(true);

  // Profile Header
  const [hodName, setHodName] = useState("");
  const [department, setDepartment] = useState("");
  const [doj, setDoj] = useState("");
  const [designation, setDesignation] = useState("Head of the Department");
  const [qualification, setQualification] = useState("");

  // KRA I: Department Academic Improvement (30 Marks)
  const [kra1PassPct, setKra1PassPct] = useState("");
  const [kra1Tier, setKra1Tier] = useState(""); // "65_above", "50_64", "40_49", "30_39", "21_29", "below_20"
  const [kra1Remarks, setKra1Remarks] = useState("");
  const [kra1Proof, setKra1Proof] = useState({ fileUrl: "", fileName: "" });

  // KRA II: Department Student Centric Activities (25 Marks total, 5 sub-parameters @ 5 marks each)
  const [kra2Parameters, setKra2Parameters] = useState({
    coCurricular: { achieved: false, remarks: "", fileUrl: "", fileName: "" },
    ipkt: { achieved: false, remarks: "", fileUrl: "", fileName: "" },
    guestLectures: { achieved: false, remarks: "", fileUrl: "", fileName: "" },
    valueAdded: { achieved: false, remarks: "", fileUrl: "", fileName: "" },
    softSkillsPlacement: { achieved: false, remarks: "", fileUrl: "", fileName: "" }
  });

  // KRA III: Faculty Enrichment Efforts for Department (20 Marks total, 4 sub-parameters @ 5 max marks each: 100% -> 5, 80-99% -> 2.5, Below -> 0)
  const [kra3Parameters, setKra3Parameters] = useState({
    fundingProposal: { tier: "below", remarks: "", fileUrl: "", fileName: "" },
    testingConsultancy: { tier: "below", remarks: "", fileUrl: "", fileName: "" },
    onlineCourse: { tier: "below", remarks: "", fileUrl: "", fileName: "" },
    publications: { tier: "below", remarks: "", fileUrl: "", fileName: "" }
  });

  // KRA IV: Significant Contribution towards Department / Personal Development (5 Marks, 2.5 per contribution)
  const [kra4Contributions, setKra4Contributions] = useState([
    { title: "", description: "", fileUrl: "", fileName: "" }
  ]);

  // KRA V: Academic Excellence and Self Development (IIY) (20 Marks total)
  // 1. Result (10 Marks): 90_above -> 10, 81_90 -> 8, 71_80 -> 6, 61_70 -> 4, 51_60 -> 2, below_50 -> 0
  const [kra5ResultTier, setKra5ResultTier] = useState("");
  const [kra5ResultRemarks, setKra5ResultRemarks] = useState("");
  const [kra5ResultProof, setKra5ResultProof] = useState({ fileUrl: "", fileName: "" });

  // 2. Online Course (5 Marks): achieved -> 5
  const [kra5OnlineCourse, setKra5OnlineCourse] = useState({ achieved: false, remarks: "", fileUrl: "", fileName: "" });

  // 3. Research Publication (5 Marks): achieved -> 5
  const [kra5Publication, setKra5Publication] = useState({ achieved: false, remarks: "", fileUrl: "", fileName: "" });

  // Declaration & Toast
  const [declaration, setDeclaration] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Auth Listener & User Profile Setup
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const uData = snap.data();
          setUserProfile(uData);
          setHodName(uData.displayName || uData.facultyName || uData.name || "");
          setDepartment(uData.department || "");
          setDoj(uData.dateOfJoining || uData.dojCollege || "");
          setDesignation(uData.designation || "Head of the Department");
          setQualification(uData.academicQualification || uData.qualification || "");
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Listen to Schedule Settings
  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "schedule");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const sched = snap.data();
        setAppraisalSchedule(sched);
        const now = Date.now();
        const start = sched.openTime ? new Date(sched.openTime).getTime() : null;
        const end = sched.closeTime ? new Date(sched.closeTime).getTime() : null;
        const active = sched.isActive;

        let open = true;
        if (!active) open = false;
        if (start && now < start) open = false;
        if (end && now > end) open = false;
        setIsPortalOpen(open);
      } else {
        setIsPortalOpen(true);
      }
      setCheckingSchedule(false);
    });
    return () => unsub();
  }, []);

  // Fetch Existing HOD Appraisal Document
  useEffect(() => {
    if (!currentUser || !academicYear) return;
    const docId = `${currentUser.uid}_${academicYear.replace(/[^a-zA-Z0-9]/g, "_")}_hod`;

    const unsub = onSnapshot(doc(db, "hod_appraisals", docId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExistingAppraisal(data);
        if (data.formData) {
          const f = data.formData;
          setHodName(f.hodName || "");
          setDepartment(f.department || "");
          setDoj(f.doj || "");
          setDesignation(f.designation || "Head of the Department");
          setQualification(f.qualification || "");

          if (f.kra1) {
            setKra1PassPct(f.kra1.passPct || "");
            setKra1Tier(f.kra1.tier || "");
            setKra1Remarks(f.kra1.remarks || "");
            setKra1Proof(f.kra1.proof || { fileUrl: "", fileName: "" });
          }

          if (f.kra2) setKra2Parameters(f.kra2);
          if (f.kra3) setKra3Parameters(f.kra3);
          if (f.kra4 && Array.isArray(f.kra4)) setKra4Contributions(f.kra4);

          if (f.kra5) {
            setKra5ResultTier(f.kra5.resultTier || "");
            setKra5ResultRemarks(f.kra5.resultRemarks || "");
            setKra5ResultProof(f.kra5.resultProof || { fileUrl: "", fileName: "" });
            if (f.kra5.onlineCourse) setKra5OnlineCourse(f.kra5.onlineCourse);
            if (f.kra5.publication) setKra5Publication(f.kra5.publication);
          }
          setDeclaration(data.declaration || false);
        }
      } else {
        setExistingAppraisal(null);
      }
    });
    return () => unsub();
  }, [currentUser, academicYear]);

  // Scores Calculations
  // KRA I: Pass Pct Tier Score (Max 30)
  const kra1Score = useMemo(() => {
    if (kra1Tier === "65_above") return 30;
    if (kra1Tier === "50_64") return 25;
    if (kra1Tier === "40_49") return 20;
    if (kra1Tier === "30_39") return 12;
    if (kra1Tier === "21_29") return 8;
    if (kra1Tier === "below_20") return 0;
    // Auto-calculate from pass % if tier not explicitly clicked
    const p = parseFloat(kra1PassPct);
    if (isNaN(p)) return 0;
    if (p >= 65) return 30;
    if (p >= 50) return 25;
    if (p >= 40) return 20;
    if (p >= 30) return 12;
    if (p >= 21) return 8;
    return 0;
  }, [kra1Tier, kra1PassPct]);

  // KRA II: Student Centric Activities (Max 25)
  const kra2Score = useMemo(() => {
    let s = 0;
    Object.values(kra2Parameters).forEach(p => {
      if (p.achieved) s += 5;
    });
    return s;
  }, [kra2Parameters]);

  // KRA III: Faculty Enrichment Efforts (Max 20)
  const kra3Score = useMemo(() => {
    let s = 0;
    Object.values(kra3Parameters).forEach(p => {
      if (p.tier === "100") s += 5;
      else if (p.tier === "80-99") s += 2.5;
    });
    return s;
  }, [kra3Parameters]);

  // KRA IV: Contributions (Max 5)
  const kra4Score = useMemo(() => {
    const validCount = kra4Contributions.filter(c => c.title && c.title.trim() !== "").length;
    return Math.min(validCount * 2.5, 5);
  }, [kra4Contributions]);

  // KRA V: Academic Excellence & IIY (Max 20)
  const kra5Score = useMemo(() => {
    let s = 0;
    // Result score (Max 10)
    if (kra5ResultTier === "90_above") s += 10;
    else if (kra5ResultTier === "81_90") s += 8;
    else if (kra5ResultTier === "71_80") s += 6;
    else if (kra5ResultTier === "61_70") s += 4;
    else if (kra5ResultTier === "51_60") s += 2;
    else if (kra5ResultTier === "below_50") s += 0;

    // Online course (5)
    if (kra5OnlineCourse.achieved) s += 5;
    // Publication (5)
    if (kra5Publication.achieved) s += 5;

    return s;
  }, [kra5ResultTier, kra5OnlineCourse, kra5Publication]);

  // Overall Total Score (Max 100)
  const totalScore = useMemo(() => {
    return kra1Score + kra2Score + kra3Score + kra4Score + kra5Score;
  }, [kra1Score, kra2Score, kra3Score, kra4Score, kra5Score]);

  // File Upload Helper
  const handleFileUpload = async (file, pathKey, onSuccess) => {
    if (!file || !currentUser) return;
    setUploadingMap(prev => ({ ...prev, [pathKey]: true }));
    try {
      const storagePath = userStoragePath("hod_appraisals", currentUser.uid, file.name);
      const fileUrl = await uploadFile(file, storagePath);
      onSuccess(fileUrl, file.name);
      showToast("File attached successfully!", "success");
    } catch (err) {
      console.error("Upload error:", err);
      showToast("Failed to upload file. Please try again.", "error");
    } finally {
      setUploadingMap(prev => ({ ...prev, [pathKey]: false }));
    }
  };

  const isReadOnly = useMemo(() => {
    if (!existingAppraisal) return false;
    const s = existingAppraisal.status;
    if (s === "Submitted" || s === "HOD_Approved" || s === "Approved") {
      return !isEditingSubmitted;
    }
    return false;
  }, [existingAppraisal, isEditingSubmitted]);

  // Save / Submit Handler
  const handleSave = async (isSubmit = false) => {
    if (!currentUser) {
      showToast("You must be logged in to save.", "error");
      return;
    }

    if (isSubmit && !declaration) {
      showToast("Please check the digital declaration box before submitting.", "error");
      return;
    }

    setSaving(true);
    const docId = `${currentUser.uid}_${academicYear.replace(/[^a-zA-Z0-9]/g, "_")}_hod`;
    const docRef = doc(db, "hod_appraisals", docId);

    const payload = {
      uid: currentUser.uid,
      hodEmail: currentUser.email,
      hodName,
      department,
      doj,
      designation,
      qualification,
      academicYear,
      formType: "hod",
      status: isSubmit ? "Submitted" : (existingAppraisal?.status || "Draft"),
      totalScore,
      kraScores: {
        kra1: kra1Score,
        kra2: kra2Score,
        kra3: kra3Score,
        kra4: kra4Score,
        kra5: kra5Score
      },
      formData: {
        hodName,
        department,
        doj,
        designation,
        qualification,
        kra1: {
          passPct: kra1PassPct,
          tier: kra1Tier,
          score: kra1Score,
          remarks: kra1Remarks,
          proof: kra1Proof
        },
        kra2: kra2Parameters,
        kra3: kra3Parameters,
        kra4: kra4Contributions,
        kra5: {
          resultTier: kra5ResultTier,
          resultRemarks: kra5ResultRemarks,
          resultProof: kra5ResultProof,
          onlineCourse: kra5OnlineCourse,
          publication: kra5Publication,
          score: kra5Score
        }
      },
      declaration,
      submittedAt: isSubmit ? new Date().toISOString() : (existingAppraisal?.submittedAt || null),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(docRef, payload, { merge: true });
      showToast(isSubmit ? "HOD Appraisal submitted successfully to Principal!" : "Draft saved successfully.", "success");
      setIsEditingSubmitted(false);
    } catch (err) {
      console.error("Save error:", err);
      showToast("Failed to save appraisal request.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading || checkingSchedule) {
    return (
      <Layout title="HOD Appraisal Request">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#120c7a]" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Loading HOD Appraisal Portal...</p>
        </div>
      </Layout>
    );
  }

  if (!isPortalOpen && (!existingAppraisal || existingAppraisal.status === "Draft")) {
    return (
      <Layout title="HOD Appraisal Request">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-rose-900 font-serif">HOD Appraisal Window Closed</h2>
            <p className="text-xs text-rose-700 max-w-md mx-auto leading-relaxed">
              The appraisal submission schedule is currently inactive or closed by the HR administration.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="HOD Appraisal Request">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Toast Notification */}
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3.5 rounded-xl text-white font-bold shadow-lg animate-slideIn ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
            <CheckCircle2 size={18} />
            <span>{toast.message}</span>
          </div>
        )}

        {/* Top Header Banner */}
        <div className="bg-gradient-to-tr from-[#120c7a] via-[#1a10a0] to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black tracking-widest uppercase w-fit">
                <Sparkles size={12} className="text-amber-400" /> HR Appraisal System
              </div>
              <h1 className="text-lg md:text-xl font-bold font-serif">
                HoD's Performance Appraisal for the Academic Year {academicYear}
              </h1>
              <p className="text-indigo-200 text-xs font-medium">
                CK COLLEGE OF ENGINEERING AND TECHNOLOGY, CUDDALORE – 607 003. (ISO 9001:2015)
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-center">
                <span className="block text-[10px] font-black uppercase text-indigo-200 tracking-wider">Total Score</span>
                <span className="text-2xl font-black text-amber-400">{totalScore} <span className="text-xs text-white/70 font-normal">/ 100</span></span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">Academic Year</span>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  disabled={isReadOnly}
                  className="bg-white/10 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/20 outline-none focus:bg-white/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <option value="2024-2025" className="text-zinc-900">2024 – 2025</option>
                  <option value="2025-2026" className="text-zinc-900">2025 – 2026</option>
                  <option value="2026-2027" className="text-zinc-900">2026 – 2027</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Submission Status Alert Banner */}
        {existingAppraisal && (
          <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                existingAppraisal.status === 'Submitted' ? 'bg-amber-100 text-amber-700' :
                existingAppraisal.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                existingAppraisal.status === 'Returned' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-700'
              }`}>
                <FileText size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Status:</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    existingAppraisal.status === 'Submitted' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                    existingAppraisal.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                    existingAppraisal.status === 'Returned' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {existingAppraisal.status === 'Submitted' ? 'Pending Principal Review' : existingAppraisal.status}
                  </span>
                </div>
                {existingAppraisal.submittedAt && (
                  <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                    Submitted on: {new Date(existingAppraisal.submittedAt).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            </div>

            {isReadOnly && existingAppraisal.status !== "Approved" && (
              <button
                onClick={() => setIsEditingSubmitted(true)}
                className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-[#120c7a] font-bold text-xs rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-1.5"
              >
                <RefreshCw size={14} /> Edit Submission
              </button>
            )}
          </div>
        )}

        {/* HOD Personal Info Card */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-150 pb-3">
            <User className="text-[#120c7a]" size={18} />
            <h2 className="text-sm font-black text-slate-850 uppercase tracking-wider">General Information of HoD</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Name of the HoD</label>
              <input
                type="text"
                value={hodName}
                onChange={(e) => setHodName(e.target.value)}
                disabled={isReadOnly}
                placeholder="Dr. / Prof. Name"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={isReadOnly}
                placeholder="Department Name"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Designation</label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                disabled={isReadOnly}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Date of Joining</label>
              <input
                type="text"
                value={doj}
                onChange={(e) => setDoj(e.target.value)}
                disabled={isReadOnly}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Qualification</label>
              <input
                type="text"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                disabled={isReadOnly}
                placeholder="Ph.D. / M.E. / M.Tech."
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>
          </div>
        </div>

        {/* KRA I: Department Academic Improvement */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">I</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Department Academic Improvement</h3>
                <p className="text-[10px] text-zinc-400 font-semibold">Department Performance in Anna University Examination (Target: Overall Pass % = 65%)</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase">Weightage: 30 Marks</span>
              <span className="block text-xs font-black text-indigo-700">Score: {kra1Score} / 30</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Overall Dept Pass Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={kra1PassPct}
                onChange={(e) => {
                  setKra1PassPct(e.target.value);
                  setKra1Tier("");
                }}
                disabled={isReadOnly}
                placeholder="e.g. 72.5"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Performance Metric Tier</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { tier: "65_above", label: "≥ 65% (30 Marks)" },
                  { tier: "50_64", label: "50 - 64% (25 Marks)" },
                  { tier: "40_49", label: "40 - 49% (20 Marks)" },
                  { tier: "30_39", label: "30 - 39% (12 Marks)" },
                  { tier: "21_29", label: "21 - 29% (8 Marks)" },
                  { tier: "below_20", label: "< 20% (0 Marks)" }
                ].map((item) => (
                  <button
                    key={item.tier}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra1Tier(item.tier)}
                    className={`py-2 px-2.5 rounded-xl text-[10px] font-bold border transition-all ${
                      kra1Tier === item.tier || (kra1Score > 0 && item.tier === (kra1Score === 30 ? "65_above" : kra1Score === 25 ? "50_64" : kra1Score === 20 ? "40_49" : kra1Score === 12 ? "30_39" : kra1Score === 8 ? "21_29" : "below_20"))
                        ? "bg-[#120c7a] text-white border-[#120c7a] shadow-sm"
                        : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Remarks / Remarks on Exam Performance</label>
              <textarea
                rows={2}
                value={kra1Remarks}
                onChange={(e) => setKra1Remarks(e.target.value)}
                disabled={isReadOnly}
                placeholder="Details of Anna University results, pass count, top performers..."
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              {kra1Proof.fileUrl ? (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700">
                  <Paperclip size={14} />
                  <a href={kra1Proof.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">{kra1Proof.fileName || "View Attachment"}</a>
                  {!isReadOnly && (
                    <button type="button" onClick={() => setKra1Proof({ fileUrl: "", fileName: "" })} className="text-rose-500 hover:text-rose-700 ml-1">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ) : (
                !isReadOnly && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer transition-all">
                    <UploadCloud size={14} />
                    <span>{uploadingMap["kra1"] ? "Uploading..." : "Attach Proof (PDF / Image)"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "kra1", (url, name) => setKra1Proof({ fileUrl: url, fileName: name }))}
                    />
                  </label>
                )
              )}
            </div>
          </div>
        </div>

        {/* KRA II: Department Student Centric Activities */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">II</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Department Student Centric Activities</h3>
                <p className="text-[10px] text-zinc-400 font-semibold">Organizing Student Centered Special Programs & Co-curricular Participation (5 Marks each parameter)</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase">Weightage: 25 Marks</span>
              <span className="block text-xs font-black text-indigo-700">Score: {kra2Score} / 25</span>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {[
              { key: "coCurricular", label: "1. Ensured Minimum of 60% Student's Participation in Co-curricular Activities (Student Innovation Club) and Remarkable Achievements" },
              { key: "ipkt", label: "2. Industrial Practical Knowledge Training (IPKT) (2/Semester per Class)" },
              { key: "guestLectures", label: "3. Industrial Oriented Guest Lecture – 3 /Semester" },
              { key: "valueAdded", label: "4. Conduction of Value Added Course (min. of 4 days duration) – 1/Year" },
              { key: "softSkillsPlacement", label: "5. Soft Skill Training / Career guidance / GATE awareness / Life Skill Program / Placement Special Efforts" }
            ].map((param) => {
              const currentData = kra2Parameters[param.key] || { achieved: false, remarks: "", fileUrl: "", fileName: "" };
              return (
                <div key={param.key} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 text-xs">{param.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setKra2Parameters(prev => ({
                          ...prev,
                          [param.key]: { ...prev[param.key], achieved: true }
                        }))}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[10px] transition-all ${
                          currentData.achieved
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                        }`}
                      >
                        100% Target Achieved (5 Marks)
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setKra2Parameters(prev => ({
                          ...prev,
                          [param.key]: { ...prev[param.key], achieved: false }
                        }))}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[10px] transition-all ${
                          !currentData.achieved
                            ? "bg-zinc-700 text-white shadow-sm"
                            : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                        }`}
                      >
                        Below Target (0 Marks)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={currentData.remarks || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setKra2Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], remarks: val } }));
                        }}
                        disabled={isReadOnly}
                        placeholder="Details of programs conducted / outcome..."
                        className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                      />
                    </div>
                    <div>
                      {currentData.fileUrl ? (
                        <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-indigo-700">
                          <Paperclip size={12} />
                          <a href={currentData.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[120px]">{currentData.fileName || "Proof"}</a>
                          {!isReadOnly && (
                            <button type="button" onClick={() => setKra2Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], fileUrl: "", fileName: "" } }))} className="text-rose-500 hover:text-rose-700 ml-auto">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ) : (
                        !isReadOnly && (
                          <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-[10px] rounded-xl cursor-pointer transition-all w-full justify-center">
                            <UploadCloud size={12} />
                            <span>{uploadingMap[`kra2_${param.key}`] ? "Uploading..." : "Attach Proof"}</span>
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], `kra2_${param.key}`, (url, name) => {
                                setKra2Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], fileUrl: url, fileName: name } }));
                              })}
                            />
                          </label>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* KRA III: Faculty Enrichment Efforts for Department */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">III</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Faculty Enrichment Efforts for Department</h3>
                <p className="text-[10px] text-zinc-400 font-semibold">Developing Ambience for R&D Activities & Invest in Yourself (100% Target: 5 Marks | 80-99%: 2.5 Marks)</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase">Weightage: 20 Marks</span>
              <span className="block text-xs font-black text-indigo-700">Score: {kra3Score} / 20</span>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {[
              { key: "fundingProposal", label: "1. Submission of Major funding proposal – 1 per Year" },
              { key: "testingConsultancy", label: "2. Revenue generation through Testing & Consultancy / Other sources – as per Target" },
              { key: "onlineCourse", label: "3. Online Course – 1 per faculty / Semester" },
              { key: "publications", label: "4. Publications of Research Papers in reputed Journal / International Conference - 2 per faculty / Semester" }
            ].map((param) => {
              const currentData = kra3Parameters[param.key] || { tier: "below", remarks: "", fileUrl: "", fileName: "" };
              return (
                <div key={param.key} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 text-xs">{param.label}</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { tier: "100", label: "100% Target (5 Marks)" },
                        { tier: "80-99", label: "80 – 99% (2.5 Marks)" },
                        { tier: "below", label: "Below (0 Marks)" }
                      ].map((t) => (
                        <button
                          key={t.tier}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setKra3Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], tier: t.tier } }))}
                          className={`px-2.5 py-1 rounded-xl font-bold text-[10px] transition-all ${
                            currentData.tier === t.tier
                              ? "bg-[#120c7a] text-white shadow-sm"
                              : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={currentData.remarks || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setKra3Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], remarks: val } }));
                        }}
                        disabled={isReadOnly}
                        placeholder="Details of proposals / revenue / courses completed..."
                        className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                      />
                    </div>
                    <div>
                      {currentData.fileUrl ? (
                        <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-indigo-700">
                          <Paperclip size={12} />
                          <a href={currentData.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[120px]">{currentData.fileName || "Proof"}</a>
                          {!isReadOnly && (
                            <button type="button" onClick={() => setKra3Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], fileUrl: "", fileName: "" } }))} className="text-rose-500 hover:text-rose-700 ml-auto">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ) : (
                        !isReadOnly && (
                          <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-[10px] rounded-xl cursor-pointer transition-all w-full justify-center">
                            <UploadCloud size={12} />
                            <span>{uploadingMap[`kra3_${param.key}`] ? "Uploading..." : "Attach Proof"}</span>
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], `kra3_${param.key}`, (url, name) => {
                                setKra3Parameters(prev => ({ ...prev, [param.key]: { ...prev[param.key], fileUrl: url, fileName: name } }));
                              })}
                            />
                          </label>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* KRA IV: Significant Contribution towards Department / Personal Development */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">IV</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Significant Contribution towards Department / Personal Development</h3>
                <p className="text-[10px] text-zinc-400 font-semibold">CoE / MoU / Book, Chapter Publication / Interaction with outside world / Foreign visit / Special Awards (2.5 Marks for each contribution, Max 5 Marks)</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase">Weightage: 5 Marks</span>
              <span className="block text-xs font-black text-indigo-700">Score: {kra4Score} / 5</span>
            </div>
          </div>

          <div className="space-y-3">
            {kra4Contributions.map((contrib, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200/70 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">Contribution #{idx + 1}</span>
                  {!isReadOnly && kra4Contributions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setKra4Contributions(prev => prev.filter((_, i) => i !== idx))}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Title / Category</label>
                    <input
                      type="text"
                      value={contrib.title || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKra4Contributions(prev => prev.map((c, i) => i === idx ? { ...c, title: val } : c));
                      }}
                      disabled={isReadOnly}
                      placeholder="e.g. Signed MoU with TechCorp / Published Book Chapter"
                      className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Details & Outcome</label>
                    <input
                      type="text"
                      value={contrib.description || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKra4Contributions(prev => prev.map((c, i) => i === idx ? { ...c, description: val } : c));
                      }}
                      disabled={isReadOnly}
                      placeholder="Scope, dates, outcomes achieved..."
                      className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-3">
                    {contrib.fileUrl ? (
                      <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1 rounded-xl text-[10px] font-bold text-indigo-700">
                        <Paperclip size={12} />
                        <a href={contrib.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">{contrib.fileName || "Proof Attachment"}</a>
                        {!isReadOnly && (
                          <button type="button" onClick={() => setKra4Contributions(prev => prev.map((c, i) => i === idx ? { ...c, fileUrl: "", fileName: "" } : c))} className="text-rose-500 hover:text-rose-700 ml-1">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ) : (
                      !isReadOnly && (
                        <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-[10px] rounded-xl cursor-pointer transition-all">
                          <UploadCloud size={12} />
                          <span>{uploadingMap[`kra4_${idx}`] ? "Uploading..." : "Attach Proof File"}</span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], `kra4_${idx}`, (url, name) => {
                              setKra4Contributions(prev => prev.map((c, i) => i === idx ? { ...c, fileUrl: url, fileName: name } : c));
                            })}
                          />
                        </label>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}

            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setKra4Contributions(prev => [...prev, { title: "", description: "", fileUrl: "", fileName: "" }])}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 border border-indigo-200 text-[#120c7a] font-bold text-xs rounded-xl hover:bg-indigo-100 transition-all"
              >
                <Plus size={14} /> Add Another Contribution
              </button>
            )}
          </div>
        </div>

        {/* KRA V: Academic Excellence and Self Development (IIY) */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">V</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Academic Excellence and Self Development (IIY)</h3>
                <p className="text-[10px] text-zinc-400 font-semibold">Anna University Subject Exam Pass % (Max 10 Marks) + Online Course (5 Marks) + Research Publication (5 Marks)</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase">Weightage: 20 Marks</span>
              <span className="block text-xs font-black text-indigo-700">Score: {kra5Score} / 20</span>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Sub-item 1: Exam Result */}
            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-3">
              <span className="font-bold text-slate-800 text-xs block">1. Anna University Examination Result (Theory Pass % Target: 95% | Analytical Pass % Target: 90%)</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { tier: "90_above", label: "≥ 90% (10 Marks)" },
                  { tier: "81_90", label: "81 - 90% (8 Marks)" },
                  { tier: "71_80", label: "71 - 80% (6 Marks)" },
                  { tier: "61_70", label: "61 - 70% (4 Marks)" },
                  { tier: "51_60", label: "51 - 60% (2 Marks)" },
                  { tier: "below_50", label: "< 50% (0 Marks)" }
                ].map((item) => (
                  <button
                    key={item.tier}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra5ResultTier(item.tier)}
                    className={`py-2 px-2.5 rounded-xl text-[10px] font-bold border transition-all ${
                      kra5ResultTier === item.tier
                        ? "bg-[#120c7a] text-white border-[#120c7a] shadow-sm"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={kra5ResultRemarks}
                    onChange={(e) => setKra5ResultRemarks(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Subject code, course name, theory & analytical pass percentage details..."
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                  />
                </div>
                <div>
                  {kra5ResultProof.fileUrl ? (
                    <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-indigo-700">
                      <Paperclip size={12} />
                      <a href={kra5ResultProof.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[120px]">{kra5ResultProof.fileName || "Proof"}</a>
                      {!isReadOnly && (
                        <button type="button" onClick={() => setKra5ResultProof({ fileUrl: "", fileName: "" })} className="text-rose-500 hover:text-rose-700 ml-auto">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ) : (
                    !isReadOnly && (
                      <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-[10px] rounded-xl cursor-pointer transition-all w-full justify-center">
                        <UploadCloud size={12} />
                        <span>{uploadingMap["kra5_result"] ? "Uploading..." : "Attach Result Sheet"}</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "kra5_result", (url, name) => setKra5ResultProof({ fileUrl: url, fileName: name }))}
                        />
                      </label>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Sub-item 2: Online Course */}
            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-slate-800 text-xs">2. Online Course – 1 per Semester</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra5OnlineCourse(prev => ({ ...prev, achieved: true }))}
                    className={`px-3 py-1 rounded-xl font-bold text-[10px] transition-all ${
                      kra5OnlineCourse.achieved ? "bg-emerald-600 text-white shadow-sm" : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    100% Target Achieved (5 Marks)
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra5OnlineCourse(prev => ({ ...prev, achieved: false }))}
                    className={`px-3 py-1 rounded-xl font-bold text-[10px] transition-all ${
                      !kra5OnlineCourse.achieved ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    Below (0 Marks)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={kra5OnlineCourse.remarks || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setKra5OnlineCourse(prev => ({ ...prev, remarks: val }));
                    }}
                    disabled={isReadOnly}
                    placeholder="Course name, NPTEL/Coursera details, score..."
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                  />
                </div>
                <div>
                  {kra5OnlineCourse.fileUrl ? (
                    <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-indigo-700">
                      <Paperclip size={12} />
                      <a href={kra5OnlineCourse.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[120px]">{kra5OnlineCourse.fileName || "Proof"}</a>
                      {!isReadOnly && (
                        <button type="button" onClick={() => setKra5OnlineCourse(prev => ({ ...prev, fileUrl: "", fileName: "" }))} className="text-rose-500 hover:text-rose-700 ml-auto">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ) : (
                    !isReadOnly && (
                      <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-[10px] rounded-xl cursor-pointer transition-all w-full justify-center">
                        <UploadCloud size={12} />
                        <span>{uploadingMap["kra5_course"] ? "Uploading..." : "Attach Certificate"}</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "kra5_course", (url, name) => setKra5OnlineCourse(prev => ({ ...prev, fileUrl: url, fileName: name })))}
                        />
                      </label>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Sub-item 3: Research Publication */}
            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-slate-800 text-xs">3. Publication of Research Paper in reputed Journal / International Conference – 1 per Semester</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra5Publication(prev => ({ ...prev, achieved: true }))}
                    className={`px-3 py-1 rounded-xl font-bold text-[10px] transition-all ${
                      kra5Publication.achieved ? "bg-emerald-600 text-white shadow-sm" : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    100% Target Achieved (5 Marks)
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra5Publication(prev => ({ ...prev, achieved: false }))}
                    className={`px-3 py-1 rounded-xl font-bold text-[10px] transition-all ${
                      !kra5Publication.achieved ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    Below (0 Marks)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={kra5Publication.remarks || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setKra5Publication(prev => ({ ...prev, remarks: val }));
                    }}
                    disabled={isReadOnly}
                    placeholder="Paper title, journal name, Scopus/WOS indexing, volume/page..."
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
                  />
                </div>
                <div>
                  {kra5Publication.fileUrl ? (
                    <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-indigo-700">
                      <Paperclip size={12} />
                      <a href={kra5Publication.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[120px]">{kra5Publication.fileName || "Proof"}</a>
                      {!isReadOnly && (
                        <button type="button" onClick={() => setKra5Publication(prev => ({ ...prev, fileUrl: "", fileName: "" }))} className="text-rose-500 hover:text-rose-700 ml-auto">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ) : (
                    !isReadOnly && (
                      <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-[10px] rounded-xl cursor-pointer transition-all w-full justify-center">
                        <UploadCloud size={12} />
                        <span>{uploadingMap["kra5_pub"] ? "Uploading..." : "Attach Paper Copy"}</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "kra5_pub", (url, name) => setKra5Publication(prev => ({ ...prev, fileUrl: url, fileName: name })))}
                        />
                      </label>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Declaration & Action Buttons */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-6">
          <div className="flex items-start gap-3 bg-amber-50/60 border border-amber-200/80 p-4 rounded-2xl">
            <input
              type="checkbox"
              id="hod_declaration"
              checked={declaration}
              onChange={(e) => setDeclaration(e.target.checked)}
              disabled={isReadOnly}
              className="mt-0.5 w-4 h-4 rounded text-[#120c7a] focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="hod_declaration" className="text-xs text-amber-950 font-medium leading-relaxed cursor-pointer select-none">
              I hereby declare that the particulars furnished above in my HOD Performance Appraisal for the Academic Year <strong>{academicYear}</strong> are true, correct, and complete to the best of my knowledge and belief.
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-zinc-150">
            <div className="text-xs font-extrabold text-slate-800">
              Signature of the Head of the Department: <span className="text-[#120c7a] underline ml-1">{hodName || "Digital Signature"}</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>Save Draft</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-[#120c7a] to-indigo-800 hover:from-indigo-900 hover:to-indigo-950 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    <span>Submit to Principal</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
}
