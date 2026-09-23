import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  User, Calendar, Briefcase, BookOpen, Award, CheckCircle2,
  Plus, Trash2, Save, Send, AlertTriangle, FileText, Sparkles,
  UploadCloud, Paperclip, Loader2, RefreshCw, Target, TrendingUp
} from "lucide-react";
import HRLayout from "../components/HRLayout";
import { uploadFile, userStoragePath } from "../utils/fileUpload";
import { checkAppraisalPortalStatus, parseAppraisalDateTime } from "../utils/appraisalScore";

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

  // Department Administration & Result Improvement
  const [deptAdministrationHOD, setDeptAdministrationHOD] = useState("");
  const [resultImprovementHOD, setResultImprovementHOD] = useState("");

  // ==========================================
  // KRA I: ACADEMIC IMPROVEMENT (30 Marks)
  // Target: Overall Exam Pass Percentage = 80%
  // ==========================================
  const [kra1PassPct, setKra1PassPct] = useState("");
  const [kra1Tier, setKra1Tier] = useState(""); // "80_above", "60_79", "40_59", "30_39", "21_29", "below_20"
  const [kra1Remarks, setKra1Remarks] = useState("");
  const [kra1Proof, setKra1Proof] = useState({ fileUrl: "", fileName: "" });

  // ==========================================
  // KRA II: STUDENT CENTRIC ACTIVITIES (25 Marks)
  // 1. Min 60% participation in Co-curricular
  // 2. Soft Skill / Career guidance / Govt Exam / Life Skill / Olympiad
  // ==========================================
  const [kra2Parameters, setKra2Parameters] = useState({
    coCurricular: { achieved: false, remarks: "", fileUrl: "", fileName: "" },
    softSkillsSpecial: { achieved: false, remarks: "", fileUrl: "", fileName: "" }
  });

  // ==========================================
  // KRA III: TEACHERS ENRICHMENT EFFORTS - IIY (20 Marks)
  // Knowledge Sharing Sessions conducted per week + 1 learned topic presented with good ratings
  // ==========================================
  const [kra3Achieved, setKra3Achieved] = useState(false);
  const [kra3Remarks, setKra3Remarks] = useState("");
  const [kra3Proof, setKra3Proof] = useState({ fileUrl: "", fileName: "" });

  // ==========================================
  // KRA IV: Significant Contribution towards Department / Personal Development (5 Marks)
  // Book, Chapter Publication / Interaction with outside world / Foreign visit / Special Awards (2.5 per contribution)
  // ==========================================
  const [kra4Contributions, setKra4Contributions] = useState([
    { title: "", description: "", fileUrl: "", fileName: "" }
  ]);

  // ==========================================
  // KRA V: Academic Excellence (20 Marks)
  // Theory Pass % - 95%, Practical Pass % - 90%
  // ==========================================
  const [kra5SubjectResults, setKra5SubjectResults] = useState([
    { theoryPassPct: "", practicalPassPct: "" }
  ]);
  const [kra5Tier, setKra5Tier] = useState(""); // "90_above", "81_90", "71_80", "61_70", "51_60", "below_50"
  const [kra5Remarks, setKra5Remarks] = useState("");
  const [kra5Proof, setKra5Proof] = useState({ fileUrl: "", fileName: "" });

  const handleKra5SubjectChange = (index, field, value) => {
    setKra5SubjectResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setKra5Tier("");
  };

  const addKra5SubjectResult = () => {
    setKra5SubjectResults(prev => [...prev, { theoryPassPct: "", practicalPassPct: "" }]);
    setKra5Tier("");
  };

  const removeKra5SubjectResult = (index) => {
    if (kra5SubjectResults.length <= 1) return;
    setKra5SubjectResults(prev => prev.filter((_, i) => i !== index));
    setKra5Tier("");
  };

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
          setHodName((prev) => prev || uData.displayName || uData.facultyName || uData.name || "");
          setDepartment((prev) => prev || uData.department || "");
          setDoj((prev) => prev || uData.dateOfJoining || uData.dojCollege || "");
          setDesignation((prev) => prev || uData.designation || "Head of the Department");
          setQualification((prev) => prev || uData.academicQualification || uData.qualification || "");
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
        if (sched.academicYear) {
          setAcademicYear(sched.academicYear);
        }
        const { isOpen } = checkAppraisalPortalStatus(sched);
        setIsPortalOpen(isOpen);
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
          if (f.hodName) setHodName(f.hodName);
          if (f.department) setDepartment(f.department);
          if (f.doj) setDoj(f.doj);
          if (f.designation) setDesignation(f.designation);
          if (f.qualification) setQualification(f.qualification);

          // KRA 1
          if (f.kra1) {
            setKra1PassPct(f.kra1.passPct || "");
            setKra1Tier(f.kra1.tier || "");
            setKra1Remarks(f.kra1.remarks || "");
            setKra1Proof(f.kra1.proof || { fileUrl: "", fileName: "" });
          }

          // KRA 2
          if (f.kra2) {
            setKra2Parameters((prev) => ({
              coCurricular: { ...prev.coCurricular, ...f.kra2.coCurricular },
              softSkillsSpecial: { ...prev.softSkillsSpecial, ...f.kra2.softSkillsSpecial }
            }));
          }

          // KRA 3
          if (f.kra3) {
            setKra3Achieved(!!f.kra3.achieved);
            setKra3Remarks(f.kra3.remarks || "");
            setKra3Proof(f.kra3.proof || { fileUrl: "", fileName: "" });
          }

          // KRA 4
          if (f.kra4 && Array.isArray(f.kra4) && f.kra4.length > 0) {
            setKra4Contributions(f.kra4);
          }

          // KRA 5
          if (f.kra5) {
            if (Array.isArray(f.kra5.subjectResults) && f.kra5.subjectResults.length > 0) {
              setKra5SubjectResults(f.kra5.subjectResults);
            } else if (f.kra5.theoryPassPct || f.kra5.practicalPassPct) {
              setKra5SubjectResults([
                {
                  theoryPassPct: f.kra5.theoryPassPct || "",
                  practicalPassPct: f.kra5.practicalPassPct || ""
                }
              ]);
            } else {
              setKra5SubjectResults([{ theoryPassPct: "", practicalPassPct: "" }]);
            }
            setKra5Tier(f.kra5.tier || f.kra5.resultTier || "");
            setKra5Remarks(f.kra5.remarks || f.kra5.resultRemarks || "");
            setKra5Proof(f.kra5.proof || f.kra5.resultProof || { fileUrl: "", fileName: "" });
          }

          setDeptAdministrationHOD(f.deptAdministrationHOD || f.hodDeptAdmin || "");
          setResultImprovementHOD(f.resultImprovementHOD || f.hodResultImprovement || "");

          setDeclaration(data.declaration || false);
        }
      } else {
        setExistingAppraisal(null);
      }
    });
    return () => unsub();
  }, [currentUser, academicYear]);

  // ==========================================
  // SCORES CALCULATIONS
  // ==========================================

  // KRA I: Pass Pct Tier Score (Max 30)
  const kra1Score = useMemo(() => {
    if (kra1Tier === "80_above") return 30;
    if (kra1Tier === "60_79") return 25;
    if (kra1Tier === "40_59") return 20;
    if (kra1Tier === "30_39") return 12;
    if (kra1Tier === "21_29") return 8;
    if (kra1Tier === "below_20") return 0;

    // Auto-tier calculation from percentage if tier not manually selected
    const p = parseFloat(kra1PassPct);
    if (isNaN(p)) return 0;
    if (p >= 80) return 30;
    if (p >= 60) return 25;
    if (p >= 40) return 20;
    if (p >= 30) return 12;
    if (p >= 21) return 8;
    return 0;
  }, [kra1Tier, kra1PassPct]);

  // KRA II: Student Centric Activities (Max 25 Marks, 12.5 per parameter achieved)
  const kra2Score = useMemo(() => {
    let s = 0;
    if (kra2Parameters.coCurricular?.achieved) s += 12.5;
    if (kra2Parameters.softSkillsSpecial?.achieved) s += 12.5;
    return s;
  }, [kra2Parameters]);

  // KRA III: Teacher Enrichment Efforts IIY (Max 20 Marks)
  const kra3Score = useMemo(() => {
    return kra3Achieved ? 20 : 0;
  }, [kra3Achieved]);

  // KRA IV: Significant Contributions (Max 5 Marks, 2.5 per contribution)
  const kra4Score = useMemo(() => {
    const validCount = kra4Contributions.filter(c => c.title && c.title.trim() !== "").length;
    return Math.min(validCount * 2.5, 5);
  }, [kra4Contributions]);

  // KRA V: Academic Excellence (Max 20 Marks)
  const kra5AvgPassPct = useMemo(() => {
    let totalPct = 0;
    let count = 0;
    kra5SubjectResults.forEach((item) => {
      const t = parseFloat(item.theoryPassPct);
      const p = parseFloat(item.practicalPassPct);
      if (!isNaN(t)) {
        totalPct += t;
        count++;
      }
      if (!isNaN(p)) {
        totalPct += p;
        count++;
      }
    });
    if (count === 0) return NaN;
    return totalPct / count;
  }, [kra5SubjectResults]);

  const kra5Score = useMemo(() => {
    if (kra5Tier === "90_above") return 20;
    if (kra5Tier === "81_90") return 10;
    if (kra5Tier === "71_80") return 8;
    if (kra5Tier === "61_70") return 6;
    if (kra5Tier === "51_60") return 4;
    if (kra5Tier === "below_50") return 0;

    if (isNaN(kra5AvgPassPct)) return 0;
    if (kra5AvgPassPct >= 90) return 20;
    if (kra5AvgPassPct >= 81) return 10;
    if (kra5AvgPassPct >= 71) return 8;
    if (kra5AvgPassPct >= 61) return 6;
    if (kra5AvgPassPct >= 51) return 4;
    return 0;
  }, [kra5Tier, kra5AvgPassPct]);

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

    const userInst = userProfile?.institution || "CKSPK (Matric)";

    const payload = {
      uid: currentUser.uid,
      hodEmail: currentUser.email,
      hodName,
      department,
      institution: userInst,
      doj,
      designation,
      qualification,
      academicYear,
      formType: "hod",
      status: isSubmit ? "HOD_Approved" : (existingAppraisal?.status || "Draft"),
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
        kra3: {
          achieved: kra3Achieved,
          score: kra3Score,
          remarks: kra3Remarks,
          proof: kra3Proof
        },
        kra4: kra4Contributions,
        kra5: {
          subjectResults: kra5SubjectResults,
          theoryPassPct: kra5SubjectResults[0]?.theoryPassPct || "",
          practicalPassPct: kra5SubjectResults[0]?.practicalPassPct || "",
          tier: kra5Tier,
          score: kra5Score,
          remarks: kra5Remarks,
          proof: kra5Proof
        },
        deptAdministrationHOD,
        resultImprovementHOD,
        hodDeptAdmin: deptAdministrationHOD,
        hodResultImprovement: resultImprovementHOD
      },
      declaration,
      submittedAt: isSubmit ? new Date().toISOString() : (existingAppraisal?.submittedAt || null),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(docRef, payload, { merge: true });
      showToast(isSubmit ? "HOD Self-Appraisal submitted successfully to Principal!" : "Draft saved successfully.", "success");
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
      <HRLayout title="HOD Appraisal Request">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#120c7a]" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Loading HOD Appraisal Portal...</p>
        </div>
      </HRLayout>
    );
  }

  const isAdminOrHR = userProfile?.role === "HR" || userProfile?.role === "Admin" || userProfile?.role === "Principal / HR";
  if (!isPortalOpen && (!existingAppraisal || existingAppraisal.status === "Draft") && !isAdminOrHR) {
    const openMs = parseAppraisalDateTime(appraisalSchedule?.openTime);
    const closeMs = parseAppraisalDateTime(appraisalSchedule?.closeTime);
    return (
      <HRLayout title="HOD Appraisal Request">
        <div className="max-w-xl mx-auto py-16 px-4">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden text-center p-8 space-y-6">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <AlertTriangle size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-850 uppercase tracking-wide">HOD Appraisal Portal is Closed</h2>
              <p className="text-zinc-500 text-xs font-medium">
                The HOD performance appraisal request submission portal is currently inactive or has reached its deadline.
              </p>
            </div>

            {appraisalSchedule && (
              <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl text-left text-xs space-y-3">
                <span className="font-bold text-slate-900 block border-b border-zinc-200 pb-1.5 uppercase">Schedule Details</span>
                <div className="flex justify-between">
                  <span className="text-zinc-400 font-bold uppercase">Target Session:</span>
                  <strong className="text-slate-800">{appraisalSchedule.academicYear || "2024-2025"}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400 font-bold uppercase">Open Time:</span>
                  <strong className="text-slate-800">
                    {openMs ? new Date(openMs).toLocaleString() : (appraisalSchedule.openTime || "Not scheduled")}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400 font-bold uppercase">Deadline Time:</span>
                  <strong className="text-slate-800">
                    {closeMs ? new Date(closeMs).toLocaleString() : (appraisalSchedule.closeTime || "Not scheduled")}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </HRLayout>
    );
  }

  return (
    <HRLayout title="HOD Appraisal Request">
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
                <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/15 backdrop-blur-md border border-white/25 rounded-xl text-xs font-black text-white tracking-wide shadow-sm">
                  <Calendar size={13} className="text-amber-400" />
                  <span>{academicYear}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submission Status Alert Banner */}
        {existingAppraisal && (
          <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${existingAppraisal.status === 'Submitted' || existingAppraisal.status === 'HOD_Approved' ? 'bg-amber-100 text-amber-700' :
                existingAppraisal.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                  existingAppraisal.status === 'Returned' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-700'
                }`}>
                <FileText size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Status:</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${existingAppraisal.status === 'Submitted' || existingAppraisal.status === 'HOD_Approved' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                    existingAppraisal.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                      existingAppraisal.status === 'Returned' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                    {existingAppraisal.status === 'Submitted' || existingAppraisal.status === 'HOD_Approved' ? 'Forwarded to Principal (HOD Approved)' : existingAppraisal.status}
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
            <h2 className="text-sm font-black text-slate-850 uppercase tracking-wider">General Information of Coordinator</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Name of the Coordinator</label>
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

        {/* ========================================================================= */}
        {/* KRA I: ACADEMIC IMPROVEMENT: Academic Performance in Examinations (30 Marks) */}
        {/* Target: Overall Exam Pass Percentage = 80% */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">I</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">ACADEMIC IMPROVEMENT: Academic Performance in Examinations</h3>
                <p className="text-[10px] text-zinc-500 font-semibold">Parameter / Target: Overall Exam Pass Percentage = 80%</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase block">Weightage: 30 Marks</span>
              <span className="text-xs font-black text-indigo-700">Score: {kra1Score} / 30</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Overall Exam Pass Percentage (%)</label>
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
                placeholder="e.g. 82.5"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Metrics / Performance Tier</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { tier: "80_above", label: "80% & Above (30 Marks)", score: 30 },
                  { tier: "60_79", label: "60 - 79% (25 Marks)", score: 25 },
                  { tier: "40_59", label: "40 - 59% (20 Marks)", score: 20 },
                  { tier: "30_39", label: "30 - 39% (12 Marks)", score: 12 },
                  { tier: "21_29", label: "21 - 29% (8 Marks)", score: 8 },
                  { tier: "below_20", label: "Below 20% (0 Marks)", score: 0 }
                ].map((item) => (
                  <button
                    key={item.tier}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra1Tier(item.tier)}
                    className={`py-2 px-2.5 rounded-xl text-[10px] font-bold border transition-all ${kra1Tier === item.tier || (kra1Score === item.score && !kra1Tier)
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
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Remarks / Details of Exam Results</label>
              <textarea
                rows={2}
                value={kra1Remarks}
                onChange={(e) => setKra1Remarks(e.target.value)}
                disabled={isReadOnly}
                placeholder="Details of examination pass percentage, semester summary, top achievers..."
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

        {/* ========================================================================= */}
        {/* KRA II: STUDENT CENTRIC ACTIVITIES (25 Marks) */}
        {/* Students participation in Co-curricular activities & Organizing Student Centered Special Programs */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">II</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">STUDENT CENTRIC ACTIVITIES</h3>
                <p className="text-[10px] text-zinc-500 font-semibold">
                  Students participation in Co-curricular activities & Organizing Student Centered Special Programs (Supported with necessary documents along with outcome)
                </p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase block">Weightage: 25 Marks</span>
              <span className="text-xs font-black text-indigo-700">Score: {kra2Score} / 25</span>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {[
              {
                key: "coCurricular",
                title: "1. Co-curricular Participation Target",
                targetText: "Ensured Minimum of 60% Student's Participation in Co-curricular Activities if any"
              },
              {
                key: "softSkillsSpecial",
                title: "2. Student Special Training & Development Programs",
                targetText: "Soft Skill Training / Career guidance/ Govt Exam awareness / Life Skill Program / Olympiad as per the Schedule & Target"
              }
            ].map((param) => {
              const currentData = kra2Parameters[param.key] || { achieved: false, remarks: "", fileUrl: "", fileName: "" };
              return (
                <div key={param.key} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">{param.title}</span>
                      <p className="text-[11px] text-zinc-600 font-medium mt-0.5">{param.targetText}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setKra2Parameters(prev => ({
                          ...prev,
                          [param.key]: { ...prev[param.key], achieved: true }
                        }))}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[10px] transition-all ${currentData.achieved
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                          }`}
                      >
                        100% Target Achieved (12.5 Marks)
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setKra2Parameters(prev => ({
                          ...prev,
                          [param.key]: { ...prev[param.key], achieved: false }
                        }))}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[10px] transition-all ${!currentData.achieved
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
                        placeholder="Details of participation %, programs conducted, and outcomes..."
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
                            <span>{uploadingMap[`kra2_${param.key}`] ? "Uploading..." : "Attach Proof File"}</span>
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

        {/* ========================================================================= */}
        {/* KRA III: TEACHERS ENRICHMENT EFFORTS: Invest in Yourself (IIY) (20 Marks) */}
        {/* Parameter / Target: Knowledge Sharing Sessions conducted per week and presented at least 1 learned topic */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">III</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">TEACHERS ENRICHMENT EFFORTS: Invest in Yourself (IIY)</h3>
                <p className="text-[10px] text-zinc-500 font-semibold">
                  Parameter / Target: Knowledge Sharing Sessions conducted per week and have presented atleast 1 learned topic to the teachers and ensure good ratings
                </p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase block">Weightage: 20 Marks</span>
              <span className="text-xs font-black text-indigo-700">Score: {kra3Score} / 20</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900 text-xs">Invest in Yourself (IIY) Target Achievement</span>
                <p className="text-[11px] text-zinc-600 font-medium mt-0.5">Achieving 100% target in parameter gives 20 Marks. Below target gives Nil (0 Marks).</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setKra3Achieved(true)}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all ${kra3Achieved
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                >
                  Achieving 100% Target (20 Marks)
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setKra3Achieved(false)}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all ${!kra3Achieved
                    ? "bg-zinc-700 text-white shadow-sm"
                    : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                >
                  Below Target - Nil (0 Marks)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Remarks / Details of IIY Presentations & Ratings</label>
              <textarea
                rows={2}
                value={kra3Remarks}
                onChange={(e) => setKra3Remarks(e.target.value)}
                disabled={isReadOnly}
                placeholder="Topic presented, date of session, number of faculty participants, ratings received..."
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-100"
              />
            </div>

            <div className="flex items-center gap-3">
              {kra3Proof.fileUrl ? (
                <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700">
                  <Paperclip size={14} />
                  <a href={kra3Proof.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">{kra3Proof.fileName || "View Attachment"}</a>
                  {!isReadOnly && (
                    <button type="button" onClick={() => setKra3Proof({ fileUrl: "", fileName: "" })} className="text-rose-500 hover:text-rose-700 ml-1">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ) : (
                !isReadOnly && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer transition-all">
                    <UploadCloud size={14} />
                    <span>{uploadingMap["kra3"] ? "Uploading..." : "Attach IIY Proof (PPT / Rating Sheet)"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "kra3", (url, name) => setKra3Proof({ fileUrl: url, fileName: name }))}
                    />
                  </label>
                )
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KRA IV: Significant Contribution towards Department / Personal Development (5 Marks) */}
        {/* Parameter / Target: Book, Chapter Publication / Interaction with outside world / Foreign visit / Special Awards */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">IV</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Significant Contribution towards Department / Personal Development</h3>
                <p className="text-[10px] text-zinc-500 font-semibold">
                  Book, Chapter Publication / Interaction with outside world / Foreign visit for academic interactions / Special Awards, if any (2.5 Marks for each Contribution, Max 5 Marks)
                </p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[10px] font-black text-indigo-900 uppercase block">Weightage: 5 Marks</span>
              <span className="text-xs font-black text-indigo-700">Score: {kra4Score} / 5</span>
            </div>
          </div>

          <div className="space-y-3">
            {kra4Contributions.map((contrib, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200/70 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">Contribution #{idx + 1}</span>
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
                      placeholder="e.g. Book Chapter / Outside World Interaction / Special Award"
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
                      placeholder="Scope, publisher, awarding body, date..."
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

        {/* ========================================================================= */}
        {/* KRA V: Academic Excellence (20 Marks) */}
        {/* Public/Annual Examination Result (Theory Subject Pass % - 95% | Practical Subject Pass % - 90%) */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">V</span>
              <div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Academic Excellence</h3>
                <p className="text-[10px] text-zinc-500 font-semibold">
                  Public / Annual Examination Result (Theory Subject Pass % Target - 95% | Practical Subject Pass % Target - 90%)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addKra5SubjectResult}
                  className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[#120c7a] font-bold text-xs rounded-xl transition-all flex items-center gap-1 shadow-xs"
                >
                  <Plus size={14} /> Add Subject Result
                </button>
              )}
              <div className="bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl text-center">
                <span className="text-[10px] font-black text-indigo-900 uppercase block">Weightage: 20 Marks</span>
                <span className="text-xs font-black text-indigo-700">Score: {kra5Score} / 20{!isNaN(kra5AvgPassPct) && ` (Avg: ${kra5AvgPassPct.toFixed(1)}%)`}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {kra5SubjectResults.map((item, index) => (
              <div key={index} className="p-4 bg-zinc-50/70 border border-zinc-200/80 rounded-2xl relative space-y-3">
                {kra5SubjectResults.length > 1 && (
                  <div className="flex items-center justify-between pb-1 border-b border-zinc-200/50">
                    <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider">Subject Result #{index + 1}</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeKra5SubjectResult(index)}
                        className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Remove Subject Result"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">
                      Theory Subject Pass % (Target: 95%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={item.theoryPassPct}
                      onChange={(e) => handleKra5SubjectChange(index, "theoryPassPct", e.target.value)}
                      disabled={isReadOnly}
                      placeholder="e.g. 96.0"
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">
                      Practical Subject Pass % (Target: 90%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={item.practicalPassPct}
                      onChange={(e) => handleKra5SubjectChange(index, "practicalPassPct", e.target.value)}
                      disabled={isReadOnly}
                      placeholder="e.g. 92.5"
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Metrics / Performance Tier</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { tier: "90_above", label: "90% & Above (20 Marks)", score: 20 },
                  { tier: "81_90", label: "81 - 90% (10 Marks)", score: 10 },
                  { tier: "71_80", label: "71 - 80% (8 Marks)", score: 8 },
                  { tier: "61_70", label: "61 - 70% (6 Marks)", score: 6 },
                  { tier: "51_60", label: "51 - 60% (4 Marks)", score: 4 },
                  { tier: "below_50", label: "Below 50% (0 Marks)", score: 0 }
                ].map((item) => (
                  <button
                    key={item.tier}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setKra5Tier(item.tier)}
                    className={`py-2 px-2.5 rounded-xl text-[10px] font-bold border transition-all ${kra5Tier === item.tier || (kra5Score === item.score && !kra5Tier)
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
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Remarks / Examination Performance Summary</label>
              <textarea
                rows={2}
                value={kra5Remarks}
                onChange={(e) => setKra5Remarks(e.target.value)}
                disabled={isReadOnly}
                placeholder="Details of theory & practical subject results, pass count, top marks..."
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-medium text-slate-800 outline-none focus:border-indigo-600 transition-all disabled:bg-zinc-50"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              {kra5Proof.fileUrl ? (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700">
                  <Paperclip size={14} />
                  <a href={kra5Proof.fileUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">{kra5Proof.fileName || "View Attachment"}</a>
                  {!isReadOnly && (
                    <button type="button" onClick={() => setKra5Proof({ fileUrl: "", fileName: "" })} className="text-rose-500 hover:text-rose-700 ml-1">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ) : (
                !isReadOnly && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer transition-all">
                    <UploadCloud size={14} />
                    <span>{uploadingMap["kra5"] ? "Uploading..." : "Attach Result Sheet (PDF / Image)"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "kra5", (url, name) => setKra5Proof({ fileUrl: url, fileName: name }))}
                    />
                  </label>
                )
              )}
            </div>
          </div>
        </div>

        {/* Department Administration & Result Improvement */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="border-b border-zinc-150 pb-3">
            <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">
              Department Administration & Result Improvement
            </h3>
            <p className="text-[10px] text-zinc-500 font-semibold">
              Planning, Monitoring, Evaluation, Lab Upkeep & Result Improvement for the Department
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                Department Administration / Planning / Monitoring & Evaluation
              </label>
              <textarea
                rows={3}
                disabled={isReadOnly}
                value={deptAdministrationHOD}
                onChange={(e) => setDeptAdministrationHOD(e.target.value)}
                placeholder="Specify administrative, planning, monitoring and evaluation details..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                Result Improvement of the Department, Department Ambience, Laboratory Development and Maintenance
              </label>
              <textarea
                rows={3}
                disabled={isReadOnly}
                value={resultImprovementHOD}
                onChange={(e) => setResultImprovementHOD(e.target.value)}
                placeholder="Specify details for departmental result improvement, lab upkeep, and maintenance..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Digital Declaration & Submission Bar */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3 bg-indigo-50/60 border border-indigo-150 p-4 rounded-2xl">
            <input
              type="checkbox"
              id="hod-declaration"
              checked={declaration}
              onChange={(e) => setDeclaration(e.target.checked)}
              disabled={isReadOnly}
              className="mt-1 w-4 h-4 text-indigo-600 rounded border-zinc-300 focus:ring-indigo-500"
            />
            <label htmlFor="hod-declaration" className="text-xs text-slate-800 font-medium leading-relaxed cursor-pointer">
              <strong className="font-bold block text-slate-900 mb-0.5 uppercase tracking-wide text-[10px]">Digital Declaration</strong>
              I hereby declare that the performance particulars, exam pass percentages, and evidence attachments submitted in this HOD Self-Appraisal form are accurate and complete to the best of my knowledge.
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs font-bold text-slate-700">
              Computed Total Score: <span className="text-amber-600 font-black text-base">{totalScore}</span> / 100 Marks
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(false)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-zinc-100 hover:bg-zinc-200 text-slate-800 font-bold rounded-xl text-xs transition-all border border-zinc-200 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>Save Draft</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(true)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer border-0"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    <span>Submit to Principal</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </HRLayout>
  );
}
