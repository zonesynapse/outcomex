import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  getDocs 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import HRLayout from "../components/HRLayout";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList
} from "recharts";
import {
  TrendingUp,
  Lock,
  ArrowUpRight,
  BarChart3,
  Award,
  CheckCircle2,
  Clock,
  Sparkles,
  Building2,
  ShieldCheck,
  FileText,
  GraduationCap,
  Users,
  ChevronRight,
  AlertCircle,
  Calendar,
  Briefcase,
  Settings2,
  User,
  HelpCircle,
  ExternalLink,
  DollarSign
} from "lucide-react";
import { normalizeInstitution } from "../utils/appraisalScore";

// Helper to format academic year e.g. "2021-22" -> "2022", "2022-23" -> "2023", "2024-25" -> "2025"
export const formatAnalyticsYear = (yearStr) => {
  if (!yearStr) return "";
  const s = String(yearStr).trim();
  const rangeMatch = s.match(/^(\d{4})\s*[-/]\s*(\d{2,4})$/);
  if (rangeMatch) {
    const startCentury = rangeMatch[1].slice(0, 2);
    const end = rangeMatch[2];
    return end.length === 2 ? `${startCentury}${end}` : end;
  }
  const generalMatch = s.match(/(\d{4})\s*[-/]\s*(\d{2,4})/);
  if (generalMatch) {
    const startCentury = generalMatch[1].slice(0, 2);
    const end = generalMatch[2];
    return end.length === 2 ? `${startCentury}${end}` : end;
  }
  return s;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(auth.currentUser || null);
  const [userProfile, setUserProfile] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(true);
  const [salaryViewMode, setSalaryViewMode] = useState("PM"); // "PM" | "PA"
  const [userSalaryInfo, setUserSalaryInfo] = useState(null);
  const [userAppraisal, setUserAppraisal] = useState(null);
  const [stats, setStats] = useState({
    facultyCount: 0,
    teacherCount: 0,
    nonTeachingCount: 0,
    hodCount: 0,
    pendingReviews: 0,
  });

  // 1. Auth & User Profile Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const uDoc = await getDoc(doc(db, "users", user.uid));
          if (uDoc.exists()) {
            setUserProfile(uDoc.data());
          } else {
            const localStr = localStorage.getItem(`user_profile_${user.uid}`);
            if (localStr) setUserProfile(JSON.parse(localStr));
          }
        } catch (err) {
          console.warn("User profile fetch error:", err);
          const localStr = localStorage.getItem(`user_profile_${user.uid}`);
          if (localStr) setUserProfile(JSON.parse(localStr));
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubAuth();
  }, []);

  // 2. Appraisal Schedule Listener
  useEffect(() => {
    const unsubSched = onSnapshot(doc(db, "appraisal_config", "schedule"), (snap) => {
      if (snap.exists()) {
        setActiveSession(snap.data());
      } else {
        setActiveSession({ academicYear: "2024-25", isActive: true });
      }
    });

    return () => unsubSched();
  }, []);

  // 3. User Appraisal Document Listener
  useEffect(() => {
    if (!currentUser) {
      setUserAppraisal(null);
      return;
    }

    const checkAppraisals = async () => {
      const collectionsToCheck = [
        "faculty_appraisals",
        "teacher_appraisals",
        "non_teaching_appraisals",
        "hod_appraisals"
      ];

      for (const colName of collectionsToCheck) {
        try {
          // Check by UID
          const qUid = query(collection(db, colName), where("uid", "==", currentUser.uid));
          const snapUid = await getDocs(qUid);
          if (!snapUid.empty) {
            const docData = snapUid.docs[0].data();
            setUserAppraisal({ id: snapUid.docs[0].id, collection: colName, ...docData });
            return;
          }

          // Check by Email
          if (currentUser.email) {
            const qEmail = query(collection(db, colName), where("email", "==", currentUser.email.toLowerCase().trim()));
            const snapEmail = await getDocs(qEmail);
            if (!snapEmail.empty) {
              const docData = snapEmail.docs[0].data();
              setUserAppraisal({ id: snapEmail.docs[0].id, collection: colName, ...docData });
              return;
            }
          }
        } catch (err) {
          console.warn(`Error checking ${colName}:`, err);
        }
      }
    };

    checkAppraisals();
  }, [currentUser]);

  // 4. Real-time Listener for Gross Salaries (Dedicated Institution Node + Legacy Fallback)
  useEffect(() => {
    if (!currentUser) {
      setUserSalaryInfo(null);
      setSalaryLoading(false);
      return;
    }

    const unsubs = [];
    const instCode = normalizeInstitution(userProfile?.institution || userAppraisal?.institution || "").toLowerCase();
    const instDocId = instCode ? `gross_salaries_${instCode}` : null;

    let instSalaries = null;
    let legacySalaries = null;

    const processMatchedSalary = () => {
      const salaries = (instSalaries && Object.keys(instSalaries).length > 0)
        ? instSalaries
        : (legacySalaries || {});

      const normalizeId = (id) => String(id || "").replace(/^['"`]+|['"`]+$/g, "").trim().toUpperCase().replace(/\s+/g, "");

      // Collect all possible candidate keys for the logged-in user
      const candidateKeys = [
        normalizeId(userProfile?.empId),
        normalizeId(userProfile?.employeeId),
        normalizeId(userProfile?.facultyId),
        normalizeId(userProfile?.staffId),
        normalizeId(userProfile?.teacherId),
        normalizeId(userProfile?.facultyEmpId),
        normalizeId(userAppraisal?.employeeId),
        normalizeId(userAppraisal?.facultyId),
        normalizeId(userAppraisal?.staffId),
        normalizeId(userAppraisal?.teacherId),
        normalizeId(userAppraisal?.empId),
        normalizeId(userAppraisal?.formData?.employeeId),
        normalizeId(userAppraisal?.formData?.facultyId),
        normalizeId(userAppraisal?.formData?.staffId),
        normalizeId(userAppraisal?.formData?.teacherId),
        normalizeId(userAppraisal?.formData?.empId),
        normalizeId(currentUser.uid),
        normalizeId(currentUser.email),
        String(userProfile?.empId || "").trim(),
        String(userProfile?.facultyId || "").trim(),
        String(userProfile?.staffId || "").trim(),
        String(userProfile?.employeeId || "").trim(),
        String(userAppraisal?.facultyId || "").trim(),
        String(userAppraisal?.empId || "").trim()
      ].filter(Boolean);

      let matchedSalaryEntry = null;
      for (const k of candidateKeys) {
        if (salaries[k] !== undefined && salaries[k] !== null) {
          matchedSalaryEntry = salaries[k];
          break;
        }
      }

      if (matchedSalaryEntry) {
        let currentPM = 0;
        let history = {};

        if (typeof matchedSalaryEntry === "object" && matchedSalaryEntry !== null) {
          history = matchedSalaryEntry.history || {};
          currentPM = Number(matchedSalaryEntry.current) || (Object.values(history).slice(-1)[0]) || 0;
        } else if (!isNaN(Number(matchedSalaryEntry))) {
          currentPM = Number(matchedSalaryEntry);
          history = { "Current": currentPM };
        }

        const historyEntries = Object.entries(history);
        if (historyEntries.length === 0 && currentPM > 0) {
          historyEntries.push(["Current", currentPM]);
        }

        // Sort years chronologically
        historyEntries.sort((a, b) => a[0].localeCompare(b[0]));

        const chartData = historyEntries.map(([yr, val], idx, arr) => {
          const displayYear = formatAnalyticsYear(yr);
          const numVal = Number(val) || 0;
          const prevVal = idx > 0 ? Number(arr[idx - 1][1]) || 0 : null;
          const incPM = prevVal !== null ? numVal - prevVal : 0;
          const incPct = prevVal && prevVal > 0 ? ((incPM / prevVal) * 100).toFixed(1) : "0.0";
          const incPctNum = Number(incPct) || 0;
          return {
            year: displayYear,
            rawYear: yr,
            salaryPM: numVal,
            salaryPA: numVal * 12,
            incrementPM: incPM,
            incrementPA: incPM * 12,
            growthPct: incPct,
            growthPctNum: incPctNum,
            growthPctFormatted: idx === 0 ? "Base" : `+${incPct}%`,
            isBase: idx === 0,
            isLatest: idx === arr.length - 1
          };
        });

        const firstVal = chartData.length > 0 ? chartData[0].salaryPM : 0;
        const lastVal = chartData.length > 0 ? chartData[chartData.length - 1].salaryPM : 0;
        const totalGrowth = lastVal - firstVal;
        const totalGrowthPct = firstVal > 0 ? ((totalGrowth / firstVal) * 100).toFixed(1) : "0.0";

        const validIncrements = chartData.filter((d, i) => i > 0 && d.growthPctNum > 0);
        const avgGrowthPct = validIncrements.length > 0
          ? (validIncrements.reduce((acc, c) => acc + c.growthPctNum, 0) / validIncrements.length).toFixed(1)
          : "0.0";

        setUserSalaryInfo({
          currentPM,
          currentPA: currentPM * 12,
          history,
          chartData,
          totalGrowth,
          totalGrowthPct,
          avgGrowthPct,
          hasMultiYear: chartData.length > 1
        });
      } else {
        setUserSalaryInfo(null);
      }
      setSalaryLoading(false);
    };

    if (instDocId) {
      const unsubInst = onSnapshot(doc(db, "appraisal_config", instDocId), (snap) => {
        if (snap.exists()) {
          instSalaries = snap.data()?.salaries || {};
        } else {
          instSalaries = {};
        }
        processMatchedSalary();
      }, (err) => console.error("Error loading institution salaries:", err));
      unsubs.push(unsubInst);
    }

    const unsubLegacy = onSnapshot(doc(db, "appraisal_config", "gross_salaries"), (snap) => {
      if (snap.exists()) {
        legacySalaries = snap.data()?.salaries || {};
      } else {
        legacySalaries = {};
      }
      processMatchedSalary();
    }, (err) => console.error("Error loading legacy salaries:", err));
    unsubs.push(unsubLegacy);

    return () => unsubs.forEach((u) => u && u());
  }, [currentUser, userProfile, userAppraisal]);

  // 5. HR Stats for Principal / HR / Coordinator roles
  useEffect(() => {
    const r = String(userProfile?.role || "").toLowerCase();
    const isPrivileged = r.includes("principal") || r.includes("hr") || r.includes("admin") || r.includes("coordinator");
    if (!isPrivileged) return;

    const fetchCounts = async () => {
      try {
        const facSnap = await getDocs(collection(db, "faculty_appraisals"));
        const teacherSnap = await getDocs(collection(db, "teacher_appraisals"));
        const ntSnap = await getDocs(collection(db, "non_teaching_appraisals"));
        const hodSnap = await getDocs(collection(db, "hod_appraisals"));

        const facPending = facSnap.docs.filter(d => d.data().status === "Submitted").length;
        const teacherPending = teacherSnap.docs.filter(d => d.data().status === "Submitted").length;
        const ntPending = ntSnap.docs.filter(d => d.data().status === "Submitted").length;
        const hodPending = hodSnap.docs.filter(d => d.data().status === "Submitted").length;

        setStats({
          facultyCount: facSnap.size,
          teacherCount: teacherSnap.size,
          nonTeachingCount: ntSnap.size,
          hodCount: hodSnap.size,
          pendingReviews: facPending + teacherPending + ntPending + hodPending
        });
      } catch (e) {
        console.error("Error fetching admin stats:", e);
      }
    };

    fetchCounts();
  }, [userProfile]);

  const userRole = userProfile?.role || "Staff";
  const userInst = userProfile?.institution || "CK Group of Institutions";
  const normalizedRole = String(userRole).toLowerCase();
  const isPrincipalHR = normalizedRole.includes("principal") || normalizedRole.includes("hr") || normalizedRole.includes("admin");
  const isCenterHead = normalizedRole.includes("center head") || normalizedRole.includes("centre head");
  const isCoordinator = normalizedRole.includes("coordinator");
  const isCKCOE = userInst.toUpperCase().includes("CKCOE") || userInst.toUpperCase().includes("ENGINEERING");

  // Determine user's active appraisal path
  const getAppraisalPath = () => {
    if (isCenterHead || isCoordinator) return "/coordinator-appraisal";
    if (isCKCOE) return "/faculty-appraisal";
    if (normalizedRole.includes("non-teaching") || normalizedRole.includes("staff")) return "/non-teaching-appraisal";
    return "/teacher-appraisal";
  };

  const appraisalPath = getAppraisalPath();

  return (
    <HRLayout>
      <div className="w-full space-y-8 animate-fadeIn pb-12">
        {/* Welcome Header Banner */}
        <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-[#120c7a] border border-slate-800 shadow-2xl text-white">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Human Resources Analytics & Self-Service Portal
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-heading text-white tracking-tight">
                Welcome back, {userProfile?.name || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Colleague"} 👋
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-300">
                <span className="px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-xs font-semibold text-slate-200">
                  {userInst}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-xs font-semibold text-indigo-200">
                  {userRole}
                </span>
                {(userProfile?.empId || userProfile?.facultyId || userProfile?.staffId) && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    ID: {userProfile.empId || userProfile.facultyId || userProfile.staffId}
                  </span>
                )}
              </div>
            </div>

            {activeSession && (
              <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/80 flex items-center gap-4 shrink-0 shadow-lg">
                <div className="p-3 bg-indigo-600/30 rounded-xl text-indigo-300 border border-indigo-500/30">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Active Academic Window</div>
                  <div className="text-base font-bold text-white">{activeSession.academicYear || "Active Session"}</div>
                  <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Portal Operational
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Appraisal Validation Scorecard Banner (If appraisal exists) */}
        {userAppraisal && (
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden animate-fadeIn">
            <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-wider uppercase w-fit">
                  <Award size={14} className="text-amber-300" /> Appraisal Submission Status
                </div>
                <h3 className="text-base font-bold">
                  {userAppraisal.status === "HOD_Approved" || userAppraisal.status === "Principal_Approved"
                    ? "Your performance appraisal evaluation is validated & approved"
                    : userAppraisal.status === "Submitted"
                    ? "Your appraisal form has been submitted and is under active review"
                    : "Appraisal request on record"}
                </h3>
                <p className="text-emerald-100 text-xs font-medium">
                  Academic Year: {userAppraisal.academicYear || activeSession?.academicYear || "2024-25"} • Status:{" "}
                  <span className="font-bold underline decoration-amber-300 underline-offset-2">
                    {userAppraisal.status || "In Review"}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {(userAppraisal.hodValidation?.totalScore !== undefined || userAppraisal.finalScore !== undefined) && (
                  <div className="text-right">
                    <span className="block text-[9px] font-black text-emerald-200 uppercase tracking-wider">Total Score</span>
                    <div className="text-3xl font-black text-amber-300">
                      {userAppraisal.hodValidation?.totalScore || userAppraisal.finalScore || "--"}{" "}
                      <span className="text-xs text-emerald-200 font-semibold">/ 100</span>
                    </div>
                  </div>
                )}

                <Link
                  to={appraisalPath}
                  style={{ color: "#120c7a", backgroundColor: "#ffffff" }}
                  className="px-5 py-2.5 bg-white hover:bg-slate-50 text-[#120c7a] rounded-xl text-xs font-black transition-all shadow-md hover:shadow-lg flex items-center gap-2 border border-white/40 shrink-0 cursor-pointer"
                >
                  <FileText size={15} style={{ color: "#120c7a" }} className="text-[#120c7a]" />
                  <span style={{ color: "#120c7a" }} className="text-[#120c7a] font-black">View Form</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Personal Salary Progression & Visualization Widget (Dual Charts)          */}
        {/* ========================================================================= */}
        {salaryLoading ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-10 flex flex-col items-center justify-center text-slate-500">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-medium">Loading compensation analytics...</p>
          </div>
        ) : userSalaryInfo ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 md:p-8 relative overflow-hidden transition-all animate-fadeIn">
            {/* Top gradient accent line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-[#120c7a]" />

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center shadow-xs shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                      Salary Progression & Compensation Analytics
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      <Lock size={10} /> Confidential • Personal Record
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Multi-year historical salary trajectory and annual compensation increment growth on institutional record
                  </p>
                </div>
              </div>

              {/* View Mode Switcher: Monthly (PM) vs Annual (PA) */}
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setSalaryViewMode("PM")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    salaryViewMode === "PM"
                      ? "bg-white text-emerald-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Monthly (PM)
                </button>
                <button
                  type="button"
                  onClick={() => setSalaryViewMode("PA")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    salaryViewMode === "PA"
                      ? "bg-white text-emerald-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Annual (PA)
                </button>
              </div>
            </div>

            {/* Metrics Ribbon (4 Cards) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Current Gross (PM)
                </span>
                <p className="text-lg md:text-xl font-black font-mono text-slate-900 mt-1">
                  ₹{Number(userSalaryInfo.currentPM).toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-slate-600 font-medium">Monthly baseline compensation</span>
              </div>

              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Annualized Gross (PA)
                </span>
                <p className="text-lg md:text-xl font-black font-mono text-emerald-800 mt-1">
                  ₹{Number(userSalaryInfo.currentPA).toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-slate-600 font-medium">Annual gross outlay</span>
              </div>

              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Total Growth (Timeline)
                </span>
                <p className="text-lg md:text-xl font-black font-mono text-indigo-700 mt-1 flex items-center gap-1">
                  {userSalaryInfo.totalGrowth >= 0 ? "+" : ""}₹{Number(userSalaryInfo.totalGrowth).toLocaleString("en-IN")}
                  <ArrowUpRight size={16} className="text-indigo-600" />
                </p>
                <span className="text-[10px] text-slate-600 font-medium">Over recorded timeline</span>
              </div>

              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Overall Increment %
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg md:text-xl font-black font-mono text-purple-700">
                    +{userSalaryInfo.totalGrowthPct}%
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                    {userSalaryInfo.chartData.length} Years
                  </span>
                </div>
                <span className="text-[10px] text-slate-600 font-medium">Cumulative growth</span>
              </div>
            </div>

            {/* Interactive Analytics Dual-Chart Grid: Left (Salary Line Graph) + Right (YoY Increment % Bar Chart) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Left Card: Historical Compensation Line Graph */}
              <div className="bg-gradient-to-b from-slate-50/60 to-white border border-slate-200/80 rounded-2xl p-4 md:p-6 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <TrendingUp size={16} className="text-emerald-600" />
                      Historical Compensation ({salaryViewMode === "PM" ? "Gross Per Month" : "Gross Per Annum"})
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="w-5 h-0.5 bg-emerald-600 inline-block rounded-full" />
                      <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block -ml-2" />
                      <span>Salary Trajectory</span>
                    </div>
                  </div>

                  <div className="w-full h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={userSalaryInfo.chartData}
                        margin={{ top: 20, right: 20, left: -5, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient id="hrSalaryLineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="year"
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const d = payload[0].payload;
                            const displayVal = salaryViewMode === "PM" ? d.salaryPM : d.salaryPA;
                            return (
                              <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700 space-y-1">
                                <div className="font-bold text-amber-300 text-[11px] uppercase tracking-wider">{d.year}</div>
                                <div className="text-sm font-black font-mono">
                                  ₹{Number(displayVal).toLocaleString("en-IN")} {salaryViewMode === "PM" ? "PM" : "PA"}
                                </div>
                                {d.incrementPM > 0 && (
                                  <div className="text-[10px] text-emerald-400 font-semibold pt-1 border-t border-slate-800">
                                    YoY Increment: +₹{Number(salaryViewMode === "PM" ? d.incrementPM : d.incrementPA).toLocaleString("en-IN")} (+{d.growthPct}%)
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey={salaryViewMode === "PM" ? "salaryPM" : "salaryPA"}
                          stroke="#059669"
                          strokeWidth={3.5}
                          fillOpacity={1}
                          fill="url(#hrSalaryLineGrad)"
                          dot={{ r: 5, fill: "#059669", stroke: "#ffffff", strokeWidth: 2.5 }}
                          activeDot={{ r: 8, fill: "#047857", stroke: "#ffffff", strokeWidth: 3 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Right Card: Year-by-Year Increment Growth Rate (%) Bar Chart */}
              <div className="bg-gradient-to-b from-slate-50/60 to-white border border-slate-200/80 rounded-2xl p-4 md:p-6 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <BarChart3 size={16} className="text-indigo-600" />
                      Year-by-Year Increment Growth Rate (%)
                    </div>
                    <div className="flex items-center gap-2">
                      {Number(userSalaryInfo.avgGrowthPct) > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Avg: +{userSalaryInfo.avgGrowthPct}%
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
                        <span>YoY % Growth</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={userSalaryInfo.chartData}
                        margin={{ top: 25, right: 20, left: -10, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient id="hrBarGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.8} />
                          </linearGradient>
                          <linearGradient id="hrBarGradActive" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="year"
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          tickFormatter={(val) => `${val}%`}
                          domain={[0, (dataMax) => Math.max(12, Math.ceil(dataMax + 2))]}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700 space-y-1">
                                <div className="font-bold text-indigo-300 text-[11px] uppercase tracking-wider">{d.year}</div>
                                {d.isBase ? (
                                  <div className="text-amber-300 font-bold text-xs">
                                    Baseline Reference Year
                                  </div>
                                ) : (
                                  <div className="text-sm font-black font-mono text-emerald-400">
                                    +{d.growthPct}% Increment
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-300 pt-1 border-t border-slate-800">
                                  {d.isBase ? (
                                    <span>Base Gross: ₹{Number(salaryViewMode === "PM" ? d.salaryPM : d.salaryPA).toLocaleString("en-IN")} {salaryViewMode}</span>
                                  ) : (
                                    <span>
                                      Added Outlay: +₹{Number(salaryViewMode === "PM" ? d.incrementPM : d.incrementPA).toLocaleString("en-IN")} {salaryViewMode}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="growthPctNum"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={44}
                        >
                          <LabelList
                            dataKey="growthPctFormatted"
                            position="top"
                            fill="#4338ca"
                            fontSize={11}
                            fontWeight={700}
                            formatter={(val) => val === "Base" ? "—" : val}
                          />
                          {userSalaryInfo.chartData.map((entry, index) => (
                            <Cell
                              key={`hr-increment-bar-${index}`}
                              fill={
                                entry.isBase
                                  ? "#cbd5e1"
                                  : index === userSalaryInfo.chartData.length - 1
                                  ? "url(#hrBarGradActive)"
                                  : "url(#hrBarGrad)"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Year-by-Year Progression Timeline Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {userSalaryInfo.chartData.map((item, idx) => (
                <div
                  key={item.year}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    idx === userSalaryInfo.chartData.length - 1
                      ? "bg-emerald-50/50 border-emerald-200"
                      : "bg-slate-50/70 border-slate-200/80"
                  }`}
                >
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <span>{item.year}</span>
                    {idx === userSalaryInfo.chartData.length - 1 && (
                      <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded text-[9px] font-black">
                        Active Year
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-black font-mono text-slate-800">
                    ₹{Number(salaryViewMode === "PM" ? item.salaryPM : item.salaryPA).toLocaleString("en-IN")}
                    <span className="text-[10px] text-slate-600 font-semibold ml-1">
                      {salaryViewMode === "PM" ? "PM" : "PA"}
                    </span>
                  </div>
                  {idx > 0 && item.incrementPM > 0 && (
                    <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                      <ArrowUpRight size={12} />
                      +₹{Number(salaryViewMode === "PM" ? item.incrementPM : item.incrementPA).toLocaleString("en-IN")} (+{item.growthPct}%)
                    </div>
                  )}
                  {idx === 0 && (
                    <div className="text-[10px] text-slate-600 font-medium mt-1">
                      Initial Baseline Compensation
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Empty / Pending Salary Configuration Banner */
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Compensation History Record
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xl">
                  {userProfile?.empId || userProfile?.facultyId || userProfile?.staffId ? (
                    <>
                      Your employee record (ID: <span className="font-bold text-slate-800 font-mono">{userProfile.empId || userProfile.facultyId || userProfile.staffId}</span>) is active. Once HR uploads your multi-year salary breakdown in Gross Analytics, your compensation progression and increment graph will display here.
                    </>
                  ) : (
                    <>
                      No salary record is currently linked to your account. When HR or Accounts updates the institutional gross salaries sheet with your employee ID, your progression analytics will appear here automatically.
                    </>
                  )}
                </p>
              </div>
            </div>

            {isPrincipalHR && (
              <Link
                to="/gross-analytics"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0"
              >
                <DollarSign size={14} /> Open Gross Analytics
              </Link>
            )}
          </div>
        )}

        {/* Quick Action HR Modules & Services Grid */}
        <div>
          <h2 className="text-lg font-bold font-heading text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            Quick HR Services & Workflows
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Primary Appraisal Request Card */}
            <Link
              to={appraisalPath}
              className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-300 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                    Self-Service <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                  Submit / Update Appraisal
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Access your official annual performance appraisal form and submit self-evaluation criteria scores.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Status:</span>
                <span className="font-bold text-slate-700">{userAppraisal?.status || "Draft / Not Submitted"}</span>
              </div>
            </Link>

            {/* Principal / HR Exclusive: Reviews */}
            {isPrincipalHR && (
              <Link
                to="/reviews"
                className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-emerald-300 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      Approvals <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                    Appraisal Reviews & Approvals
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    Review incoming teaching, non-teaching, and HOD appraisal submissions with live criteria validation.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Pending Reviews:</span>
                  <span className="font-bold text-amber-600">{stats.pendingReviews}</span>
                </div>
              </Link>
            )}

            {/* Principal / HR Exclusive: Gross Analytics */}
            {isPrincipalHR && (
              <Link
                to="/gross-analytics"
                className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-purple-300 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-purple-600 flex items-center gap-1">
                      Analytics <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">
                    Gross Analytics & Outlay Engine
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    Multi-year historical salary matrix, increment tier calculations, promotions, and financial budget outlay.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Access:</span>
                  <span className="font-bold text-purple-700">Principal & HR Only</span>
                </div>
              </Link>
            )}

            {/* Settings Link for HR / Admin */}
            {isPrincipalHR && (
              <Link
                to="/settings"
                className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-amber-300 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <Settings2 className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                      Admin <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-amber-600 transition-colors">
                    Appraisal Settings & Deadlines
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    Manage active submission windows, open/close dates, and performance evaluation weights.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Configuration:</span>
                  <span className="font-bold text-slate-700">Appraisal Schedule</span>
                </div>
              </Link>
            )}

            {/* Institutional Information / Support Card */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-3 rounded-xl bg-slate-200/70 text-slate-700">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Institutional
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Confidential HR Records
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  All compensation histories, increment records, and appraisal submissions are protected under institutional data privacy policy.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400 font-medium">
                ZoneSynapse HRMS • CK Group
              </div>
            </div>
          </div>
        </div>
      </div>
    </HRLayout>
  );
}
