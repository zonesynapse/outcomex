import React, { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import HRLayout from "../components/HRLayout";
import evaluateAppraisal, { checkAppraisalPortalStatus, DEFAULT_CRITERIA, getSchoolBannerTitle, getSchoolShortName } from "../utils/appraisalScore";
import {
  FileText,
  Save,
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Calendar,
  User,
  Building,
  Award,
  BookOpen,
  Briefcase,
  HelpCircle,
  ChevronRight,
  Loader2,
  GraduationCap,
  Target,
  FileCheck,
  Users,
  HeartHandshake,
  Check,
  X
} from "lucide-react";

export default function TeacherAppraisal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [appraisalSchedule, setAppraisalSchedule] = useState(null);
  const [isPortalOpen, setIsPortalOpen] = useState(true);
  const [checkingSchedule, setCheckingSchedule] = useState(true);
  const [existingAppraisal, setExistingAppraisal] = useState(null);
  const [activeTab, setActiveTab] = useState(1);

  // Academic Year State
  const [academicYear, setAcademicYear] = useState("2024-2025");

  // Initial Form Data matching CKSPE Self-Appraisal Form for Teaching (Images 1-4)
  const initialFormData = {
    // 1. Staff Profile & Experience (Q1-Q7)
    name: "",
    dob: "",
    age: "",
    designation: "",
    department: "",
    dojCollege: "",
    dojPresentPost: "",
    qualification: "",
    specialization: "",
    expCKSPE: "",
    expOther: "",
    expIndustrial: "",

    // 2. Workload & Academic Results (Q8-Q12)
    workload: {
      theory: "",
      practical: "",
      specialClass: "",
      otherActivity: "",
      total: ""
    },

    // Q9: THEORY Quarterly Exam (Sep 2024-25)
    resultsQuarterly: [
      { class: "", subject: "", appeared: "", passed: "", passPercent: "" }
    ],

    // Q10: THEORY Half Yearly Exam (Dec 2024-25)
    resultsHalfYearly: [
      { class: "", subject: "", appeared: "", passed: "", passPercent: "" }
    ],

    // Q11a: THEORY Annual Exam (April 2024-25)
    resultsAnnualTheory: [
      { class: "", subject: "", appeared: "", passed: "", passPercent: "" }
    ],

    // Q11b: PRACTICALS Annual Exam (April 2024-25)
    resultsAnnualPractical: [
      { class: "", subject: "", appeared: "", passed: "", passPercent: "" }
    ],

    // Q12: Results Attributed To
    resultsAttributedTo: {
      yourself: false,
      students: false,
      both: false,
      prevailingCircumstances: false
    },

    // 3. Invest In Yourself & Growth (Q14 A-G)
    // A) Details of No. of Classes handled per week
    iiyClasses: [
      { topic: "", numClasses: "", sessionDate: "", rating: "" }
    ],
    // B) Outcome & achievements of IIY
    iiyOutcome: "",

    // C) Participation in Workshops / Conferences / Seminars / Special Programs
    workshops: [
      { title: "", dates: "", numDays: "", organization: "", reportSubmitted: "Yes", fileUrl: "", fileName: "" }
    ],

    // D) Are you improving your Qualification?
    improvingQualification: "No", // Yes | No
    qualificationDetails: [
      { degree: "", specialization: "", university: "", duration: "", status: "", nocObtained: "Yes" }
    ],

    // E) Involvement in Dept Development / Student Welfare / Mentoring
    deptInvolvement: [
      { description: "", role: "", outcome: "", recordsMaintained: "Yes" }
    ],

    // F) Contribution towards Alumni / Sports / NSS / Others
    otherContributions: [
      { role: "", description: "", outcome: "" }
    ],

    // H) Specify your Role / Contribution, if any other than the above
    otherRoleContribution: "",

    // 15. Admissions Contributed to Institutions
    admissionsInstitution: [
      { area: "", count: "" }
    ],

    // 15. Admissions Contributed to Vijayadashami
    admissionsVijayadashami: [
      { area: "", count: "" }
    ],

    // 16. No. of TC Issued
    numTCsIssued: "",

    // 17-20. Work Habits & Leave Details
    accomplishAssignment: "Yes", // Yes | with reminder | Depends on my interest
    applyLeaveAdvance: "Yes", // Yes | Most of the time | No
    leaveDetails: {
      cl: "0",
      coff: "0",
      llp: "0",
      odPublicExam: "0",
      odOthers: "0",
      odInst: "0"
    },
    consumeBalanceCL: "No", // Yes | If required | No

    // 22-24. Interpersonal Relationships
    relStudents: { rating: "Good", reason: "" }, // Good | Fair | Unsatisfactory | Should be improved
    relColleagues: { rating: "Good", reason: "" },
    relSuperiors: { rating: "Good", reason: "" },

    // 5. Department Rating, Targets & Self Analysis (Q25-Q30)
    // Q25: Department Rating
    deptRating: "Good", // Good | Fair | Unsatisfactory | Should be improved
    deptRatingReason: "",

    // Q26: Potential Utilization
    potentialUtilization: "Properly Utilized", // Over Burdened | Properly Utilized | Under Utilized | Not utilized at all

    // Q27: Targets & Strategy
    targetsNextYear: "",
    targetsStrategy: "",

    // Q28: Difficulties faced & Suggestions
    difficultiesAndSuggestions: "",

    // Q29: Assessment Self Placement
    selfAssessmentPlacement: "At par", // Above | At par | Below

    // Q30: Self Analysis (Strengths & Weaknesses)
    selfAnalysis: [
      { strength: "", weakness: "" }
    ],

    // Declaration & Certification
    certified: false,
    declarationDate: new Date().toISOString().split("T")[0],

    // Dynamic Custom Fields
    customFields: {}
  };

  const [formData, setFormData] = useState(initialFormData);

  // User Auth Observer
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const localStr = localStorage.getItem(`user_profile_${user.uid}`);
        const localProf = localStr ? JSON.parse(localStr) : null;
        try {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserProfile(data);
            setFormData(prev => ({
              ...prev,
              name: prev.name || data.name || user.displayName || "",
              designation: prev.designation || data.designation || data.role || "",
              department: prev.department || data.department || "",
              qualification: prev.qualification || data.qualification || ""
            }));
          } else if (localProf) {
            setUserProfile(localProf);
            setFormData(prev => ({
              ...prev,
              name: prev.name || localProf.name || "",
              designation: prev.designation || localProf.role || "",
              department: prev.department || localProf.department || ""
            }));
          }
        } catch (e) {
          console.warn("User profile fetch notice:", e);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  const [evalCriteria, setEvalCriteria] = useState(DEFAULT_CRITERIA);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Fetch Appraisal Evaluation Criteria
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "appraisal_config", "criteria"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.criteriaVersion === "2026_v2") {
          setEvalCriteria({
            part1: Array.isArray(data.part1) ? data.part1 : DEFAULT_CRITERIA.part1,
            part2: Array.isArray(data.part2) ? data.part2 : DEFAULT_CRITERIA.part2
          });
        } else {
          setEvalCriteria(DEFAULT_CRITERIA);
        }
      } else {
        setEvalCriteria(DEFAULT_CRITERIA);
      }
    });
    return () => unsub();
  }, []);

  // Compute Live Performance Score
  const liveScore = useMemo(() => {
    return evaluateAppraisal(formData, evalCriteria);
  }, [formData, evalCriteria]);

  // Fetch Appraisal Schedule & Active Status
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "appraisal_config", "schedule"), (snap) => {
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

  // Fetch Existing Teacher Appraisal Document
  useEffect(() => {
    if (!currentUser) return;
    const docId = `${currentUser.uid}_${academicYear}`;
    const unsub = onSnapshot(doc(db, "teacher_appraisals", docId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExistingAppraisal(data);
        if (data.formData) {
          setFormData(prev => ({
            ...initialFormData,
            ...data.formData,
            // Ensure array fields default to at least one row
            resultsQuarterly: Array.isArray(data.formData.resultsQuarterly) && data.formData.resultsQuarterly.length ? data.formData.resultsQuarterly : initialFormData.resultsQuarterly,
            resultsHalfYearly: Array.isArray(data.formData.resultsHalfYearly) && data.formData.resultsHalfYearly.length ? data.formData.resultsHalfYearly : initialFormData.resultsHalfYearly,
            resultsAnnualTheory: Array.isArray(data.formData.resultsAnnualTheory) && data.formData.resultsAnnualTheory.length ? data.formData.resultsAnnualTheory : initialFormData.resultsAnnualTheory,
            resultsAnnualPractical: Array.isArray(data.formData.resultsAnnualPractical) && data.formData.resultsAnnualPractical.length ? data.formData.resultsAnnualPractical : initialFormData.resultsAnnualPractical,
            iiyClasses: Array.isArray(data.formData.iiyClasses) && data.formData.iiyClasses.length ? data.formData.iiyClasses : initialFormData.iiyClasses,
            workshops: Array.isArray(data.formData.workshops) && data.formData.workshops.length ? data.formData.workshops : initialFormData.workshops,
            qualificationDetails: Array.isArray(data.formData.qualificationDetails) && data.formData.qualificationDetails.length ? data.formData.qualificationDetails : initialFormData.qualificationDetails,
            deptInvolvement: Array.isArray(data.formData.deptInvolvement) && data.formData.deptInvolvement.length ? data.formData.deptInvolvement : initialFormData.deptInvolvement,
            otherContributions: Array.isArray(data.formData.otherContributions) && data.formData.otherContributions.length ? data.formData.otherContributions : initialFormData.otherContributions,
            admissionsInstitution: Array.isArray(data.formData.admissionsInstitution) && data.formData.admissionsInstitution.length ? data.formData.admissionsInstitution : initialFormData.admissionsInstitution,
            admissionsVijayadashami: Array.isArray(data.formData.admissionsVijayadashami) && data.formData.admissionsVijayadashami.length ? data.formData.admissionsVijayadashami : initialFormData.admissionsVijayadashami,
            numTCsIssued: data.formData.numTCsIssued || "",
            leaveDetails: {
              ...initialFormData.leaveDetails,
              ...(data.formData.leaveDetails || {})
            },
            relStudents: data.formData.relStudents || initialFormData.relStudents,
            relColleagues: data.formData.relColleagues || initialFormData.relColleagues,
            relSuperiors: data.formData.relSuperiors || initialFormData.relSuperiors,
            selfAnalysis: Array.isArray(data.formData.selfAnalysis) && data.formData.selfAnalysis.length ? data.formData.selfAnalysis : initialFormData.selfAnalysis
          }));
        }
      }
    });
    return () => unsub();
  }, [currentUser, academicYear]);

  // Input Change Handlers
  const handleTextChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  const handleCheckboxToggle = (parent, key) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [key]: !prev[parent]?.[key]
      }
    }));
  };

  // Dynamic Array Helpers
  const handleArrayRowChange = (arrayKey, index, field, value) => {
    setFormData(prev => {
      const list = [...(prev[arrayKey] || initialFormData[arrayKey] || [])];
      list[index] = { ...list[index], [field]: value };

      // Auto compute pass % for exam tables
      if (["appeared", "passed"].includes(field)) {
        const app = parseFloat(field === "appeared" ? value : list[index].appeared) || 0;
        const pas = parseFloat(field === "passed" ? value : list[index].passed) || 0;
        if (app > 0) {
          list[index].passPercent = ((pas / app) * 100).toFixed(1) + "%";
        } else {
          list[index].passPercent = "";
        }
      }
      return { ...prev, [arrayKey]: list };
    });
  };

  const addArrayRow = (arrayKey, defaultObj) => {
    setFormData(prev => ({
      ...prev,
      [arrayKey]: [...(prev[arrayKey] || initialFormData[arrayKey] || []), defaultObj]
    }));
  };

  const removeArrayRow = (arrayKey, index) => {
    setFormData(prev => {
      const list = [...(prev[arrayKey] || initialFormData[arrayKey] || [])];
      if (list.length <= 1) return prev; // keep at least 1 row
      list.splice(index, 1);
      return { ...prev, [arrayKey]: list };
    });
  };

  // Auto calculate total workload
  const calculateTotalWorkload = (wl) => {
    const t = parseFloat(wl.theory) || 0;
    const p = parseFloat(wl.practical) || 0;
    const s = parseFloat(wl.specialClass) || 0;
    const o = parseFloat(wl.otherActivity) || 0;
    return (t + p + s + o).toFixed(1);
  };

  const handleSubmitButtonClick = () => {
    if (!formData.name || !formData.department) {
      alert("Please fill in your Name and Department before submitting.");
      return;
    }
    if (!formData.certified) {
      alert("Please confirm the declaration check before submitting.");
      return;
    }
    setShowSubmitModal(true);
  };

  // Save / Submit Handlers
  const handleSave = async (isSubmit = false) => {
    if (!currentUser) return;
    if (isSubmit) {
      if (!formData.name || !formData.department) {
        alert("Please fill in your Name and Department before submitting.");
        return;
      }
      if (!formData.certified) {
        alert("Please confirm the declaration check before submitting.");
        return;
      }
    }

    if (isSubmit) setSubmitting(true);
    else setSaving(true);

    try {
      const docId = `${currentUser.uid}_${academicYear}`;
      const docRef = doc(db, "teacher_appraisals", docId);

      // Computed Total Workload
      const updatedFormData = {
        ...formData,
        workload: {
          ...formData.workload,
          total: calculateTotalWorkload(formData.workload)
        }
      };

      const scoreResult = evaluateAppraisal(updatedFormData, evalCriteria);

      const userInst = userProfile?.institution || formData.institution || (currentUser ? JSON.parse(localStorage.getItem(`user_profile_${currentUser.uid}`) || "{}")?.institution : "") || "CKSPK (Matric)";

      const payload = {
        docId,
        formType: "teacher",
        facultyId: currentUser.uid,
        facultyName: formData.name || userProfile?.name || currentUser.email,
        facultyEmail: currentUser.email,
        department: formData.department || userProfile?.department || "General",
        institution: userInst,
        academicYear,
        formData: {
          ...updatedFormData,
          institution: userInst
        },
        totalScore: scoreResult.grandTotal,
        evaluatedScore: scoreResult,
        status: isSubmit ? "Submitted" : (existingAppraisal?.status || "Draft"),
        submittedAt: isSubmit ? new Date().toISOString() : (existingAppraisal?.submittedAt || null),
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload, { merge: true });
      alert(isSubmit ? "Teacher Appraisal Form submitted to Coordinator successfully!" : "Progress saved as draft.");
    } catch (error) {
      console.error("Save Teacher Appraisal error:", error);
      alert("Failed to save appraisal: " + error.message);
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  if (loading || checkingSchedule) {
    return (
      <HRLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-600">Loading Teacher Appraisal Request Form...</p>
        </div>
      </HRLayout>
    );
  }

  const status = existingAppraisal?.status || "Draft";
  const isReadOnly = !isPortalOpen || status === "Approved" || status === "HOD_Approved" || status === "Submitted";

  const instName = userProfile?.institution || existingAppraisal?.institution || existingAppraisal?.formData?.institution || (currentUser ? JSON.parse(localStorage.getItem(`user_profile_${currentUser.uid}`) || "{}")?.institution : "") || "";
  const schoolTitle = getSchoolBannerTitle(instName);
  const schoolShortName = getSchoolShortName(instName);

  const tabs = [
    { id: 1, name: "1. Staff Profile & Experience", icon: User },
    { id: 2, name: "2. Workload & Academic Results", icon: BookOpen },
    { id: 3, name: "3. Invest In Yourself & Admissions", icon: GraduationCap },
    { id: 4, name: "4. Work Habits, Leaves & Relationships", icon: Users },
    { id: 5, name: "5. Rating, Targets & Self Analysis", icon: Target }
  ];

  return (
    <HRLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-16">
        {/* Header Title Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-full text-xs font-bold tracking-wider uppercase">
                  {schoolTitle}
                </span>
                <div className="bg-white/15 backdrop-blur-md border border-white/25 rounded-xl px-3.5 py-1 text-xs font-black text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Academic Session {academicYear}</span>
                </div>
              </div>

              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-heading">
                Teacher Appraisal Request Form
              </h1>
              <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-2xl font-medium">
                Self-Appraisal Form for Teaching Staff. Formulated to assess your academic performance, subject results, IIY growth, and departmental contributions.
              </p>
            </div>

            {/* Status & Actions Pill */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className={`px-4 py-2 rounded-2xl text-xs font-extrabold uppercase tracking-wider border shadow-sm ${status === "Approved" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                status === "HOD_Approved" ? "bg-blue-500/20 text-blue-300 border-blue-500/40" :
                  status === "Submitted" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                    "bg-slate-700/50 text-slate-300 border-slate-600/50"
                }`}>
                Status: {status.replace("_", " ")}
              </span>

              {!isReadOnly && (
                <>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Draft
                  </button>

                  <button
                    onClick={handleSubmitButtonClick}
                    disabled={submitting}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit to Coordinator
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Closed Portal Alert */}
        {!isPortalOpen && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800 text-xs font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>The Appraisal Portal submission window is currently closed or outside the scheduled timeline. Form is displayed in Read-Only mode.</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 overflow-x-auto gap-2 no-scrollbar bg-white p-2 rounded-2xl shadow-xs border border-slate-200/80">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                  }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: STAFF PROFILE & EXPERIENCE ── */}
        {activeTab === 1 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-8 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600" /> 1. General Profile & Service Details
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Please review and complete your personal profile information.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">1. Name of Teacher *</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.name}
                  onChange={e => handleTextChange("name", e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">2. Date of Birth</label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={formData.dob}
                  onChange={e => handleTextChange("dob", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Age (Yrs)</label>
                <input
                  type="number"
                  disabled={isReadOnly}
                  value={formData.age}
                  onChange={e => handleTextChange("age", e.target.value)}
                  placeholder="e.g. 35"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">3. Designation</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.designation}
                  onChange={e => handleTextChange("designation", e.target.value)}
                  placeholder="e.g. Senior Teacher / PGT"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Department *</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.department}
                  onChange={e => handleTextChange("department", e.target.value)}
                  placeholder="e.g. Mathematics / Science"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">4. Date of Joining School</label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={formData.dojCollege}
                  onChange={e => handleTextChange("dojCollege", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Date of Joining Present Post</label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={formData.dojPresentPost}
                  onChange={e => handleTextChange("dojPresentPost", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">5. Academic Qualification</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.qualification}
                  onChange={e => handleTextChange("qualification", e.target.value)}
                  placeholder="e.g. M.Sc, M.Ed, Ph.D"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">6. Subject of Interest / Specialization</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.specialization}
                  onChange={e => handleTextChange("specialization", e.target.value)}
                  placeholder="e.g. Physics / Calculus"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>
            </div>

            {/* Experience Section */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-4">7. Experience Details (in Years)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">a) Teaching at {schoolShortName}</label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={isReadOnly}
                    value={formData.expCKSPE}
                    onChange={e => handleTextChange("expCKSPE", e.target.value)}
                    placeholder="e.g. 4.5"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">b) Teaching Elsewhere</label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={isReadOnly}
                    value={formData.expOther}
                    onChange={e => handleTextChange("expOther", e.target.value)}
                    placeholder="e.g. 2.0"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: WORKLOAD & ACADEMIC RESULTS ── */}
        {activeTab === 2 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            {/* Workload */}
            <div>
              <div className="border-b border-slate-100 pb-4 mb-6">
                <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" /> 8. Weekly Workload Allocation (Hrs/Week)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Specify hours assigned per week for Academic Session {academicYear}.</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">a) Theory</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={formData.workload?.theory || ""}
                    onChange={e => handleNestedChange("workload", "theory", e.target.value)}
                    placeholder="Hrs"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">b) Practical</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={formData.workload?.practical || ""}
                    onChange={e => handleNestedChange("workload", "practical", e.target.value)}
                    placeholder="Hrs"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">c) Special Class</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={formData.workload?.specialClass || ""}
                    onChange={e => handleNestedChange("workload", "specialClass", e.target.value)}
                    placeholder="Hrs"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">d) Other Activity</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={formData.workload?.otherActivity || ""}
                    onChange={e => handleNestedChange("workload", "otherActivity", e.target.value)}
                    placeholder="Hrs"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-indigo-700 uppercase mb-1.5">e) Total Hrs/Wk</label>
                  <input
                    type="text"
                    disabled
                    value={calculateTotalWorkload(formData.workload)}
                    className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-black"
                  />
                </div>
              </div>
            </div>

            {/* Helper Component to render Exam Tables */}
            {renderExamTableSection({
              title: "9. Subjects Handled & Pass Percentage: THEORY: Quarterly Examination – (Sep - 2024-25)",
              arrayKey: "resultsQuarterly",
              list: formData.resultsQuarterly,
              isReadOnly,
              handleArrayRowChange,
              addArrayRow,
              removeArrayRow
            })}

            {renderExamTableSection({
              title: "10. Subjects Handled & Pass Percentage: THEORY: Half Yearly Examination – (Dec – 2024-25)",
              arrayKey: "resultsHalfYearly",
              list: formData.resultsHalfYearly,
              isReadOnly,
              handleArrayRowChange,
              addArrayRow,
              removeArrayRow
            })}

            {renderExamTableSection({
              title: "11. Subjects Handled & Pass Percentage: THEORY: Annual Examination – (April – 2024-25)",
              arrayKey: "resultsAnnualTheory",
              list: formData.resultsAnnualTheory,
              isReadOnly,
              handleArrayRowChange,
              addArrayRow,
              removeArrayRow
            })}

            {renderExamTableSection({
              title: "PRACTICALS – Annual Examination – (April – 2024-25)",
              arrayKey: "resultsAnnualPractical",
              list: formData.resultsAnnualPractical,
              isReadOnly,
              handleArrayRowChange,
              addArrayRow,
              removeArrayRow
            })}

            {/* Results Attribution */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                12. To whom do you think these results can be attributed to?
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { key: "yourself", label: "Yourself" },
                  { key: "students", label: "Students" },
                  { key: "both", label: "Both" },
                  { key: "prevailingCircumstances", label: "Prevailing Circumstances" }
                ].map(opt => (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.resultsAttributedTo?.[opt.key]
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={!!formData.resultsAttributedTo?.[opt.key]}
                      onChange={() => handleCheckboxToggle("resultsAttributedTo", opt.key)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: INVEST IN YOURSELF & GROWTH ── */}
        {activeTab === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" /> 14. INVEST IN YOURSELF
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Academic sessions, workshops, qualifications, and department development contributions.</p>
            </div>

            {/* A) IIY Classes Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  A) Details of the No. of Classes handled per week (2024 - 2025)
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("iiyClasses", { topic: "", numClasses: "", sessionDate: "", rating: "" })}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Topic Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3">Topic</th>
                      <th className="p-3 text-center w-36">Number of Classes</th>
                      <th className="p-3 text-center w-48">Date of Knowledge Sharing Sessions</th>
                      <th className="p-3 text-center w-40">Teachers Rating (1-10)</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {(formData.iiyClasses || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.topic}
                            onChange={e => handleArrayRowChange("iiyClasses", idx, "topic", e.target.value)}
                            placeholder="Topic title..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={row.numClasses}
                            onChange={e => handleArrayRowChange("iiyClasses", idx, "numClasses", e.target.value)}
                            placeholder="Classes"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            disabled={isReadOnly}
                            value={row.sessionDate}
                            onChange={e => handleArrayRowChange("iiyClasses", idx, "sessionDate", e.target.value)}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            max="10"
                            disabled={isReadOnly}
                            value={row.rating}
                            onChange={e => handleArrayRowChange("iiyClasses", idx, "rating", e.target.value)}
                            placeholder="Rating (1-10)"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center text-indigo-700"
                          />
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("iiyClasses", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* B) IIY Outcome */}
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                * Specify the Outcome and achievements of IIY
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={formData.iiyOutcome}
                onChange={e => handleTextChange("iiyOutcome", e.target.value)}
                placeholder="Detail the key learning outcomes and achievements from your Invest In Yourself sessions..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              ></textarea>
            </div>

            {/* C) Workshops Table */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  C) Participation in Workshops / Conferences / Seminars and Special Programs
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("workshops", { title: "", dates: "", numDays: "", organization: "", reportSubmitted: "Yes", fileUrl: "", fileName: "" })}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Program Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3">Title of Program</th>
                      <th className="p-3 text-center w-32">Dates</th>
                      <th className="p-3 text-center w-24">No. of Days</th>
                      <th className="p-3 w-40">Organization</th>
                      <th className="p-3 text-center w-28">Report Submitted</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {(formData.workshops || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.title}
                            onChange={e => handleArrayRowChange("workshops", idx, "title", e.target.value)}
                            placeholder="Title of Workshop / Seminar..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.dates}
                            onChange={e => handleArrayRowChange("workshops", idx, "dates", e.target.value)}
                            placeholder="e.g. 12 Oct - 14 Oct"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={row.numDays}
                            onChange={e => handleArrayRowChange("workshops", idx, "numDays", e.target.value)}
                            placeholder="Days"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.organization}
                            onChange={e => handleArrayRowChange("workshops", idx, "organization", e.target.value)}
                            placeholder="Organizing Body"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <select
                            disabled={isReadOnly}
                            value={row.reportSubmitted}
                            onChange={e => handleArrayRowChange("workshops", idx, "reportSubmitted", e.target.value)}
                            className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                          >
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("workshops", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* D) Qualification Improvement */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-4">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    D) Are you improving your Qualification?
                  </h3>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        name="improvingQualification"
                        disabled={isReadOnly}
                        checked={formData.improvingQualification === "Yes"}
                        onChange={() => handleTextChange("improvingQualification", "Yes")}
                        className="text-indigo-600"
                      />
                      <span>Yes</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        name="improvingQualification"
                        disabled={isReadOnly}
                        checked={formData.improvingQualification === "No"}
                        onChange={() => handleTextChange("improvingQualification", "No")}
                        className="text-indigo-600"
                      />
                      <span>No</span>
                    </label>
                  </div>
                </div>

                {formData.improvingQualification === "Yes" && !isReadOnly && (
                  <button
                    onClick={() => addArrayRow("qualificationDetails", { degree: "", specialization: "", university: "", duration: "", status: "", nocObtained: "Yes" })}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Degree Row
                  </button>
                )}
              </div>

              {formData.improvingQualification === "Yes" && (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl mt-3">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                      <tr>
                        <th className="p-3 text-center w-12">Sl.No</th>
                        <th className="p-3">Degree Registered</th>
                        <th className="p-3">Specialization</th>
                        <th className="p-3">University</th>
                        <th className="p-3 text-center w-28">Duration</th>
                        <th className="p-3 text-center w-28">Status</th>
                        <th className="p-3 text-center w-28">NOC Obtained</th>
                        {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {(formData.qualificationDetails || []).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.degree}
                              onChange={e => handleArrayRowChange("qualificationDetails", idx, "degree", e.target.value)}
                              placeholder="e.g. Ph.D / M.Ed"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.specialization}
                              onChange={e => handleArrayRowChange("qualificationDetails", idx, "specialization", e.target.value)}
                              placeholder="Specialization..."
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.university}
                              onChange={e => handleArrayRowChange("qualificationDetails", idx, "university", e.target.value)}
                              placeholder="University Name"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.duration}
                              onChange={e => handleArrayRowChange("qualificationDetails", idx, "duration", e.target.value)}
                              placeholder="e.g. 3 Yrs"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.status}
                              onChange={e => handleArrayRowChange("qualificationDetails", idx, "status", e.target.value)}
                              placeholder="Ongoing / Final"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <select
                              disabled={isReadOnly}
                              value={row.nocObtained}
                              onChange={e => handleArrayRowChange("qualificationDetails", idx, "nocObtained", e.target.value)}
                              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                            >
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          </td>
                          {!isReadOnly && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => removeArrayRow("qualificationDetails", idx)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* E) Department Development / Mentoring */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  E) Involvement in Department Development / Student Welfare / Mentoring / Counseling
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("deptInvolvement", { description: "", role: "", outcome: "", recordsMaintained: "Yes" })}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Activity Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3">Description of Activity</th>
                      <th className="p-3 w-44">Specify Your Role</th>
                      <th className="p-3">Outcome of Activity</th>
                      <th className="p-3 text-center w-32">Records Maintained</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {(formData.deptInvolvement || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.description}
                            onChange={e => handleArrayRowChange("deptInvolvement", idx, "description", e.target.value)}
                            placeholder="Description of activity..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.role}
                            onChange={e => handleArrayRowChange("deptInvolvement", idx, "role", e.target.value)}
                            placeholder="Coordinator / Member"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.outcome}
                            onChange={e => handleArrayRowChange("deptInvolvement", idx, "outcome", e.target.value)}
                            placeholder="Outcome / Benefits"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <select
                            disabled={isReadOnly}
                            value={row.recordsMaintained}
                            onChange={e => handleArrayRowChange("deptInvolvement", idx, "recordsMaintained", e.target.value)}
                            className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                          >
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("deptInvolvement", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* F) Contribution towards Alumni / Sports / NSS */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  F) Contribution towards Alumni / Sports / NSS / Others
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("otherContributions", { role: "", description: "", outcome: "" })}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Contribution Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3 w-48">Specify Your Role</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Highlight the Outcome</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {(formData.otherContributions || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.role}
                            onChange={e => handleArrayRowChange("otherContributions", idx, "role", e.target.value)}
                            placeholder="e.g. Sports In-charge"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.description}
                            onChange={e => handleArrayRowChange("otherContributions", idx, "description", e.target.value)}
                            placeholder="Description of contribution..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.outcome}
                            onChange={e => handleArrayRowChange("otherContributions", idx, "outcome", e.target.value)}
                            placeholder="Highlight outcome / achievements..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("otherContributions", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>



            {/* H) Additional Role / Contribution */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                H) Specify your Role / Contribution, if any other than the above
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={formData.otherRoleContribution}
                onChange={e => handleTextChange("otherRoleContribution", e.target.value)}
                placeholder="Detail any other special roles, responsibilities or contributions..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              ></textarea>
            </div>

            {/* 15. Admissions Contributed to Institution */}
            <div className="pt-6 border-t border-slate-100 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    15. No of admission contributed to the Institution for the AY {academicYear}
                  </h3>
                  {!isReadOnly && (
                    <button
                      onClick={() => addArrayRow("admissionsInstitution", { area: "", count: "" })}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Row
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                      <tr>
                        <th className="p-3 text-center w-12">Sl.No</th>
                        <th className="p-3">Area</th>
                        <th className="p-3 text-center w-48">No of Admission Contributed</th>
                        {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {(formData.admissionsInstitution || []).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.area}
                              onChange={e => handleArrayRowChange("admissionsInstitution", idx, "area", e.target.value)}
                              placeholder="e.g. Cuddalore / Local Area"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              disabled={isReadOnly}
                              value={row.count}
                              onChange={e => handleArrayRowChange("admissionsInstitution", idx, "count", e.target.value)}
                              placeholder="e.g. 5"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center"
                            />
                          </td>
                          {!isReadOnly && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => removeArrayRow("admissionsInstitution", idx)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Admissions Contributed to Vijayadashami */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    15. No of admission contributed to Vijayadashami for the AY {academicYear}
                  </h3>
                  {!isReadOnly && (
                    <button
                      onClick={() => addArrayRow("admissionsVijayadashami", { area: "", count: "" })}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Row
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                      <tr>
                        <th className="p-3 text-center w-12">Sl.No</th>
                        <th className="p-3">Area</th>
                        <th className="p-3 text-center w-48">No of Admission Contributed</th>
                        {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {(formData.admissionsVijayadashami || []).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={row.area}
                              onChange={e => handleArrayRowChange("admissionsVijayadashami", idx, "area", e.target.value)}
                              placeholder="e.g. Pre-KG / Primary"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              disabled={isReadOnly}
                              value={row.count}
                              onChange={e => handleArrayRowChange("admissionsVijayadashami", idx, "count", e.target.value)}
                              placeholder="e.g. 3"
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center"
                            />
                          </td>
                          {!isReadOnly && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => removeArrayRow("admissionsVijayadashami", idx)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 16. No. of TC Issued */}
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                  16. No. of TC Issued for the AY {academicYear}
                </label>
                <input
                  type="number"
                  min="0"
                  disabled={isReadOnly}
                  value={formData.numTCsIssued || ""}
                  onChange={e => handleTextChange("numTCsIssued", e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full md:w-64 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: WORK HABITS, LEAVES & RELATIONSHIPS ── */}
        {activeTab === 4 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> Work Habits, Leaves & Interpersonal Relationships
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Questions 17 to 24: Punctuality, leave utilization, and relationships with stakeholders.</p>
            </div>

            {/* Q17: Accomplish assignment in time */}
            <div>
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                17. Do you accomplish the given assignment in time?
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { value: "Yes", label: "Yes" },
                  { value: "with reminder", label: "with reminder" },
                  { value: "Depends on my interest", label: "Depends on my interest" }
                ].map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.accomplishAssignment === opt.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="radio"
                      name="accomplishAssignment"
                      disabled={isReadOnly}
                      checked={formData.accomplishAssignment === opt.value}
                      onChange={() => handleTextChange("accomplishAssignment", opt.value)}
                      className="text-indigo-600"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q18: Apply for leave in advance */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                18. Do you apply for leave in advance?
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { value: "Yes", label: "Yes" },
                  { value: "Most of the time", label: "Most of the time" },
                  { value: "No", label: "No" }
                ].map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.applyLeaveAdvance === opt.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="radio"
                      name="applyLeaveAdvance"
                      disabled={isReadOnly}
                      checked={formData.applyLeaveAdvance === opt.value}
                      onChange={() => handleTextChange("applyLeaveAdvance", opt.value)}
                      className="text-indigo-600"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q19: Details of leave taken */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                19. Details of leave taken during the Academic Year (June to May):
              </h3>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-center">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th colSpan="3" className="p-3 border-r border-slate-200 bg-indigo-50/50 text-indigo-900">No. of Leave availed</th>
                      <th colSpan="3" className="p-3 bg-slate-100 text-slate-900">No. of On Duty availed</th>
                    </tr>
                    <tr className="bg-slate-100/80 border-t border-slate-200">
                      <th className="p-2 border-r border-slate-200 w-24">CL</th>
                      <th className="p-2 border-r border-slate-200 w-24">C-Off</th>
                      <th className="p-2 border-r border-slate-200 w-24">LLP</th>
                      <th className="p-2 border-r border-slate-200">Related to Public Examination</th>
                      <th className="p-2 border-r border-slate-200 w-28">Others</th>
                      <th className="p-2 w-28">Institution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold">
                    <tr>
                      <td className="p-2 border-r border-slate-200">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={formData.leaveDetails?.cl || ""}
                          onChange={e => handleNestedChange("leaveDetails", "cl", e.target.value)}
                          placeholder="0"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center"
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={formData.leaveDetails?.coff || ""}
                          onChange={e => handleNestedChange("leaveDetails", "coff", e.target.value)}
                          placeholder="0"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center"
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={formData.leaveDetails?.llp || ""}
                          onChange={e => handleNestedChange("leaveDetails", "llp", e.target.value)}
                          placeholder="0"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center"
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={formData.leaveDetails?.odPublicExam || ""}
                          onChange={e => handleNestedChange("leaveDetails", "odPublicExam", e.target.value)}
                          placeholder="0"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center"
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={formData.leaveDetails?.odOthers || ""}
                          onChange={e => handleNestedChange("leaveDetails", "odOthers", e.target.value)}
                          placeholder="0"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={formData.leaveDetails?.odInst || ""}
                          onChange={e => handleNestedChange("leaveDetails", "odInst", e.target.value)}
                          placeholder="0"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Q20: Consume balance CL in last month */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                20. Do you consume your balance CL in last month of academic session?
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { value: "Yes", label: "Yes" },
                  { value: "If required", label: "If required" },
                  { value: "No", label: "No" }
                ].map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.consumeBalanceCL === opt.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="radio"
                      name="consumeBalanceCL"
                      disabled={isReadOnly}
                      checked={formData.consumeBalanceCL === opt.value}
                      onChange={() => handleTextChange("consumeBalanceCL", opt.value)}
                      className="text-indigo-600"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q22, Q23, Q24: Interpersonal Relationships */}
            <div className="pt-6 border-t border-slate-100 space-y-6">
              {[
                { key: "relStudents", qNum: "22", title: "Relationship with the Students" },
                { key: "relColleagues", qNum: "23", title: "Relationship with the Colleagues" },
                { key: "relSuperiors", qNum: "24", title: "Relationship with the Superiors" }
              ].map(rel => (
                <div key={rel.key} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                  <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    {rel.qNum}. {rel.title}
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { value: "Good", label: "Good" },
                      { value: "Fair", label: "Fair" },
                      { value: "Unsatisfactory", label: "Unsatisfactory" },
                      { value: "Should be improved", label: "Should be improved" }
                    ].map(r => (
                      <label
                        key={r.value}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData[rel.key]?.rating === r.value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <input
                          type="radio"
                          name={rel.key}
                          disabled={isReadOnly}
                          checked={formData[rel.key]?.rating === r.value}
                          onChange={() => handleNestedChange(rel.key, "rating", r.value)}
                          className="text-indigo-600"
                        />
                        <span>{r.label}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={formData[rel.key]?.reason || ""}
                    onChange={e => handleNestedChange(rel.key, "reason", e.target.value)}
                    placeholder="Specify reason if unsatisfactory or should be improved..."
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 5: RATING, TARGETS & SELF ANALYSIS ── */}
        {activeTab === 5 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" /> Department Rating, Targets & Self Analysis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Questions 25 to 30: Institutional feedback, future academic targets, and SWOT self-analysis.</p>
            </div>

            {/* Q25: Department Rating */}
            <div>
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                25. How do you rate your Department?
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {[
                  { value: "Good", label: "Good" },
                  { value: "Fair", label: "Fair" },
                  { value: "Unsatisfactory", label: "Unsatisfactory" },
                  { value: "Should be improved", label: "Should be improved" }
                ].map(r => (
                  <label
                    key={r.value}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.deptRating === r.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="radio"
                      name="deptRating"
                      disabled={isReadOnly}
                      checked={formData.deptRating === r.value}
                      onChange={() => handleTextChange("deptRating", r.value)}
                      className="text-indigo-600"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
              <textarea
                rows="2"
                disabled={isReadOnly}
                value={formData.deptRatingReason}
                onChange={e => handleTextChange("deptRatingReason", e.target.value)}
                placeholder="Specify the reason or feedback regarding your department rating..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              ></textarea>
            </div>

            {/* Q26: Potential Utilization */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                26. Is your potential being appropriately utilized by the Department / Institution?
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  "Over Burdened",
                  "Properly Utilized",
                  "Under Utilized",
                  "Not utilized at all"
                ].map(u => (
                  <label
                    key={u}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.potentialUtilization === u
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="radio"
                      name="potentialUtilization"
                      disabled={isReadOnly}
                      checked={formData.potentialUtilization === u}
                      onChange={() => handleTextChange("potentialUtilization", u)}
                      className="text-indigo-600"
                    />
                    <span>{u}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q27: Targets for Next Academic Year */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                  27. (i) Targets set up by you for the Next Academic Year:
                </label>
                <textarea
                  rows="3"
                  disabled={isReadOnly}
                  value={formData.targetsNextYear}
                  onChange={e => handleTextChange("targetsNextYear", e.target.value)}
                  placeholder="Outline key academic, pass % and research goals for the next session..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                  (ii) Strategy / Planning for Achieving the Targets:
                </label>
                <textarea
                  rows="3"
                  disabled={isReadOnly}
                  value={formData.targetsStrategy}
                  onChange={e => handleTextChange("targetsStrategy", e.target.value)}
                  placeholder="Describe your step-by-step strategy to achieve the above targets..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                ></textarea>
              </div>
            </div>

            {/* Q28: Difficulties faced & suggestions */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                28. Difficulties faced and suggestions for improvement of On-Campus Life / Self-Growth:
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={formData.difficultiesAndSuggestions}
                onChange={e => handleTextChange("difficultiesAndSuggestions", e.target.value)}
                placeholder="Share any challenges or recommendations for improving institutional life..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              ></textarea>
            </div>

            {/* Q29: Assessment Placement */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                29. From the above assessment, where would you place yourself?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {["Above", "At par", "Below"].map(p => (
                  <label
                    key={p}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${formData.selfAssessmentPlacement === p
                      ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    <input
                      type="radio"
                      name="selfAssessmentPlacement"
                      disabled={isReadOnly}
                      checked={formData.selfAssessmentPlacement === p}
                      onChange={() => handleTextChange("selfAssessmentPlacement", p)}
                      className="text-indigo-600"
                    />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q30: Self Analysis (Strengths & Weaknesses) */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  30. Self-Analysis (Strengths & Weaknesses)
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("selfAnalysis", { strength: "", weakness: "" })}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3">Strength</th>
                      <th className="p-3">Weakness</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {(formData.selfAnalysis || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.strength}
                            onChange={e => handleArrayRowChange("selfAnalysis", idx, "strength", e.target.value)}
                            placeholder="Specify your strength..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-emerald-800"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.weakness}
                            onChange={e => handleArrayRowChange("selfAnalysis", idx, "weakness", e.target.value)}
                            placeholder="Specify area for improvement..."
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-rose-800"
                          />
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("selfAnalysis", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Declaration Checkbox & Dates */}
            <div className="pt-6 border-t border-slate-200 bg-slate-50/60 p-6 rounded-2xl border border-slate-200/80 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={formData.certified}
                  onChange={e => handleTextChange("certified", e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-800 leading-relaxed">
                  I certify that the details given above are correct to the best of my knowledge and belief.
                </span>
              </label>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 text-xs text-slate-600 font-medium">
                <div>
                  <span className="font-bold text-slate-800">Date of Declaration: </span>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={formData.declarationDate}
                    onChange={e => handleTextChange("declarationDate", e.target.value)}
                    className="ml-2 px-3 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                  />
                </div>
                <div className="text-right italic font-serif text-slate-700">
                  Signature of the Faculty: <span className="font-bold underline">{formData.name || "________________"}</span>
                </div>
              </div>

              {!isReadOnly && (
                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3">
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Draft
                  </button>

                  <button
                    onClick={handleSubmitButtonClick}
                    disabled={submitting}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit to Coordinator
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit Confirmation & Evaluated Mark Pop-Up Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 md:p-8 space-y-6 relative animate-in fade-in zoom-in-95 duration-200 my-8">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b border-slate-150 pb-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-150 flex items-center justify-center text-[#120c7a] shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 font-heading">Performance Evaluation Summary</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Review your evaluated marks breakdown before confirming submission to the Coordinator.
                  </p>
                </div>
              </div>

              {/* Total Score Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-indigo-50/70 border border-indigo-150 p-4 rounded-2xl text-center">
                  <span className="text-[10px] font-black text-indigo-900 uppercase block mb-1">Part One (Academic)</span>
                  <span className="text-xl font-black text-indigo-700">{liveScore.part1Total} / {liveScore.part1Max || 50} Marks</span>
                </div>
                <div className="bg-indigo-50/70 border border-indigo-150 p-4 rounded-2xl text-center">
                  <span className="text-[10px] font-black text-indigo-900 uppercase block mb-1">Part Two (Development)</span>
                  <span className="text-xl font-black text-indigo-700">{liveScore.part2Total} / {liveScore.part2Max || 50} Marks</span>
                </div>
                <div className="bg-gradient-to-br from-[#120c7a] to-indigo-900 text-white p-4 rounded-2xl text-center shadow-md">
                  <span className="text-[10px] font-black text-indigo-200 uppercase block mb-1">Total Score</span>
                  <span className="text-2xl font-extrabold">{liveScore.grandTotal} / {liveScore.grandMax || 100} Marks</span>
                </div>
              </div>

              {/* Detailed Item Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs max-h-[50vh] overflow-y-auto pr-1">
                {/* Part One Breakdown */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-2">
                    <span>Part One - Academic Performance</span>
                    <span className="text-indigo-700 font-black">{liveScore.part1Total} / {liveScore.part1Max || 50} Marks</span>
                  </div>
                  {liveScore.part1Rows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between text-[11px] p-2.5 bg-white rounded-xl border border-slate-150 shadow-2xs">
                      <div>
                        <span className="font-bold text-slate-800 block">{row.sNo}. {row.particulars}</span>
                        <span className="text-slate-500 font-medium text-[10px]">{row.valueLabel}</span>
                      </div>
                      <span className="font-black text-indigo-700 shrink-0 ml-2">{row.scored} / {row.maxMarks}</span>
                    </div>
                  ))}
                </div>

                {/* Part Two Breakdown */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-2">
                    <span>Part Two - Self-Development & Dept</span>
                    <span className="text-indigo-700 font-black">{liveScore.part2Total} / {liveScore.part2Max || 50} Marks</span>
                  </div>
                  {liveScore.part2Rows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between text-[11px] p-2.5 bg-white rounded-xl border border-slate-150 shadow-2xs">
                      <div>
                        <span className="font-bold text-slate-800 block">{row.sNo}. {row.particulars}</span>
                        <span className="text-slate-500 font-medium text-[10px]">{row.valueLabel}</span>
                      </div>
                      <span className="font-black text-indigo-700 shrink-0 ml-2">{row.scored} / {row.maxMarks}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  disabled={submitting}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Review & Edit Form
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitModal(false);
                    handleSave(true);
                  }}
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#120c7a] hover:bg-indigo-900 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Confirm & Submit to Coordinator
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </HRLayout>
  );
}

// Sub-component helper to render repetitive Exam Tables cleanly
function renderExamTableSection({
  title,
  arrayKey,
  list = [],
  isReadOnly,
  handleArrayRowChange,
  addArrayRow,
  removeArrayRow
}) {
  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
          {title}
        </h3>
        {!isReadOnly && (
          <button
            onClick={() => addArrayRow(arrayKey, { class: "", subject: "", appeared: "", passed: "", passPercent: "" })}
            className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Subject Row
          </button>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-2xl">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
            <tr>
              <th className="p-3 text-center w-12">Sl.No</th>
              <th className="p-3 w-40">Class</th>
              <th className="p-3">Subject</th>
              <th className="p-3 text-center w-28">Appeared</th>
              <th className="p-3 text-center w-28">Passed</th>
              <th className="p-3 text-center w-32">Pass Percentage</th>
              {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-semibold">
            {(list || []).map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                <td className="p-2">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={row.class}
                    onChange={e => handleArrayRowChange(arrayKey, idx, "class", e.target.value)}
                    placeholder="e.g. Std X - A"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={row.subject}
                    onChange={e => handleArrayRowChange(arrayKey, idx, "subject", e.target.value)}
                    placeholder="Subject Name"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={row.appeared}
                    onChange={e => handleArrayRowChange(arrayKey, idx, "appeared", e.target.value)}
                    placeholder="Count"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={row.passed}
                    onChange={e => handleArrayRowChange(arrayKey, idx, "passed", e.target.value)}
                    placeholder="Count"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-center"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    disabled
                    value={row.passPercent}
                    placeholder="Auto %"
                    className="w-full p-2 bg-indigo-50/60 border border-indigo-150 text-indigo-900 rounded-lg text-xs font-bold text-center"
                  />
                </td>
                {!isReadOnly && (
                  <td className="p-2 text-center">
                    <button
                      onClick={() => removeArrayRow(arrayKey, idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
