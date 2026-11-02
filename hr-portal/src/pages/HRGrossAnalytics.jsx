import React, { useState, useEffect, useMemo, useRef } from "react";
import HRLayout from "../components/HRLayout";
import { auth, db } from "../firebase";
import { collection, doc, onSnapshot, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from "xlsx";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  ReferenceLine
} from "recharts";
import {
  BarChart3,
  Search,
  Download,
  Upload,
  Filter,
  CheckCircle2,
  Calendar,
  Award,
  Star,
  Users,
  ChevronDown,
  Sparkles,
  Briefcase,
  Layers,
  ArrowUpDown,
  Eye,
  X,
  FileText,
  Calculator,
  Percent,
  TrendingUp,
  ShieldCheck,
  IndianRupee,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Loader2,
  Settings2,
  Sliders,
  RotateCcw,
  BadgePercent,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Trash2,
  Crown,
  Pencil,
  Landmark
} from "lucide-react";
import { isSameInstitution, normalizeInstitution, getSchoolShortName } from "../utils/appraisalScore";

// Default Baseline Revenue & HR Cost Configuration (per Academic Year)
export const DEFAULT_REVENUE_CONFIG = {
  y2025_26: {
    totalFaculty: 134,
    totalRevenue: 127524311,
    annualHrCost: 62287163
  },
  y2026_27: {
    totalFaculty: 147,
    totalRevenue: 157438900,
    annualHrCost: 73073231
  }
};

export const DEFAULT_INSTITUTION_REVENUE = {
  ckcet: {
    y2025_26: { totalFaculty: 134, totalRevenue: 127524311, annualHrCost: 62287163 },
    y2026_27: { totalFaculty: 147, totalRevenue: 157438900, annualHrCost: 73073231 }
  },
  ckspk: {
    y2025_26: { totalFaculty: 0, totalRevenue: 0, annualHrCost: 0 },
    y2026_27: { totalFaculty: 0, totalRevenue: 0, annualHrCost: 0 }
  },
  ckspe: {
    y2025_26: { totalFaculty: 0, totalRevenue: 0, annualHrCost: 0 },
    y2026_27: { totalFaculty: 0, totalRevenue: 0, annualHrCost: 0 }
  },
  ckcoe: {
    y2025_26: { totalFaculty: 0, totalRevenue: 0, annualHrCost: 0 },
    y2026_27: { totalFaculty: 0, totalRevenue: 0, annualHrCost: 0 }
  }
};

export const INSTITUTION_OPTIONS = [
  { code: "ckcet", name: "CKCET (Engineering)" },
  { code: "ckspk", name: "CKSPK (Matric)" },
  { code: "ckspe", name: "CKSPE (CBSE)" },
  { code: "ckcoe", name: "CKCOE (B.Ed)" }
];

// Helper to compute clean, dynamic non-overlapping tier boundaries (honoring user-configured min and max scores)
export const computeDynamicTiers = (rawTiers = []) => {
  if (!Array.isArray(rawTiers) || rawTiers.length === 0) {
    return DEFAULT_INCREMENT_CRITERIA.tiers;
  }

  return rawTiers.map((tier, idx, arr) => {
    const minScore = Number(tier.minScore) || 0;
    const incrementPct = Number(tier.incrementPct) || 0;

    // If tier has an explicit user-configured maxScore that is valid, preserve it!
    // Otherwise, dynamically derive: top tier is 100, subsequent tiers up to prevMin - 0.01
    let maxScore = 100;
    if (idx === 0) {
      maxScore = tier.maxScore !== undefined && tier.maxScore !== null ? Number(tier.maxScore) : 100;
    } else {
      const prevMin = Number(arr[idx - 1].minScore) || 100;
      if (tier.maxScore !== undefined && tier.maxScore !== null && Number(tier.maxScore) <= prevMin && Number(tier.maxScore) >= minScore) {
        maxScore = Number(tier.maxScore);
      } else {
        maxScore = Math.max(minScore, prevMin - 0.01);
      }
    }

    let description = "";
    if (idx === 0) {
      description = `≥ ${minScore}% (${incrementPct}%)`;
    } else if (minScore > 0) {
      description = `${minScore}% to ${Math.floor(maxScore)}% (${incrementPct}%)`;
    } else {
      description = `< ${Math.ceil(maxScore)}% (${incrementPct}%)`;
    }

    return {
      ...tier,
      minScore,
      maxScore,
      incrementPct,
      description
    };
  });
};

// Institutional Performance & Increment Criteria Matrix (from official rubrics)
export const DEFAULT_INCREMENT_CRITERIA = {
  tiers: [
    {
      id: "FEE",
      code: "FEE",
      label: "Far Exceeds Expectations",
      minScore: 90,
      maxScore: 100,
      incrementPct: 10,
      description: "≥ 90% (10%)",
      badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-300",
      accentBg: "bg-emerald-600 text-white"
    },
    {
      id: "EE",
      code: "EE",
      label: "Exceeds Expectations",
      minScore: 80,
      maxScore: 89.99,
      incrementPct: 8,
      description: "80% to 89% (8%)",
      badgeColor: "bg-blue-50 text-blue-800 border-blue-300",
      accentBg: "bg-blue-600 text-white"
    },
    {
      id: "ME",
      code: "ME",
      label: "Meets Expectations",
      minScore: 70,
      maxScore: 79.99,
      incrementPct: 6,
      description: "70% to 79% (6%)",
      badgeColor: "bg-indigo-50 text-indigo-800 border-indigo-300",
      accentBg: "bg-indigo-600 text-white"
    },
    {
      id: "PME",
      code: "PME",
      label: "Partially Meets",
      minScore: 60,
      maxScore: 69.99,
      incrementPct: 4,
      description: "60% to 69% (4%)",
      badgeColor: "bg-amber-50 text-amber-800 border-amber-300",
      accentBg: "bg-amber-600 text-white"
    },
    {
      id: "NME",
      code: "NME",
      label: "Does Not Meet",
      minScore: 0,
      maxScore: 59.99,
      incrementPct: 0,
      description: "< 60% (0%)",
      badgeColor: "bg-rose-50 text-rose-800 border-rose-300",
      accentBg: "bg-rose-600 text-white"
    }
  ],
  promotionPct: 5 // Promotion - 5%
};

// Helper to parse numeric or range salary string e.g. "95,820", "25,000 - 30,000", "90000-1.2 Lakh"
export const parseSalaryValue = (val) => {
  if (val === undefined || val === null || val === "") {
    return { raw: "-", num: 0 };
  }
  const str = String(val).trim();
  if (!str || str === "-") return { raw: "-", num: 0 };

  const rangeMatch = str.match(/([0-9.,]+(?:\s*(?:Lakh|L))?)\s*[-–—to]+\s*([0-9.,]+(?:\s*(?:Lakh|L))?)/i);
  if (rangeMatch) {
    const parsePart = (p) => {
      let clean = p.replace(/,/g, "").trim().toLowerCase();
      if (clean.includes("lakh") || clean.endsWith("l")) {
        const n = parseFloat(clean.replace(/[^0-9.]/g, "")) || 0;
        return n * 100000;
      }
      return parseFloat(clean.replace(/[^0-9.]/g, "")) || 0;
    };
    const v1 = parsePart(rangeMatch[1]);
    const v2 = parsePart(rangeMatch[2]);
    const avg = Math.round((v1 + v2) / 2);
    return { raw: str, num: avg, min: Math.min(v1, v2), max: Math.max(v1, v2) };
  }

  const cleanStr = str.toLowerCase();
  let numVal = 0;
  if (cleanStr.includes("lakh") || cleanStr.endsWith("l")) {
    const n = parseFloat(cleanStr.replace(/[^0-9.]/g, "")) || 0;
    numVal = n * 100000;
  } else {
    const numMatch = str.match(/[0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]+/);
    if (numMatch) {
      numVal = parseFloat(numMatch[0].replace(/,/g, "")) || 0;
    }
  }

  return { raw: str, num: numVal };
};

export const formatDiffK = (val) => {
  if (!val && val !== 0) return "0";
  const abs = Math.abs(val);
  if (abs >= 100000) {
    return (abs / 100000).toFixed(1) + "L";
  }
  return (abs / 1000).toFixed(0) + "k";
};

// Default dynamic salary benchmark data (matching uploaded reference images)
export const DEFAULT_DYNAMIC_BENCHMARK = {
  designations: [
    { id: "assistant_professor", label: "Assistant Professor" },
    { id: "associate_professor", label: "Associate Professor" },
    { id: "professor", label: "Professor" }
  ],
  schools: [
    {
      id: "anna_univ",
      name: "Anna University",
      subName: "(19 colleges)",
      region: "Govt / State Univ",
      location: "Tamil Nadu",
      isGovt: true,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "95,820", num: 95820 },
        associate_professor: { raw: "2,13,740", num: 213740 },
        professor: { raw: "2,34,220", num: 234220 }
      }
    },
    {
      id: "st_joseph",
      name: "St.Joseph",
      subName: "(chennai)",
      region: "Chennai Metro",
      location: "Chennai",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "35,000 (first year)", num: 35000 },
        associate_professor: { raw: "85,000", num: 85000 },
        professor: { raw: "1,40,000", num: 140000 }
      }
    },
    {
      id: "aiht",
      name: "AIHT",
      subName: "(chennai)",
      region: "Chennai Metro",
      location: "Chennai",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "25,000 - 30,000", num: 27500 },
        associate_professor: { raw: "65,000 - 75,000", num: 70000 },
        professor: { raw: "1,00,000", num: 100000 }
      }
    },
    {
      id: "psgitech_sk",
      name: "PSGiTech / Sri Krishna",
      subName: "(coimbatore)",
      region: "Coimbatore Tier-1",
      location: "Coimbatore",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "35000-40000", num: 37500 },
        associate_professor: { raw: "70000-85000", num: 77500 },
        professor: { raw: "90000-1.2 Lakh", num: 105000 }
      }
    },
    {
      id: "saranathan",
      name: "Saranathan",
      subName: "(trichy)",
      region: "Central Tamil Nadu",
      location: "Trichy",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "28,000", num: 28000 },
        associate_professor: { raw: "65,000", num: 65000 },
        professor: { raw: "80,000", num: 80000 }
      }
    },
    {
      id: "ramco",
      name: "RAMCO Institute",
      subName: "(rajapalayam)",
      region: "South TN Tier-1",
      location: "Rajapalayam",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "46,400", num: 46400 },
        associate_professor: { raw: "66,000", num: 66000 },
        professor: { raw: "80,000", num: 80000 }
      }
    },
    {
      id: "syed_ammal",
      name: "Syed Ammal Engg",
      subName: "(ramnad)",
      region: "South Coastal",
      location: "Ramanathapuram",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "22,000", num: 22000 },
        associate_professor: { raw: "50,000", num: 50000 },
        professor: { raw: "75,000", num: 75000 }
      }
    },
    {
      id: "manakula",
      name: "MANAKULA",
      subName: "(pondy)",
      region: "Puducherry / Coastal",
      location: "Puducherry",
      isGovt: false,
      isOurCollege: false,
      salaries: {
        assistant_professor: { raw: "27,000", num: 27000 },
        associate_professor: { raw: "60,000", num: 60000 },
        professor: { raw: "80,000", num: 80000 }
      }
    },
    {
      id: "ckcet",
      name: "CKCET (Revised)",
      subName: "Our College",
      region: "Cuddalore / Our College",
      location: "Cuddalore",
      isGovt: false,
      isOurCollege: true,
      salaries: {
        assistant_professor: { raw: "30,000", num: 30000 },
        associate_professor: { raw: "65,000", num: 65000 },
        professor: { raw: "80,000", num: 80000 }
      }
    }
  ]
};

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

export default function HRGrossAnalytics() {
  const [facultyAppraisals, setFacultyAppraisals] = useState([]);
  const [teacherAppraisals, setTeacherAppraisals] = useState([]);
  const [nonTeachingAppraisals, setNonTeachingAppraisals] = useState([]);
  const [hodAppraisals, setHodAppraisals] = useState([]);
  const [principalAppraisals, setPrincipalAppraisals] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [promotionsMap, setPromotionsMap] = useState({});
  const [salaryAdjustmentsMap, setSalaryAdjustmentsMap] = useState({});
  const [adjustmentInputs, setAdjustmentInputs] = useState({});
  const [criteriaConfig, setCriteriaConfig] = useState(DEFAULT_INCREMENT_CRITERIA);
  const [loading, setLoading] = useState(true);

  // Institution-segregated salaries store (gross_salaries_ckcoe, gross_salaries_ckspk, gross_salaries_ckspe, gross_salaries_ckcet)
  const [instSalaries, setInstSalaries] = useState({
    ckcoe: {},
    ckspk: {},
    ckspe: {},
    ckcet: {},
    legacy: {}
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingSalaries, setDeletingSalaries] = useState(false);

  // Principal / HR Role & Institution Verification
  const [currentUser, setCurrentUser] = useState(auth.currentUser || null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [userInstitution, setUserInstitution] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [selectedInstFilter, setSelectedInstFilter] = useState("All");

  // Normalized active institution code ('ckcoe', 'ckspk', 'ckspe', 'ckcet')
  const activeInstCode = useMemo(() => {
    const raw = userInstitution || (selectedInstFilter !== "All" ? selectedInstFilter : "");
    return normalizeInstitution(raw).toLowerCase();
  }, [userInstitution, selectedInstFilter]);

  // Reactive resolution of salaries strictly prioritizing the active institution's dedicated document node
  const salariesMap = useMemo(() => {
    if (activeInstCode && activeInstCode !== "all") {
      const dedicated = instSalaries[activeInstCode];
      // If dedicated document has data or was fetched, use it
      if (dedicated && Object.keys(dedicated).length > 0) {
        return dedicated;
      }
      // If dedicated node is empty/not uploaded yet, fallback to legacy
      return instSalaries.legacy || {};
    }

    // Super Admin viewing "All": merge all institution nodes
    return {
      ...(instSalaries.legacy || {}),
      ...(instSalaries.ckcet || {}),
      ...(instSalaries.ckcoe || {}),
      ...(instSalaries.ckspe || {}),
      ...(instSalaries.ckspk || {})
    };
  }, [activeInstCode, instSalaries]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsAuthorized(false);
        setAuthChecking(false);
        return;
      }
      try {
        let role = "";
        let designation = "";
        let inst = "";
        let dept = "";
        let profileData = null;

        // Try Firestore users collection first
        const uDoc = await getDoc(doc(db, "users", user.uid));
        if (uDoc.exists()) {
          profileData = uDoc.data();
        }

        // Check localStorage fallback / enrichment
        let localProfile = null;
        try {
          const localStr = localStorage.getItem(`user_profile_${user.uid}`);
          if (localStr) localProfile = JSON.parse(localStr);
        } catch (e) { }

        role = profileData?.role || localProfile?.role || "";
        designation = profileData?.designation || localProfile?.designation || "";
        inst = profileData?.institution || localProfile?.institution || "";
        dept = profileData?.department || localProfile?.department || "";

        setUserProfile(profileData || localProfile);
        setUserRole(role);
        setUserInstitution(inst);
        setUserDepartment(dept);
        const r = (String(role) + " " + String(designation)).toLowerCase();
        const allowed = r.includes("principal") || r.includes("hr") || r.includes("admin") || user?.email === "obe@ckcet.edu.in";
        setIsAuthorized(allowed);
      } catch (e) {
        console.error("Auth check error in Gross Analytics:", e);
        setIsAuthorized(false);
      } finally {
        setAuthChecking(false);
      }
    });

    return () => unsubAuth();
  }, []);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");
  const [approvalFilter, setApprovalFilter] = useState("All"); // Always "All"
  const [sortField, setSortField] = useState("grossMark"); // "grossMark", "grossPM", "incrementAmount", "facultyName", "dateOfJoining", "appraisalMark"
  const [sortDirection, setSortDirection] = useState("desc");

  // Modal States
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedAnalyticsCandidate, setSelectedAnalyticsCandidate] = useState(null);
  const [analyticsSalaryViewMode, setAnalyticsSalaryViewMode] = useState("PM");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState(DEFAULT_INCREMENT_CRITERIA);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [parsedPreviewList, setParsedPreviewList] = useState([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadDetectedYears, setUploadDetectedYears] = useState([]);
  const [incrementAnalyticsModalOpen, setIncrementAnalyticsModalOpen] = useState(false);
  const [incrementModalTab, setIncrementModalTab] = useState("tiers");
  const [incrementModalViewMode, setIncrementModalViewMode] = useState("PA");

  // Institutional Revenue & Budget State (Editable per institution)
  const [revenueAnalyticsMap, setRevenueAnalyticsMap] = useState({});
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [revenueModalTargetYear, setRevenueModalTargetYear] = useState("all"); // "y2025_26", "y2026_27", or "all"
  const [revenueTargetInst, setRevenueTargetInst] = useState("ckcet");
  const [revenueForm, setRevenueForm] = useState({
    y2025_26: { totalFaculty: 134, totalRevenue: 127524311, annualHrCost: 62287163 },
    y2026_27: { totalFaculty: 147, totalRevenue: 157438900, annualHrCost: 73073231 }
  });
  const [savingRevenue, setSavingRevenue] = useState(false);

  // Toast Notification State
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const fileInputRef = useRef(null);

  // Salary Structure Matrix Benchmark State (Dynamic Multi-School & Multi-Designation)
  const [benchmarkTableOrientation, setBenchmarkTableOrientation] = useState("exactImage"); // "exactImage" or "detailed"
  const [benchmarkData, setBenchmarkData] = useState(DEFAULT_DYNAMIC_BENCHMARK);
  const [selectedBenchmarkRole, setSelectedBenchmarkRole] = useState("");
  const [benchmarkChartType, setBenchmarkChartType] = useState("salary"); // "salary" | "variance"
  const [benchmarkSort, setBenchmarkSort] = useState("default"); // "default" | "salaryDesc" | "salaryAsc"
  const [includeGovtScale, setIncludeGovtScale] = useState(false);
  const benchmarkFileInputRef = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Helper: Normalize ID for comparison (strips all leading/trailing quotes like ''1783, '1783 -> 1783)
  const normalizeId = (id) => String(id || "").replace(/^['"`]+|['"`]+$/g, "").trim().toUpperCase().replace(/\s+/g, "");

  // Real-time Firestore Listeners
  useEffect(() => {
    let unsubs = [];

    // 1. Fetch Users collection for ID and DOJ enrichment
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const uMap = {};
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const docId = docSnap.id;
        const entry = { id: docId, ...data };
        // Index by Firestore document ID (which is the user's Auth UID)
        uMap[docId] = entry;
        if (data.uid) uMap[data.uid] = entry;
        if (data.email) uMap[data.email.toLowerCase().trim()] = entry;
        if (data.empId) {
          const eStr = String(data.empId).trim();
          uMap[eStr] = entry;
          uMap[eStr.toUpperCase()] = entry;
          uMap[eStr.toLowerCase()] = entry;
        }
        if (data.employeeId) {
          const empStr = String(data.employeeId).trim();
          uMap[empStr] = entry;
          uMap[empStr.toUpperCase()] = entry;
          uMap[empStr.toLowerCase()] = entry;
        }
        if (data.facultyId) {
          const fStr = String(data.facultyId).trim();
          uMap[fStr] = entry;
          uMap[fStr.toUpperCase()] = entry;
        }
        if (data.staffId) {
          const sStr = String(data.staffId).trim();
          uMap[sStr] = entry;
        }
      });
      setUsersMap(uMap);
    }, (err) => console.error("Error loading users:", err));
    unsubs.push(unsubUsers);

    // 2. Fetch Gross Salaries from Dedicated Institution Nodes (ckcoe, ckspk, ckspe, ckcet)
    const instNodes = ["ckcoe", "ckspk", "ckspe", "ckcet"];
    instNodes.forEach((code) => {
      const unsubInstSal = onSnapshot(doc(db, "appraisal_config", `gross_salaries_${code}`), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setInstSalaries((prev) => ({ ...prev, [code]: data.salaries || {} }));
        } else {
          setInstSalaries((prev) => ({ ...prev, [code]: {} }));
        }
      }, (err) => console.error(`Error loading ${code} salaries:`, err));
      unsubs.push(unsubInstSal);
    });

    // Legacy fallback listener (appraisal_config/gross_salaries)
    const unsubLegacy = onSnapshot(doc(db, "appraisal_config", "gross_salaries"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setInstSalaries((prev) => ({ ...prev, legacy: data.salaries || {} }));
      } else {
        setInstSalaries((prev) => ({ ...prev, legacy: {} }));
      }
    }, (err) => console.error("Error loading legacy salaries config:", err));
    unsubs.push(unsubLegacy);

    // 3. Fetch Increment Criteria Configuration
    const unsubCriteria = onSnapshot(doc(db, "appraisal_config", "increment_criteria"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const normalizedTiers = computeDynamicTiers(data.tiers || DEFAULT_INCREMENT_CRITERIA.tiers);
        setCriteriaConfig({
          ...DEFAULT_INCREMENT_CRITERIA,
          ...data,
          tiers: normalizedTiers
        });
      } else {
        setCriteriaConfig(DEFAULT_INCREMENT_CRITERIA);
      }
    }, (err) => console.error("Error loading criteria config:", err));
    unsubs.push(unsubCriteria);

    // 4. Fetch Promotion Recommendations
    const unsubPromotions = onSnapshot(doc(db, "appraisal_config", "promotions"), (snap) => {
      if (snap.exists()) {
        setPromotionsMap(snap.data().promotions || {});
      } else {
        setPromotionsMap({});
      }
    }, (err) => console.error("Error loading promotions config:", err));
    unsubs.push(unsubPromotions);

    // 5. Fetch Salary Adjustments (PM)
    const unsubAdjustments = onSnapshot(doc(db, "appraisal_config", "salary_adjustments"), (snap) => {
      if (snap.exists()) {
        setSalaryAdjustmentsMap(snap.data().adjustments || {});
      } else {
        setSalaryAdjustmentsMap({});
      }
    }, (err) => console.error("Error loading salary adjustments:", err));
    unsubs.push(unsubAdjustments);

    // 5b. Fetch Institution Revenue Analytics (2025-26 & 2026-27 budgets per institution)
    const unsubRevenueAnalytics = onSnapshot(doc(db, "appraisal_config", "institution_revenue_analytics"), (snap) => {
      if (snap.exists()) {
        setRevenueAnalyticsMap(snap.data() || {});
      } else {
        setRevenueAnalyticsMap({});
      }
    }, (err) => console.error("Error loading institution revenue analytics:", err));
    unsubs.push(unsubRevenueAnalytics);

    // 6. Fetch Faculty Appraisals
    const unsubFaculty = onSnapshot(collection(db, "faculty_appraisals"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        collectionType: "faculty",
        ...d.data()
      }));
      setFacultyAppraisals(list);
      setLoading(false);
    }, (err) => console.error("Error loading faculty appraisals:", err));
    unsubs.push(unsubFaculty);

    // 6b. Fetch Teacher Appraisals (CKSPK / School Teachers)
    const unsubTeacher = onSnapshot(collection(db, "teacher_appraisals"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        collectionType: "teacher",
        ...d.data()
      }));
      setTeacherAppraisals(list);
      setLoading(false);
    }, (err) => console.error("Error loading teacher appraisals:", err));
    unsubs.push(unsubTeacher);

    // 7. Fetch Non-Teaching Appraisals
    const unsubNonTeaching = onSnapshot(collection(db, "non_teaching_appraisals"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        collectionType: "non_teaching",
        ...d.data()
      }));
      setNonTeachingAppraisals(list);
      setLoading(false);
    }, (err) => console.error("Error loading non-teaching appraisals:", err));
    unsubs.push(unsubNonTeaching);

    // 8. Fetch HOD Appraisals
    const unsubHOD = onSnapshot(collection(db, "hod_appraisals"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        collectionType: "hod",
        ...d.data()
      }));
      setHodAppraisals(list);
      setLoading(false);
    }, (err) => console.error("Error loading HOD appraisals:", err));
    unsubs.push(unsubHOD);

    // 9. Fetch Principal Appraisals
    const unsubPrincipal = onSnapshot(collection(db, "principal_appraisals"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        collectionType: "principal",
        ...d.data()
      }));
      setPrincipalAppraisals(list);
      setLoading(false);
    }, (err) => console.error("Error loading principal appraisals:", err));
    unsubs.push(unsubPrincipal);

    return () => unsubs.forEach((u) => u && u());
  }, []);

  // Real-time subscription to salary structure benchmark data from Firestore
  useEffect(() => {
    const targetInst = activeInstCode || "ckcet";
    const unsubBenchmark = onSnapshot(
      doc(db, "appraisal_config", `salary_structure_benchmark_${targetInst}`),
      (snap) => {
        if (snap.exists() && snap.data()?.schools?.length > 0) {
          setBenchmarkData(snap.data());
        } else {
          // Fallback check generic benchmark doc
          getDoc(doc(db, "appraisal_config", "salary_structure_benchmark"))
            .then((gSnap) => {
              if (gSnap.exists() && gSnap.data()?.schools?.length > 0) {
                setBenchmarkData(gSnap.data());
              }
            })
            .catch(() => {});
        }
      },
      (err) => console.warn("Benchmark data listener warning:", err)
    );
    return () => unsubBenchmark();
  }, [activeInstCode]);

  // Derived our college/school and peer institutions from benchmark data
  const ourCollege = useMemo(() => {
    return (
      benchmarkData.schools.find((s) => s.isOurCollege) ||
      benchmarkData.schools[benchmarkData.schools.length - 1]
    );
  }, [benchmarkData]);

  const peerSchools = useMemo(() => {
    return benchmarkData.schools.filter((s) => s !== ourCollege);
  }, [benchmarkData, ourCollege]);

  // Derived active institution short code for difference badges (e.g. CKSPE, CKSPK, CKCOE, CKCET)
  const ourInstitutionCode = useMemo(() => {
    if (ourCollege?.name) {
      const clean = ourCollege.name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0];
      if (clean && clean.length <= 10) return clean.toUpperCase();
    }
    const shortName = getSchoolShortName(userInstitution);
    if (shortName) return shortName.toUpperCase();
    if (activeInstCode && activeInstCode !== "all") return activeInstCode.toUpperCase();
    return "CKCET";
  }, [ourCollege, userInstitution, activeInstCode]);

  // Derived institution descriptor label ("Our School" vs "Our College" based on uploaded data and institution login)
  const instTypeLabel = useMemo(() => {
    const fullName = ((ourCollege?.fullName || ourCollege?.name || "") + " " + (ourCollege?.subName || "")).toLowerCase();
    if (fullName.includes("our school") || fullName.includes("school")) {
      return "Our School";
    }
    if (fullName.includes("our college") || fullName.includes("college")) {
      return "Our College";
    }
    if (activeInstCode === "ckspe" || activeInstCode === "ckspk") {
      return "Our School";
    }
    return "Our College";
  }, [ourCollege, activeInstCode]);

  // Clean display name for our institution without duplicate "(Our School)" or "(Our College)"
  const cleanOurCollegeName = useMemo(() => {
    if (!ourCollege?.name) return `${ourInstitutionCode} (Revised)`;
    return ourCollege.name.replace(/\s*\(our (?:college|school)\)/i, "").trim();
  }, [ourCollege, ourInstitutionCode]);

  // Check if any school has Govt scale
  const hasGovtSchool = useMemo(() => {
    return benchmarkData.schools.some((s) => s.isGovt);
  }, [benchmarkData.schools]);

  // Active benchmark role (defaults to first designation; strictly NO "all roles" per user requirement)
  const activeBenchmarkRole = useMemo(() => {
    if (selectedBenchmarkRole && benchmarkData.designations.some((d) => d.id === selectedBenchmarkRole)) {
      return selectedBenchmarkRole;
    }
    return benchmarkData.designations[0]?.id || "";
  }, [selectedBenchmarkRole, benchmarkData.designations]);

  // Metrics for active selected role
  const activeRoleMetrics = useMemo(() => {
    const roleId = activeBenchmarkRole;
    const desgObj = benchmarkData.designations.find((d) => d.id === roleId) || benchmarkData.designations[0];
    const ourSal = ourCollege?.salaries?.[roleId]?.num || 0;
    const ourRaw = ourCollege?.salaries?.[roleId]?.raw || "-";
    const peerList = benchmarkData.schools.filter((s) => !s.isOurCollege && (includeGovtScale || !s.isGovt));

    const higherCount = peerList.filter((s) => (s.salaries?.[roleId]?.num || 0) > ourSal).length;
    const parityCount = peerList.filter((s) => (s.salaries?.[roleId]?.num || 0) === ourSal && ourSal > 0).length;
    const lowerCount = peerList.filter((s) => (s.salaries?.[roleId]?.num || 0) < ourSal && ourSal > 0).length;
    const rank = higherCount + 1;

    return {
      roleId,
      roleName: desgObj?.label || "Designation",
      ourSal,
      ourRaw,
      rank,
      totalPeers: peerList.length,
      higherCount,
      parityCount,
      lowerCount
    };
  }, [benchmarkData, activeBenchmarkRole, ourCollege, includeGovtScale]);

  // Derived chart data for selected role across institutions
  const benchmarkChartData = useMemo(() => {
    if (!benchmarkData?.schools || benchmarkData.schools.length === 0) return [];
    const roleId = activeBenchmarkRole;
    if (!roleId) return [];

    const ourSal = ourCollege?.salaries?.[roleId]?.num || 0;
    const list = benchmarkData.schools.filter((s) => includeGovtScale || !s.isGovt);

    let mapped = list.map((s) => {
      const salObj = s.salaries?.[roleId];
      const salary = salObj?.num || 0;
      const rawText = salObj?.raw || "-";
      const diffFromOur = salary - ourSal;

      // Extract concise location
      let loc = "";
      if (s.isOurCollege) {
        loc = s.location || "Cuddalore";
      } else if (s.id === "anna_univ" && s.subName) {
        loc = s.subName.replace(/[()]/g, "").trim();
      } else if (s.location) {
        loc = s.location;
      } else if (s.subName && !s.subName.toLowerCase().includes("college") && !s.subName.toLowerCase().includes("school")) {
        loc = s.subName.replace(/[()]/g, "").trim();
      } else {
        loc = "Tamil Nadu";
      }

      // Clean base name if location is already embedded in parentheses or after comma
      let baseName = s.name;
      if (loc && loc !== "Tamil Nadu") {
        const parenRegex = new RegExp(`\\s*\\(${loc.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\)`, "i");
        baseName = baseName.replace(parenRegex, "").trim();
        const commaRegex = new RegExp(`[,\\s]+${loc.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, "i");
        baseName = baseName.replace(commaRegex, "").trim();
      }

      const shortNameWithLocation = loc ? `${baseName} (${loc})` : baseName;

      return {
        id: s.id,
        name: s.name,
        shortNameWithLocation,
        subName: s.subName,
        location: loc,
        region: s.region,
        isGovt: s.isGovt,
        isOurCollege: s.isOurCollege,
        salary,
        rawText,
        diffFromOur
      };
    });

    if (benchmarkSort === "salaryDesc") {
      mapped.sort((a, b) => b.salary - a.salary);
    } else if (benchmarkSort === "salaryAsc") {
      mapped.sort((a, b) => a.salary - b.salary);
    }

    return mapped;
  }, [benchmarkData, activeBenchmarkRole, ourCollege, includeGovtScale, benchmarkSort]);

  // Custom Glassmorphic Tooltip for Benchmark Bar Chart
  const BenchmarkChartTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const diff = item.diffFromOur;

      return (
        <div className="bg-slate-900/95 text-white backdrop-blur-md rounded-2xl p-3.5 shadow-2xl border border-white/10 text-xs min-w-[230px]">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2">
            <div>
              <div className="font-black text-sm text-white flex items-center gap-1.5">
                {item.name}
                {item.isOurCollege && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-500 text-white">
                    {instTypeLabel.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">
                {item.location ? `(${item.location})` : ""} {item.region ? `• ${item.region}` : ""}
              </div>
            </div>
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                item.isGovt ? "bg-amber-400/20 text-amber-300" : "bg-slate-700 text-slate-300"
              }`}
            >
              {item.isGovt ? "Govt Scale" : "Private"}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">{activeRoleMetrics.roleName}:</span>
              <strong className="font-mono text-emerald-400 text-sm">{item.rawText}</strong>
            </div>
            {!item.isOurCollege && activeRoleMetrics.ourSal > 0 && item.salary > 0 && (
              <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">vs {cleanOurCollegeName}:</span>
                {diff > 0 ? (
                  <span className="font-mono text-emerald-400 font-bold">
                    Peer pays +₹{diff.toLocaleString("en-IN")} higher
                  </span>
                ) : diff === 0 ? (
                  <span className="font-mono text-sky-400 font-bold">100% Market Parity</span>
                ) : (
                  <span className="font-mono text-amber-400 font-bold">
                    Peer pays -₹{Math.abs(diff).toLocaleString("en-IN")} lower
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Download Excel Template matching Image 3 with Location column (Row 1: school name/designation | location | desg 1 | desg 2... Rows 2..N: school 1 | school 2...)
  const handleDownloadBenchmarkTemplate = () => {
    try {
      const headers = ["school name/designation", "location", ...benchmarkData.designations.map((d) => d.label)];
      const rows = benchmarkData.schools.map((s) => {
        let schoolTitle = s.name;
        if (s.isOurCollege) {
          const clean = s.name.replace(/\s*\(our (?:college|school)\)/i, "").trim();
          schoolTitle = `${clean} (${instTypeLabel})`;
        } else if (s.subName && !s.location) {
          schoolTitle = `${s.name} ${s.subName}`;
        }

        let locVal = "";
        if (s.isOurCollege) {
          locVal = s.location || "Cuddalore";
        } else if (s.location) {
          locVal = s.location;
        } else if (s.subName && !s.subName.toLowerCase().includes("college") && !s.subName.toLowerCase().includes("school") && !s.subName.toLowerCase().includes("19 colleges")) {
          locVal = s.subName.replace(/[()]/g, "").trim();
        }

        const row = [schoolTitle, locVal];
        benchmarkData.designations.forEach((d) => {
          row.push(s.salaries[d.id]?.raw || "");
        });
        return row;
      });

      const wsData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Auto-fit column widths
      ws["!cols"] = [
        { wch: 38 },
        { wch: 18 },
        ...benchmarkData.designations.map(() => ({ wch: 22 }))
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Salary Benchmark Template");
      XLSX.writeFile(wb, `${ourInstitutionCode}_Salary_Benchmark_Template.xlsx`);
      showToast("Template downloaded! You can enter location for each school (defaults to Tamil Nadu if empty).", "success");
    } catch (err) {
      console.error("Error downloading template:", err);
      showToast("Could not generate Excel template.", "error");
    }
  };

  // Upload Excel / CSV file to dynamically import any number of schools & designations
  const handleUploadBenchmarkFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (!json || json.length < 2) {
            showToast("Excel file must contain a header row and at least one school data row.", "error");
            return;
          }

          // Row 0 is header: Column 0 is "school name/designation", followed by optional "location" column and designations
          const headerRow = json[0] || [];
          let locationColIndex = -1;
          const designations = [];
          for (let c = 1; c < headerRow.length; c++) {
            const rawLabel = headerRow[c];
            if (rawLabel !== undefined && rawLabel !== null && String(rawLabel).trim() !== "") {
              const label = String(rawLabel).trim();
              if (label.toLowerCase() === "location" || label.toLowerCase().startsWith("location")) {
                locationColIndex = c;
              } else {
                const id = `desg_${c}_` + label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                designations.push({ id, label, colIndex: c });
              }
            }
          }

          if (designations.length === 0) {
            showToast("No designation columns found in the header row.", "error");
            return;
          }

          // Rows 1..N are schools
          const schools = [];
          for (let r = 1; r < json.length; r++) {
            const row = json[r];
            if (!row || row.length === 0) continue;
            const rawSchoolName = row[0] ? String(row[0]).trim() : "";
            if (!rawSchoolName) continue;

            const lowerName = rawSchoolName.toLowerCase();
            const isOurCollege =
              lowerName.includes("our college") ||
              lowerName.includes("our school") ||
              lowerName.includes("ckcet") ||
              lowerName.includes("ckspe") ||
              lowerName.includes("ckspk") ||
              lowerName.includes("ckcoe") ||
              lowerName.includes(userInstitution?.toLowerCase() || "___") ||
              lowerName.includes(activeInstCode?.toLowerCase() || "___");

            let rowInstType = "Our College";
            if (lowerName.includes("our school")) {
              rowInstType = "Our School";
            } else if (lowerName.includes("our college")) {
              rowInstType = "Our College";
            } else if (activeInstCode === "ckspe" || activeInstCode === "ckspk" || lowerName.includes("school") || lowerName.includes("cbse") || lowerName.includes("matric")) {
              rowInstType = "Our School";
            }

            let name = rawSchoolName;
            let subName = isOurCollege ? rowInstType : "";
            const parenMatch = rawSchoolName.match(/^(.*?)\s*(\(.*?\))$/);
            if (parenMatch) {
              name = parenMatch[1].trim();
              const insideParen = parenMatch[2].replace(/[()]/g, "").trim();
              subName = insideParen;
            }

            // Extract location from location column if present
            let schoolLocation = "";
            if (locationColIndex !== -1 && row[locationColIndex] !== undefined && row[locationColIndex] !== null) {
              schoolLocation = String(row[locationColIndex]).trim();
            }

            // User requirement:
            // "adhula podra location than varanum. aedhumae podalana than (Tamil nadu) varanum."
            if (schoolLocation) {
              // Location specified explicitly
              const locPattern = new RegExp(`[,\\s]+${schoolLocation.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'i');
              if (locPattern.test(name)) {
                name = name.replace(locPattern, '').trim();
              }
            } else {
              // Location not specified -> fallback: if our institution: Cuddalore, else Tamil Nadu
              if (isOurCollege) {
                schoolLocation = "Cuddalore";
              } else if (subName && !subName.toLowerCase().includes("college") && !subName.toLowerCase().includes("school") && !subName.toLowerCase().includes("19 colleges")) {
                schoolLocation = subName;
              } else {
                schoolLocation = "Tamil Nadu";
              }
            }

            const isGovt = lowerName.includes("anna univ") || lowerName.includes("govt") || lowerName.includes("university");

            const salaries = {};
            designations.forEach((d) => {
              const cellVal = row[d.colIndex];
              salaries[d.id] = parseSalaryValue(cellVal);
            });

            schools.push({
              id: `school_${r}_` + name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              name,
              subName: subName || (schoolLocation ? `(${schoolLocation.toLowerCase()})` : ""),
              fullName: rawSchoolName,
              region: isOurCollege ? `Cuddalore / ${rowInstType}` : isGovt ? "Govt / State Univ" : (rowInstType === "Our School" ? "Private Peer School" : "Private Peer College"),
              location: schoolLocation,
              isGovt,
              isOurCollege,
              salaries
            });
          }

          if (schools.length === 0) {
            showToast("No valid school data rows found in uploaded file.", "error");
            return;
          }

          // Ensure at least one school is marked as our college
          const hasOurCollege = schools.some((s) => s.isOurCollege);
          if (!hasOurCollege && schools.length > 0) {
            schools[schools.length - 1].isOurCollege = true;
          }

          const newBenchmarkData = {
            designations: designations.map((d) => ({ id: d.id, label: d.label })),
            schools,
            updatedAt: new Date().toISOString()
          };

          setBenchmarkData(newBenchmarkData);

          // Save to Firestore
          try {
            const targetInst = activeInstCode || "ckcet";
            await setDoc(doc(db, "appraisal_config", `salary_structure_benchmark_${targetInst}`), newBenchmarkData, { merge: true });
            if (targetInst === "ckcet") {
              await setDoc(doc(db, "appraisal_config", "salary_structure_benchmark"), newBenchmarkData, { merge: true });
            }
          } catch (fireErr) {
            console.warn("Could not persist benchmark data to Firestore:", fireErr);
          }

          showToast(`Successfully imported ${schools.length} institutions and ${designations.length} designations!`, "success");
        } catch (innerErr) {
          console.error("Inner parse error:", innerErr);
          showToast("Error parsing Excel content. Please verify column formats.", "error");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("File upload error:", err);
      showToast("Failed to read file.", "error");
    } finally {
      e.target.value = "";
    }
  };

  // Reset to default benchmark matrix
  const handleResetDefaultBenchmark = async () => {
    if (!window.confirm("Reset salary structure benchmark tables to default reference data?")) return;
    try {
      setBenchmarkData(DEFAULT_DYNAMIC_BENCHMARK);
      const targetInst = activeInstCode || "ckcet";
      await setDoc(doc(db, "appraisal_config", `salary_structure_benchmark_${targetInst}`), DEFAULT_DYNAMIC_BENCHMARK, { merge: true });
      showToast("Reset to default benchmark data successfully.", "success");
    } catch (err) {
      console.error("Reset error:", err);
      showToast("Failed to reset benchmark data.", "error");
    }
  };

  // Default salary years helper (generates past 3 academic years based on active academic year)
  const getDefaultSalaryYears = (activeYear = "2024-2025") => {
    const match = String(activeYear).match(/(20\d{2})/);
    const startYear = match ? parseInt(match[1], 10) : new Date().getFullYear();
    return [
      `${startYear - 2}-${String(startYear - 1).slice(-2)}`,
      `${startYear - 1}-${String(startYear).slice(-2)}`,
      `${startYear}-${String(startYear + 1).slice(-2)}`
    ];
  };

  // Discovered multi-year history keys across salariesMap
  const discoveredSalaryYears = useMemo(() => {
    const set = new Set();
    Object.values(salariesMap).forEach((val) => {
      if (val && typeof val === "object" && val.history) {
        Object.keys(val.history).forEach((y) => set.add(y));
      }
    });
    if (set.size >= 2) {
      return Array.from(set).sort();
    }
    return getDefaultSalaryYears(selectedYear !== "All" ? selectedYear : "2024-2025");
  }, [salariesMap, selectedYear]);

  // Helper: Find matching tier for a given score
  const getCandidateTier = (score, criteria) => {
    const rawTiers = criteria?.tiers || DEFAULT_INCREMENT_CRITERIA.tiers;
    const tiers = computeDynamicTiers(rawTiers);
    const numScore = Number(score) || 0;
    for (const tier of tiers) {
      if (numScore >= Number(tier.minScore)) {
        return tier;
      }
    }
    return tiers[tiers.length - 1];
  };

  // Process and compute combined gross records
  const allRecords = useMemo(() => {
    const rawList = [...facultyAppraisals, ...teacherAppraisals, ...nonTeachingAppraisals, ...hodAppraisals, ...principalAppraisals];

    return rawList.map((app, appIdx) => {
      // Find matching user from usersMap
      const candidateUserKeys = [
        app.uid,
        app.userId,
        app.staffId,
        app.facultyId,
        app.id ? app.id.split("_")[0] : null,
        app.docId ? app.docId.split("_")[0] : null,
        app.facultyEmail ? app.facultyEmail.toLowerCase().trim() : null,
        app.staffEmail ? app.staffEmail.toLowerCase().trim() : null,
        app.email ? app.email.toLowerCase().trim() : null,
        app.userEmail ? app.userEmail.toLowerCase().trim() : null,
        app.formData?.email ? app.formData.email.toLowerCase().trim() : null,
        app.formData?.facultyEmail ? app.formData.facultyEmail.toLowerCase().trim() : null,
        app.formData?.staffEmail ? app.formData.staffEmail.toLowerCase().trim() : null,
        app.empId,
        app.formData?.empId,
        app.employeeId,
        app.formData?.employeeId
      ].filter(Boolean);

      let matchedUser = {};
      for (const k of candidateUserKeys) {
        if (usersMap[k]) {
          matchedUser = usersMap[k];
          break;
        }
      }

      // Check if a string is a 20+ character Firestore Auth UID (e.g. 0UoZxWuDJfhKLJMguOP1ftRu6Vz1)
      const isFirestoreUid = (val) => {
        if (!val || typeof val !== "string") return false;
        const s = val.trim();
        return s.length >= 20 && /^[A-Za-z0-9_-]{20,}$/.test(s);
      };

      const getValidEmpId = (val) => {
        if (!val) return null;
        const str = String(val).replace(/^['"`]+|['"`]+$/g, "").trim();
        if (!str || isFirestoreUid(str)) return null;
        return str;
      };

      // ID resolution: Strictly prioritize official employee ID (empId) over Firestore Auth UID
      const resolvedEmpId = (
        getValidEmpId(matchedUser.empId) ||
        getValidEmpId(app.empId) ||
        getValidEmpId(app.formData?.empId) ||
        getValidEmpId(matchedUser.employeeId) ||
        getValidEmpId(app.employeeId) ||
        getValidEmpId(app.formData?.employeeId) ||
        getValidEmpId(app.facultyEmpId) ||
        getValidEmpId(matchedUser.facultyId) ||
        getValidEmpId(app.facultyId) ||
        getValidEmpId(matchedUser.staffId) ||
        getValidEmpId(app.formData?.facultyId) ||
        getValidEmpId(app.formData?.staffId) ||
        getValidEmpId(app.staffId) ||
        (matchedUser.empId ? String(matchedUser.empId).trim() : null) ||
        (app.empId ? String(app.empId).trim() : null) ||
        (matchedUser.employeeId ? String(matchedUser.employeeId).trim() : null) ||
        (app.uid ? app.uid.slice(0, 8).toUpperCase() : app.id.slice(0, 8).toUpperCase())
      );
      const facultyId = String(resolvedEmpId || "").replace(/^['"`]+|['"`]+$/g, "").trim();

      // Lookup Gross PM salary from salariesMap (supports legacy number and new time-series object)
      const normId = normalizeId(facultyId);
      const normUid = normalizeId(app.uid || app.staffId || matchedUser.id);
      const normEmail = normalizeId(app.facultyEmail || app.staffEmail || matchedUser.email);
      const normEmpId = normalizeId(matchedUser.empId);
      const rawSalaryEntry = (
        salariesMap[normId] ??
        salariesMap[facultyId] ??
        salariesMap[normEmpId] ??
        salariesMap[normUid] ??
        salariesMap[normEmail] ??
        null
      );

      let grossPM = null;
      let salaryHistory = {};

      if (rawSalaryEntry !== null && rawSalaryEntry !== undefined) {
        if (typeof rawSalaryEntry === "object" && rawSalaryEntry !== null) {
          salaryHistory = rawSalaryEntry.history || {};
          const currentVal = rawSalaryEntry.current ?? (Object.values(salaryHistory).slice(-1)[0]);
          grossPM = currentVal !== null && !isNaN(Number(currentVal)) ? Number(currentVal) : null;
        } else if (!isNaN(Number(rawSalaryEntry))) {
          grossPM = Number(rawSalaryEntry);
          salaryHistory = { "Current": grossPM };
        }
      }

      // Promotion Status
      const isPromoted = Boolean(
        promotionsMap[normId] ||
        promotionsMap[facultyId] ||
        promotionsMap[normEmpId] ||
        app.promoted ||
        app.recommendedPromotion
      );

      const isPrincipal = app.formType === "principal" || app.collectionType === "principal";

      // Faculty / Member Name resolution
      const facultyName = (
        app.principalName ||
        app.facultyName ||
        app.formData?.name ||
        app.staffName ||
        app.hodName ||
        matchedUser.displayName ||
        matchedUser.facultyName ||
        (isPrincipal ? "Principal" : "Faculty Member")
      );

      // Designation resolution
      const designation = (
        app.designation ||
        app.formData?.designation ||
        app.staffDesignation ||
        matchedUser.designation ||
        (isPrincipal ? "Principal" : "Faculty")
      );

      // Department resolution
      const department = (
        app.department ||
        app.formData?.department ||
        app.dept ||
        app.formData?.dept ||
        matchedUser.department ||
        matchedUser.dept ||
        (isPrincipal ? "Administration" : "General")
      );

      // Institution resolution (e.g. 'CKSPK (Matric)', 'CKSPE (CBSE)', 'CKCOE', 'CKCET')
      const institution = (
        app.institution ||
        app.formData?.institution ||
        app.school ||
        app.formData?.school ||
        matchedUser.institution ||
        matchedUser.school ||
        (isPrincipal ? "CKCET" : app.collectionType === "teacher" ? "CKSPK (Matric)" : app.collectionType === "faculty" ? "CKCOE" : "")
      );

      // Helper to cleanly extract a date string if val is a string, Firestore Timestamp, or Date
      const extractDojString = (val) => {
        if (!val) return "";
        if (typeof val === "string") return val.trim();
        if (val.toDate && typeof val.toDate === "function") {
          return val.toDate().toISOString().split("T")[0];
        }
        if (val instanceof Date) {
          return val.toISOString().split("T")[0];
        }
        return String(val).trim();
      };

      // Date of Joining (DOJ) resolution - supports Non-Teaching (dojSchool), Teachers (dojCollege/dojSchool), Faculty (dojCollege), and user profiles
      const rawDoj = (
        app.formData?.dojSchool ||
        app.formData?.dojCollege ||
        app.formData?.dateOfJoining ||
        app.formData?.doj ||
        app.formData?.dojPresentPost ||
        app.dojSchool ||
        app.dojCollege ||
        app.dateOfJoining ||
        app.doj ||
        app.dojPresentPost ||
        matchedUser.dateOfJoining ||
        matchedUser.doj ||
        matchedUser.dojSchool ||
        matchedUser.dojCollege ||
        matchedUser.dojPresentPost ||
        ""
      );
      const dateOfJoining = extractDojString(rawDoj) || "-";

      // 1. Appraisal Review Form Mark (out of 100)
      // The Principal's explicit Final Rating entered in AppraisalReviews takes highest priority
      let appraisalMark = 0;
      const rawFinalRating = app.principalReview?.finalRating ?? app.principalReview?.rating ?? app.performanceEvaluation?.finalRating ?? app.finalRating;
      const hasFinalRating = rawFinalRating !== undefined && rawFinalRating !== null && rawFinalRating !== "" && !isNaN(Number(rawFinalRating));

      if (isPrincipal) {
        const principalScore = app.managementReview?.score ?? app.totalScore ?? app.principalReview?.finalRating ?? app.grossMark ?? (hasFinalRating ? rawFinalRating : null);
        if (principalScore !== undefined && principalScore !== null && !isNaN(Number(principalScore))) {
          appraisalMark = Number(principalScore);
        } else {
          appraisalMark = 100;
        }
      } else if (hasFinalRating) {
        // Principal's entered Final Rating (e.g. 85 in AppraisalReviews)
        appraisalMark = Number(rawFinalRating);
      } else if (app.principalReview?.principalTotalScore !== undefined && app.principalReview?.principalTotalScore !== null && !isNaN(Number(app.principalReview.principalTotalScore))) {
        appraisalMark = Number(app.principalReview.principalTotalScore);
      } else if (app.collectionType === "non_teaching") {
        appraisalMark = Number(app.performanceEvaluation?.totalMarks ?? app.totalScore ?? 0);
      } else if (app.autoScore?.total !== undefined && !isNaN(Number(app.autoScore.total))) {
        appraisalMark = Number(app.autoScore.total);
      } else {
        appraisalMark = Number(app.totalScore || app.score || 0);
      }

      // 2. Attitude Form Mark (Reflects across CKCOE, CKSPK, CKSPE once evaluated)
      const attitudeObj = app.attitudeForm || app.attitudeEvaluation || {};
      const isAttitudeSubmitted = Boolean(
        app.attitudeSubmittedToPrincipal === true ||
        attitudeObj.submittedToPrincipal === true ||
        attitudeObj.principalEvaluated === true ||
        (attitudeObj.principalTotalScore !== undefined && Number(attitudeObj.principalTotalScore) > 0) ||
        (attitudeObj.totalScore !== undefined && Number(attitudeObj.totalScore) > 0 && !attitudeObj.isDraft && !app.attitudeDraft) ||
        (app.principalReview?.attitudeTotalScore !== undefined && Number(app.principalReview?.attitudeTotalScore) > 0) ||
        (attitudeObj.principalMarks && Object.keys(attitudeObj.principalMarks).length > 0) ||
        (attitudeObj.ratings && Object.keys(attitudeObj.ratings).length > 0 && !attitudeObj.isDraft && !app.attitudeDraft)
      );

      let attitudeTotalScore = 0;
      if (isAttitudeSubmitted) {
        // Principal's evaluation takes priority if provided
        if (attitudeObj.principalTotalScore !== undefined && Number(attitudeObj.principalTotalScore) > 0) {
          attitudeTotalScore = Number(attitudeObj.principalTotalScore);
        } else if (app.principalReview?.attitudeTotalScore !== undefined && Number(app.principalReview.attitudeTotalScore) > 0) {
          attitudeTotalScore = Number(app.principalReview.attitudeTotalScore);
        } else if (attitudeObj.principalMarks && Object.keys(attitudeObj.principalMarks).length > 0) {
          attitudeTotalScore = Object.values(attitudeObj.principalMarks).reduce((s, v) => s + (Number(v) || 0), 0);
        } else if (attitudeObj.totalScore !== undefined && Number(attitudeObj.totalScore) > 0) {
          attitudeTotalScore = Number(attitudeObj.totalScore);
        } else if (attitudeObj.ratings && Object.keys(attitudeObj.ratings).length > 0) {
          attitudeTotalScore = Object.values(attitudeObj.ratings).reduce((s, v) => s + (Number(v) || 0), 0);
        }
      }

      const rawMax = attitudeObj.principalMaxScore || attitudeObj.maxScore || (attitudeObj.totalQuestions ? attitudeObj.totalQuestions * 5 : null);
      const questionCount = attitudeObj.principalMarks ? Object.keys(attitudeObj.principalMarks).length : (attitudeObj.ratings ? Object.keys(attitudeObj.ratings).length : 0);
      const attitudeMaxScore = Number(rawMax) || (questionCount > 0 ? questionCount * 5 : (app.formType === "hod" ? 90 : (app.formType === "teacher" ? 90 : 80)));
      const attitudePercentage = attitudeMaxScore > 0 ? (attitudeTotalScore / attitudeMaxScore) * 100 : 0;
      const attitudeMarkNormalized = isAttitudeSubmitted
        ? (attitudeObj.percentage !== undefined && !isNaN(Number(attitudeObj.percentage)) && Number(attitudeObj.percentage) > 0
          ? Number(attitudeObj.percentage)
          : attitudePercentage)
        : 0;

      // 3. Mark Computation: For Principal executive rubric, gross mark is 100% of the evaluated appraisal score.
      const weightedAppraisal = isPrincipal ? appraisalMark : 0.6 * appraisalMark;
      const weightedAttitude = isPrincipal ? 0 : 0.4 * attitudeMarkNormalized;
      const grossMark = isPrincipal ? Number(appraisalMark.toFixed(2)) : Number((weightedAppraisal + weightedAttitude).toFixed(2));

      // 4. Performance Tier & Increment Percentage Evaluation (Criteria Matrix)
      const tier = getCandidateTier(grossMark, criteriaConfig);
      const baseIncrementPct = Number(tier.incrementPct) || 0;

      // 5. Institutional Revision Matrix (Columns M - U)
      const grossPA = grossPM !== null ? Number((grossPM * 12).toFixed(2)) : null;

      // Col M: Increment Amount (PA) = Gross PA * (baseIncrementPct / 100)
      const incrementAmountPA = grossPA !== null ? Number(((grossPA * baseIncrementPct) / 100).toFixed(2)) : null;
      const incrementAmountPM = grossPM !== null ? Number(((grossPM * baseIncrementPct) / 100).toFixed(2)) : null;

      // Col N: Promotion %
      const promotionPct = isPromoted
        ? (typeof promotionsMap[normId] === "number" ? Number(promotionsMap[normId]) : (Number(criteriaConfig.promotionPct) || 5))
        : 0;

      // Col O: Promotion Amount = Gross PA * (promotionPct / 100)
      const promotionAmount = grossPA !== null ? Number(((grossPA * promotionPct) / 100).toFixed(2)) : null;
      const promotionAmountPM = grossPM !== null ? Number(((grossPM * promotionPct) / 100).toFixed(2)) : null;

      // Col R: Salary Adjustment (PM)
      const salaryAdjustmentPM = Number(salaryAdjustmentsMap[normId] ?? salaryAdjustmentsMap[facultyId] ?? 0);

      // Col S: Salary Adjustment (PA) = Salary Adjustment (PM) * 12
      const salaryAdjustmentPA = Number((salaryAdjustmentPM * 12).toFixed(2));

      // Col P: Revised Gross (PA) = Gross PA + Increment Amount (PA) + Promotion Amount + Salary Adjustment (PA)
      const revisedGrossPA = grossPA !== null
        ? Number((grossPA + (incrementAmountPA || 0) + (promotionAmount || 0) + (salaryAdjustmentPA || 0)).toFixed(2))
        : null;

      // Col Q: % Increase = ((revisedGrossPA - grossPA) / grossPA) * 100 (if grossPA exists)
      const pctIncrease = grossPA && grossPA > 0 && revisedGrossPA
        ? Number((((revisedGrossPA - grossPA) / grossPA) * 100).toFixed(2))
        : Number((baseIncrementPct + promotionPct).toFixed(2));

      // Col T: Revised Gross (PM) = Revised Gross PA / 12
      const revisedGrossPM = grossPM !== null && revisedGrossPA !== null
        ? Number((revisedGrossPA / 12).toFixed(2))
        : null;

      // Col U: INCREMENT AMOUNT (PM) = Revised Gross (PM) - Gross PM
      const totalIncrementAmount = grossPM !== null && revisedGrossPM !== null
        ? Number((revisedGrossPM - grossPM).toFixed(2))
        : null;
      // Col U (PA): INCREMENT AMOUNT (PA) = Revised Gross (PA) - Gross PA (reflects base, promo, and salary adjustment)
      const totalIncrementAmountPA = grossPA !== null && revisedGrossPA !== null
        ? Number((revisedGrossPA - grossPA).toFixed(2))
        : (totalIncrementAmount !== null ? Number((totalIncrementAmount * 12).toFixed(2)) : null);

      return {
        id: `${app.collectionType || "app"}_${app.id || appIdx}`,
        appDocId: app.id,
        rawApp: app,
        facultyId,
        facultyName,
        email: app.facultyEmail || matchedUser.email || "",
        designation,
        department,
        institution,
        dateOfJoining,
        grossPM, // Gross Per Month
        grossPA, // Gross Per Annum
        salaryHistory, // Multi-year salary history dictionary
        academicYear: app.academicYear || "2024-2025",
        status: app.status || "Submitted",
        collectionType: app.collectionType,
        appraisalMark,
        weightedAppraisal: Number(weightedAppraisal.toFixed(2)),
        attitudeTotalScore,
        attitudeMaxScore,
        attitudeMarkNormalized: Number(attitudeMarkNormalized.toFixed(2)),
        weightedAttitude: Number(weightedAttitude.toFixed(2)),
        grossMark,
        // Criteria Matrix Fields
        tierCode: tier.code,
        tierLabel: tier.label,
        tierDescription: tier.description,
        tierBadgeColor: tier.badgeColor,
        tierAccentBg: tier.accentBg,
        baseIncrementPct,
        promotionBonusPct: promotionPct,
        totalIncrementPct: pctIncrease,
        isPromoted,
        // Institutional Spreadsheet Matrix Columns M - U
        incrementAmountPA,      // Col M: Increment Amount (PA)
        incrementAmountPM,
        promotionPct,           // Col N: Promotion %
        promotionAmount,        // Col O: Promotion Amount
        promotionAmountPM,
        revisedGrossPA,         // Col P: Revised Gross (PA)
        pctIncrease,            // Col Q: % Increase
        salaryAdjustmentPM,     // Col R: Salary Adjustment (PM)
        salaryAdjustmentPA,     // Col S: Salary Adjustment (PA)
        revisedGrossPM,         // Col T: Revised Gross (PM)
        incrementAmount: totalIncrementAmount, // Backward-compat
        totalIncrementAmount,   // Col U: INCREMENT AMOUNT
        totalIncrementAmountPA,
        isPrincipalApproved: isPrincipal
          ? (app.status === "Approved" || Boolean(app.managementReview) || Boolean(app.principalReview))
          : (app.status === "Approved" || Boolean(app.principalReview))
      };
    });
  }, [facultyAppraisals, teacherAppraisals, nonTeachingAppraisals, hodAppraisals, principalAppraisals, usersMap, salariesMap, criteriaConfig, promotionsMap, salaryAdjustmentsMap]);

  const isSuperAdmin = (currentUser?.email === "obe@ckcet.edu.in" || userRole === "Admin" || userRole === "Super Admin") && (!userInstitution || userInstitution === "ALL");
  const isDeptRole = (userRole || "").toLowerCase().includes("hod") || (userRole || "").toLowerCase().includes("coordinator");

  // Strict Institution and Department Data Segregation:
  // Restricts Principal/HR to only view records belonging to their assigned institution (e.g., CKSPK, CKSPE, CKCOE)
  const scopedRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      // 1. Strict Institution Segregation:
      if (isSuperAdmin) {
        if (selectedInstFilter !== "All" && !isSameInstitution(selectedInstFilter, rec.institution)) {
          return false;
        }
      } else {
        // Strictly block cross-institution access (e.g. CKSPK vs CKSPE vs CKCOE)
        if (!userInstitution) return false;
        if (!isSameInstitution(userInstitution, rec.institution)) {
          return false;
        }
      }

      // 2. Department-level Segregation:
      // If user has a department-specific role (HOD / Coordinator) or department-restricted access
      if (isDeptRole && userDepartment) {
        const normUserDept = (userDepartment || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const normRecDept = (rec.department || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normUserDept !== "" && normRecDept !== normUserDept) {
          return false;
        }
      }

      return true;
    });
  }, [allRecords, userInstitution, userDepartment, isSuperAdmin, selectedInstFilter, isDeptRole]);

  // Filtered & Sorted Records (Strictly over scopedRecords)
  const filteredRecords = useMemo(() => {
    return scopedRecords.filter((rec) => {
      // Department Filter (from dropdown)
      if (selectedDept !== "All" && rec.department !== selectedDept) {
        return false;
      }

      // Type Filter
      if (selectedType !== "All") {
        if (selectedType === "Faculty" && rec.collectionType !== "faculty" && rec.collectionType !== "teacher") return false;
        if (selectedType === "Non-Teaching" && rec.collectionType !== "non_teaching") return false;
        if (selectedType === "HOD" && rec.collectionType !== "hod") return false;
        if (selectedType === "Principal" && rec.collectionType !== "principal") return false;
      }

      // Academic Year Filter
      if (selectedYear !== "All" && rec.academicYear !== selectedYear) {
        return false;
      }

      // Search Query Match
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = rec.facultyName.toLowerCase().includes(query);
        const matchesId = rec.facultyId.toLowerCase().includes(query);
        const matchesDept = rec.department.toLowerCase().includes(query);
        const matchesDesig = rec.designation.toLowerCase().includes(query);
        const matchesEmail = rec.email.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesDept && !matchesDesig && !matchesEmail) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle null/numeric sorting for monetary and percentage fields
      const numericFields = [
        "grossPM", "grossPA", "appraisalMark", "attitudeMarkNormalized", "grossMark",
        "incrementAmountPA", "promotionPct", "promotionAmount", "revisedGrossPA",
        "pctIncrease", "totalIncrementPct", "salaryAdjustmentPM", "salaryAdjustmentPA",
        "revisedGrossPM", "totalIncrementAmount", "totalIncrementAmountPA", "incrementAmount"
      ];
      if (numericFields.includes(sortField)) {
        valA = valA === null || valA === undefined ? -1 : Number(valA);
        valB = valB === null || valB === undefined ? -1 : Number(valB);
      }

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [scopedRecords, approvalFilter, selectedDept, selectedType, selectedYear, searchTerm, sortField, sortDirection]);

  // Departments & Academic Years list strictly generated from scopedRecords
  const departmentsList = useMemo(() => {
    const set = new Set(scopedRecords.map((r) => r.department).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [scopedRecords]);

  const academicYearsList = useMemo(() => {
    const set = new Set(scopedRecords.map((r) => r.academicYear).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [scopedRecords]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    if (filteredRecords.length === 0) {
      return {
        totalEvaluated: 0,
        nmeFacultyCount: 0,
        eligibleFacultyCount: 0,
        avgGross: "0.00",
        avgAppraisal: "0.00",
        avgAttitude: "0.00",
        topCandidate: null,
        salariesUploadedCount: 0,
        totalGrossPM: 0,
        totalGrossPA: 0,
        totalIncrementPM: 0,
        totalIncrementPA: 0,
        avgIncrementPct: "0.0"
      };
    }

    const total = filteredRecords.length;
    const nmeFacultyCount = filteredRecords.filter((r) => String(r.tierCode || "").toUpperCase() === "NME").length;
    const eligibleFacultyCount = Math.max(0, total - nmeFacultyCount);

    const sumGross = filteredRecords.reduce((acc, r) => acc + r.grossMark, 0);
    const sumAppraisal = filteredRecords.reduce((acc, r) => acc + r.appraisalMark, 0);
    const sumAttitude = filteredRecords.reduce((acc, r) => acc + r.attitudeMarkNormalized, 0);
    const sumIncrementPct = filteredRecords.reduce((acc, r) => acc + r.pctIncrease, 0);

    const salariesUploadedCount = filteredRecords.filter((r) => r.grossPM !== null && r.grossPM > 0).length;
    const totalGrossPM = filteredRecords.reduce((acc, r) => acc + (r.grossPM || 0), 0);
    const totalGrossPA = totalGrossPM * 12;
    const totalIncrementPM = filteredRecords.reduce((acc, r) => acc + (r.totalIncrementAmount || 0), 0);
    const totalIncrementPA = totalIncrementPM * 12;

    const sortedByGross = [...filteredRecords].sort((a, b) => b.grossMark - a.grossMark);
    const topCandidate = sortedByGross[0];

    return {
      totalEvaluated: total,
      nmeFacultyCount,
      eligibleFacultyCount,
      avgGross: (sumGross / total).toFixed(2),
      avgAppraisal: (sumAppraisal / total).toFixed(2),
      avgAttitude: (sumAttitude / total).toFixed(2),
      avgIncrementPct: (sumIncrementPct / total).toFixed(1),
      topCandidate,
      salariesUploadedCount,
      totalGrossPM,
      totalGrossPA,
      totalIncrementPM,
      totalIncrementPA
    };
  }, [filteredRecords]);

  // Table Footer Totals & Percentage Increase
  const tableTotals = useMemo(() => {
    let grossPMTotal = 0;
    let grossPATotal = 0;
    let revisedGrossPMTotal = 0;
    let revisedGrossPATotal = 0;
    let promotionAmountTotal = 0;
    let salaryAdjustmentPMTotal = 0;
    let salaryAdjustmentPATotal = 0;
    let totalIncrementPMTotal = 0;
    let totalIncrementPATotal = 0;

    filteredRecords.forEach((r) => {
      if (r.grossPM !== null && r.grossPM !== undefined) {
        grossPMTotal += Number(r.grossPM) || 0;
      }
      if (r.grossPA !== null && r.grossPA !== undefined) {
        grossPATotal += Number(r.grossPA) || 0;
      }
      if (r.revisedGrossPM !== null && r.revisedGrossPM !== undefined) {
        revisedGrossPMTotal += Number(r.revisedGrossPM) || 0;
      }
      if (r.revisedGrossPA !== null && r.revisedGrossPA !== undefined) {
        revisedGrossPATotal += Number(r.revisedGrossPA) || 0;
      }
      if (r.promotionAmount !== null && r.promotionAmount !== undefined) {
        promotionAmountTotal += Number(r.promotionAmount) || 0;
      }
      salaryAdjustmentPMTotal += Number(r.salaryAdjustmentPM) || 0;
      salaryAdjustmentPATotal += Number(r.salaryAdjustmentPA) || 0;
      if (r.totalIncrementAmount !== null && r.totalIncrementAmount !== undefined) {
        totalIncrementPMTotal += Number(r.totalIncrementAmount) || 0;
      }
      if (r.totalIncrementAmountPA !== null && r.totalIncrementAmountPA !== undefined) {
        totalIncrementPATotal += Number(r.totalIncrementAmountPA) || 0;
      }
    });

    // Formula: ((revised pa total - Gross Pa total) / Gross Pa total) * 100
    const totalPctIncrease = grossPATotal > 0
      ? (((revisedGrossPATotal - grossPATotal) / grossPATotal) * 100).toFixed(2)
      : "0.00";

    return {
      grossPMTotal,
      grossPATotal,
      revisedGrossPMTotal,
      revisedGrossPATotal,
      promotionAmountTotal,
      salaryAdjustmentPMTotal,
      salaryAdjustmentPATotal,
      totalIncrementPMTotal,
      totalIncrementPATotal,
      totalPctIncrease
    };
  }, [filteredRecords]);

  // Institutional Revenue Calculation (per Institution)
  const currentInstRevenue = useMemo(() => {
    const myCode = normalizeInstitution(userInstitution).toLowerCase() || "";
    const code = (
      !isSuperAdmin && myCode
        ? myCode
        : (activeInstCode && activeInstCode !== "all" ? activeInstCode : "ckcet")
    ).toLowerCase();

    const instData = revenueAnalyticsMap[code] || {};
    const defaultData = DEFAULT_INSTITUTION_REVENUE[code] || DEFAULT_REVENUE_CONFIG;
    const d25 = defaultData?.y2025_26 || DEFAULT_REVENUE_CONFIG.y2025_26;
    const d26 = defaultData?.y2026_27 || DEFAULT_REVENUE_CONFIG.y2026_27;

    return {
      code,
      y2025_26: {
        totalFaculty: instData.y2025_26?.totalFaculty !== undefined
          ? instData.y2025_26.totalFaculty
          : (d25.totalFaculty || metrics.totalEvaluated || 0),
        totalRevenue: instData.y2025_26?.totalRevenue !== undefined
          ? instData.y2025_26.totalRevenue
          : d25.totalRevenue,
        annualHrCost: instData.y2025_26?.annualHrCost !== undefined
          ? instData.y2025_26.annualHrCost
          : d25.annualHrCost
      },
      y2026_27: {
        totalFaculty: instData.y2026_27?.totalFaculty !== undefined
          ? instData.y2026_27.totalFaculty
          : (d26.totalFaculty || metrics.totalEvaluated || 0),
        totalRevenue: instData.y2026_27?.totalRevenue !== undefined
          ? instData.y2026_27.totalRevenue
          : d26.totalRevenue,
        annualHrCost: instData.y2026_27?.annualHrCost !== undefined
          ? instData.y2026_27.annualHrCost
          : d26.annualHrCost
      }
    };
  }, [revenueAnalyticsMap, activeInstCode, userInstitution, isSuperAdmin, metrics.totalEvaluated]);

  const hrCostPct2025_26 = currentInstRevenue.y2025_26.totalRevenue > 0
    ? ((currentInstRevenue.y2025_26.annualHrCost / currentInstRevenue.y2025_26.totalRevenue) * 100).toFixed(2)
    : "0.00";

  const hrCostPct2026_27 = currentInstRevenue.y2026_27.totalRevenue > 0
    ? ((currentInstRevenue.y2026_27.annualHrCost / currentInstRevenue.y2026_27.totalRevenue) * 100).toFixed(2)
    : "0.00";

  // Modal open / switch / save handlers for Institutional Revenue
  const handleOpenRevenueModal = (targetYear = "all") => {
    const myCode = normalizeInstitution(userInstitution).toLowerCase() || "";
    const code = (
      !isSuperAdmin && myCode
        ? myCode
        : (activeInstCode && activeInstCode !== "all" ? activeInstCode : (revenueTargetInst || "ckcet"))
    ).toLowerCase();

    setRevenueTargetInst(code);
    setRevenueModalTargetYear(targetYear);
    const existing = revenueAnalyticsMap[code] || {};
    const defaultData = DEFAULT_INSTITUTION_REVENUE[code] || DEFAULT_REVENUE_CONFIG;
    const d25 = defaultData?.y2025_26 || DEFAULT_REVENUE_CONFIG.y2025_26;
    const d26 = defaultData?.y2026_27 || DEFAULT_REVENUE_CONFIG.y2026_27;

    setRevenueForm({
      y2025_26: {
        totalFaculty: existing.y2025_26?.totalFaculty ?? (d25.totalFaculty || metrics.totalEvaluated || 0),
        totalRevenue: existing.y2025_26?.totalRevenue ?? d25.totalRevenue,
        annualHrCost: existing.y2025_26?.annualHrCost ?? d25.annualHrCost
      },
      y2026_27: {
        totalFaculty: existing.y2026_27?.totalFaculty ?? (d26.totalFaculty || metrics.totalEvaluated || 0),
        totalRevenue: existing.y2026_27?.totalRevenue ?? d26.totalRevenue,
        annualHrCost: existing.y2026_27?.annualHrCost ?? d26.annualHrCost
      }
    });
    setRevenueModalOpen(true);
  };

  const handleSwitchRevenueInst = (newCode) => {
    if (!isSuperAdmin) return; // Non-super admins strictly restricted from switching institutions
    setRevenueTargetInst(newCode);
    const existing = revenueAnalyticsMap[newCode] || {};
    const defaultData = DEFAULT_INSTITUTION_REVENUE[newCode] || DEFAULT_REVENUE_CONFIG;
    const d25 = defaultData?.y2025_26 || DEFAULT_REVENUE_CONFIG.y2025_26;
    const d26 = defaultData?.y2026_27 || DEFAULT_REVENUE_CONFIG.y2026_27;
    setRevenueForm({
      y2025_26: {
        totalFaculty: existing.y2025_26?.totalFaculty ?? (d25.totalFaculty || metrics.totalEvaluated || 0),
        totalRevenue: existing.y2025_26?.totalRevenue ?? d25.totalRevenue,
        annualHrCost: existing.y2025_26?.annualHrCost ?? d25.annualHrCost
      },
      y2026_27: {
        totalFaculty: existing.y2026_27?.totalFaculty ?? (d26.totalFaculty || metrics.totalEvaluated || 0),
        totalRevenue: existing.y2026_27?.totalRevenue ?? d26.totalRevenue,
        annualHrCost: existing.y2026_27?.annualHrCost ?? d26.annualHrCost
      }
    });
  };

  const handleSaveRevenueConfig = async () => {
    const myCode = normalizeInstitution(userInstitution).toLowerCase() || "";
    const code = (!isSuperAdmin && myCode ? myCode : (revenueTargetInst || activeInstCode || "ckcet")).toLowerCase();
    setSavingRevenue(true);
    try {
      const updatedMap = {
        ...revenueAnalyticsMap,
        [code]: {
          y2025_26: {
            totalFaculty: Number(revenueForm.y2025_26.totalFaculty) || 0,
            totalRevenue: Number(revenueForm.y2025_26.totalRevenue) || 0,
            annualHrCost: Number(revenueForm.y2025_26.annualHrCost) || 0
          },
          y2026_27: {
            totalFaculty: Number(revenueForm.y2026_27.totalFaculty) || 0,
            totalRevenue: Number(revenueForm.y2026_27.totalRevenue) || 0,
            annualHrCost: Number(revenueForm.y2026_27.annualHrCost) || 0
          }
        }
      };
      await setDoc(doc(db, "appraisal_config", "institution_revenue_analytics"), updatedMap, { merge: true });
      setRevenueAnalyticsMap(updatedMap);
      setToast({ show: true, message: `Saved Revenue & HR Cost values for ${code.toUpperCase()}!`, type: "success" });
      setRevenueModalOpen(false);
    } catch (err) {
      console.error("Error saving revenue analytics:", err);
      setToast({ show: true, message: "Failed to save revenue analytics values.", type: "error" });
    } finally {
      setSavingRevenue(false);
    }
  };

  // Salary revision (sum of 5000 entries from Salary Adjustment column) and increment calculations for Card 4
  const salaryRevisionCalculation = useMemo(() => {
    let count5000 = 0;
    let sum5000 = 0;
    let totalAdjPM = 0;

    filteredRecords.forEach((r) => {
      const adj = Number(r.salaryAdjustmentPM) || 0;
      totalAdjPM += adj;
      if (adj === 5000) {
        count5000 += 1;
        sum5000 += adj;
      }
    });

    // Sum of 5000 adjustments; fallback to total adjustments PM if adjustments exist
    const salaryRevisionPM = count5000 > 0 ? sum5000 : totalAdjPM;
    const count = count5000 > 0 ? count5000 : filteredRecords.filter((r) => (Number(r.salaryAdjustmentPM) || 0) > 0).length;

    const totalGrossPM = Number(tableTotals.grossPMTotal) || 0;
    const totalRevisedPM = Number(tableTotals.revisedGrossPMTotal) || 0;
    const totalDifferencePM = Math.max(0, Number((totalRevisedPM - totalGrossPM).toFixed(2)));

    // Increment amount (PM) is the portion of total increase attributed to base increment & promotion
    const incrementAmountPM = Math.max(0, Number((totalDifferencePM - salaryRevisionPM).toFixed(2)));

    const overallPctIncrease = totalGrossPM > 0
      ? (((totalRevisedPM - totalGrossPM) / totalGrossPM) * 100).toFixed(2)
      : "0.00";
    const salaryRevisionPct = totalGrossPM > 0
      ? ((salaryRevisionPM / totalGrossPM) * 100).toFixed(2)
      : "0.00";
    const incrementPct = totalGrossPM > 0
      ? ((incrementAmountPM / totalGrossPM) * 100).toFixed(2)
      : "0.00";

    return {
      count5000,
      salaryRevisionPM,
      facultyCount: count,
      totalGrossPM,
      totalRevisedPM,
      totalDifferencePM,
      incrementAmountPM,
      overallPctIncrease,
      salaryRevisionPct,
      incrementPct
    };
  }, [filteredRecords, tableTotals.grossPMTotal, tableTotals.revisedGrossPMTotal]);

  // Comprehensive Institutional Increment Analytics & Visual Graphs dataset
  const overallIncrementAnalytics = useMemo(() => {
    // 1. Department Outflow & Increment Dynamics
    const deptMap = {};
    filteredRecords.forEach((r) => {
      const dept = r.department || "General";
      if (!deptMap[dept]) {
        deptMap[dept] = {
          department: dept,
          headcount: 0,
          grossPM: 0,
          grossPA: 0,
          revisedGrossPM: 0,
          revisedGrossPA: 0,
          incrementPM: 0,
          incrementPA: 0,
          promotionCount: 0,
          promotionAmount: 0,
          salaryAdjustmentPA: 0,
          salaryAdjustmentPM: 0,
        };
      }
      const d = deptMap[dept];
      d.headcount += 1;
      d.grossPM += Number(r.grossPM) || 0;
      d.grossPA += Number(r.grossPA) || 0;
      d.revisedGrossPM += Number(r.revisedGrossPM) || 0;
      d.revisedGrossPA += Number(r.revisedGrossPA) || 0;
      d.incrementPM += Number(r.totalIncrementAmount) || 0;
      d.incrementPA += Number(r.totalIncrementAmountPA) || 0;
      if (r.isPromoted) {
        d.promotionCount += 1;
        d.promotionAmount += Number(r.promotionAmount) || 0;
      }
      d.salaryAdjustmentPM += Number(r.salaryAdjustmentPM) || 0;
      d.salaryAdjustmentPA += Number(r.salaryAdjustmentPA) || 0;
    });

    const formatDeptShortName = (name = "") => {
      const n = String(name).trim();
      if (!n) return "Dept";
      if (/computer science|cse/i.test(n)) return "CSE";
      if (/information technology|\bit\b/i.test(n)) return "IT";
      if (/artificial intelligence|ai & ds|aids|data science/i.test(n)) return "AI & DS";
      if (/electronics and comm|ece/i.test(n)) return "ECE";
      if (/electrical and electr|eee/i.test(n)) return "EEE";
      if (/mechanical|mech/i.test(n)) return "Mech";
      if (/civil/i.test(n)) return "Civil";
      if (/bio.?medical|bme/i.test(n)) return "BME";
      if (/robotics/i.test(n)) return "Robotics";
      if (/business administration|mba/i.test(n)) return "MBA";
      if (/science and humanities|s&h|humanities/i.test(n)) return "S&H";
      if (/administration|admin/i.test(n)) return "Admin";
      if (n.length > 10) return n.slice(0, 9) + "…";
      return n;
    };

    const departmentData = Object.values(deptMap).map((d) => {
      const growthPct = d.grossPA > 0
        ? Number((((d.revisedGrossPA - d.grossPA) / d.grossPA) * 100).toFixed(2))
        : 0;
      return {
        ...d,
        shortName: formatDeptShortName(d.department),
        growthPct,
        currentPA_Lakhs: Number((d.grossPA / 100000).toFixed(2)),
        revisedPA_Lakhs: Number((d.revisedGrossPA / 100000).toFixed(2)),
        incrementPA_Lakhs: Number((d.incrementPA / 100000).toFixed(2)),
        currentPM_K: Number((d.grossPM / 1000).toFixed(1)),
        revisedPM_K: Number((d.revisedGrossPM / 1000).toFixed(1)),
        incrementPM_K: Number((d.incrementPM / 1000).toFixed(1)),
      };
    }).sort((a, b) => b.incrementPA - a.incrementPA);

    // 2. Performance Tier Breakdown
    const tierMap = {};
    const configuredTiers = criteriaConfig.tiers || [];
    configuredTiers.forEach((tier) => {
      tierMap[tier.code] = {
        tierCode: tier.code,
        tierLabel: tier.label,
        incrementPct: tier.incrementPct,
        minScore: tier.minScore,
        maxScore: tier.maxScore,
        headcount: 0,
        grossPA: 0,
        grossPM: 0,
        revisedGrossPA: 0,
        revisedGrossPM: 0,
        incrementPA: 0,
        incrementPM: 0,
        color: tier.code === "FEE" ? "#10b981" : tier.code === "EE" ? "#3b82f6" : tier.code === "ME" ? "#8b5cf6" : tier.code === "PME" ? "#f59e0b" : "#ef4444"
      };
    });

    filteredRecords.forEach((r) => {
      const code = r.tierCode || "NME";
      if (!tierMap[code]) {
        tierMap[code] = {
          tierCode: code,
          tierLabel: r.tierLabel || code,
          incrementPct: r.baseIncrementPct || 0,
          minScore: 0,
          maxScore: 100,
          headcount: 0,
          grossPA: 0,
          grossPM: 0,
          revisedGrossPA: 0,
          revisedGrossPM: 0,
          incrementPA: 0,
          incrementPM: 0,
          color: "#64748b"
        };
      }
      const t = tierMap[code];
      t.headcount += 1;
      t.grossPA += Number(r.grossPA) || 0;
      t.grossPM += Number(r.grossPM) || 0;
      t.revisedGrossPA += Number(r.revisedGrossPA) || 0;
      t.revisedGrossPM += Number(r.revisedGrossPM) || 0;
      t.incrementPA += Number(r.totalIncrementAmountPA) || 0;
      t.incrementPM += Number(r.totalIncrementAmount) || 0;
    });

    const tierData = Object.values(tierMap).map((t) => {
      const growthPct = t.grossPA > 0
        ? Number((((t.revisedGrossPA - t.grossPA) / t.grossPA) * 100).toFixed(2))
        : 0;
      return {
        ...t,
        growthPct,
        incrementPA_Lakhs: Number((t.incrementPA / 100000).toFixed(2)),
        incrementPM_K: Number((t.incrementPM / 1000).toFixed(1)),
      };
    });

    // 3. Increment Component Outflow (Base Tier Slabs vs Promotion Bump vs Salary Adjustments)
    let totalBaseIncrementPA = 0;
    let totalPromotionPA = 0;
    let totalAdjustmentPA = 0;
    let promotedCount = 0;
    let adjustedCount = 0;

    filteredRecords.forEach((r) => {
      totalBaseIncrementPA += Number(r.incrementAmountPA) || 0;
      totalPromotionPA += Number(r.promotionAmount) || 0;
      totalAdjustmentPA += Number(r.salaryAdjustmentPA) || 0;
      if (r.isPromoted) promotedCount += 1;
      if (Number(r.salaryAdjustmentPM) > 0 || Number(r.salaryAdjustmentPA) > 0) adjustedCount += 1;
    });

    const totalOutflowPA = totalBaseIncrementPA + totalPromotionPA + totalAdjustmentPA;
    const componentData = [
      {
        name: "Base Tier Slabs",
        amountPA: totalBaseIncrementPA,
        amountPM: Math.round(totalBaseIncrementPA / 12),
        pctShare: totalOutflowPA > 0 ? Number(((totalBaseIncrementPA / totalOutflowPA) * 100).toFixed(1)) : 0,
        color: "#3b82f6",
        count: filteredRecords.length,
        desc: "Performance matrix slab increments derived from Gross Marks"
      },
      {
        name: "Promotion Bumps",
        amountPA: totalPromotionPA,
        amountPM: Math.round(totalPromotionPA / 12),
        pctShare: totalOutflowPA > 0 ? Number(((totalPromotionPA / totalOutflowPA) * 100).toFixed(1)) : 0,
        color: "#8b5cf6",
        count: promotedCount,
        desc: `Merit promotion recommendations (+${criteriaConfig.promotionPct || 5}% bump)`
      },
      {
        name: "Salary Adjustments",
        amountPA: totalAdjustmentPA,
        amountPM: Math.round(totalAdjustmentPA / 12),
        pctShare: totalOutflowPA > 0 ? Number(((totalAdjustmentPA / totalOutflowPA) * 100).toFixed(1)) : 0,
        color: "#10b981",
        count: adjustedCount,
        desc: "HR / Principal discretionary salary increment adjustments"
      }
    ];

    // 4. Growth Rate Brackets
    const brackets = [
      { range: "< 4%", min: -Infinity, max: 3.99, count: 0, grossPA: 0, revisedGrossPA: 0, incrementPA: 0, color: "#94a3b8" },
      { range: "4% - 5.9%", min: 4, max: 5.99, count: 0, grossPA: 0, revisedGrossPA: 0, incrementPA: 0, color: "#60a5fa" },
      { range: "6% - 7.9%", min: 6, max: 7.99, count: 0, grossPA: 0, revisedGrossPA: 0, incrementPA: 0, color: "#38bdf8" },
      { range: "8% - 9.9%", min: 8, max: 9.99, count: 0, grossPA: 0, revisedGrossPA: 0, incrementPA: 0, color: "#818cf8" },
      { range: "10% - 14.9%", min: 10, max: 14.99, count: 0, grossPA: 0, revisedGrossPA: 0, incrementPA: 0, color: "#a855f7" },
      { range: "≥ 15%", min: 15, max: Infinity, count: 0, grossPA: 0, revisedGrossPA: 0, incrementPA: 0, color: "#10b981" },
    ];

    filteredRecords.forEach((r) => {
      const pct = Number(r.pctIncrease) || 0;
      const b = brackets.find((br) => pct >= br.min && pct <= br.max);
      if (b) {
        b.count += 1;
        b.grossPA += Number(r.grossPA) || 0;
        b.revisedGrossPA += Number(r.revisedGrossPA) || 0;
        b.incrementPA += Number(r.totalIncrementAmountPA) || 0;
      }
    });

    // 5. Top Incremented Candidates
    const topIncremented = [...filteredRecords]
      .filter((r) => (Number(r.totalIncrementAmountPA) || 0) > 0)
      .sort((a, b) => (Number(b.totalIncrementAmountPA) || 0) - (Number(a.totalIncrementAmountPA) || 0))
      .slice(0, 6);

    return {
      departmentData,
      tierData,
      componentData,
      brackets,
      topIncremented,
      totalBaseIncrementPA,
      totalPromotionPA,
      totalAdjustmentPA,
      totalOutflowPA,
      promotedCount,
      adjustedCount
    };
  }, [filteredRecords, criteriaConfig]);

  // Dynamic Chart & Progression Analytics for selected candidate in analytics modal
  const selectedCandidateAnalyticsData = useMemo(() => {
    if (!selectedAnalyticsCandidate) return null;

    const history = selectedAnalyticsCandidate.salaryHistory || {};
    let historyEntries = Object.entries(history);

    if (historyEntries.length === 0 && selectedAnalyticsCandidate.grossPM) {
      historyEntries = [["Current", Number(selectedAnalyticsCandidate.grossPM)]];
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
    const lastVal = chartData.length > 0 ? chartData[chartData.length - 1].salaryPM : (selectedAnalyticsCandidate.grossPM || 0);
    const totalGrowth = lastVal - firstVal;
    const totalGrowthPct = firstVal > 0 ? ((totalGrowth / firstVal) * 100).toFixed(1) : "0.0";

    const validIncrements = chartData.filter((d, i) => i > 0 && d.growthPctNum > 0);
    const avgGrowthPct = validIncrements.length > 0
      ? (validIncrements.reduce((acc, c) => acc + c.growthPctNum, 0) / validIncrements.length).toFixed(1)
      : "0.0";

    return {
      chartData,
      currentPM: lastVal,
      currentPA: lastVal * 12,
      totalGrowth,
      totalGrowthPct,
      avgGrowthPct,
      hasMultiYear: chartData.length > 1
    };
  }, [selectedAnalyticsCandidate]);

  // Sort handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Toggle candidate promotion recommendation
  const handleTogglePromotion = async (facultyId) => {
    const norm = normalizeId(facultyId);
    const newPromotions = { ...promotionsMap };
    newPromotions[norm] = !newPromotions[norm];

    try {
      await setDoc(doc(db, "appraisal_config", "promotions"), {
        promotions: newPromotions,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setPromotionsMap(newPromotions);
      showToast(newPromotions[norm] ? `Promotion (+${criteriaConfig.promotionPct}%) applied for ${facultyId}` : `Promotion removed for ${facultyId}`, "success");
    } catch (err) {
      console.error("Error saving promotion:", err);
      showToast("Failed to update promotion status.", "error");
    }
  };

  // Handle Salary Adjustment (PM) Input Change
  const handleAdjustmentInputChange = (facultyId, val) => {
    setAdjustmentInputs((prev) => ({ ...prev, [facultyId]: val }));
  };

  // Handle Salary Adjustment (PM) Input Blur / Commit
  const handleAdjustmentInputBlur = async (facultyId, val) => {
    const num = val === "" ? 0 : Number(val) || 0;
    await handleUpdateAdjustment(facultyId, num);
  };

  // Update Salary Adjustment in Firestore
  const handleUpdateAdjustment = async (facultyId, value) => {
    const cleanId = normalizeId(facultyId);
    const numVal = value === "" ? 0 : Number(value) || 0;
    const newMap = { ...salaryAdjustmentsMap, [cleanId]: numVal };
    setSalaryAdjustmentsMap(newMap);

    try {
      await setDoc(doc(db, "appraisal_config", "salary_adjustments"), {
        adjustments: newMap,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast(`Adjustment updated for ID ${facultyId}: ₹${numVal.toLocaleString("en-IN")} PM`, "success");
    } catch (err) {
      console.error("Error saving salary adjustment:", err);
      showToast("Failed to save salary adjustment.", "error");
    }
  };

  // 1. Download Multi-Year Salary Template (Excel .xlsx with "faculty id" and dynamic past years columns, ID prefixed with ')
  const handleDownloadTemplate = () => {
    const seen = new Set();
    const rows = [];

    // Determine multi-year columns (defaults to past 3 years e.g. 2022-23, 2023-24, 2024-25)
    const templateYears = discoveredSalaryYears.length >= 2
      ? discoveredSalaryYears
      : getDefaultSalaryYears(selectedYear !== "All" ? selectedYear : "2024-2025");

    // Header row: "faculty id", "gross PM (2022-23)", "gross PM (2023-24)", "gross PM (2024-25)"
    rows.push(["faculty id", ...templateYears.map((yr) => `gross PM (${yr})`)]);

    // Target faculty list: strictly authorized institution's records only
    const targetList = filteredRecords.length > 0 ? filteredRecords : scopedRecords;

    targetList.forEach((r) => {
      // Clean any existing quotes from facultyId first to prevent double quotes (e.g. 1783 instead of ''1783)
      const cleanId = String(r.facultyId || "").replace(/^['"`]+|['"`]+$/g, "").trim();
      if (cleanId && !seen.has(cleanId)) {
        seen.add(cleanId);
        // Prepend EXACTLY ONE single quote ' so Excel treats ID strictly as text (e.g. '1783)
        const textFormattedId = `'${cleanId}`;
        const row = [textFormattedId];

        templateYears.forEach((yr, idx) => {
          const histVal = r.salaryHistory?.[yr];
          if (histVal !== undefined && histVal !== null && histVal > 0) {
            row.push(histVal);
          } else if (idx === templateYears.length - 1 && r.grossPM) {
            // Fallback for latest year if they previously had single grossPM
            row.push(r.grossPM);
          } else {
            row.push("");
          }
        });

        rows.push(row);
      }
    });

    // Fallback sample rows with single quote '
    if (rows.length === 1) {
      rows.push(["'1783", 45000, 50000, 55000]);
      rows.push(["'1234", 48000, 52000, 58000]);
      rows.push(["'1235", 42000, 46000, 52000]);
    }

    // Build Worksheet & Workbook
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [{ wch: 20 }, ...templateYears.map(() => ({ wch: 22 }))];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Multi_Year_Gross_Template");

    // Write as .xlsx file
    XLSX.writeFile(workbook, `CKCET_Faculty_MultiYear_Gross_PM_Template_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Template Excel (.xlsx) with ${templateYears.length} years downloaded! Fill salaries and upload.`, "success");
  };

  // Export Full Salary Revision Matrix (.xlsx) with Columns M through U
  const handleExportFullMatrix = () => {
    const rows = [];

    // Header Row matching Institutional Nomenclature
    rows.push([
      "Faculty ID",
      "Faculty Name",
      "Designation",
      "Department",
      "Date of Joining",
      "Gross PM",
      "Gross PA",
      "Appraisal (60%)",
      "Attitude (40%)",
      "Gross Score (100)",
      "Performance Tier",
      "Promotion %",
      "Promotion Amount",
      "% Increase",
      "Salary Adjustment (PM)",
      "Salary Adjustment (PA)",
      "Revised Gross (PM)",
      "Revised Gross (PA)",
      "Increment Amount (PM)",
      "Increment Amount (PA)"
    ]);

    const targetList = filteredRecords.length > 0 ? filteredRecords : allRecords;

    targetList.forEach((r) => {
      const cleanId = String(r.facultyId || "").replace(/^['"`]+|['"`]+$/g, "").trim();
      rows.push([
        `'${cleanId}`,
        r.facultyName || "",
        r.designation || "",
        r.department || "",
        r.dateOfJoining || "",
        r.grossPM !== null ? r.grossPM : "",
        r.grossPA !== null ? r.grossPA : "",
        r.appraisalMark,
        r.attitudeMarkNormalized,
        r.grossMark,
        `${r.tierCode} (${r.baseIncrementPct}%)`,
        r.promotionPct ? `${r.promotionPct}%` : "0%",
        r.promotionAmount !== null ? r.promotionAmount : "",
        `${r.pctIncrease}%`,
        r.salaryAdjustmentPM || 0,
        r.salaryAdjustmentPA || 0,
        r.revisedGrossPM !== null ? r.revisedGrossPM : "",
        r.revisedGrossPA !== null ? r.revisedGrossPA : "",
        r.totalIncrementAmount !== null ? r.totalIncrementAmount : "",
        r.totalIncrementAmountPA !== null ? r.totalIncrementAmountPA : ""
      ]);
    });

    // Total Summary Row
    const expGrossPMTotal = targetList.reduce((acc, r) => acc + (Number(r.grossPM) || 0), 0);
    const expGrossPATotal = targetList.reduce((acc, r) => acc + (Number(r.grossPA) || 0), 0);
    const expPromoTotal = targetList.reduce((acc, r) => acc + (Number(r.promotionAmount) || 0), 0);
    const expAdjPMTotal = targetList.reduce((acc, r) => acc + (Number(r.salaryAdjustmentPM) || 0), 0);
    const expAdjPATotal = targetList.reduce((acc, r) => acc + (Number(r.salaryAdjustmentPA) || 0), 0);
    const expRevPMTotal = targetList.reduce((acc, r) => acc + (Number(r.revisedGrossPM) || 0), 0);
    const expRevPATotal = targetList.reduce((acc, r) => acc + (Number(r.revisedGrossPA) || 0), 0);
    const expIncPMTotal = targetList.reduce((acc, r) => acc + (Number(r.totalIncrementAmount) || 0), 0);
    const expIncPATotal = targetList.reduce((acc, r) => acc + (Number(r.totalIncrementAmountPA) || 0), 0);
    const expTotalPct = expGrossPATotal > 0 ? (((expRevPATotal - expGrossPATotal) / expGrossPATotal) * 100).toFixed(2) : "0.00";

    rows.push([
      "TOTAL",
      `Total Staff: ${targetList.length}`,
      "",
      "",
      "",
      expGrossPMTotal,
      expGrossPATotal,
      "",
      "",
      "",
      "",
      "",
      expPromoTotal,
      `${expTotalPct}%`,
      expAdjPMTotal,
      expAdjPATotal,
      expRevPMTotal,
      expRevPATotal,
      expIncPMTotal,
      expIncPATotal
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 15 }, { wch: 25 }, { wch: 22 }, { wch: 25 }, { wch: 15 },
      { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
      { wch: 18 }, { wch: 22 }, { wch: 15 }, { wch: 20 }, { wch: 22 },
      { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 22 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Salary_Revision_Matrix");

    XLSX.writeFile(workbook, `CKCET_Salary_Revision_Matrix_M_to_U_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Full Salary Revision Matrix (.xlsx) exported successfully!", "success");
  };

  // 2. Handle Excel / CSV File Selection & Parse
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        if (!buffer) return;

        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (!sheetRows || sheetRows.length < 2) {
          showToast("Excel file is empty or missing data rows.", "error");
          return;
        }

        // Parse Header Row
        const rawHeaders = sheetRows[0].map((h) => String(h || "").trim());
        const cleanedHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/^['"`]|['"`]$/g, ""));

        // 1. Locate Faculty ID column
        const idIdx = cleanedHeaders.findIndex((h) =>
          h.includes("faculty") || h.includes("id") || h.includes("emp") || h.includes("staff")
        );

        if (idIdx === -1) {
          showToast("Excel header must include a 'faculty id' column.", "error");
          return;
        }

        // 2. Discover all Multi-Year / Gross PM Salary Columns dynamically
        const yearColumns = [];
        cleanedHeaders.forEach((header, idx) => {
          if (idx === idIdx) return;
          // Match academic year patterns like 2022-23, 2022-2023, 2024
          const yearMatch = rawHeaders[idx].match(/(20\d{2}\s*[-/]\s*\d{2,4}|20\d{2})/i);
          if (yearMatch) {
            const cleanYear = yearMatch[1].replace(/\s+/g, "");
            yearColumns.push({ colIdx: idx, yearLabel: cleanYear, rawHeader: rawHeaders[idx] });
          } else if (header.includes("gross") || header.includes("pm") || header.includes("salary") || header.includes("amount")) {
            yearColumns.push({ colIdx: idx, yearLabel: "Current", rawHeader: rawHeaders[idx] });
          }
        });

        if (yearColumns.length === 0) {
          showToast("Headers must include 'gross PM (YYYY-YY)' or 'gross PM' salary columns.", "error");
          return;
        }

        // Sort detected columns chronologically
        yearColumns.sort((a, b) => a.yearLabel.localeCompare(b.yearLabel));
        const detectedYearLabels = yearColumns.map((yc) => yc.yearLabel);
        setUploadDetectedYears(detectedYearLabels);

        // 3. Map parsed rows
        const parsed = [];
        for (let i = 1; i < sheetRows.length; i++) {
          const row = sheetRows[i];
          const rawId = String(row[idIdx] !== undefined ? row[idIdx] : "").trim();

          if (rawId) {
            const cleanedId = String(rawId).replace(/^['"`]+|['"`]+$/g, "").trim();
            const norm = normalizeId(cleanedId);

            const history = {};
            let latestSalary = 0;

            yearColumns.forEach((yc) => {
              const cellVal = String(row[yc.colIdx] !== undefined ? row[yc.colIdx] : "").trim();
              const cleanNumStr = cellVal.replace(/[^0-9.]/g, "");
              const parsedVal = cleanNumStr ? parseFloat(cleanNumStr) : 0;
              if (parsedVal > 0) {
                history[yc.yearLabel] = parsedVal;
                latestSalary = parsedVal;
              }
            });

            // Match against current scoped records (strict institution segregation)
            const matched = scopedRecords.find((r) => {
              const rNorm = normalizeId(r.facultyId);
              const rEmpId = normalizeId(r.empId);
              return rNorm === norm || r.facultyId === cleanedId || r.facultyId === rawId || rEmpId === norm;
            });

            parsed.push({
              rawId,
              cleanedId,
              normalizedId: norm,
              facultyName: matched ? matched.facultyName : "Unknown / Unmatched",
              department: matched ? matched.department : "-",
              institution: matched?.institution || userInstitution || (selectedInstFilter !== "All" ? selectedInstFilter : ""),
              history,
              grossPM: latestSalary,
              isMatched: Boolean(matched)
            });
          }
        }

        if (parsed.length === 0) {
          showToast("No valid rows found in file.", "error");
          return;
        }

        setParsedPreviewList(parsed);
        setUploadModalOpen(true);
      } catch (err) {
        console.error("Error reading file:", err);
        showToast("Failed to parse Excel file format.", "error");
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // 3. Confirm and Save Multi-Year Salaries to Dedicated Institution Firestore Nodes
  const handleConfirmSaveSalaries = async () => {
    if (parsedPreviewList.length === 0) return;
    setUploadSaving(true);

    try {
      // Group salaries by normalized institution code ('ckcoe', 'ckspk', 'ckspe', 'ckcet')
      const salariesByInst = {};
      const globalUpdatedSalaries = { ...(instSalaries.legacy || {}) };

      parsedPreviewList.forEach((item) => {
        const itemInst = item.institution || userInstitution || (selectedInstFilter !== "All" ? selectedInstFilter : "");
        const instCode = normalizeInstitution(itemInst).toLowerCase() || "ckspk";
        if (!salariesByInst[instCode]) {
          salariesByInst[instCode] = { ...(instSalaries[instCode] || {}) };
        }

        const payload = {
          current: item.grossPM,
          history: item.history || {},
          updatedAt: new Date().toISOString()
        };

        if (item.normalizedId) {
          salariesByInst[instCode][item.normalizedId] = payload;
          globalUpdatedSalaries[item.normalizedId] = payload;
        }
        if (item.cleanedId) {
          salariesByInst[instCode][item.cleanedId] = payload;
          globalUpdatedSalaries[item.cleanedId] = payload;
        }
      });

      // Save into dedicated institution document nodes:
      // - appraisal_config/gross_salaries_ckcoe
      // - appraisal_config/gross_salaries_ckspk
      // - appraisal_config/gross_salaries_ckspe
      // - appraisal_config/gross_salaries_ckcet
      const savePromises = Object.entries(salariesByInst).map(async ([code, instSalariesData]) => {
        const docId = `gross_salaries_${code}`;
        return setDoc(doc(db, "appraisal_config", docId), {
          institution: code.toUpperCase(),
          salaries: instSalariesData,
          historicalYears: uploadDetectedYears.length > 0 ? uploadDetectedYears : ["Current"],
          updatedAt: new Date().toISOString(),
          totalUpdated: Object.keys(instSalariesData).length
        }, { merge: true });
      });

      // Also maintain global doc for backward compatibility
      savePromises.push(
        setDoc(doc(db, "appraisal_config", "gross_salaries"), {
          salaries: globalUpdatedSalaries,
          historicalYears: uploadDetectedYears.length > 0 ? uploadDetectedYears : ["Current"],
          updatedAt: new Date().toISOString(),
          totalUpdated: parsedPreviewList.length
        }, { merge: true })
      );

      await Promise.all(savePromises);

      const targetNodes = Object.keys(salariesByInst).map((c) => `gross_salaries_${c}`).join(", ");
      setUploadModalOpen(false);
      setParsedPreviewList([]);
      showToast(`Successfully saved salaries to institution node(s): ${targetNodes}!`, "success");
    } catch (err) {
      console.error("Error saving salaries:", err);
      showToast("Failed to save salaries to database.", "error");
    } finally {
      setUploadSaving(false);
    }
  };

  // 4. Delete / Reset Salaries for Active Institution Node
  const handleDeleteSchoolSalaries = async () => {
    const code = activeInstCode;
    if (!code || code === "all") {
      showToast("Please select a specific school / institution to reset salaries.", "error");
      return;
    }
    setDeletingSalaries(true);
    try {
      await deleteDoc(doc(db, "appraisal_config", `gross_salaries_${code}`));
      showToast(`Successfully deleted salary node for ${code.toUpperCase()} (gross_salaries_${code})!`, "success");
      setDeleteModalOpen(false);
    } catch (e) {
      console.error("Error deleting salaries node:", e);
      showToast("Failed to delete salary node.", "error");
    } finally {
      setDeletingSalaries(false);
    }
  };

  // 4. Save Modified Criteria Configuration to Firestore
  const handleSaveCriteriaConfig = async () => {
    setCriteriaSaving(true);
    try {
      const normalizedPayload = {
        ...editingCriteria,
        tiers: computeDynamicTiers(editingCriteria.tiers),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "appraisal_config", "increment_criteria"), normalizedPayload, { merge: true });

      setCriteriaConfig(normalizedPayload);
      setCriteriaModalOpen(false);
      showToast("Increment criteria & slab configuration updated successfully!", "success");
    } catch (err) {
      console.error("Error saving criteria config:", err);
      showToast("Failed to save criteria configuration.", "error");
    } finally {
      setCriteriaSaving(false);
    }
  };

  // Open Criteria Modal
  const handleOpenCriteriaModal = () => {
    const normalized = {
      ...criteriaConfig,
      tiers: computeDynamicTiers(criteriaConfig.tiers)
    };
    setEditingCriteria(JSON.parse(JSON.stringify(normalized)));
    setCriteriaModalOpen(true);
  };

  // 1. Loading permission check
  if (authChecking) {
    return (
      <HRLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Verifying Principal / HR permissions...</p>
        </div>
      </HRLayout>
    );
  }

  // 2. Access Denied if not Principal / HR / Admin
  if (!isAuthorized) {
    return (
      <HRLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shadow-sm">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900">Access Restricted</h2>
          <p className="text-sm text-slate-600 max-w-md">
            The Gross Analytics & Increment Matrix is exclusively restricted to authorized <strong>Principal and HR</strong> accounts.
          </p>
          <a
            href="/"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            Return to Dashboard
          </a>
        </div>
      </HRLayout>
    );
  }

  return (
    <HRLayout>
      <div className="w-full space-y-6 pb-12 px-4 sm:px-6 lg:px-8">

        {/* Floating Toast Notification */}
        {toast.show && (
          <div className="fixed top-6 right-6 z-50 animate-slideIn">
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border ${toast.type === "error"
              ? "bg-rose-50 text-rose-800 border-rose-300"
              : "bg-emerald-50 text-emerald-900 border-emerald-300"
              }`}>
              {toast.type === "error" ? <AlertCircle size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        {/* Hero Header Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#101b38] via-[#162752] to-[#1c356e] p-6 sm:p-8 text-white shadow-xl">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-bold text-amber-300 uppercase tracking-widest mb-3">
                <Sparkles size={13} className="text-amber-300" /> HR Appraisal Performance Intelligence
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                <BarChart3 className="text-blue-400 stroke-[2.5]" size={30} />
                Gross Analytics & Increment Engine
              </h1>
              <p className="text-blue-100/90 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
                Consolidated performance metrics for Principal-approved appraisals calculating monthly gross salary
                increment amounts based on the institutional appraisal score matrix.
              </p>
            </div>

            {/* Formula Badge Callout */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-inner">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center shrink-0">
                <Calculator className="text-amber-300" size={20} />
              </div>
              <div>
                <div className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Evaluation Formula</div>
                <div className="text-sm font-extrabold text-white tracking-wide font-mono">
                  Gross Mark = <span className="text-sky-300">(0.6 × Appraisal)</span> + <span className="text-emerald-300">(0.4 × Attitude)</span>
                </div>
                <div className="text-[10px] text-slate-200 mt-0.5">
                  Increment % derived from Gross Mark slab • Increment ₹ = Gross PM × Increment %
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Master Card: Revenue vs. Salary Expenditure – Financial Impact Analysis */}
        <div className="bg-white border border-zinc-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Financial Impact Modeling</div>
              <h3 className="text-sm sm:text-base font-black text-[#101b38] flex items-center gap-2">
                <Building2 size={18} className="text-indigo-600" />
                Revenue Vs. Salary Expenditure – Financial Impact Analysis
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[11px] font-bold text-zinc-400 bg-zinc-50 border border-zinc-200/80 px-3 py-1 rounded-full">
                {getSchoolShortName(userInstitution) || activeInstCode.toUpperCase()} Outflow Overview
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Total Revenue (2025-26) with edit trigger */}
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group">
              <div>
                <div className="flex items-start justify-between text-zinc-500 mb-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 block">total revenue (2025-26)</span>
                    <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1 mt-1">
                      total faculty : <strong className="text-zinc-800 font-mono">{currentInstRevenue.y2025_26.totalFaculty}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenRevenueModal("y2025_26")}
                      className="w-7 h-7 rounded-lg bg-zinc-50 hover:bg-indigo-50 border border-zinc-200/80 text-zinc-500 hover:text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                      title="Edit 2025-26 Revenue & Budget"
                    >
                      <Pencil size={12} />
                    </button>
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <IndianRupee size={18} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">total revenue</span>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(currentInstRevenue.y2025_26.totalRevenue).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Annual HR cost</span>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(currentInstRevenue.y2025_26.annualHrCost).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-medium text-zinc-500 mt-2.5 pt-2 border-t border-zinc-50 flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">HR Cost (% of Total Revenue):</span>
                <strong className="text-sm font-black text-slate-700 font-mono">{hrCostPct2025_26}% </strong>
              </div>
            </div>

            {/* Card 2: Total Revenue (2026-27) with edit trigger & Eligible Faculty */}
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group">
              <div>
                <div className="flex items-start justify-between text-zinc-500 mb-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 block">total revenue (2026-27)</span>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        total faculty : <strong className="text-zinc-800 font-mono">{currentInstRevenue.y2026_27.totalFaculty}</strong>
                      </span>
                      {/* <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        eligible faculty : <strong className="text-emerald-700 font-mono">{metrics.eligibleFacultyCount}</strong>
                      </span> */}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenRevenueModal("y2026_27")}
                      className="w-7 h-7 rounded-lg bg-zinc-50 hover:bg-indigo-50 border border-zinc-200/80 text-zinc-500 hover:text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                      title="Edit 2026-27 Revenue & Budget"
                    >
                      <Pencil size={12} />
                    </button>
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <TrendingUp size={18} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">total revenue</span>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(currentInstRevenue.y2026_27.totalRevenue).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Annual HR cost</span>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(currentInstRevenue.y2026_27.annualHrCost).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Eligible Faculty</span>
                    </div>
                    <span className="text-sm font-black text-emerald-700 font-mono">
                      {metrics.eligibleFacultyCount}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-medium text-zinc-500 mt-2.5 pt-2 border-t border-zinc-50 flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">HR Cost (% of Total Revenue):</span>
                <strong className="text-sm font-black text-slate-700 font-mono">{hrCostPct2026_27}% </strong>
              </div>
            </div>

            {/* Card 4: Increment % (Clickable trigger for detailed visual graphs modal) */}
            <div
              onClick={() => setIncrementAnalyticsModalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIncrementAnalyticsModalOpen(true); }}
              className="group relative overflow-hidden bg-white border border-zinc-200/80 hover:border-emerald-500 rounded-2xl p-5 shadow-xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
              title="Click to view full executive visualization graphs"
            >
              <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-400/10 rounded-full blur-2xl group-hover:bg-emerald-400/20 transition-all pointer-events-none" />

              <div>
                <div className="flex items-center justify-between text-zinc-500 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-600 animate-pulse" />
                    increment %
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100/90 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <span>Visualize</span>
                    <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">total gross PM</span>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(salaryRevisionCalculation.totalGrossPM).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">total revised PM</span>
                      <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                        +{salaryRevisionCalculation.overallPctIncrease}%
                      </span>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(salaryRevisionCalculation.totalRevisedPM).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-medium text-zinc-500 mt-2.5 pt-2 border-t border-zinc-50 flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Difference in %:</span>
                <strong className="text-sm font-black text-emerald-700 font-mono">
                  +{salaryRevisionCalculation.overallPctIncrease}% (+₹{Number(salaryRevisionCalculation.totalDifferencePM).toLocaleString("en-IN")} PM)
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional Salary Structure & Market Benchmark Analytics */}
        <div className="bg-white border border-zinc-200/90 rounded-3xl overflow-hidden shadow-sm space-y-0">
          {/* Card Master Header */}
          <div className="px-5 py-4 bg-zinc-50/90 border-b border-zinc-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <BarChart3 size={16} />
              </div>
              <div>
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                  Institutional Salary Structure &amp; Market Benchmark Analytics
                </span>
                <span className="text-[10px] text-zinc-500 font-medium">
                  Dynamic benchmark across {benchmarkData.schools.length} institutions &amp; {benchmarkData.designations.length} designations • Role-Wise Deep Dive
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Download Template (.xlsx) */}
              <button
                type="button"
                onClick={handleDownloadBenchmarkTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-700 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="Download Excel template matching the matrix format"
              >
                <Download size={13} className="text-indigo-600" />
                <span>Download Template (.xlsx)</span>
              </button>

              {/* Upload Benchmark Excel */}
              <button
                type="button"
                onClick={() => benchmarkFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#101b38] hover:bg-[#162752] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="Upload filled Excel file to dynamically populate matrix tables"
              >
                <Upload size={13} className="text-emerald-400" />
                <span>Upload Excel</span>
              </button>
              <input
                ref={benchmarkFileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleUploadBenchmarkFile}
                className="hidden"
              />

              {/* Reset Default */}
              <button
                type="button"
                onClick={handleResetDefaultBenchmark}
                className="w-8 h-8 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
                title="Reset to default benchmark data"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Graphical Benchmark Chart Module (Role-Wise Deep Dive - Strictly NO "All Roles") */}
          <div className="p-4 sm:p-5 bg-slate-50/60 border-b border-zinc-200 space-y-4">
            {/* Controls Bar: Designation Pills & Chart View Toggles */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Designation Selector Pills (Each Role Individually - NO "All Roles") */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mr-1 shrink-0">
                  Select Role:
                </span>
                {benchmarkData.designations.map((desg) => (
                  <button
                    key={desg.id}
                    type="button"
                    onClick={() => setSelectedBenchmarkRole(desg.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      activeBenchmarkRole === desg.id
                        ? "bg-[#101b38] text-white shadow-2xs"
                        : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    {desg.label}
                  </button>
                ))}
              </div>

              {/* Right Chart View Switcher & Options */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* View Mode: Salary vs Variance */}
                <div className="inline-flex p-0.5 bg-zinc-200/90 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setBenchmarkChartType("salary")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      benchmarkChartType === "salary"
                        ? "bg-white text-zinc-900 shadow-2xs font-black"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                    title="Ranked Salary Bar Chart"
                  >
                    <BarChart3 size={13} className="text-indigo-600" />
                    <span>Ranked Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBenchmarkChartType("variance")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      benchmarkChartType === "variance"
                        ? "bg-white text-zinc-900 shadow-2xs font-black"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                    title="Variance Differential Chart vs Our Institution"
                  >
                    <ArrowUpDown size={13} className="text-emerald-600" />
                    <span>Advantage (±₹)</span>
                  </button>
                </div>

                {/* Sort Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setBenchmarkSort(
                      benchmarkSort === "salaryDesc"
                        ? "salaryAsc"
                        : benchmarkSort === "salaryAsc"
                          ? "default"
                          : "salaryDesc"
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    benchmarkSort !== "default"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                  }`}
                  title="Cycle sort: High-to-Low, Low-to-High, Table Order"
                >
                  <Sliders size={13} />
                  <span>
                    {benchmarkSort === "salaryDesc"
                      ? "Rank: High → Low"
                      : benchmarkSort === "salaryAsc"
                        ? "Rank: Low → High"
                        : "Sort: Table Order"}
                  </span>
                </button>

                {/* Govt Scale Toggle (If Govt institution present) */}
                {hasGovtSchool && (
                  <button
                    type="button"
                    onClick={() => setIncludeGovtScale(!includeGovtScale)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      includeGovtScale
                        ? "bg-amber-50 text-amber-900 border-amber-300 shadow-2xs"
                        : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    }`}
                    title="Toggle Govt 7th CPC scale to adjust comparative axis scale"
                  >
                    <Landmark size={13} className={includeGovtScale ? "text-amber-600" : "text-zinc-400"} />
                    <span>{includeGovtScale ? "Govt: Included" : "Govt: Excluded"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Chart Header Title & Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-zinc-200/80">
              <div>
                <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                  {benchmarkChartType === "salary" ? (
                    <>
                      <BarChart3 size={15} className="text-indigo-600" />
                      {activeRoleMetrics.roleName} – Institutional Salary Structure (Per Month)
                    </>
                  ) : (
                    <>
                      <ArrowUpDown size={15} className="text-emerald-600" />
                      Salary Variance: Peers vs {ourInstitutionCode} Base (₹ Per Month) – {activeRoleMetrics.roleName}
                    </>
                  )}
                </h4>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                  {benchmarkChartType === "salary" ? (
                    <>
                      Our {instTypeLabel}: <strong>{cleanOurCollegeName}</strong> ({activeRoleMetrics.ourRaw} PM) • Peer Rank{" "}
                      <span className="font-bold text-indigo-700">#{activeRoleMetrics.rank}</span> of{" "}
                      {activeRoleMetrics.totalPeers} Peers
                    </>
                  ) : (
                    <>
                      Green bars (increase ↑): Institutions paying <strong>higher than {ourInstitutionCode}</strong> • Orange bars (decrease ↓): Institutions paying <strong>lower than {ourInstitutionCode}</strong>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {benchmarkChartType === "salary" ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-950 bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-md shadow-2xs">
                      <Crown size={11} className="text-amber-500 fill-amber-400" />
                      {cleanOurCollegeName} ({instTypeLabel})
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                      {instTypeLabel === "Our School" ? "Peer Schools" : "Peer Colleges"}
                    </span>
                    {includeGovtScale && hasGovtSchool && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                        Govt / 7th CPC
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                      +₹ : Peer Pays Higher (Green Bar ↑)
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                      -₹ : Peer Pays Lower (Orange Bar ↓)
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Chart SVG Rendering Canvas */}
            <div className="w-full h-80 sm:h-96 min-w-0 min-h-[320px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                {benchmarkChartType === "salary" ? (
                  <BarChart data={benchmarkChartData} margin={{ top: 30, right: 20, left: 10, bottom: 65 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortNameWithLocation"
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      tick={{ fontSize: 10.5, fontWeight: 700, fill: "#334155" }}
                      height={65}
                      dy={6}
                    />
                    <YAxis
                      tickFormatter={(v) => `₹${v >= 100000 ? (v / 100000).toFixed(1) + "L" : (v / 1000).toFixed(0) + "k"}`}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<BenchmarkChartTooltip />} />
                    {activeRoleMetrics.ourSal > 0 && (
                      <ReferenceLine
                        y={activeRoleMetrics.ourSal}
                        stroke="#4338ca"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        label={{
                          value: `★ ${ourInstitutionCode} Baseline: ₹${activeRoleMetrics.ourRaw}`,
                          fill: "#312e81",
                          fontSize: 10,
                          position: "insideTopRight",
                          fontWeight: "bold"
                        }}
                      />
                    )}
                    <Bar dataKey="salary" radius={[8, 8, 0, 0]}>
                      {benchmarkChartData.map((entry) => (
                        <Cell
                          key={`cell-${entry.id}`}
                          fill={
                            entry.isOurCollege
                              ? "#4338ca"
                              : entry.isGovt
                                ? "#f59e0b"
                                : entry.salary < activeRoleMetrics.ourSal
                                  ? "#0d9488"
                                  : entry.salary === activeRoleMetrics.ourSal
                                    ? "#0284c7"
                                    : "#64748b"
                          }
                          stroke={entry.isOurCollege ? "#fbbf24" : "none"}
                          strokeWidth={entry.isOurCollege ? 2.5 : 0}
                        />
                      ))}
                      <LabelList
                        dataKey="salary"
                        position="top"
                        formatter={(val) =>
                          val > 0
                            ? `₹${val >= 100000 ? (val / 100000).toFixed(1) + "L" : (val / 1000).toFixed(0) + "k"}`
                            : "-"
                        }
                        style={{ fontSize: 10, fontWeight: 800, fill: "#1e293b" }}
                      />
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={benchmarkChartData} margin={{ top: 25, right: 20, left: 10, bottom: 65 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortNameWithLocation"
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      tick={{ fontSize: 10.5, fontWeight: 700, fill: "#334155" }}
                      height={70}
                      dy={10}
                      axisLine={{ stroke: "#94a3b8", strokeWidth: 1.2 }}
                      tickLine={{ stroke: "#cbd5e1" }}
                    />
                    <YAxis
                      domain={[
                        (dataMin) => Math.min(Math.floor((dataMin - 5000) / 2000) * 2000, -14000),
                        (dataMax) => Math.max(Math.ceil((dataMax + 4000) / 2000) * 2000, 22000)
                      ]}
                      tickFormatter={(v) => `${v > 0 ? "+" : ""}₹${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<BenchmarkChartTooltip />} />
                    <ReferenceLine y={0} stroke="#334155" strokeWidth={1.5} />
                    <Bar dataKey="diffFromOur" radius={[6, 6, 0, 0]}>
                      {benchmarkChartData.map((entry) => (
                        <Cell
                          key={`var-${entry.id}`}
                          fill={
                            entry.isOurCollege
                              ? "#4338ca"
                              : entry.diffFromOur > 0
                                ? "#10b981"
                                : entry.diffFromOur === 0
                                  ? "#0284c7"
                                  : "#f59e0b"
                          }
                          stroke={entry.isOurCollege ? "#fbbf24" : "none"}
                          strokeWidth={entry.isOurCollege ? 2 : 0}
                        />
                      ))}
                      <LabelList
                        dataKey="diffFromOur"
                        position="top"
                        formatter={(val) =>
                          val === 0
                            ? `★ ${ourInstitutionCode}`
                            : `${val > 0 ? "+" : "-"}₹${
                                Math.abs(val) >= 100000
                                  ? (Math.abs(val) / 100000).toFixed(1) + "L"
                                  : (Math.abs(val) / 1000).toFixed(0) + "k"
                              }`
                        }
                        style={{ fontSize: 10, fontWeight: 800, fill: "#1e293b" }}
                      />
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Matrix Tables Subheader Bar & Orientation Switcher */}
          <div className="px-5 py-3 bg-zinc-100/80 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={14} className="text-indigo-600" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Salary Structure Matrix Verification Table
              </span>
            </div>

            {/* View Switcher Tabs */}
            <div className="inline-flex p-0.5 bg-zinc-200/90 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setBenchmarkTableOrientation("exactImage")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  benchmarkTableOrientation === "exactImage"
                    ? "bg-white text-zinc-900 shadow-2xs font-black"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Exact Image Layout ({benchmarkData.schools.length + 1} Cols)
              </button>
              <button
                type="button"
                onClick={() => setBenchmarkTableOrientation("detailed")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  benchmarkTableOrientation === "detailed"
                    ? "bg-white text-zinc-900 shadow-2xs font-black"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Institutional Roster View
              </button>
            </div>
          </div>

          {/* Exact Image Table Orientation (Designations as Rows, Colleges as Columns) */}
          {benchmarkTableOrientation === "exactImage" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100/90 text-zinc-700 font-black uppercase tracking-wider text-[10px] border-b border-zinc-200">
                    <th
                      className="py-3 px-3.5 border-r border-zinc-200 sticky left-0 z-10 min-w-[160px] font-black uppercase text-slate-800"
                      style={{ backgroundColor: "#f4f4f5", color: "#0f172a" }}
                    >
                      SALARY STRUCTURE
                    </th>
                    {peerSchools.map((school) => {
                      const displaySub = school.location
                        ? `(${school.location.toLowerCase()})`
                        : school.subName
                        ? school.subName.startsWith("(") ? school.subName : `(${school.subName.toLowerCase()})`
                        : "";
                      return (
                        <th key={school.id} className="py-3 px-3 border-r border-zinc-200 text-center min-w-[125px]">
                          {school.name}
                          {displaySub && (
                            <span className="block text-[9px] font-medium text-zinc-500 lowercase">
                              {displaySub}
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th
                      className="py-3 px-4 text-center min-w-[140px] bg-[#1e1b4b] text-white font-black border-l-2 border-indigo-400"
                      style={{ backgroundColor: "#1e1b4b", color: "#ffffff" }}
                    >
                      <span className="flex items-center justify-center gap-1 font-black text-white" style={{ color: "#ffffff" }}>
                        <Crown size={13} className="text-amber-400 shrink-0 fill-amber-400" />
                        {cleanOurCollegeName}
                      </span>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-200" style={{ color: "#c7d2fe" }}>
                        {instTypeLabel}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 font-mono">
                  {benchmarkData.designations.map((desg) => {
                    const ourSalary = ourCollege?.salaries?.[desg.id]?.num || 0;
                    const ourRaw = ourCollege?.salaries?.[desg.id]?.raw || "-";

                    return (
                      <tr key={desg.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td
                          className="py-3.5 px-3.5 font-bold font-sans text-slate-900 border-r border-zinc-200 sticky left-0 z-10"
                          style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
                        >
                          {desg.label}
                        </td>
                        {peerSchools.map((school) => {
                          const peerSalaryObj = school.salaries?.[desg.id];
                          const peerRaw = peerSalaryObj?.raw || "-";
                          const peerNum = peerSalaryObj?.num || 0;
                          const diff = ourSalary - peerNum;

                          return (
                            <td key={school.id} className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                              <div className="font-bold text-slate-900">{peerRaw}</div>
                              {ourSalary > 0 && peerNum > 0 && (
                                <div className="mt-0.5">
                                  {diff > 0 ? (
                                    <span className="block text-[9px] font-sans text-emerald-700 font-bold">
                                      {ourInstitutionCode} +₹{formatDiffK(diff)}
                                    </span>
                                  ) : diff === 0 ? (
                                    <span className="block text-[9px] font-sans text-blue-700 font-bold">
                                      100% Parity
                                    </span>
                                  ) : (
                                    <span className="block text-[9px] font-sans text-amber-700 font-bold">
                                      +₹{formatDiffK(Math.abs(diff))}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td
                          className="py-3.5 px-4 text-center font-black text-indigo-950 text-sm border-l-2 border-indigo-400"
                          style={{ backgroundColor: "#eef2ff", color: "#1e1b4b" }}
                        >
                          {ourRaw}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Institutional Roster View (Colleges as Rows, Designations as Columns) */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100/90 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                    <th className="py-3 px-3.5 border-r border-zinc-200 min-w-[200px]">Institution &amp; Region</th>
                    {benchmarkData.designations.map((desg) => (
                      <th key={desg.id} className="py-3 px-3.5 border-r border-zinc-200 text-right min-w-[130px]">
                        {desg.label}
                      </th>
                    ))}
                    <th className="py-3 px-3.5 text-center min-w-[160px]">Benchmark Standing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {/* Peer Schools */}
                  {peerSchools.map((col) => {
                    return (
                      <tr key={col.id} className="hover:bg-zinc-50/80 text-zinc-700 transition-colors">
                        <td className="py-3 px-3.5 border-r border-zinc-100">
                          <div className="font-black text-slate-900">
                            {col.name} {col.subName}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-medium">
                            {col.region || (instTypeLabel === "Our School" ? "Peer School" : "Peer Institution")} • {col.location || "Tamil Nadu"}
                          </div>
                        </td>
                        {benchmarkData.designations.map((desg) => {
                          const peerObj = col.salaries?.[desg.id];
                          const peerRaw = peerObj?.raw || "-";
                          const peerNum = peerObj?.num || 0;
                          const ourSalary = ourCollege?.salaries?.[desg.id]?.num || 0;
                          const diff = peerNum - ourSalary;

                          return (
                            <td key={desg.id} className="py-3 px-3.5 border-r border-zinc-100 text-right font-mono">
                              <span className="text-slate-800">{peerRaw}</span>
                              {ourSalary > 0 && peerNum > 0 && (
                                <div className="text-[10px] font-semibold mt-0.5">
                                  {diff > 0 ? (
                                    <span className="text-amber-700 font-mono">
                                      +₹{diff.toLocaleString("en-IN")}
                                    </span>
                                  ) : diff === 0 ? (
                                    <span className="text-blue-700 font-bold">100% Parity</span>
                                  ) : (
                                    <span className="text-emerald-700 font-mono">
                                      {ourInstitutionCode} +₹{Math.abs(diff).toLocaleString("en-IN")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-3.5 text-center">
                          {col.isGovt ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Govt 7th CPC Benchmark
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {col.region?.toLowerCase().includes("school") || instTypeLabel === "Our School" ? "Private Peer School" : "Private Peer College"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Our College/School Row at Bottom */}
                  {ourCollege && (
                    <tr
                      className="bg-indigo-50/90 font-bold border-y-2 border-indigo-400"
                      style={{ backgroundColor: "#eef2ff" }}
                    >
                      <td className="py-3 px-3.5 border-r border-zinc-100">
                        <div className="flex items-center gap-2">
                          <Crown size={14} className="text-amber-500 shrink-0 fill-amber-400" />
                          <div>
                            <div className="font-black text-indigo-950 text-sm" style={{ color: "#1e1b4b" }}>
                              {cleanOurCollegeName}
                              <span className="ml-1.5 text-xs font-bold text-indigo-700 font-sans">
                                ({instTypeLabel})
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 font-medium">
                              {ourCollege.region?.replace(/our (?:college|school)/i, instTypeLabel) || `Cuddalore / ${instTypeLabel}`} • {ourCollege.location || "Cuddalore"}
                            </div>
                          </div>
                        </div>
                      </td>
                      {benchmarkData.designations.map((desg) => {
                        const ourRaw = ourCollege.salaries?.[desg.id]?.raw || "-";
                        return (
                          <td
                            key={desg.id}
                            className="py-3 px-3.5 border-r border-zinc-100 text-right font-mono text-indigo-900 font-black text-sm"
                            style={{ color: "#1e1b4b" }}
                          >
                            {ourRaw}
                          </td>
                        );
                      })}
                      <td className="py-3 px-3.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-600 text-white shadow-2xs">
                          <Star size={10} className="fill-amber-300 text-amber-300" />
                          Current Institutional Standard
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Institutional Increment Criteria & Slab Reference Card (From User Spreadsheet) */}
        <div className="bg-white border border-zinc-200/90 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Performance Rubrics Matrix</div>
              <h3 className="text-sm font-black text-[#101b38] flex items-center gap-2">
                <Sliders size={16} className="text-indigo-600" />
                Active Score Criteria & Salary Increment Slabs
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-xl">
                Promotion Bump: <strong>+{criteriaConfig.promotionPct}%</strong>
              </span>
              <button
                type="button"
                onClick={handleOpenCriteriaModal}
                className="px-3 py-1.5 bg-[#101b38] hover:bg-[#162752] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Settings2 size={13} /> Configure Criteria
              </button>
            </div>
          </div>

          {/* Visual Matrix Badges (Parity with uploaded image tables) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {computeDynamicTiers(criteriaConfig.tiers || DEFAULT_INCREMENT_CRITERIA.tiers).map((tier, idx, allTiers) => (
              <div key={tier.code} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 text-center space-y-1 relative overflow-hidden">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  {tier.code}
                </div>
                <div className="text-xs font-black text-slate-800 truncate" title={tier.label}>
                  {tier.label}
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                  {tier.incrementPct}% Increment
                </div>
                <div className="text-[10px] font-bold text-zinc-500 pt-0.5">
                  {tier.minScore > 0
                    ? `${tier.minScore}% to ${Math.floor(tier.maxScore)}%`
                    : `< ${Math.ceil(tier.maxScore)}%`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters & Control Bar */}
        <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
              <input
                type="text"
                placeholder="Search by ID, Faculty Name, Designation, Dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#101b38]/20 focus:border-[#101b38]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Actions: Download Template & Upload CSV */}
            <div className="flex items-center gap-3 flex-wrap">

              {/* 1. Download Template Button */}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-zinc-800 rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                title="Download Excel (.xlsx) Template with 'faculty id' and 'gross PM' columns"
              >
                <FileSpreadsheet size={15} className="text-emerald-700" />
                Download Template (Excel)
              </button>

              {/* 2. Hidden File Input for Excel/CSV */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* 3. Upload Gross PM Excel/CSV Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
                title="Upload filled Excel (.xlsx) file with 'faculty id' and 'gross PM'"
              >
                <Upload size={14} />
                Upload Gross PM
              </button>

              {/* 4. Export Full Revision Matrix (.xlsx) with Columns M - U */}
              <button
                type="button"
                onClick={handleExportFullMatrix}
                className="px-4 py-2.5 bg-[#101b38] hover:bg-[#1c356e] text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer"
                title="Export complete institutional salary revision spreadsheet with columns M through U"
              >
                <Download size={14} className="text-amber-300" />
                Export Matrix (.xlsx)
              </button>

              {/* 5. Clear / Reset School Salaries Button */}
              {activeInstCode && activeInstCode !== "all" && (
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  title={`Delete all uploaded salaries from node appraisal_config/gross_salaries_${activeInstCode}`}
                >
                  <Trash2 size={14} className="text-rose-600" />
                  Clear Salaries ({getSchoolShortName(userInstitution) || activeInstCode.toUpperCase()})
                </button>
              )}
            </div>
          </div>

          {/* Secondary Dropdown Filters */}
          <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-zinc-100 text-xs">
            {/* Institution Badge / Selector */}
            {isSuperAdmin ? (
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-500 text-[11px] uppercase tracking-wider">Institution:</span>
                <select
                  value={selectedInstFilter}
                  onChange={(e) => {
                    setSelectedInstFilter(e.target.value);
                    setSelectedDept("All");
                  }}
                  className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#101b38]"
                >
                  <option value="All">All Institutions</option>
                  <option value="CKSPK">CKSPK (Matric)</option>
                  <option value="CKSPE">CKSPE (CBSE)</option>
                  <option value="CKCOE">CKCOE (B.Ed)</option>
                  <option value="CKCET">CKCET (Engineering)</option>
                </select>
              </div>
            ) : userInstitution ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-850 font-bold text-xs shadow-2xs" title="Strict Institutional Segregation Enforced">
                <Building2 size={13} className="text-indigo-600" />
                <span>{getSchoolShortName(userInstitution) || userInstitution}</span>
                <span className="text-[9px] bg-indigo-200/70 text-indigo-900 px-1.5 py-0.5 rounded uppercase font-black tracking-wider">Active School</span>
              </div>
            ) : null}

            {/* Department-Locked Badge for Department Roles */}
            {isDeptRole && userDepartment && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-bold text-xs">
                <span>Dept: <strong>{userDepartment}</strong></span>
              </div>
            )}

            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-500 text-[11px] uppercase tracking-wider">Department:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#101b38]"
              >
                {departmentsList.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-500 text-[11px] uppercase tracking-wider">Type:</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#101b38]"
              >
                <option value="All">All Staff Types</option>
                <option value="Faculty">Teaching Faculty</option>
                <option value="Non-Teaching">Non-Teaching Staff</option>
                <option value="HOD">Head of Department (HOD)</option>
                <option value="Principal">Principal</option>
              </select>
            </div>

            {/* Academic Year Filter */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-500 text-[11px] uppercase tracking-wider">Academic Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#101b38]"
              >
                {academicYearsList.map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            <div className="ml-auto text-[11px] font-bold text-zinc-400">
              Showing <strong className="text-zinc-700 font-extrabold">{filteredRecords.length}</strong> evaluated records
            </div>
          </div>
        </div>

        {/* Main Gross Analytics & Increment Table */}
        <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2300px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-zinc-50/90 border-b border-zinc-200 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                  {/* 1. ID */}
                  <th
                    onClick={() => handleSort("facultyId")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      ID <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 2. Faculty Member */}
                  <th
                    onClick={() => handleSort("facultyName")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Faculty Member <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 3. Designation & Department */}
                  <th
                    onClick={() => handleSort("designation")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Designation & Dept <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 4. Date of Joining */}
                  <th
                    onClick={() => handleSort("dateOfJoining")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center border-r border-zinc-200"
                  >
                    <div className="flex items-center justify-center gap-1">
                      DOJ <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 5. Gross PM (Monthly Salary) */}
                  <th
                    onClick={() => handleSort("grossPM")}
                    className="p-3.5 cursor-pointer hover:bg-emerald-100/70 transition-colors text-center bg-emerald-50/60 border-r border-emerald-200/70"
                    title="Current Baseline Gross Per Month (PM)"
                  >
                    <div className="flex items-center justify-center gap-1 text-emerald-950 font-black">
                      <IndianRupee size={12} className="text-emerald-700" />
                      Gross PM <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 6. Gross PA (Annual Baseline Salary) */}
                  <th
                    onClick={() => handleSort("grossPA")}
                    className="p-3.5 cursor-pointer hover:bg-emerald-100/70 transition-colors text-center bg-emerald-50/60 border-r border-emerald-200/70"
                    title="Current Baseline Gross Per Annum (PA = Gross PM × 12)"
                  >
                    <div className="flex items-center justify-center gap-1 text-emerald-950 font-black">
                      <IndianRupee size={12} className="text-emerald-700" />
                      Gross PA <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 7. Appraisal Review Form Mark (60%) */}
                  <th
                    onClick={() => handleSort("appraisalMark")}
                    className="p-3.5 cursor-pointer hover:bg-blue-100/50 transition-colors text-center bg-blue-50/40"
                    title="Appraisal Review Form Mark (60% weightage)"
                  >
                    <div className="flex items-center justify-center gap-1 text-blue-900">
                      Appraisal (60%) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 8. Attitude Form Mark (40%) */}
                  <th
                    onClick={() => handleSort("attitudeMarkNormalized")}
                    className="p-3.5 cursor-pointer hover:bg-emerald-100/50 transition-colors text-center bg-emerald-50/40"
                    title="Attitude Form Mark (40% weightage)"
                  >
                    <div className="flex items-center justify-center gap-1 text-emerald-900">
                      Attitude (40%) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 9. Gross Mark (100) */}
                  <th
                    onClick={() => handleSort("grossMark")}
                    className="p-3.5 cursor-pointer hover:bg-amber-100/50 transition-colors text-center bg-amber-50/30"
                    title="Gross Score = (0.6 * Appraisal) + (0.4 * Attitude)"
                  >
                    <div className="flex items-center justify-center gap-1 text-amber-900 font-black">
                      Score (100) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 10. Performance Criteria & Increment % */}
                  <th
                    onClick={() => handleSort("baseIncrementPct")}
                    className="p-3.5 cursor-pointer hover:bg-indigo-100/50 transition-colors text-center bg-indigo-50/30 border-r border-zinc-200"
                    title="Performance Tier & Base Increment %"
                  >
                    <div className="flex items-center justify-center gap-1 text-indigo-900 font-black">
                      Criteria Slab <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 11. Promotion % */}
                  <th
                    onClick={() => handleSort("promotionPct")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Promotion Recommendation Percentage"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Promotion % <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 12. Promotion Amount */}
                  <th
                    onClick={() => handleSort("promotionAmount")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Promotion Increment Amount (PA) = Gross PA × Promotion %"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Promotion Amount <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 13. % Increase */}
                  <th
                    onClick={() => handleSort("pctIncrease")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Total % Increase = ((Revised Gross PA - Gross PA) / Gross PA) × 100"
                  >
                    <div className="flex items-center justify-center gap-1">
                      % Increase <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 14. Salary Adjustment (PM) */}
                  <th
                    onClick={() => handleSort("salaryAdjustmentPM")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Monthly Discretionary Adjustment (₹ PM)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Salary Adjustment (PM) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 15. Salary Adjustment (PA) */}
                  <th
                    onClick={() => handleSort("salaryAdjustmentPA")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Annual Salary Adjustment = Adjustment (PM) × 12"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Salary Adjustment (PA) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 16. Revised Gross (PM) */}
                  <th
                    onClick={() => handleSort("revisedGrossPM")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Final Revised Gross Monthly Salary"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Revised Gross (PM) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 17. Revised Gross (PA) */}
                  <th
                    onClick={() => handleSort("revisedGrossPA")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Revised Gross Annual Salary = Gross PA + Increment Amount (PA) + Promotion Amount + Salary Adjustment (PA)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Revised Gross (PA) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 18. Increment Amount (PM) */}
                  <th
                    onClick={() => handleSort("totalIncrementAmount")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Net Total Increment Amount = Revised Gross (PM) - Original Gross (PM)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Increment Amount (PM) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 19. Increment Amount (PA) */}
                  <th
                    onClick={() => handleSort("totalIncrementAmountPA")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Total Annual Increment = Revised Gross (PA) - Gross PA"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Increment Amount (PA) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 20. Action */}
                  <th className="p-3.5 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={20} className="p-12 text-center text-zinc-400 font-semibold">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Gross Analytics Records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="p-12 text-center text-zinc-400 font-medium">
                      <div className="max-w-md mx-auto space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                          <Filter size={20} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-700">No Approved Records Found</h4>
                        <p className="text-xs text-zinc-500">
                          {approvalFilter === "Approved"
                            ? "No faculty members match the filters with Principal approval status. Switch to 'All Appraisals' to inspect all submissions."
                            : "No appraisals match the current search filters."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-zinc-50/70 transition-all">

                      {/* 1. ID Column */}
                      <td className="p-3.5">
                        <div className="inline-flex items-center gap-1 font-mono text-[11px] font-black text-[#101b38] bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
                          {rec.facultyId}
                        </div>
                      </td>

                      {/* 2. Faculty Member */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-850 text-xs">{rec.facultyName}</div>
                        {rec.email && (
                          <div className="text-[10px] text-zinc-400 truncate max-w-[180px]">{rec.email}</div>
                        )}
                        <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5">
                          {rec.collectionType === "principal" ? (
                            <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1 font-black">
                              <Crown size={10} /> Principal
                            </span>
                          ) : rec.collectionType === "teacher"
                            ? "School Teacher"
                            : rec.collectionType === "faculty"
                              ? "Teaching Faculty"
                              : rec.collectionType === "hod"
                                ? "HOD"
                                : "Non-Teaching Staff"}
                        </div>
                      </td>

                      {/* 3. Designation & Department */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-700 text-xs">{rec.designation}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] font-bold text-[#101b38]">{rec.department}</span>
                          {rec.institution && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200" title={rec.institution}>
                              {getSchoolShortName(rec.institution)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Date of Joining */}
                      <td className="p-3.5 text-center border-r border-zinc-200">
                        <div className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-200/80">
                          <Calendar size={12} className="text-zinc-400" />
                          {rec.dateOfJoining}
                        </div>
                      </td>

                      {/* 5. Gross PM (Monthly Salary) */}
                      <td className="p-3.5 text-center border-r border-zinc-200 whitespace-nowrap">
                        {rec.grossPM !== null && rec.grossPM !== undefined ? (
                          <div className="flex flex-col items-center">
                            <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                              ₹{Number(rec.grossPM).toLocaleString("en-IN")}
                            </span>
                            {rec.salaryHistory && Object.keys(rec.salaryHistory).length > 1 && (
                              <span
                                className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded-md mt-0.5 tracking-tight cursor-help"
                                title={`Salary recorded for ${Object.keys(rec.salaryHistory).length} years: ${Object.keys(rec.salaryHistory).map(k => `${k}: ₹${Number(rec.salaryHistory[k]).toLocaleString("en-IN")}`).join(" | ")}`}
                              >
                                {Object.keys(rec.salaryHistory).length}Y History
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs italic">-</span>
                        )}
                      </td>

                      {/* 6. Gross PA (Annual Baseline Salary = Gross PM × 12) */}
                      <td className="p-3.5 text-center border-r border-zinc-200 whitespace-nowrap">
                        {rec.grossPA !== null && rec.grossPA !== undefined ? (
                          <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                            ₹{Number(rec.grossPA).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs italic">-</span>
                        )}
                      </td>

                      {/* 6. Appraisal Review Form Mark */}
                      <td className="p-3.5 text-center bg-blue-50/20">
                        <div className="font-black text-blue-950 text-xs">
                          {rec.appraisalMark} <span className="text-[10px] font-bold text-blue-500">/ 100</span>
                        </div>
                        <div className="text-[10px] font-bold text-blue-700 mt-0.5">
                          {rec.collectionType === "principal" ? (
                            <strong className="text-purple-900 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">100% Executive</strong>
                          ) : (
                            <>60% = <strong className="text-blue-900">{rec.weightedAppraisal} pts</strong></>
                          )}
                        </div>
                      </td>

                      {/* 7. Attitude Form Mark */}
                      <td className="p-3.5 text-center bg-emerald-50/20">
                        {rec.collectionType === "principal" ? (
                          <div className="text-[10px] text-zinc-400 font-medium italic">
                            N/A (Direct)
                          </div>
                        ) : (
                          <>
                            <div className="font-black text-emerald-950 text-xs">
                              {rec.attitudeMarkNormalized}%
                              <span className="text-[10px] font-bold text-zinc-400 ml-1">
                                ({rec.attitudeTotalScore}/{rec.attitudeMaxScore})
                              </span>
                            </div>
                            <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
                              40% = <strong className="text-emerald-900">{rec.weightedAttitude} pts</strong>
                            </div>
                          </>
                        )}
                      </td>

                      {/* 8. Gross Total Mark */}
                      <td className="p-3.5 text-center bg-amber-50/20">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-sm font-black text-[#101b38] bg-white px-3 py-1 rounded-xl border border-amber-300 shadow-xs">
                            {rec.grossMark}
                          </span>
                          <span className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest mt-0.5">
                            out of 100
                          </span>
                        </div>
                      </td>

                      {/* 9. Performance Criteria Slab */}
                      <td className="p-3.5 text-center bg-indigo-50/20 border-r border-zinc-200">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${rec.tierBadgeColor}`}>
                            {rec.tierCode} ({rec.baseIncrementPct}%)
                          </span>
                        </div>
                      </td>

                      {/* 10. Promotion % */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${rec.promotionPct > 0
                            ? "bg-purple-100 text-purple-900 border-purple-300"
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                            }`}>
                            {rec.promotionPct}%
                          </span>
                          <button
                            type="button"
                            onClick={() => handleTogglePromotion(rec.facultyId)}
                            className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full transition-all cursor-pointer ${rec.isPromoted
                              ? "bg-purple-600 text-white shadow-2xs hover:bg-purple-700"
                              : "bg-white border border-zinc-300 text-zinc-600 hover:bg-purple-50 hover:text-purple-700"
                              }`}
                            title="Toggle candidate promotion recommendation"
                          >
                            {rec.isPromoted ? "Active" : "+ Promo"}
                          </button>
                        </div>
                      </td>

                      {/* 11. Promotion Amount */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {rec.promotionAmount !== null ? (
                          <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                            {rec.promotionAmount > 0 ? `₹${Number(rec.promotionAmount).toLocaleString("en-IN")}` : "₹0"}
                          </span>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs">-</span>
                        )}
                      </td>

                      {/* 12. % Increase */}
                      <td className="p-3.5 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-950 border border-indigo-200">
                          {rec.pctIncrease}%
                        </span>
                      </td>

                      {/* 13. Salary Adjustment (PM) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 bg-white border border-zinc-300 hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 rounded-lg px-2 py-1 shadow-2xs transition-all">
                          <span className="text-[10px] text-zinc-400 font-bold">₹</span>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={adjustmentInputs[rec.facultyId] !== undefined ? adjustmentInputs[rec.facultyId] : (rec.salaryAdjustmentPM || "")}
                            placeholder="0"
                            onChange={(e) => handleAdjustmentInputChange(rec.facultyId, e.target.value)}
                            onBlur={(e) => handleAdjustmentInputBlur(rec.facultyId, e.target.value)}
                            className="w-16 text-xs font-mono font-bold text-zinc-800 bg-transparent outline-none text-right"
                            title="Enter monthly salary adjustment in ₹"
                          />
                        </div>
                      </td>

                      {/* 14. Salary Adjustment (PA) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span className="font-mono font-bold text-zinc-700 text-xs whitespace-nowrap inline-block">
                          ₹{Number(rec.salaryAdjustmentPA).toLocaleString("en-IN")}
                        </span>
                      </td>

                      {/* 15. Revised Gross (PM) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {rec.revisedGrossPM !== null ? (
                          <span className="font-mono font-black text-emerald-950 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl text-xs shadow-2xs whitespace-nowrap inline-block">
                            ₹{Number(rec.revisedGrossPM).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs">-</span>
                        )}
                      </td>

                      {/* 16. Revised Gross (PA) - Right of Revised Gross (PM) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {rec.revisedGrossPA !== null ? (
                          <span className="font-mono font-black text-slate-900 text-xs whitespace-nowrap inline-block">
                            ₹{Number(rec.revisedGrossPA).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs">-</span>
                        )}
                      </td>

                      {/* 17. Increment Amount (PM) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {rec.totalIncrementAmount !== null ? (
                          <span className="font-mono font-black text-emerald-900 bg-emerald-100/90 border border-emerald-300 px-2.5 py-1 rounded-xl text-xs shadow-2xs whitespace-nowrap inline-block">
                            +₹{Number(rec.totalIncrementAmount).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <div className="text-[10px] text-zinc-400 font-semibold italic">
                            Upload Gross PM
                          </div>
                        )}
                      </td>

                      {/* 19. Increment Amount (PA) - Right of Increment Amount (PM) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {rec.totalIncrementAmountPA !== null ? (
                          <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                            +₹{Number(rec.totalIncrementAmountPA).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs">-</span>
                        )}
                      </td>

                      {/* 20. Action Buttons: Analytics + Breakdown */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedAnalyticsCandidate(rec);
                              setAnalyticsSalaryViewMode("PM");
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs"
                            title="View Personal Salary Progression & Dual Charts"
                          >
                            <TrendingUp size={12} /> Analytics
                          </button>
                          <button
                            onClick={() => setSelectedCandidate(rec)}
                            className="px-2.5 py-1.5 bg-[#101b38] hover:bg-[#1c356e] text-white rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs"
                            title="View Complete Salary Revision Breakdown"
                          >
                            <Eye size={12} /> Breakdown
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100/95 border-t-2 border-slate-300 text-xs font-black text-slate-900 sticky bottom-0 z-10 shadow-md">
                <tr className="divide-x divide-zinc-200">
                  {/* 1-4. Summary Header */}
                  <td colSpan={4} className="p-3.5 text-left bg-slate-200/90 font-black text-slate-900">
                    <div className="flex items-center gap-2">
                      <Calculator size={15} className="text-indigo-700" />
                      <span>Total / Summary ({filteredRecords.length} Staff)</span>
                    </div>
                  </td>

                  {/* 5. Gross PM Total */}
                  <td className="p-3.5 text-center whitespace-nowrap bg-emerald-100/70 font-mono font-black text-emerald-950">
                    ₹{Number(tableTotals.grossPMTotal).toLocaleString("en-IN")}
                  </td>

                  {/* 6. Gross PA Total (Gross PM × 12) */}
                  <td className="p-3.5 text-center whitespace-nowrap bg-emerald-100/70 border-r border-emerald-200/70 font-mono font-black text-emerald-950">
                    ₹{Number(tableTotals.grossPATotal).toLocaleString("en-IN")}
                  </td>

                  {/* 7. Appraisal (60%) */}
                  <td className="p-3.5 text-center text-zinc-400 font-bold bg-blue-50/20">—</td>

                  {/* 8. Attitude (40%) */}
                  <td className="p-3.5 text-center text-zinc-400 font-bold bg-emerald-50/20">—</td>

                  {/* 9. Gross Mark (100) */}
                  <td className="p-3.5 text-center text-zinc-400 font-bold bg-amber-50/20">—</td>

                  {/* 10. Criteria Slab */}
                  <td className="p-3.5 text-center text-zinc-400 font-bold bg-indigo-50/20 border-r border-zinc-200">—</td>

                  {/* 11. Promotion % */}
                  <td className="p-3.5 text-center text-zinc-400 font-bold">—</td>

                  {/* 12. Promotion Amount Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-purple-900 bg-purple-50/60">
                    {tableTotals.promotionAmountTotal > 0
                      ? `₹${Number(tableTotals.promotionAmountTotal).toLocaleString("en-IN")}`
                      : "₹0"}
                  </td>

                  {/* 13. % Increase Total = ((Revised PA Total - Gross PA Total) / Gross PA Total) * 100 */}
                  <td className="p-3.5 text-center whitespace-nowrap bg-indigo-50/60">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-2xs">
                      {tableTotals.totalPctIncrease}%
                    </span>
                  </td>

                  {/* 14. Salary Adjustment (PM) Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-amber-950 bg-amber-50/60">
                    ₹{Number(tableTotals.salaryAdjustmentPMTotal).toLocaleString("en-IN")}
                  </td>

                  {/* 15. Salary Adjustment (PA) Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-amber-950 bg-amber-50/60">
                    ₹{Number(tableTotals.salaryAdjustmentPATotal).toLocaleString("en-IN")}
                  </td>

                  {/* 16. Revised Gross (PM) Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-emerald-950 bg-emerald-100/90">
                    ₹{Number(tableTotals.revisedGrossPMTotal).toLocaleString("en-IN")}
                  </td>

                  {/* 17. Revised Gross (PA) Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-slate-900 bg-emerald-100/90">
                    ₹{Number(tableTotals.revisedGrossPATotal).toLocaleString("en-IN")}
                  </td>

                  {/* 18. Increment Amount (PM) Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-emerald-900 bg-emerald-200/80">
                    +₹{Number(tableTotals.totalIncrementPMTotal).toLocaleString("en-IN")}
                  </td>

                  {/* 19. Increment Amount (PA) Total */}
                  <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-slate-900 bg-emerald-200/80">
                    +₹{Number(tableTotals.totalIncrementPATotal).toLocaleString("en-IN")}
                  </td>

                  {/* 20. Action */}
                  <td className="p-3.5 text-center text-zinc-400 font-bold">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Increment Criteria Configuration Modal */}
        {criteriaModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl w-full max-w-2xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              {/* Modal Header */}
              <div className="bg-gradient-to-r from-[#101b38] to-[#1c356e] p-6 text-white flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-1">
                    <Sliders size={12} /> Settings & Rubrics Manager
                  </div>
                  <h3 className="text-lg font-black">Configure Score Criteria & Increment % Slabs</h3>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Customize the threshold score ranges and increment percentages as approved by management.
                  </p>
                </div>
                <button
                  onClick={() => setCriteriaModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs text-zinc-700">

                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-[#101b38] flex items-center justify-between">
                    <span>Performance Slabs Configuration:</span>
                    <button
                      type="button"
                      onClick={() => setEditingCriteria(DEFAULT_INCREMENT_CRITERIA)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw size={12} /> Reset to Institutional Defaults
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {editingCriteria.tiers.map((tier, idx) => (
                      <div key={tier.code} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-[170px]">
                          <span className="font-mono text-xs font-black text-indigo-900 block">{tier.code}</span>
                          <span className="text-[11px] font-bold text-zinc-600">{tier.label}</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Min Score:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={tier.minScore}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditingCriteria((prev) => {
                                  const newTiers = [...prev.tiers];
                                  newTiers[idx] = { ...newTiers[idx], minScore: val };
                                  return { ...prev, tiers: computeDynamicTiers(newTiers) };
                                });
                              }}
                              className="w-16 h-8 text-center bg-white border border-zinc-300 rounded-lg font-bold text-xs"
                            />
                            <span className="text-zinc-400">%</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Max Score:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={Math.floor(tier.maxScore ?? 100)}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditingCriteria((prev) => {
                                  const newTiers = [...prev.tiers];
                                  newTiers[idx] = { ...newTiers[idx], maxScore: val };
                                  return { ...prev, tiers: computeDynamicTiers(newTiers) };
                                });
                              }}
                              className="w-16 h-8 text-center bg-white border border-zinc-300 rounded-lg font-bold text-xs"
                            />
                            <span className="text-zinc-400">%</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Increment:</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={tier.incrementPct}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditingCriteria((prev) => {
                                  const newTiers = [...prev.tiers];
                                  newTiers[idx] = { ...newTiers[idx], incrementPct: val };
                                  return { ...prev, tiers: computeDynamicTiers(newTiers) };
                                });
                              }}
                              className="w-16 h-8 text-center bg-white border border-emerald-300 text-emerald-800 rounded-lg font-black text-xs"
                            />
                            <span className="text-emerald-700 font-bold">%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Promotion Percentage Setting */}
                <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-black text-purple-900 block">Promotion Recommendation Bonus</span>
                    <span className="text-[11px] text-zinc-500">Additional increment percentage applied when candidate is promoted</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={editingCriteria.promotionPct ?? 5}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setEditingCriteria((prev) => ({ ...prev, promotionPct: val }));
                      }}
                      className="w-16 h-8 text-center bg-white border border-purple-300 text-purple-900 rounded-lg font-black text-xs"
                    />
                    <span className="text-purple-800 font-bold">%</span>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCriteriaModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 text-zinc-700 text-xs font-bold hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCriteriaConfig}
                  disabled={criteriaSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#101b38] hover:bg-[#162752] text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-blue-950/20"
                >
                  {criteriaSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save Configuration
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Upload Gross PM Confirmation & Preview Modal */}
        {uploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl w-full max-w-4xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              {/* Modal Header */}
              <div className="bg-gradient-to-r from-emerald-700 to-teal-800 p-6 text-white flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-emerald-200 text-[10px] font-black uppercase tracking-wider mb-1">
                    <FileSpreadsheet size={12} /> Excel Multi-Year Salary Import Preview
                  </div>
                  <h3 className="text-lg font-black flex items-center gap-2">
                    Import Multi-Year Gross Salaries
                  </h3>
                  <div className="text-xs text-emerald-100 mt-1 flex items-center gap-2 flex-wrap">
                    <span>File: <strong className="font-mono text-white">{uploadFileName}</strong></span>
                    <span>•</span>
                    <span>{parsedPreviewList.length} rows parsed</span>
                    {uploadDetectedYears.length > 0 && (
                      <>
                        <span>•</span>
                        <span className="bg-emerald-600/60 px-2 py-0.5 rounded-md font-bold text-white text-[11px]">
                          {uploadDetectedYears.length} Years: {uploadDetectedYears.join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setUploadModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                {/* Target Institution Node Notice */}
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-900 text-xs font-bold">
                  <Building2 size={16} className="text-indigo-600 shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>Target Firestore Node:</span>
                    <strong className="font-mono text-indigo-950 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                      appraisal_config/gross_salaries_{activeInstCode || "institution"}
                    </strong>
                    <span className="text-[10px] text-indigo-600 font-semibold">(Isolated School Node)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 p-3 rounded-2xl">
                  <div className="text-zinc-600 font-semibold">
                    Matched Faculty: <strong className="text-emerald-700">{parsedPreviewList.filter(p => p.isMatched).length}</strong>
                  </div>
                  <div className="text-zinc-600 font-semibold">
                    Total Records: <strong className="text-slate-800">{parsedPreviewList.length}</strong>
                  </div>
                </div>

                {/* Preview Table */}
                <div className="border border-zinc-200 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-100 text-zinc-600 font-bold uppercase tracking-wider text-[10px] sticky top-0">
                        <th className="p-3">Faculty ID</th>
                        <th className="p-3">Faculty Name</th>
                        <th className="p-3">Department</th>
                        {uploadDetectedYears.map((yr) => (
                          <th key={yr} className="p-3 text-right">
                            {yr} (₹)
                          </th>
                        ))}
                        <th className="p-3 text-right font-black text-emerald-800">Active Gross PM</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {parsedPreviewList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50">
                          <td className="p-3 font-mono font-bold text-slate-800">
                            {item.cleanedId || item.rawId}
                            {item.rawId !== item.cleanedId && (
                              <span className="text-[10px] text-zinc-400 font-normal ml-1.5" title="Original text in Excel">
                                (raw: {item.rawId})
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-semibold text-slate-700">{item.facultyName}</td>
                          <td className="p-3 text-zinc-500">{item.department}</td>
                          {uploadDetectedYears.map((yr) => (
                            <td key={yr} className="p-3 text-right font-mono text-zinc-600">
                              {item.history?.[yr] ? `₹${Number(item.history[yr]).toLocaleString("en-IN")}` : "—"}
                            </td>
                          ))}
                          <td className="p-3 text-right font-black font-mono text-emerald-800">
                            {item.grossPM > 0 ? `₹${Number(item.grossPM).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="p-3 text-center">
                            {item.isMatched ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                Matched
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                                New ID
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed italic">
                  * Clicking "Save & Apply Salaries" will attach these multi-year salaries to the corresponding faculty members and immediately compute current increment amounts using the latest active year.
                </p>
              </div>

              {/* Modal Footer */}
              <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 text-zinc-700 text-xs font-bold hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveSalaries}
                  disabled={uploadSaving}
                  className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-700/20"
                >
                  {uploadSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save & Apply Salaries
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Delete / Reset Salaries Confirmation Modal */}
        {deleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl w-full max-w-md border border-zinc-200 shadow-2xl overflow-hidden p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Delete {getSchoolShortName(userInstitution) || activeInstCode.toUpperCase()} Salaries?
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Target Node: <strong className="font-mono text-rose-700">appraisal_config/gross_salaries_{activeInstCode}</strong>
                  </p>
                </div>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 space-y-1.5">
                <p className="font-bold">This will completely remove all uploaded salary records for {getSchoolShortName(userInstitution) || activeInstCode.toUpperCase()}.</p>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Appraisal forms, marks, and evaluations will remain 100% safe. Other institutions (CKCOE, CKSPK, CKSPE) will NOT be touched.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deletingSalaries}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-bold text-zinc-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSchoolSalaries}
                  disabled={deletingSalaries}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {deletingSalaries ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Confirm Delete Node
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Breakdown Modal with Salary Increment Engine */}
        {selectedCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl w-full max-w-2xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              {/* Modal Header */}
              <div className="bg-gradient-to-r from-[#101b38] to-[#1c356e] p-6 text-white flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-1">
                    <ShieldCheck size={12} /> Gross Evaluation & Increment Card
                  </div>
                  <h3 className="text-lg font-black">{selectedCandidate.facultyName}</h3>
                  <div className="text-xs text-zinc-300 flex items-center gap-3 mt-1 flex-wrap">
                    <span>ID: <strong className="text-white font-mono">{selectedCandidate.facultyId}</strong></span>
                    <span>•</span>
                    <span>{selectedCandidate.designation}</span>
                    <span>•</span>
                    <span>{selectedCandidate.department}</span>
                    {selectedCandidate.institution && (
                      <>
                        <span>•</span>
                        <span className="text-amber-300 font-bold">{getSchoolShortName(selectedCandidate.institution)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 text-xs text-zinc-700">

                {/* Candidate Overview Card with Gross PM */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-center">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Date of Joining</span>
                    <strong className="text-xs font-black text-slate-800">{selectedCandidate.dateOfJoining}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Academic Session</span>
                    <strong className="text-xs font-black text-slate-800">{selectedCandidate.academicYear}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Current Gross PM</span>
                    <strong className="text-xs font-black font-mono text-emerald-900">
                      {selectedCandidate.grossPM !== null ? `₹${Number(selectedCandidate.grossPM).toLocaleString("en-IN")}` : "-"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Performance Tier</span>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${selectedCandidate.tierBadgeColor}`}>
                      {selectedCandidate.tierCode} ({selectedCandidate.totalIncrementPct}%)
                    </span>
                  </div>
                </div>

                {/* Multi-Year Salary Progression History */}
                {selectedCandidate.salaryHistory && Object.keys(selectedCandidate.salaryHistory).length > 0 && (
                  <div className="bg-gradient-to-br from-indigo-50/60 to-slate-50 border border-indigo-100 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-indigo-600" /> Multi-Year Salary History
                      </span>
                      <span className="text-[10px] bg-indigo-100/80 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                        {Object.keys(selectedCandidate.salaryHistory).length} Years on Record
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                      {Object.entries(selectedCandidate.salaryHistory).map(([yr, val], idx, arr) => {
                        const prevVal = idx > 0 ? arr[idx - 1][1] : null;
                        const diff = prevVal ? val - prevVal : null;
                        const diffPct = prevVal && prevVal > 0 ? ((diff / prevVal) * 100).toFixed(1) : null;
                        return (
                          <div key={yr} className="bg-white p-3 rounded-xl border border-indigo-100/80 shadow-xs flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">{formatAnalyticsYear(yr)}</span>
                            <div className="text-xs font-black font-mono text-slate-800 mt-1">
                              ₹{Number(val).toLocaleString("en-IN")} <span className="text-[9px] font-bold text-zinc-400">PM</span>
                            </div>
                            {diff !== null && (
                              <div className={`text-[9px] font-bold mt-1 ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {diff >= 0 ? `+₹${diff.toLocaleString("en-IN")}` : `-₹${Math.abs(diff).toLocaleString("en-IN")}`} ({diffPct}%)
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mathematical Formula Callout */}
                <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                    <Calculator size={15} /> Formula Weightage Computation:
                  </div>
                  {selectedCandidate.collectionType === "principal" ? (
                    <div className="font-mono text-xs bg-white p-3 rounded-xl border border-amber-200 text-slate-800 space-y-1">
                      <div>Executive Leadership Rubric: Gross Mark = Management Evaluated Mark (100% Direct)</div>
                      <div className="text-amber-800 font-bold">
                        Management Review Score = {selectedCandidate.appraisalMark} / 100
                      </div>
                      <div className="text-emerald-700 font-black text-sm pt-1 border-t border-zinc-100">
                        Gross Mark = <span className="underline">{selectedCandidate.grossMark} / 100</span>
                      </div>
                    </div>
                  ) : (
                    <div className="font-mono text-xs bg-white p-3 rounded-xl border border-amber-200 text-slate-800 space-y-1">
                      <div>Gross Mark = (0.60 × Appraisal Review Mark) + (0.40 × Attitude Form Mark)</div>
                      <div className="text-amber-800 font-bold">
                        Gross Mark = (0.60 × {selectedCandidate.appraisalMark}) + (0.40 × {selectedCandidate.attitudeMarkNormalized})
                      </div>
                      <div className="text-emerald-700 font-black text-sm pt-1 border-t border-zinc-100">
                        = {selectedCandidate.weightedAppraisal} + {selectedCandidate.weightedAttitude} = <span className="underline">{selectedCandidate.grossMark} / 100</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Score Breakdown Comparison Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Component 1: Appraisal Review Form */}
                  <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-blue-900 font-bold">
                      <span className="flex items-center gap-1.5 text-xs"><FileText size={14} /> 1. Appraisal Review Form</span>
                      <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full font-black">60% Weight</span>
                    </div>
                    <div className="text-2xl font-black text-blue-950">
                      {selectedCandidate.appraisalMark} <span className="text-xs font-bold text-zinc-400">/ 100</span>
                    </div>
                    <div className="text-xs font-medium text-blue-800">
                      Weighted Contribution: <strong>{selectedCandidate.weightedAppraisal} points</strong>
                    </div>
                    {selectedCandidate.rawApp?.principalReview?.comments && (
                      <div className="text-[11px] text-zinc-600 bg-white p-2.5 rounded-xl border border-blue-100 italic">
                        "{selectedCandidate.rawApp.principalReview.comments}"
                      </div>
                    )}
                  </div>

                  {/* Component 2: Attitude Evaluation Form */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-emerald-900 font-bold">
                      <span className="flex items-center gap-1.5 text-xs"><Award size={14} /> 2. Attitude & Competency Form</span>
                      <span className="text-[10px] bg-emerald-100 px-2 py-0.5 rounded-full font-black">40% Weight</span>
                    </div>
                    <div className="text-2xl font-black text-emerald-950">
                      {selectedCandidate.attitudeMarkNormalized}%
                    </div>
                    <div className="text-xs font-medium text-emerald-800">
                      Raw Score: <strong>{selectedCandidate.attitudeTotalScore} / {selectedCandidate.attitudeMaxScore}</strong> • Weighted: <strong>{selectedCandidate.weightedAttitude} points</strong>
                    </div>
                    {(selectedCandidate.rawApp?.attitudeEvaluation?.remarks || selectedCandidate.rawApp?.attitudeForm?.remarks || selectedCandidate.rawApp?.attitudeForm?.principalRemarks) && (
                      <div className="text-[11px] text-zinc-600 bg-white p-2.5 rounded-xl border border-emerald-100 italic">
                        "{selectedCandidate.rawApp?.attitudeEvaluation?.remarks || selectedCandidate.rawApp?.attitudeForm?.principalRemarks || selectedCandidate.rawApp?.attitudeForm?.remarks}"
                      </div>
                    )}
                  </div>

                </div>

                {/* Salary Increment & Revision Matrix (Spreadsheet Columns M - U) */}
                <div className="bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/40 border-2 border-slate-300 rounded-3xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">Institutional Compensation Architecture</span>
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                        <IndianRupee size={15} className="text-emerald-700" /> Salary Revision Matrix (Columns M – U)
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTogglePromotion(selectedCandidate.facultyId)}
                      className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${selectedCandidate.isPromoted
                        ? "bg-purple-600 text-white shadow-xs"
                        : "bg-white border border-purple-300 text-purple-700 hover:bg-purple-50"
                        }`}
                    >
                      {selectedCandidate.isPromoted
                        ? `Promotion Active (+${selectedCandidate.promotionBonusPct || criteriaConfig.promotionPct || 5}%)`
                        : `Apply Promotion (+${criteriaConfig.promotionPct || 5}%)`}
                    </button>
                  </div>

                  {/* Baseline & Slabs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-2xl border border-zinc-200 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Baseline Gross PM</span>
                      <strong className="text-sm font-black font-mono text-slate-800">
                        {selectedCandidate.grossPM !== null ? `₹${Number(selectedCandidate.grossPM).toLocaleString("en-IN")}` : "Not Set"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Baseline Gross PA</span>
                      <strong className="text-sm font-black font-mono text-slate-800">
                        {selectedCandidate.grossPA !== null ? `₹${Number(selectedCandidate.grossPA).toLocaleString("en-IN")}` : "Not Set"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Performance Tier</span>
                      <strong className="text-xs font-black text-indigo-900">
                        {selectedCandidate.tierCode} ({selectedCandidate.baseIncrementPct}%)
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Promotion Status</span>
                      <strong className="text-xs font-black text-purple-900">
                        {selectedCandidate.promotionPct > 0 ? `+${selectedCandidate.promotionPct}% Promoted` : "0% (Standard)"}
                      </strong>
                    </div>
                  </div>

                  {/* Columns M to U Detailed Rubric Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {/* Col M */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                        <span>Col M</span>
                        <span className="text-blue-600 font-black">PA</span>
                      </div>
                      <span className="text-[11px] font-bold text-zinc-600 block truncate">Increment (PA)</span>
                      <div className="text-xs font-black font-mono text-slate-900 mt-1">
                        {selectedCandidate.incrementAmountPA !== null ? `₹${Number(selectedCandidate.incrementAmountPA).toLocaleString("en-IN")}` : "-"}
                      </div>
                    </div>

                    {/* Col N & O */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                        <span>Col N & O</span>
                        <span className="text-purple-600 font-black">Promo</span>
                      </div>
                      <span className="text-[11px] font-bold text-zinc-600 block truncate">Promotion Amount</span>
                      <div className="text-xs font-black font-mono text-purple-900 mt-1">
                        {selectedCandidate.promotionAmount !== null ? `₹${Number(selectedCandidate.promotionAmount).toLocaleString("en-IN")}` : "-"}
                        <span className="text-[10px] text-zinc-400 font-sans ml-1">({selectedCandidate.promotionPct}%)</span>
                      </div>
                    </div>

                    {/* Col P */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                        <span>Col P</span>
                        <span className="text-slate-600 font-black">PA</span>
                      </div>
                      <span className="text-[11px] font-bold text-zinc-600 block truncate">Revised Gross (PA)</span>
                      <div className="text-xs font-black font-mono text-slate-900 mt-1">
                        {selectedCandidate.revisedGrossPA !== null ? `₹${Number(selectedCandidate.revisedGrossPA).toLocaleString("en-IN")}` : "-"}
                      </div>
                    </div>

                    {/* Col Q */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                        <span>Col Q</span>
                        <span className="text-indigo-600 font-black">Total %</span>
                      </div>
                      <span className="text-[11px] font-bold text-zinc-600 block truncate">% Increase</span>
                      <div className="text-xs font-black text-indigo-900 mt-1">
                        +{selectedCandidate.pctIncrease}%
                      </div>
                    </div>

                    {/* Col R & S */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                        <span>Col R & S</span>
                        <span className="text-amber-600 font-black">Adjust</span>
                      </div>
                      <span className="text-[11px] font-bold text-zinc-600 block truncate">Adjustment</span>
                      <div className="text-xs font-black font-mono text-zinc-800 mt-1">
                        ₹{Number(selectedCandidate.salaryAdjustmentPM || 0).toLocaleString("en-IN")} PM
                        <span className="text-[9px] text-zinc-400 block font-sans">₹{Number(selectedCandidate.salaryAdjustmentPA || 0).toLocaleString("en-IN")} PA</span>
                      </div>
                    </div>
                  </div>

                  {/* Col T & Col U Summary Highlight */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">Column T: Revised Gross (PM)</span>
                        <div className="text-xl font-black font-mono text-emerald-950 mt-0.5">
                          {selectedCandidate.revisedGrossPM !== null ? `₹${Number(selectedCandidate.revisedGrossPM).toLocaleString("en-IN")}` : "-"}
                          <span className="text-xs text-emerald-700 font-sans ml-1">PM</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200/80 px-2.5 py-1 rounded-full">New Monthly Gross</span>
                    </div>

                    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 rounded-2xl flex items-center justify-between shadow-sm">
                      <div>
                        <span className="text-[10px] font-black text-emerald-200 uppercase tracking-widest block">Column U: INCREMENT AMOUNT</span>
                        <div className="text-xl font-black font-mono text-white mt-0.5">
                          {selectedCandidate.totalIncrementAmount !== null ? `+₹${Number(selectedCandidate.totalIncrementAmount).toLocaleString("en-IN")}` : "-"}
                          <span className="text-xs text-emerald-200 font-sans ml-1">PM</span>
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-bold text-emerald-100">
                        <span>Annual Growth:</span>
                        <div className="font-mono font-black text-sm text-white">
                          +₹{Number(selectedCandidate.totalIncrementAmountPA || 0).toLocaleString("en-IN")} PA
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Final Gross Score Banner */}
                <div className="bg-gradient-to-r from-slate-900 to-[#101b38] text-white p-5 rounded-2xl flex items-center justify-between shadow-lg">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Final Consolidated Gross Mark</span>
                    <div className="text-3xl font-black text-amber-300">{selectedCandidate.grossMark} <span className="text-xs text-zinc-300">/ 100</span></div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Criteria Classification</span>
                    <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${selectedCandidate.tierBadgeColor}`}>
                      {selectedCandidate.tierCode} — {selectedCandidate.tierLabel}
                    </span>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex items-center justify-end">
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#101b38] hover:bg-[#162752] text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Close Scorecard
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Candidate Compensation Progression & Analytics Modal */}
        {selectedAnalyticsCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white rounded-3xl w-full max-w-5xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col my-6 max-h-[92vh]">

              {/* Modal Header */}
              <div className="bg-gradient-to-r from-[#101b38] to-[#1c356e] p-6 text-white flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-1">
                    <TrendingUp size={12} /> Compensation Analytics & Progression
                  </div>
                  <h3 className="text-xl font-black">{selectedAnalyticsCandidate.facultyName}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-zinc-300 flex-wrap">
                    <span className="bg-white/10 px-2 py-0.5 rounded font-mono font-bold text-white">
                      ID: {selectedAnalyticsCandidate.facultyId}
                    </span>
                    <span>•</span>
                    <span>{selectedAnalyticsCandidate.designation}</span>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold">{selectedAnalyticsCandidate.department}</span>
                    {selectedAnalyticsCandidate.institution && (
                      <>
                        <span>•</span>
                        <span className="text-amber-300 font-bold bg-amber-400/10 border border-amber-300/20 px-2 py-0.5 rounded-md">
                          {getSchoolShortName(selectedAnalyticsCandidate.institution)}
                        </span>
                      </>
                    )}
                    {selectedAnalyticsCandidate.dateOfJoining && (
                      <>
                        <span>•</span>
                        <span>Joined: {selectedAnalyticsCandidate.dateOfJoining}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* View Mode Switcher: Monthly (PM) vs Annual (PA) */}
                  <div className="flex items-center bg-white/10 p-1 rounded-xl border border-white/15">
                    <button
                      onClick={() => setAnalyticsSalaryViewMode("PM")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${analyticsSalaryViewMode === "PM"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-zinc-200 hover:text-white"
                        }`}
                    >
                      Monthly (PM)
                    </button>
                    <button
                      onClick={() => setAnalyticsSalaryViewMode("PA")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${analyticsSalaryViewMode === "PA"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-zinc-200 hover:text-white"
                        }`}
                    >
                      Annual (PA)
                    </button>
                  </div>

                  <button
                    onClick={() => setSelectedAnalyticsCandidate(null)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">

                {/* Appraisal Evaluation & Increment Proposal Ribbon */}
                <div className="bg-gradient-to-r from-slate-900 via-[#101b38] to-[#1c356e] text-white p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm border border-slate-700/60">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Institutional Performance</span>
                      <div className="text-2xl font-black text-amber-300">
                        {selectedAnalyticsCandidate.grossMark} <span className="text-xs text-zinc-400">/ 100</span>
                      </div>
                    </div>
                    <div className="h-8 w-px bg-white/15 hidden sm:block" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Evaluated Tier</span>
                      <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${selectedAnalyticsCandidate.tierBadgeColor}`}>
                        {selectedAnalyticsCandidate.tierCode} ({selectedAnalyticsCandidate.tierLabel})
                      </span>
                    </div>
                    <div className="h-8 w-px bg-white/15 hidden sm:block" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Proposed Increment</span>
                      <span className="text-base font-black font-mono text-emerald-400">
                        +{selectedAnalyticsCandidate.totalIncrementPct}%
                      </span>
                      {selectedAnalyticsCandidate.isPromoted && (
                        <span className="text-[10px] text-amber-300 font-bold ml-1.5">(Promoted)</span>
                      )}
                    </div>
                  </div>

                  {selectedAnalyticsCandidate.revisedGrossPM !== null && (
                    <div className="bg-white/10 border border-white/15 px-4 py-2.5 rounded-xl text-right">
                      <span className="text-[10px] uppercase font-bold text-zinc-300 tracking-wider block">
                        Proposed Revised {analyticsSalaryViewMode === "PM" ? "Gross PM" : "Gross PA"}
                      </span>
                      <div className="text-lg font-black font-mono text-emerald-300">
                        ₹{Number(analyticsSalaryViewMode === "PM" ? selectedAnalyticsCandidate.revisedGrossPM : selectedAnalyticsCandidate.revisedGrossPA).toLocaleString("en-IN")}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        +₹{Number(analyticsSalaryViewMode === "PM" ? selectedAnalyticsCandidate.totalIncrementAmount : selectedAnalyticsCandidate.totalIncrementAmountPA).toLocaleString("en-IN")} ({selectedAnalyticsCandidate.totalIncrementPct}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* If data exists */}
                {selectedCandidateAnalyticsData && selectedCandidateAnalyticsData.chartData.length > 0 ? (
                  <>
                    {/* KPI Metric Ribbon */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                      <div className="bg-zinc-50/80 p-4 rounded-2xl border border-zinc-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Current Gross (PM)
                        </span>
                        <p className="text-lg md:text-xl font-black font-mono text-slate-800 mt-1">
                          ₹{Number(selectedCandidateAnalyticsData.currentPM).toLocaleString("en-IN")}
                        </p>
                        <span className="text-[10px] text-zinc-500 font-medium">Monthly baseline compensation</span>
                      </div>

                      <div className="bg-zinc-50/80 p-4 rounded-2xl border border-zinc-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Annualized Gross (PA)
                        </span>
                        <p className="text-lg md:text-xl font-black font-mono text-emerald-800 mt-1">
                          ₹{Number(selectedCandidateAnalyticsData.currentPA).toLocaleString("en-IN")}
                        </p>
                        <span className="text-[10px] text-zinc-500 font-medium">Annual gross outlay</span>
                      </div>

                      <div className="bg-zinc-50/80 p-4 rounded-2xl border border-zinc-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Total Growth (Timeline)
                        </span>
                        <p className="text-lg md:text-xl font-black font-mono text-indigo-700 mt-1 flex items-center gap-1">
                          {selectedCandidateAnalyticsData.totalGrowth >= 0 ? "+" : ""}₹{Number(analyticsSalaryViewMode === "PM" ? selectedCandidateAnalyticsData.totalGrowth : selectedCandidateAnalyticsData.totalGrowth * 12).toLocaleString("en-IN")}
                          <ArrowUpRight size={16} className="text-indigo-600" />
                        </p>
                        <span className="text-[10px] text-zinc-500 font-medium">Over recorded timeline</span>
                      </div>

                      <div className="bg-zinc-50/80 p-4 rounded-2xl border border-zinc-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Overall Increment %
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-lg md:text-xl font-black font-mono text-purple-700">
                            +{selectedCandidateAnalyticsData.totalGrowthPct}%
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                            {selectedCandidateAnalyticsData.chartData.length} Years
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-medium">Cumulative growth</span>
                      </div>
                    </div>

                    {/* Interactive Analytics Dual-Chart Grid: Left (Line Graph) + Right (Bar Chart) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                      {/* Left Card: Historical Compensation Line Graph */}
                      <div className="bg-gradient-to-b from-zinc-50/60 to-white border border-zinc-200/70 rounded-2xl p-4 md:p-6 flex flex-col justify-between shadow-xs">
                        <div>
                          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                              <TrendingUp size={16} className="text-emerald-600" />
                              Historical Compensation ({analyticsSalaryViewMode === "PM" ? "Gross Per Month" : "Gross Per Annum"})
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                              <span className="w-5 h-0.5 bg-emerald-600 inline-block rounded-full" />
                              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block -ml-2" />
                              <span>Salary Trajectory</span>
                            </div>
                          </div>

                          <div className="w-full h-64 md:h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={selectedCandidateAnalyticsData.chartData}
                                margin={{ top: 20, right: 20, left: -5, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="hrPortalSalaryLineGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                                <XAxis
                                  dataKey="year"
                                  tickLine={false}
                                  axisLine={{ stroke: "#e4e4e7" }}
                                  tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                                />
                                <YAxis
                                  tickLine={false}
                                  axisLine={{ stroke: "#e4e4e7" }}
                                  tick={{ fill: "#71717a", fontSize: 10 }}
                                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                                  domain={['auto', 'auto']}
                                />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload || !payload.length) return null;
                                    const d = payload[0].payload;
                                    const displayVal = analyticsSalaryViewMode === "PM" ? d.salaryPM : d.salaryPA;
                                    return (
                                      <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700 space-y-1">
                                        <div className="font-bold text-amber-300 text-[11px] uppercase tracking-wider">{d.year}</div>
                                        <div className="text-sm font-black font-mono">
                                          ₹{Number(displayVal).toLocaleString("en-IN")} {analyticsSalaryViewMode === "PM" ? "PM" : "PA"}
                                        </div>
                                        {d.incrementPM > 0 && (
                                          <div className="text-[10px] text-emerald-400 font-semibold pt-1 border-t border-slate-800">
                                            YoY Increment: +₹{Number(analyticsSalaryViewMode === "PM" ? d.incrementPM : d.incrementPA).toLocaleString("en-IN")} (+{d.growthPct}%)
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey={analyticsSalaryViewMode === "PM" ? "salaryPM" : "salaryPA"}
                                  stroke="#059669"
                                  strokeWidth={3.5}
                                  fillOpacity={1}
                                  fill="url(#hrPortalSalaryLineGrad)"
                                  dot={{ r: 5, fill: "#059669", stroke: "#ffffff", strokeWidth: 2.5 }}
                                  activeDot={{ r: 8, fill: "#047857", stroke: "#ffffff", strokeWidth: 3 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* Right Card: Year-by-Year Increment Growth Rate (%) Bar Chart */}
                      <div className="bg-gradient-to-b from-zinc-50/60 to-white border border-zinc-200/70 rounded-2xl p-4 md:p-6 flex flex-col justify-between shadow-xs">
                        <div>
                          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                              <BarChart3 size={16} className="text-indigo-600" />
                              Year-by-Year Increment Growth Rate (%)
                            </div>
                            <div className="flex items-center gap-2">
                              {Number(selectedCandidateAnalyticsData.avgGrowthPct) > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Avg: +{selectedCandidateAnalyticsData.avgGrowthPct}%
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
                                <span>YoY % Growth</span>
                              </div>
                            </div>
                          </div>

                          <div className="w-full h-64 md:h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={selectedCandidateAnalyticsData.chartData}
                                margin={{ top: 25, right: 20, left: -10, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="hrPortalIncrementBarGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.8} />
                                  </linearGradient>
                                  <linearGradient id="hrPortalIncrementBarGradActive" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                                    <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                                <XAxis
                                  dataKey="year"
                                  tickLine={false}
                                  axisLine={{ stroke: "#e4e4e7" }}
                                  tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                                />
                                <YAxis
                                  tickLine={false}
                                  axisLine={{ stroke: "#e4e4e7" }}
                                  tick={{ fill: "#71717a", fontSize: 10 }}
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
                                        <div className="text-[10px] text-zinc-300 pt-1 border-t border-slate-800">
                                          {d.isBase ? (
                                            <span>Base Gross: ₹{Number(analyticsSalaryViewMode === "PM" ? d.salaryPM : d.salaryPA).toLocaleString("en-IN")} {analyticsSalaryViewMode}</span>
                                          ) : (
                                            <span>
                                              Added Outlay: +₹{Number(analyticsSalaryViewMode === "PM" ? d.incrementPM : d.incrementPA).toLocaleString("en-IN")} {analyticsSalaryViewMode}
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
                                  {selectedCandidateAnalyticsData.chartData.map((entry, index) => (
                                    <Cell
                                      key={`hr-portal-increment-bar-${index}`}
                                      fill={
                                        entry.isBase
                                          ? "#e2e8f0"
                                          : index === selectedCandidateAnalyticsData.chartData.length - 1
                                            ? "url(#hrPortalIncrementBarGradActive)"
                                            : "url(#hrPortalIncrementBarGrad)"
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
                    <div>
                      <div className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-500" />
                        Multi-Year Historical Compensation Progression Cards
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {selectedCandidateAnalyticsData.chartData.map((item, idx) => (
                          <div
                            key={item.rawYear || item.year}
                            className={`p-3.5 rounded-2xl border transition-all ${idx === selectedCandidateAnalyticsData.chartData.length - 1
                              ? "bg-emerald-50/50 border-emerald-200"
                              : "bg-zinc-50/70 border-zinc-200/80"
                              }`}
                          >
                            <div className="flex items-center justify-between text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                              <span>{item.year}</span>
                              {idx === selectedCandidateAnalyticsData.chartData.length - 1 && (
                                <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded text-[9px] font-black">
                                  Active Year
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-black font-mono text-slate-800">
                              ₹{Number(analyticsSalaryViewMode === "PM" ? item.salaryPM : item.salaryPA).toLocaleString("en-IN")}
                              <span className="text-[10px] text-zinc-400 font-semibold ml-1">
                                {analyticsSalaryViewMode === "PM" ? "PM" : "PA"}
                              </span>
                            </div>
                            {idx > 0 && item.incrementPM > 0 && (
                              <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                                <ArrowUpRight size={12} />
                                +₹{Number(analyticsSalaryViewMode === "PM" ? item.incrementPM : item.incrementPA).toLocaleString("en-IN")} ({item.growthPct}%)
                              </div>
                            )}
                            {idx === 0 && (
                              <div className="text-[10px] text-zinc-400 font-medium mt-1">
                                Baseline salary
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-300">
                    <AlertCircle size={36} className="mx-auto text-amber-500 mb-2" />
                    <p className="text-sm font-bold text-slate-700">No Historical Salary Data Recorded</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                      Salary figures have not yet been uploaded for this member ({selectedAnalyticsCandidate.facultyId}). Upload the multi-year Excel template above to visualize their progression timeline and increment graphs.
                    </p>
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={() => {
                    const cand = selectedAnalyticsCandidate;
                    setSelectedAnalyticsCandidate(null);
                    setSelectedCandidate(cand);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border border-slate-300"
                >
                  <Eye size={13} /> View Full Scorecard Breakdown
                </button>
                <button
                  onClick={() => setSelectedAnalyticsCandidate(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#101b38] hover:bg-[#162752] text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Close Analytics
                </button>
              </div>

            </div>
          </div>
        )}

        {/* =========================================================================
            EXECUTIVE INCREMENT & GROSS SALARY VISUALIZATION MODAL (LIGHT MODE)
            Opened by clicking "Increment %" card (Pleasant, Executive, High-Contrast)
           ========================================================================= */}
        {incrementAnalyticsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto animate-fadeIn">
            <div className="bg-white border border-zinc-200/90 rounded-3xl shadow-2xl max-w-7xl xl:max-w-[1420px] w-full max-h-[94vh] flex flex-col text-slate-800 overflow-hidden my-auto">

              {/* Modal Header */}
              <div className="bg-gradient-to-r from-slate-50 via-indigo-50/40 to-emerald-50/30 p-5 sm:p-6 border-b border-zinc-200 flex items-center justify-between gap-4 flex-wrap shrink-0">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                    <Sparkles size={12} className="text-emerald-600 animate-pulse" />
                    Institutional Performance & Outflow Intelligence
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#101b38] tracking-tight flex items-center gap-2">
                    Executive Increment & Outflow Visualizer
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Consolidated visual modeling across <strong className="text-slate-800">{filteredRecords.length} staff</strong> • Academic Year: <strong className="text-emerald-700 font-bold">{selectedYear !== "All" ? selectedYear : "All Years"}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* View Mode Toggle: PA vs PM */}
                  <div className="flex items-center bg-zinc-100 border border-zinc-200 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIncrementModalViewMode("PA")}
                      className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${incrementModalViewMode === "PA"
                        ? "bg-white text-emerald-800 font-black shadow-xs border border-zinc-200/80"
                        : "text-zinc-500 hover:text-zinc-800"
                        }`}
                    >
                      Annual (PA)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncrementModalViewMode("PM")}
                      className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${incrementModalViewMode === "PM"
                        ? "bg-white text-emerald-800 font-black shadow-xs border border-zinc-200/80"
                        : "text-zinc-500 hover:text-zinc-800"
                        }`}
                    >
                      Monthly (PM)
                    </button>
                  </div>

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={() => setIncrementAnalyticsModalOpen(false)}
                    className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 flex items-center justify-center transition-colors cursor-pointer border border-zinc-200"
                    title="Close Visualizer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs text-slate-700">

                {/* Top 4 Quick KPI Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* KPI 1: Current Outflow */}
                  <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4.5 flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Current Gross Outflow</span>
                        <span className="text-[10px] font-black text-slate-700 bg-slate-200/90 px-2 py-0.5 rounded-md font-mono">
                          {incrementModalViewMode}
                        </span>
                      </div>
                      <div className="text-xl sm:text-2xl xl:text-[25px] font-black text-slate-900 font-mono tracking-tight truncate" title={`₹${Number(incrementModalViewMode === "PA" ? tableTotals.grossPATotal : tableTotals.grossPMTotal).toLocaleString("en-IN")}`}>
                        ₹{Number(incrementModalViewMode === "PA" ? tableTotals.grossPATotal : tableTotals.grossPMTotal).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-2 font-medium">
                      Baseline institutional expenditure
                    </div>
                  </div>

                  {/* KPI 2: Revised Outflow */}
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-4.5 flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex items-center justify-between text-indigo-700 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Revised Gross Outflow</span>
                        <span className="text-[10px] font-black text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                          {incrementModalViewMode}
                        </span>
                      </div>
                      <div className="text-xl sm:text-2xl xl:text-[25px] font-black text-indigo-950 font-mono tracking-tight truncate" title={`₹${Number(incrementModalViewMode === "PA" ? tableTotals.revisedGrossPATotal : tableTotals.revisedGrossPMTotal).toLocaleString("en-IN")}`}>
                        ₹{Number(incrementModalViewMode === "PA" ? tableTotals.revisedGrossPATotal : tableTotals.revisedGrossPMTotal).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="text-[11px] text-indigo-600/90 mt-2 font-medium">
                      Projected budget after all increments
                    </div>
                  </div>

                  {/* KPI 3: Net Increment Addition */}
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4.5 flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex items-center justify-between text-emerald-800 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Net Increment Outlay</span>
                        <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md font-mono">
                          {incrementModalViewMode}
                        </span>
                      </div>
                      <div className="text-xl sm:text-2xl xl:text-[25px] font-black text-emerald-950 font-mono tracking-tight truncate" title={`+₹${Number(incrementModalViewMode === "PA" ? tableTotals.totalIncrementPATotal : tableTotals.totalIncrementPMTotal).toLocaleString("en-IN")}`}>
                        +₹{Number(incrementModalViewMode === "PA" ? tableTotals.totalIncrementPATotal : tableTotals.totalIncrementPMTotal).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-2 font-medium">
                      Capital dedicated to staff enhancement
                    </div>
                  </div>

                  {/* KPI 4: Institutional Increment % */}
                  <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-white border-2 border-emerald-400 rounded-2xl p-4.5 flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex items-center justify-between text-emerald-800 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                          <Sparkles size={11} className="text-emerald-600" /> Overall Increment %
                        </span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md uppercase">
                          Overall
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl xl:text-4xl font-black text-emerald-950 font-mono tracking-tight">
                        +{tableTotals.totalPctIncrease}%
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-800 mt-2 font-semibold">
                      Formula: ((Revised - Gross) / Gross) × 100
                    </div>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setIncrementModalTab("tiers")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${incrementModalTab === "tiers"
                      ? "bg-[#101b38] text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
                      }`}
                  >
                    <Award size={13} /> Performance Slabs
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncrementModalTab("composition")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${incrementModalTab === "composition"
                      ? "bg-[#101b38] text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
                      }`}
                  >
                    <Layers size={13} /> Outlay Composition
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncrementModalTab("brackets")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${incrementModalTab === "brackets"
                      ? "bg-[#101b38] text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
                      }`}
                  >
                    <BarChart3 size={13} /> Growth Distribution
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncrementModalTab("top")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${incrementModalTab === "top"
                      ? "bg-[#101b38] text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
                      }`}
                  >
                    <Crown size={13} /> Top Impact & Insights
                  </button>
                </div>

                {/* TAB 1: Performance Slabs */}
                {incrementModalTab === "tiers" && (
                  <div className="space-y-5 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      {overallIncrementAnalytics.tierData.map((tier) => (
                        <div
                          key={tier.tierCode}
                          className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="px-2 py-0.5 rounded-md font-mono text-xs font-black"
                                style={{ backgroundColor: `${tier.color}15`, color: tier.color }}
                              >
                                {tier.tierCode}
                              </span>
                              <span className="text-[11px] font-mono font-bold text-slate-600">
                                {tier.incrementPct}% Slab
                              </span>
                            </div>
                            <div className="font-black text-slate-900 text-xs line-clamp-1">{tier.tierLabel}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Min Score: {tier.minScore}%
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[10px] text-zinc-500">Staff Count:</span>
                              <span className="font-mono font-black text-slate-900 text-sm">{tier.headcount}</span>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-[10px] text-zinc-500">Total Increment:</span>
                              <span className="font-mono font-bold text-emerald-700 text-xs">
                                +₹{Number(incrementModalViewMode === "PA" ? tier.incrementPA : tier.incrementPM).toLocaleString("en-IN")}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-5 shadow-xs">
                      <h4 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2">
                        <Award size={16} className="text-amber-600" />
                        Increment Fund Allocation by Performance Slab ({incrementModalViewMode})
                      </h4>
                      <p className="text-[11px] text-zinc-500 mb-4">
                        Visual distribution of increment expenditure allocated according to institutional appraisal slabs
                      </p>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={overallIncrementAnalytics.tierData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="tierCode" stroke="#475569" fontSize={11} fontWeight={600} tickLine={false} />
                            <YAxis
                              stroke="#475569"
                              fontSize={10}
                              tickFormatter={(val) => `${val}${incrementModalViewMode === "PA" ? "L" : "k"}`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#ffffff",
                                borderColor: "#cbd5e1",
                                borderRadius: "1rem",
                                color: "#0f172a",
                                fontSize: "11px",
                                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)"
                              }}
                              formatter={(val, name, item) => [
                                `+₹${Number(incrementModalViewMode === "PA" ? item.payload.incrementPA : item.payload.incrementPM).toLocaleString("en-IN")} (${item.payload.headcount} staff)`,
                                "Increment Outlay"
                              ]}
                            />
                            <Bar
                              dataKey={incrementModalViewMode === "PA" ? "incrementPA_Lakhs" : "incrementPM_K"}
                              name="Increment Outlay"
                              radius={[8, 8, 0, 0]}
                            >
                              {overallIncrementAnalytics.tierData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Outlay Composition Pillars */}
                {incrementModalTab === "composition" && (
                  <div className="space-y-5 animate-fadeIn">
                    <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-5 shadow-xs">
                      <h4 className="text-sm font-black text-slate-900 mb-1">
                        Increment Outlay Composition (3 Core Pillars)
                      </h4>
                      <p className="text-[11px] text-zinc-500 mb-4">
                        Breakdown of overall budget increase across base score slabs, merit promotion recommendations, and special salary adjustments
                      </p>

                      {/* Stacked Proportional Progress Bar */}
                      <div className="w-full h-5 rounded-full overflow-hidden flex bg-slate-200 border border-slate-300/80 mb-5">
                        {overallIncrementAnalytics.componentData.map((comp) => (
                          <div
                            key={comp.name}
                            style={{ width: `${comp.pctShare}%`, backgroundColor: comp.color }}
                            className="h-full transition-all duration-500 hover:opacity-90 relative group"
                            title={`${comp.name}: ${comp.pctShare}%`}
                          />
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {overallIncrementAnalytics.componentData.map((comp) => (
                          <div
                            key={comp.name}
                            className="bg-white border border-slate-200 rounded-2xl p-4.5 flex flex-col justify-between shadow-xs"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-2 font-black text-slate-900 text-xs">
                                  <span className="w-3 h-3 rounded-md" style={{ backgroundColor: comp.color }} />
                                  {comp.name}
                                </span>
                                <span className="font-mono font-black text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                  {comp.pctShare}%
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-500 leading-relaxed">{comp.desc}</p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                              <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-zinc-500">Total Outlay:</span>
                                <span className="font-mono font-black text-emerald-700 text-sm">
                                  +₹{Number(incrementModalViewMode === "PA" ? comp.amountPA : comp.amountPM).toLocaleString("en-IN")}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-zinc-500">Recipients:</span>
                                <span className="font-mono font-bold text-slate-700 text-xs">
                                  {comp.count} staff
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: Growth Rate Distribution */}
                {incrementModalTab === "brackets" && (
                  <div className="space-y-5 animate-fadeIn">
                    <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-5 shadow-xs">
                      <h4 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                        <BarChart3 size={16} className="text-blue-600" />
                        Faculty Distribution across Growth Brackets (% Increase)
                      </h4>
                      <p className="text-[11px] text-zinc-500 mb-4">
                        Histogram of staff counts grouped by their final salary increase percentage bracket
                      </p>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={overallIncrementAnalytics.brackets} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="range" stroke="#475569" fontSize={11} fontWeight={600} tickLine={false} />
                            <YAxis stroke="#475569" fontSize={10} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#ffffff",
                                borderColor: "#cbd5e1",
                                borderRadius: "1rem",
                                color: "#0f172a",
                                fontSize: "11px",
                                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)"
                              }}
                              formatter={(val, name, item) => [
                                `${val} staff (+₹${Number(incrementModalViewMode === "PA" ? item.payload.incrementPA : item.payload.incrementPA / 12).toLocaleString("en-IN")})`,
                                "Faculty Count"
                              ]}
                            />
                            <Bar dataKey="count" name="Staff Count" radius={[8, 8, 0, 0]}>
                              {overallIncrementAnalytics.brackets.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                      {overallIncrementAnalytics.brackets.map((b) => (
                        <div key={b.range} className="bg-white border border-slate-200 rounded-2xl p-3 text-center shadow-xs">
                          <span className="font-mono text-xs font-black block" style={{ color: b.color }}>
                            {b.range}
                          </span>
                          <span className="text-xl font-black text-slate-900 font-mono mt-1 block">
                            {b.count}
                          </span>
                          <span className="text-[10px] text-zinc-500 block mt-0.5">Faculty</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 5: Top Impact & Insights */}
                {incrementModalTab === "top" && (
                  <div className="space-y-5 animate-fadeIn">
                    <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-5 shadow-xs">
                      <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                        <Crown size={16} className="text-amber-500" />
                        Top Increment Recipients (Highest Annual Capital Additions)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {overallIncrementAnalytics.topIncremented.map((cand, idx) => (
                          <div
                            key={cand.facultyId}
                            className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-mono font-black text-xs flex items-center justify-center">
                                  #{idx + 1}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${cand.tierBadgeColor}`}>
                                  {cand.tierCode}
                                </span>
                              </div>
                              <h5 className="font-black text-slate-900 text-xs">{cand.facultyName}</h5>
                              <p className="text-[10px] text-zinc-500 mt-0.5">
                                {cand.designation} • <strong className="text-slate-700">{cand.department}</strong>
                              </p>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
                              <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-zinc-500">Annual Increment:</span>
                                <span className="font-mono font-black text-emerald-700 text-xs">
                                  +₹{Number(cand.totalIncrementAmountPA).toLocaleString("en-IN")}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-zinc-500">% Increase:</span>
                                <span className="font-mono font-bold text-indigo-900 text-xs">
                                  +{cand.pctIncrease}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Executive Insights Callout */}
                    <div className="bg-gradient-to-r from-indigo-50/80 via-slate-50 to-emerald-50/80 border border-indigo-200 rounded-3xl p-5 shadow-xs">
                      <h4 className="text-sm font-black text-indigo-950 mb-2 flex items-center gap-2">
                        <Sparkles size={16} className="text-indigo-600" />
                        Executive Summary & Key Takeaways
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mt-3">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase">Average Annual Gain per Staff</span>
                          <p className="text-lg font-black text-slate-900 font-mono mt-1">
                            +₹{Math.round(tableTotals.totalIncrementPATotal / (metrics.totalEvaluated || 1)).toLocaleString("en-IN")}
                          </p>
                          <span className="text-[10px] text-emerald-700 font-semibold">per faculty member</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase">Merit Promotions Sanctioned</span>
                          <p className="text-lg font-black text-purple-900 font-mono mt-1">
                            {overallIncrementAnalytics.promotedCount} Faculty
                          </p>
                          <span className="text-[10px] text-purple-700 font-semibold">+{criteriaConfig.promotionPct || 5}% bump applied</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase">Special Adjustments Granted</span>
                          <p className="text-lg font-black text-emerald-900 font-mono mt-1">
                            {overallIncrementAnalytics.adjustedCount} Staff
                          </p>
                          <span className="text-[10px] text-zinc-500">discretionary compensation bumps</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-wrap gap-3 shrink-0">
                <div className="text-[11px] font-mono text-slate-600 flex items-center gap-2">
                  <span className="text-emerald-700 font-bold">Calculation Formula:</span>
                  <span>((Revised PA Total - Gross PA Total) / Gross PA Total) × 100 = <strong className="text-slate-900">+{tableTotals.totalPctIncrease}%</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncrementAnalyticsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-[#101b38] hover:bg-[#162752] text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  Close Visualizer
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Modal: Edit Institutional Revenue & HR Cost */}
        {revenueModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="bg-[#101b38] text-white p-5 flex items-center justify-between border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-amber-300">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">Institutional Revenue &amp; HR Budget</h3>
                    <p className="text-xs text-slate-300 font-medium">Configure Revenue, HR Cost, &amp; Faculty counts per Institution</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRevenueModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs">
                {/* Institution Selector / Locked Institution Banner */}
                {isSuperAdmin ? (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                      Select Target Institution
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {INSTITUTION_OPTIONS.map((inst) => {
                        const isSelected = revenueTargetInst === inst.code;
                        return (
                          <button
                            key={inst.code}
                            type="button"
                            onClick={() => handleSwitchRevenueInst(inst.code)}
                            className={`px-3 py-2.5 rounded-xl font-bold text-xs transition-all border cursor-pointer text-left flex flex-col justify-between ${isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                          >
                            <span className="font-black text-sm uppercase">{inst.code}</span>
                            <span className={`text-[10px] truncate ${isSelected ? "text-indigo-100" : "text-slate-500"}`}>
                              {inst.name.replace(/^CK[A-Z]+\s*\(/, "").replace(/\)$/, "")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3.5 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs uppercase shadow-xs">
                        {revenueTargetInst || "INST"}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Assigned Institution</span>
                        <p className="text-xs font-black text-indigo-950">
                          {INSTITUTION_OPTIONS.find((i) => i.code === revenueTargetInst)?.name || getSchoolShortName(userInstitution) || revenueTargetInst.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                      Institution Access Only
                    </span>
                  </div>
                )}

                {/* Academic Year 2025-26 Form Card */}
                <div className={`p-4 rounded-2xl border transition-all ${revenueModalTargetYear === "y2025_26" || revenueModalTargetYear === "all"
                  ? "bg-white border-indigo-200 shadow-xs"
                  : "bg-slate-50/70 border-slate-200 opacity-80"
                  }`}>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Academic Year 2025-26
                      </h4>
                    </div>
                    {Number(revenueForm.y2025_26?.totalRevenue) > 0 && (
                      <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                        HR Cost Share: {((Number(revenueForm.y2025_26.annualHrCost || 0) / Number(revenueForm.y2025_26.totalRevenue || 1)) * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Total Faculty
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={revenueForm.y2025_26?.totalFaculty ?? ""}
                        onChange={(e) => setRevenueForm((prev) => ({
                          ...prev,
                          y2025_26: { ...prev.y2025_26, totalFaculty: e.target.value }
                        }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                        placeholder="e.g. 134"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Total Revenue (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={revenueForm.y2025_26?.totalRevenue ?? ""}
                        onChange={(e) => setRevenueForm((prev) => ({
                          ...prev,
                          y2025_26: { ...prev.y2025_26, totalRevenue: e.target.value }
                        }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                        placeholder="e.g. 127524311"
                      />
                      <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                        Preview: ₹{Number(revenueForm.y2025_26?.totalRevenue || 0).toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Annual HR Cost (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={revenueForm.y2025_26?.annualHrCost ?? ""}
                        onChange={(e) => setRevenueForm((prev) => ({
                          ...prev,
                          y2025_26: { ...prev.y2025_26, annualHrCost: e.target.value }
                        }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                        placeholder="e.g. 62287163"
                      />
                      <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                        Preview: ₹{Number(revenueForm.y2025_26?.annualHrCost || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Academic Year 2026-27 Form Card */}
                <div className={`p-4 rounded-2xl border transition-all ${revenueModalTargetYear === "y2026_27" || revenueModalTargetYear === "all"
                  ? "bg-white border-emerald-200 shadow-xs"
                  : "bg-slate-50/70 border-slate-200 opacity-80"
                  }`}>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Academic Year 2026-27
                      </h4>
                    </div>
                    {Number(revenueForm.y2026_27?.totalRevenue) > 0 && (
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        HR Cost Share: {((Number(revenueForm.y2026_27.annualHrCost || 0) / Number(revenueForm.y2026_27.totalRevenue || 1)) * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Total Faculty
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={revenueForm.y2026_27?.totalFaculty ?? ""}
                        onChange={(e) => setRevenueForm((prev) => ({
                          ...prev,
                          y2026_27: { ...prev.y2026_27, totalFaculty: e.target.value }
                        }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                        placeholder="e.g. 147"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Total Revenue (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={revenueForm.y2026_27?.totalRevenue ?? ""}
                        onChange={(e) => setRevenueForm((prev) => ({
                          ...prev,
                          y2026_27: { ...prev.y2026_27, totalRevenue: e.target.value }
                        }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                        placeholder="e.g. 157438900"
                      />
                      <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                        Preview: ₹{Number(revenueForm.y2026_27?.totalRevenue || 0).toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Annual HR Cost (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={revenueForm.y2026_27?.annualHrCost ?? ""}
                        onChange={(e) => setRevenueForm((prev) => ({
                          ...prev,
                          y2026_27: { ...prev.y2026_27, annualHrCost: e.target.value }
                        }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                        placeholder="e.g. 73073231"
                      />
                      <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                        Preview: ₹{Number(revenueForm.y2026_27?.annualHrCost || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] flex items-center gap-2">
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                  <span>
                    Values are saved under <strong className="font-mono">appraisal_config/institution_revenue_analytics</strong> for institution <strong className="uppercase font-bold">{revenueTargetInst}</strong> and dynamically update across all dashboards.
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setRevenueModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingRevenue}
                  onClick={handleSaveRevenueConfig}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingRevenue ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Saving Values...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save for {revenueTargetInst.toUpperCase()}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </HRLayout>
  );
}
