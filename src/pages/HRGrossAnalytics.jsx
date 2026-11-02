import React, { useState, useEffect, useMemo, useRef } from "react";
import Layout from "../components/Layout";
import { db, auth } from "../firebase";
import { collection, doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from "xlsx";
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
  EyeOff,
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
  Lock,
  Crown,
  Building2,
  Pencil,
  Landmark
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Legend,
  ReferenceLine
} from "recharts";

// Institutional Revenue & Expenditure Baseline Configuration per Academic Year
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

// Comparative Salary Structure Benchmark Data across Colleges
export const BENCHMARK_SALARY_DATA = [
  {
    id: "anna_univ",
    name: "Anna University",
    shortName: "Anna Univ",
    subName: "(19 Colleges)",
    region: "Govt / State Univ",
    location: "Tamil Nadu",
    isGovt: true,
    isCkcet: false,
    assistantProfessor: { min: 95820, max: 95820, avg: 95820, display: "₹95,820", rawText: "95,820" },
    associateProfessor: { min: 213740, max: 213740, avg: 213740, display: "₹2,13,740", rawText: "2,13,740" },
    professor: { min: 234220, max: 234220, avg: 234220, display: "₹2,34,220", rawText: "2,34,220" },
  },
  {
    id: "st_joseph",
    name: "St.Joseph",
    shortName: "St.Joseph",
    subName: "(Chennai)",
    region: "Chennai Metro",
    location: "Chennai",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 35000, max: 35000, avg: 35000, display: "₹35,000", rawText: "35,000 (first year)", note: "first year" },
    associateProfessor: { min: 85000, max: 85000, avg: 85000, display: "₹85,000", rawText: "85,000" },
    professor: { min: 140000, max: 140000, avg: 140000, display: "₹1,40,000", rawText: "1,40,000" },
  },
  {
    id: "aiht",
    name: "AIHT",
    shortName: "AIHT",
    subName: "(Chennai)",
    region: "Chennai Metro",
    location: "Chennai",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 25000, max: 30000, avg: 27500, display: "₹25,000 - ₹30,000", rawText: "25,000 - 30,000" },
    associateProfessor: { min: 65000, max: 75000, avg: 70000, display: "₹65,000 - ₹75,000", rawText: "65,000 - 75,000" },
    professor: { min: 100000, max: 100000, avg: 100000, display: "₹1,00,000", rawText: "1,00,000" },
  },
  {
    id: "psgitech_sk",
    name: "PSGiTech / Sri Krishna",
    shortName: "PSG / Sri Krishna",
    subName: "(Coimbatore)",
    region: "Coimbatore Tier-1",
    location: "Coimbatore",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 35000, max: 40000, avg: 37500, display: "₹35,000 - ₹40,000", rawText: "35000-40000" },
    associateProfessor: { min: 70000, max: 85000, avg: 77500, display: "₹70,000 - ₹85,000", rawText: "70000-85000" },
    professor: { min: 90000, max: 120000, avg: 105000, display: "₹90,000 - ₹1,20,000", rawText: "90000-1.2 Lakh" },
  },
  {
    id: "saranathan",
    name: "Saranathan",
    shortName: "Saranathan",
    subName: "(Trichy)",
    region: "Central Tamil Nadu",
    location: "Trichy",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 28000, max: 28000, avg: 28000, display: "₹28,000", rawText: "28,000" },
    associateProfessor: { min: 65000, max: 65000, avg: 65000, display: "₹65,000", rawText: "65,000" },
    professor: { min: 80000, max: 80000, avg: 80000, display: "₹80,000", rawText: "80,000" },
  },
  {
    id: "ramco",
    name: "RAMCO Institute",
    shortName: "RAMCO",
    subName: "(Rajapalayam)",
    region: "South TN Tier-1",
    location: "Rajapalayam",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 46400, max: 46400, avg: 46400, display: "₹46,400", rawText: "46,400" },
    associateProfessor: { min: 66000, max: 66000, avg: 66000, display: "₹66,000", rawText: "66,000" },
    professor: { min: 80000, max: 80000, avg: 80000, display: "₹80,000", rawText: "80,000" },
  },
  {
    id: "syed_ammal",
    name: "Syed Ammal Engg College",
    shortName: "Syed Ammal",
    subName: "(Ramnad)",
    region: "South Coastal",
    location: "Ramanathapuram",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 22000, max: 22000, avg: 22000, display: "₹22,000", rawText: "22,000" },
    associateProfessor: { min: 50000, max: 50000, avg: 50000, display: "₹50,000", rawText: "50,000" },
    professor: { min: 75000, max: 75000, avg: 75000, display: "₹75,000", rawText: "75,000" },
  },
  {
    id: "manakula",
    name: "MANAKULA",
    shortName: "Manakula",
    subName: "(Pondy)",
    region: "Puducherry / Coastal",
    location: "Puducherry",
    isGovt: false,
    isCkcet: false,
    assistantProfessor: { min: 27000, max: 27000, avg: 27000, display: "₹27,000", rawText: "27,000" },
    associateProfessor: { min: 60000, max: 60000, avg: 60000, display: "₹60,000", rawText: "60,000" },
    professor: { min: 80000, max: 80000, avg: 80000, display: "₹80,000", rawText: "80,000" },
  },
  {
    id: "ckcet",
    name: "CKCET (Revised)",
    shortName: "CKCET",
    subName: "(Our College)",
    region: "Cuddalore / Our College",
    location: "Cuddalore",
    isGovt: false,
    isCkcet: true,
    assistantProfessor: { min: 30000, max: 30000, avg: 30000, display: "₹30,000", rawText: "30,000" },
    associateProfessor: { min: 65000, max: 65000, avg: 65000, display: "₹65,000", rawText: "65,000" },
    professor: { min: 80000, max: 80000, avg: 80000, display: "₹80,000", rawText: "80,000" },
  }
];

export const GROSS_ANALYTICS_COLUMNS = [
  { id: "facultyId", label: "ID", category: "Staff Info" },
  { id: "facultyName", label: "Faculty Member", category: "Staff Info" },
  { id: "designation", label: "Designation & Dept", category: "Staff Info" },
  { id: "dateOfJoining", label: "DOJ", category: "Staff Info" },
  { id: "grossPM", label: "Gross PM", category: "Current Salary" },
  { id: "grossPA", label: "Gross PA", category: "Current Salary" },
  { id: "appraisalMark", label: "Appraisal (60%)", category: "Performance" },
  { id: "attitudeMark", label: "Attitude (40%)", category: "Performance" },
  { id: "grossMark", label: "Score (100)", category: "Performance" },
  { id: "criteriaSlab", label: "Criteria Slab", category: "Performance" },
  { id: "promotionPct", label: "Promotion %", category: "Increment & Adjustments" },
  { id: "promotionAmount", label: "Promotion Amount", category: "Increment & Adjustments" },
  { id: "pctIncrease", label: "% Increase", category: "Increment & Adjustments" },
  { id: "salaryAdjustmentPM", label: "Salary Adjustment (PM)", category: "Increment & Adjustments" },
  { id: "salaryAdjustmentPA", label: "Salary Adjustment (PA)", category: "Increment & Adjustments" },
  { id: "revisedGrossPM", label: "Revised Gross (PM)", category: "Revised Package" },
  { id: "revisedGrossPA", label: "Revised Gross (PA)", category: "Revised Package" },
  { id: "totalIncrementAmount", label: "Increment Amount (PM)", category: "Revised Package" },
  { id: "totalIncrementAmountPA", label: "Increment Amount (PA)", category: "Revised Package" },
  { id: "actions", label: "Actions", category: "Actions" }
];

export default function HRGrossAnalytics() {
  const [facultyAppraisals, setFacultyAppraisals] = useState([]);
  const [nonTeachingAppraisals, setNonTeachingAppraisals] = useState([]);
  const [hodAppraisals, setHodAppraisals] = useState([]);
  const [principalAppraisals, setPrincipalAppraisals] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [salariesMap, setSalariesMap] = useState({});
  const [promotionsMap, setPromotionsMap] = useState({});
  const [salaryAdjustmentsMap, setSalaryAdjustmentsMap] = useState({});
  const [adjustmentInputs, setAdjustmentInputs] = useState({});
  const [criteriaConfig, setCriteriaConfig] = useState(DEFAULT_INCREMENT_CRITERIA);
  const [loading, setLoading] = useState(true);

  // Column Visibility State
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem("hr_gross_analytics_hidden_columns");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("hr_gross_analytics_hidden_columns", JSON.stringify(hiddenColumns));
    } catch (e) {
      // ignore
    }
  }, [hiddenColumns]);

  const toggleColumn = (colId) => {
    setHiddenColumns((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    );
  };

  const showAllColumns = () => {
    setHiddenColumns([]);
  };

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

  // Market Salary Benchmark State
  const [benchmarkRole, setBenchmarkRole] = useState("all"); // "all", "assistantProfessor", "associateProfessor", "professor"
  const [benchmarkView, setBenchmarkView] = useState("chart"); // "chart", "variance", "table"
  const [benchmarkTableOrientation, setBenchmarkTableOrientation] = useState("exactImage"); // "exactImage", "detailed"
  const [benchmarkSort, setBenchmarkSort] = useState("default"); // "default", "salaryDesc", "salaryAsc"
  const [includeAnnaUniv, setIncludeAnnaUniv] = useState(false);
  const [benchmarkExpanded, setBenchmarkExpanded] = useState(true);

  // User Auth & Institution State
  const [currentUser, setCurrentUser] = useState(auth?.currentUser || null);
  const [userRole, setUserRole] = useState("");
  const [userInstitution, setUserInstitution] = useState("");

  const isSuperAdmin = (currentUser?.email === "obe@ckcet.edu.in" || userRole === "Admin" || userRole === "Super Admin") && (!userInstitution || userInstitution === "ALL");

  const activeInstCode = useMemo(() => {
    const raw = userInstitution || "";
    const s = String(raw).trim().toUpperCase();
    if (s.includes("CKSPK") || s.includes("PRACTICAL")) return "ckspk";
    if (s.includes("CKSPE") || s.includes("PROGRESSIVE")) return "ckspe";
    if (s.includes("CKCOE") || s.includes("B.ED") || s.includes("BED")) return "ckcoe";
    return "ckcet";
  }, [userInstitution]);

  // Institutional Revenue & Budget State (Editable per institution)
  const [revenueAnalyticsMap, setRevenueAnalyticsMap] = useState({});
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [revenueModalTargetYear, setRevenueModalTargetYear] = useState("all");
  const [revenueTargetInst, setRevenueTargetInst] = useState("ckcet");
  const [revenueForm, setRevenueForm] = useState({
    y2025_26: { totalFaculty: 134, totalRevenue: 127524311, annualHrCost: 62287163 },
    y2026_27: { totalFaculty: 147, totalRevenue: 157438900, annualHrCost: 73073231 }
  });
  const [savingRevenue, setSavingRevenue] = useState(false);

  // Toast Notification State
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const fileInputRef = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Helper: Normalize ID for comparison (strips all leading/trailing quotes like ''1783, '1783 -> 1783)
  const normalizeId = (id) => String(id || "").replace(/^['"`]+|['"`]+$/g, "").trim().toUpperCase().replace(/\s+/g, "");

  // Real-time Firestore Listeners
  useEffect(() => {
    let unsubs = [];

    // 0. User Auth & Institution Listener
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          let localProfile = null;
          try {
            const localStr = localStorage.getItem(`user_profile_${user.uid}`);
            if (localStr) localProfile = JSON.parse(localStr);
          } catch (e) { }

          const data = userDoc.exists() ? userDoc.data() : localProfile;
          if (data) {
            setUserRole(data.role || "");
            setUserInstitution(data.institution || "");
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      }
    });
    unsubs.push(unsubAuth);

    // 1. Fetch Users collection for ID and DOJ enrichment
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const uMap = {};
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email) uMap[data.email.toLowerCase()] = { id: docSnap.id, ...data };
        if (data.uid) uMap[data.uid] = { id: docSnap.id, ...data };
      });
      setUsersMap(uMap);
    }, (err) => console.error("Error loading users:", err));
    unsubs.push(unsubUsers);

    // 2. Fetch Gross Salaries (Persisted from Excel/CSV Uploads)
    const unsubSalaries = onSnapshot(doc(db, "appraisal_config", "gross_salaries"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSalariesMap(data.salaries || {});
      } else {
        setSalariesMap({});
      }
    }, (err) => console.error("Error loading salaries config:", err));
    unsubs.push(unsubSalaries);

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
    const rawList = [...facultyAppraisals, ...nonTeachingAppraisals, ...hodAppraisals, ...principalAppraisals];

    return rawList.map((app) => {
      // Find matching user from usersMap
      const userByEmail = app.facultyEmail ? usersMap[app.facultyEmail.toLowerCase()] : null;
      const userByUid = app.uid ? usersMap[app.uid] : null;
      const matchedUser = userByUid || userByEmail || {};

      // ID resolution (Sanitized strictly without quotes)
      const rawFacultyId = (
        app.facultyId ||
        app.staffId ||
        app.employeeId ||
        app.facultyEmpId ||
        matchedUser.facultyId ||
        matchedUser.staffId ||
        app.formData?.facultyId ||
        app.formData?.staffId ||
        app.formData?.employeeId ||
        (app.uid ? app.uid.slice(0, 8).toUpperCase() : app.id.slice(0, 8).toUpperCase())
      );
      const facultyId = String(rawFacultyId || "").replace(/^['"`]+|['"`]+$/g, "").trim();

      // Lookup Gross PM salary from salariesMap (supports legacy number and new time-series object)
      const normId = normalizeId(facultyId);
      const normUid = normalizeId(app.uid);
      const normEmail = normalizeId(app.facultyEmail);
      const rawSalaryEntry = (
        salariesMap[normId] ??
        salariesMap[facultyId] ??
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
        matchedUser.department ||
        (isPrincipal ? "Administration" : "General")
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
      // The Principal's explicit Final Rating entered in AppraisalReviews.jsx takes highest priority
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
        // Principal's entered Final Rating (e.g. 85 in AppraisalReviews.jsx)
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

      // 2. Attitude Form Mark (Only if submitted/evaluated)
      const isAttitudeSubmitted = Boolean(
        app.attitudeSubmittedToPrincipal === true ||
        (app.attitudeEvaluation?.submittedToPrincipal === true && app.attitudeEvaluation?.isDraft !== true) ||
        (app.attitudeEvaluation?.totalScore !== undefined && Number(app.attitudeEvaluation?.totalScore) > 0 && app.attitudeEvaluation?.isDraft !== true && !app.attitudeDraft) ||
        (app.attitudeForm?.totalScore !== undefined && Number(app.attitudeForm?.totalScore) > 0 && app.attitudeForm?.isDraft !== true && !app.attitudeDraft)
      );
      const attitudeObj = isAttitudeSubmitted ? (app.attitudeEvaluation || app.attitudeForm || {}) : {};
      let attitudeTotalScore = Number(attitudeObj.totalScore) || 0;
      if (attitudeTotalScore === 0 && attitudeObj.ratings) {
        const ratingVals = Object.values(attitudeObj.ratings);
        if (ratingVals.length > 0) {
          attitudeTotalScore = ratingVals.reduce((sum, v) => sum + (Number(v) || 0), 0);
        }
      }
      const attitudeMaxScore = Number(attitudeObj.maxScore) || (attitudeObj.totalQuestions ? attitudeObj.totalQuestions * 5 : (app.formType === "hod" ? 90 : 80));
      const attitudePercentage = attitudeMaxScore > 0 ? (attitudeTotalScore / attitudeMaxScore) * 100 : 0;
      const attitudeMarkNormalized = isAttitudeSubmitted
        ? (attitudeObj.percentage !== undefined && !isNaN(Number(attitudeObj.percentage))
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

      // Col Q: % Increase = Total Increment (PA) / Gross PA * 100 (reflects base increment, promotion, and salary adjustment)
      const pctIncrease = (grossPA !== null && grossPA > 0 && revisedGrossPA !== null)
        ? Number((((revisedGrossPA - grossPA) / grossPA) * 100).toFixed(2))
        : (baseIncrementPct + promotionPct);

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
        id: app.id,
        rawApp: app,
        facultyId,
        facultyName,
        email: app.facultyEmail || matchedUser.email || "",
        designation,
        department,
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
  }, [facultyAppraisals, nonTeachingAppraisals, hodAppraisals, principalAppraisals, usersMap, salariesMap, criteriaConfig, promotionsMap, salaryAdjustmentsMap]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      // Department Filter
      if (selectedDept !== "All" && rec.department !== selectedDept) {
        return false;
      }

      // Type Filter
      if (selectedType !== "All") {
        if (selectedType === "Faculty" && rec.collectionType !== "faculty") return false;
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
  }, [allRecords, approvalFilter, selectedDept, selectedType, selectedYear, searchTerm, sortField, sortDirection]);

  // Departments & Academic Years list
  const departmentsList = useMemo(() => {
    const set = new Set(allRecords.map((r) => r.department).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [allRecords]);

  const academicYearsList = useMemo(() => {
    const set = new Set(allRecords.map((r) => r.academicYear).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [allRecords]);

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

    // Formula requested: ((revised pa total - Gross Pa total) / Gross Pa total) * 100
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

  // Selected Institution Revenue & Budget Configuration
  const currentInstRevenue = useMemo(() => {
    const myCode = activeInstCode || "ckcet";
    const code = (!isSuperAdmin && myCode ? myCode : (revenueTargetInst || activeInstCode || "ckcet")).toLowerCase();
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
  }, [revenueAnalyticsMap, revenueTargetInst, activeInstCode, isSuperAdmin, metrics.totalEvaluated]);

  const hrCostPct2025_26 = currentInstRevenue.y2025_26.totalRevenue > 0
    ? ((currentInstRevenue.y2025_26.annualHrCost / currentInstRevenue.y2025_26.totalRevenue) * 100).toFixed(2)
    : "0.00";

  const hrCostPct2026_27 = currentInstRevenue.y2026_27.totalRevenue > 0
    ? ((currentInstRevenue.y2026_27.annualHrCost / currentInstRevenue.y2026_27.totalRevenue) * 100).toFixed(2)
    : "0.00";

  // Modal open / switch / save handlers for Institutional Revenue
  const handleOpenRevenueModal = (targetYear = "all") => {
    const myCode = activeInstCode || "ckcet";
    const code = (!isSuperAdmin && myCode ? myCode : (revenueTargetInst || activeInstCode || "ckcet")).toLowerCase();
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
    if (!isSuperAdmin) return;
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
    const myCode = activeInstCode || "ckcet";
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

    // Target faculty list
    const targetList = filteredRecords.length > 0 ? filteredRecords : allRecords;

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

            // Match against current records
            const matched = allRecords.find((r) => {
              const rNorm = normalizeId(r.facultyId);
              return rNorm === norm || r.facultyId === cleanedId || r.facultyId === rawId;
            });

            parsed.push({
              rawId,
              cleanedId,
              normalizedId: norm,
              facultyName: matched ? matched.facultyName : "Unknown / Unmatched",
              department: matched ? matched.department : "-",
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

  // 3. Confirm and Save Multi-Year Salaries to Firestore
  const handleConfirmSaveSalaries = async () => {
    if (parsedPreviewList.length === 0) return;
    setUploadSaving(true);

    try {
      const updatedSalaries = { ...salariesMap };

      parsedPreviewList.forEach((item) => {
        const payload = {
          current: item.grossPM,
          history: item.history || {},
          updatedAt: new Date().toISOString()
        };
        if (item.normalizedId) {
          updatedSalaries[item.normalizedId] = payload;
        }
        if (item.cleanedId) {
          updatedSalaries[item.cleanedId] = payload;
        }
      });

      await setDoc(doc(db, "appraisal_config", "gross_salaries"), {
        salaries: updatedSalaries,
        historicalYears: uploadDetectedYears.length > 0 ? uploadDetectedYears : ["Current"],
        updatedAt: new Date().toISOString(),
        totalUpdated: parsedPreviewList.length
      }, { merge: true });

      setSalariesMap(updatedSalaries);
      setUploadModalOpen(false);
      setParsedPreviewList([]);
      showToast(`Successfully updated multi-year Gross PM for ${parsedPreviewList.length} faculty entries!`, "success");
    } catch (err) {
      console.error("Error saving salaries:", err);
      showToast("Failed to save salaries to database.", "error");
    } finally {
      setUploadSaving(false);
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

  // Market Pay Benchmark Calculations
  const benchmarkChartData = useMemo(() => {
    const list = BENCHMARK_SALARY_DATA.filter(c => includeAnnaUniv || !c.isGovt);
    const roleKey = benchmarkRole === "all" ? "assistantProfessor" : benchmarkRole;
    const ckcetItem = BENCHMARK_SALARY_DATA.find(c => c.isCkcet);
    const ckcetVal = ckcetItem ? (ckcetItem[roleKey]?.avg || 0) : 0;

    let mapped = list.map(c => {
      const salary = c[roleKey]?.avg || 0;
      const diffFromCkcet = salary - ckcetVal; // Positive if peer > CKCET, negative if peer < CKCET
      const ckcetAdvantage = ckcetVal - salary; // Positive if CKCET pays more than peer
      let loc = "";
      if (c.isCkcet) {
        loc = "Cuddalore";
      } else if (c.id === "anna_univ") {
        loc = "19 Colleges";
      } else if (c.subName) {
        loc = c.subName.replace(/[()]/g, "").trim();
      } else if (c.location) {
        loc = c.location;
      }
      const shortNameWithLocation = loc ? `${c.shortName} (${loc})` : c.shortName;

      return {
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        shortNameWithLocation,
        subName: c.subName,
        location: c.location,
        locationDisplay: loc,
        region: c.region,
        isGovt: c.isGovt,
        isCkcet: c.isCkcet,
        asstProf: c.assistantProfessor.avg,
        assocProf: c.associateProfessor.avg,
        prof: c.professor.avg,
        salary,
        diffFromCkcet,
        ckcetAdvantage,
        rawText: c[roleKey]?.rawText || "",
        display: c[roleKey]?.display || ""
      };
    });

    if (benchmarkSort === "salaryDesc" && benchmarkRole !== "all") {
      mapped.sort((a, b) => b.salary - a.salary);
    } else if (benchmarkSort === "salaryAsc" && benchmarkRole !== "all") {
      mapped.sort((a, b) => a.salary - b.salary);
    }

    return mapped;
  }, [includeAnnaUniv, benchmarkRole, benchmarkSort]);

  // Executive Top 3 Role KPI Summaries (Independent of role tab selection)
  const benchmarkSummary = useMemo(() => {
    const calcRole = (roleKey, roleName) => {
      const ckcetItem = BENCHMARK_SALARY_DATA.find(c => c.isCkcet);
      const ckcetVal = ckcetItem ? (ckcetItem[roleKey]?.avg || 0) : 0;
      const privatePeers = BENCHMARK_SALARY_DATA.filter(c => !c.isGovt && !c.isCkcet);

      const avgPeerSalary = Math.round(privatePeers.reduce((s, c) => s + (c[roleKey]?.avg || 0), 0) / privatePeers.length);
      const lowerCount = privatePeers.filter(c => (c[roleKey]?.avg || 0) < ckcetVal).length;
      const parityCount = privatePeers.filter(c => (c[roleKey]?.avg || 0) === ckcetVal).length;
      const higherCount = privatePeers.filter(c => (c[roleKey]?.avg || 0) > ckcetVal).length;
      const minSalary = Math.min(...privatePeers.map(c => c[roleKey]?.avg || 0));
      const maxSalary = Math.max(...privatePeers.map(c => c[roleKey]?.avg || 0));

      const rank = privatePeers.filter(c => (c[roleKey]?.avg || 0) > ckcetVal).length + 1;

      const diffFromAvg = ckcetVal - avgPeerSalary;
      const diffFromAvgPct = avgPeerSalary > 0 ? (((ckcetVal - avgPeerSalary) / avgPeerSalary) * 100).toFixed(1) : "0";

      return {
        roleKey,
        roleName,
        ckcetVal,
        ckcetDisplay: ckcetItem ? ckcetItem[roleKey]?.display : "₹0",
        annualLakh: ((ckcetVal * 12) / 100000).toFixed(2),
        avgPeerSalary,
        lowerCount,
        parityCount,
        higherCount,
        minSalary,
        maxSalary,
        rank,
        totalPeers: privatePeers.length,
        diffFromAvg,
        diffFromAvgPct
      };
    };

    return {
      assistantProfessor: calcRole("assistantProfessor", "Assistant Professor"),
      associateProfessor: calcRole("associateProfessor", "Associate Professor"),
      professor: calcRole("professor", "Professor")
    };
  }, []);

  const benchmarkRoleMetrics = useMemo(() => {
    const roleKey = benchmarkRole === "all" ? "assistantProfessor" : benchmarkRole;
    const ckcetItem = BENCHMARK_SALARY_DATA.find(c => c.isCkcet);
    const ckcetVal = ckcetItem ? ckcetItem[roleKey]?.avg : 0;
    const privatePeers = BENCHMARK_SALARY_DATA.filter(c => !c.isGovt);
    const otherPrivate = privatePeers.filter(c => !c.isCkcet);

    const avgPeerSalary = Math.round(otherPrivate.reduce((sum, c) => sum + (c[roleKey]?.avg || 0), 0) / otherPrivate.length);
    const sortedSalaries = [...otherPrivate].map(c => c[roleKey]?.avg || 0).sort((a, b) => a - b);
    const medianPeerSalary = sortedSalaries[Math.floor(sortedSalaries.length / 2)];

    const lowerThanCkcet = otherPrivate.filter(c => (c[roleKey]?.avg || 0) < ckcetVal);
    const parityWithCkcet = otherPrivate.filter(c => (c[roleKey]?.avg || 0) === ckcetVal);
    const higherThanCkcet = otherPrivate.filter(c => (c[roleKey]?.avg || 0) > ckcetVal);

    const saranathan = otherPrivate.find(c => c.id === "saranathan");
    const manakula = otherPrivate.find(c => c.id === "manakula");
    const ramco = otherPrivate.find(c => c.id === "ramco");
    const syedAmmal = otherPrivate.find(c => c.id === "syed_ammal");

    const roleName = benchmarkRole === "associateProfessor"
      ? "Associate Professor"
      : benchmarkRole === "professor"
        ? "Professor"
        : "Assistant Professor";

    return {
      roleKey,
      roleName,
      ckcetVal,
      ckcetDisplay: ckcetItem ? ckcetItem[roleKey]?.display : "₹0",
      avgPeerSalary,
      medianPeerSalary,
      lowerCount: lowerThanCkcet.length,
      parityCount: parityWithCkcet.length,
      higherCount: higherThanCkcet.length,
      diffFromAvg: ckcetVal - avgPeerSalary,
      diffFromAvgPct: avgPeerSalary > 0 ? (((ckcetVal - avgPeerSalary) / avgPeerSalary) * 100).toFixed(1) : "0",
      saranathanDiff: saranathan ? ckcetVal - saranathan[roleKey]?.avg : 0,
      manakulaDiff: manakula ? ckcetVal - manakula[roleKey]?.avg : 0,
      ramcoDiff: ramco ? ckcetVal - ramco[roleKey]?.avg : 0,
      syedAmmalDiff: syedAmmal ? ckcetVal - syedAmmal[roleKey]?.avg : 0,
    };
  }, [benchmarkRole]);

  // Custom Glassmorphic Tooltip for Market Salary Benchmark
  const BenchmarkCustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const roleKey = benchmarkRole === "all" ? "assistantProfessor" : benchmarkRole;
      const ckcetData = BENCHMARK_SALARY_DATA.find(c => c.isCkcet);
      const ckcetVal = ckcetData ? ckcetData[roleKey]?.avg : 0;
      const currentVal = item[roleKey]?.avg || 0;
      const diff = currentVal - ckcetVal;
      const pctDiff = ckcetVal > 0 ? ((diff / ckcetVal) * 100).toFixed(1) : "0";

      return (
        <div className="bg-slate-900/95 text-white backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/10 text-xs min-w-[240px]">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2">
            <div>
              <div className="font-black text-sm text-white flex items-center gap-1.5">
                {item.name}
                {item.isCkcet && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-500 text-white">
                    OUR COLLEGE
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">{item.subName} • {item.location}</div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.isGovt ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
              {item.isGovt ? 'Govt / University' : 'Self-Financing'}
            </span>
          </div>

          {benchmarkRole === "all" ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Asst. Prof:</span>
                <strong className="font-mono text-indigo-300">{item.asstProf ? `₹${item.asstProf.toLocaleString("en-IN")}` : item.display}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Assoc. Prof:</span>
                <strong className="font-mono text-purple-300">{item.assocProf ? `₹${item.assocProf.toLocaleString("en-IN")}` : item.display}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Professor:</span>
                <strong className="font-mono text-emerald-300">{item.prof ? `₹${item.prof.toLocaleString("en-IN")}` : item.display}</strong>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-slate-400 uppercase text-[10px] font-bold">
                  {benchmarkRole === "assistantProfessor" ? "Assistant Professor" : benchmarkRole === "associateProfessor" ? "Associate Professor" : "Professor"}
                </span>
                <span className="text-base font-black font-mono text-sky-400">
                  {item.display}
                </span>
              </div>

              {!item.isCkcet && (
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">vs CKCET (Our College):</span>
                  {diff > 0 ? (
                    <span className="font-mono font-bold text-emerald-400">
                      Peer +₹{diff.toLocaleString("en-IN")} (+{pctDiff}% higher)
                    </span>
                  ) : diff === 0 ? (
                    <span className="font-mono font-bold text-blue-300">
                      100% Market Parity
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-amber-400">
                      CKCET +₹{Math.abs(diff).toLocaleString("en-IN")} ({Math.abs(pctDiff)}% higher than Peer)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Layout title="Gross Analytics">
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

              <div className="flex items-center gap-2 mt-3.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("market-benchmark-section");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer shadow-xs hover:border-amber-300/50"
                  title="Jump to Comparative Salary Structure & Peer Market Benchmark"
                >
                  <Building2 size={13} className="text-amber-300" />
                  <span>Market Pay Benchmark (CKCET vs Peers) ↗</span>
                </button>
              </div>
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
                Institutional Budget &amp; HR Outflow Overview
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
                  <div className="flex items-baseline justify-between pt-1 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">salary revison PM</span>
                      <span className="text-[10px] font-extrabold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-300">
                        +{salaryRevisionCalculation.salaryRevisionPct}%
                      </span>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(salaryRevisionCalculation.salaryRevisionPM).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">increment amount PM</span>
                      <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                        +{salaryRevisionCalculation.incrementPct}%
                      </span>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      ₹{Number(salaryRevisionCalculation.incrementAmountPM).toLocaleString("en-IN")}
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

        {/* Comparative Salary Structure & Inter-Collegiate Market Benchmark Section (MOST VISIBLE POSITION) */}
        <div id="market-benchmark-section" className="bg-white border border-zinc-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6 scroll-mt-6">

          {/* Section Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/60 mb-1.5">
                <Crown size={12} className="text-amber-500" /> Comparative Market Intelligence
              </div>
              <h3 className="text-base sm:text-lg font-black text-[#101b38] flex items-center gap-2">
                <Building2 size={20} className="text-indigo-600" />
                Salary Structure &amp; Inter-Collegiate Market Benchmark
              </h3>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Strategic compensation benchmarking comparing <strong className="text-indigo-700 font-bold">CKCET (Our College)</strong> against Anna University &amp; 8 premier self-financing peer institutions across Tamil Nadu &amp; Puducherry.
              </p>
            </div>

            {/* Interactive Control Controls */}
            <div className="flex flex-wrap items-center gap-2.5">

              {/* Role Filter Tabs */}
              <div className="inline-flex p-1 bg-zinc-100 rounded-2xl border border-zinc-200 text-xs font-bold">
                {[
                  { key: "all", label: "All Roles", icon: Layers },
                  { key: "assistantProfessor", label: "Assistant Prof", icon: Users },
                  { key: "associateProfessor", label: "Associate Prof", icon: Award },
                  { key: "professor", label: "Professor", icon: Crown }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = benchmarkRole === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setBenchmarkRole(tab.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${active
                          ? "bg-[#101b38] text-white shadow-xs"
                          : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                        }`}
                    >
                      <Icon size={12} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* View Toggle (Chart vs Variance vs Table) */}
              <div className="inline-flex p-1 bg-zinc-100 rounded-2xl border border-zinc-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setBenchmarkView("chart")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${benchmarkView === "chart"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                    }`}
                  title="Graphical Bar Chart View"
                >
                  <BarChart3 size={13} />
                  <span>Chart</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBenchmarkView("variance")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${benchmarkView === "variance"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                    }`}
                  title="CKCET Pay Advantage / Differential Chart"
                >
                  <ArrowUpDown size={13} />
                  <span>Advantage (±₹)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBenchmarkView("table")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${benchmarkView === "table"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                    }`}
                  title="Detailed Benchmark Matrix Table (1:1 with Spreadsheet)"
                >
                  <FileSpreadsheet size={13} />
                  <span>1:1 Table</span>
                </button>
              </div>

              {/* Include/Exclude Anna University Toggle */}
              <button
                type="button"
                onClick={() => setIncludeAnnaUniv(!includeAnnaUniv)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${includeAnnaUniv
                    ? "bg-amber-50 text-amber-900 border-amber-300 shadow-2xs"
                    : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                  }`}
                title="Toggle 7th CPC Govt scale (Anna Univ 19 colleges) to adjust peer scale comparison"
              >
                <Landmark size={13} className={includeAnnaUniv ? "text-amber-600" : "text-zinc-400"} />
                <span>{includeAnnaUniv ? "Govt Scale: Included" : "Govt Scale: Excluded"}</span>
              </button>

              {/* Sort Controls (when single role selected) */}
              {benchmarkRole !== "all" && benchmarkView !== "table" && (
                <button
                  type="button"
                  onClick={() => setBenchmarkSort(benchmarkSort === "salaryDesc" ? "salaryAsc" : benchmarkSort === "salaryAsc" ? "default" : "salaryDesc")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${benchmarkSort !== "default"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    }`}
                  title="Cycle sort: High-to-Low, Low-to-High, Default Table Order"
                >
                  <Sliders size={13} />
                  <span>
                    {benchmarkSort === "salaryDesc" ? "Rank: High → Low" : benchmarkSort === "salaryAsc" ? "Rank: Low → High" : "Sort: Table Order"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 4 Dynamic Executive Role Snapshot Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Card 1: Assistant Professor (CKCET vs Peers) */}
            <div className={`rounded-2xl p-4.5 shadow-xs transition-all flex flex-col justify-between border ${benchmarkRole === "assistantProfessor"
                ? "bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20"
                : "bg-white border-zinc-200"
              }`}>
              <div>
                <div className="flex items-center justify-between text-zinc-500 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                    <Users size={12} className="text-indigo-600" /> Assistant Professor
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                    Rank #{benchmarkSummary.assistantProfessor.rank} of 8 Peers
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tight mt-1 flex items-baseline gap-1">
                  <span>{benchmarkSummary.assistantProfessor.ckcetDisplay}</span>
                  <span className="text-xs font-semibold text-zinc-500 font-sans">PM</span>
                  <span className="text-[11px] font-bold text-zinc-400 font-mono ml-auto">₹{benchmarkSummary.assistantProfessor.annualLakh}L PA</span>
                </div>

                {/* Visual Mini Range Bar */}
                <div className="mt-2.5 pt-2 border-t border-zinc-100 space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold text-zinc-400">
                    <span>Min: ₹22k (Syed Ammal)</span>
                    <span className="text-indigo-700 font-bold">CKCET: ₹30k</span>
                    <span>Max: ₹46.4k (RAMCO)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden relative">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-indigo-500 to-indigo-600 rounded-full" style={{ width: '45%' }} />
                  </div>
                </div>

                <div className="text-[11px] text-zinc-600 font-medium mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 size={11} /> +₹3,000 PM (+11.1%) vs MANAKULA (Pondy ₹27k)
                  </div>
                  <div className="flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 size={11} /> +₹2,000 PM (+7.1%) vs Saranathan (Trichy ₹28k)
                  </div>
                  <div className="flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 size={11} /> +₹8,000 PM (+36.4%) vs Syed Ammal (₹22k)
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-zinc-100 mt-2.5 flex items-center justify-between text-[10px] font-bold text-zinc-500">
                <span>Chennai Parity:</span>
                <span className="font-mono text-indigo-700">Matches AIHT top band (₹30,000)</span>
              </div>
            </div>

            {/* Card 2: Associate Professor (CKCET vs Peers) */}
            <div className={`rounded-2xl p-4.5 shadow-xs transition-all flex flex-col justify-between border ${benchmarkRole === "associateProfessor"
                ? "bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20"
                : "bg-white border-zinc-200"
              }`}>
              <div>
                <div className="flex items-center justify-between text-zinc-500 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 flex items-center gap-1">
                    <Award size={12} className="text-purple-600" /> Associate Professor
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 font-mono">
                    Rank #{benchmarkSummary.associateProfessor.rank} of 8 Peers
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tight mt-1 flex items-baseline gap-1">
                  <span>{benchmarkSummary.associateProfessor.ckcetDisplay}</span>
                  <span className="text-xs font-semibold text-zinc-500 font-sans">PM</span>
                  <span className="text-[11px] font-bold text-zinc-400 font-mono ml-auto">₹{benchmarkSummary.associateProfessor.annualLakh}L PA</span>
                </div>

                {/* Visual Mini Range Bar */}
                <div className="mt-2.5 pt-2 border-t border-zinc-100 space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold text-zinc-400">
                    <span>Min: ₹50k (Syed Ammal)</span>
                    <span className="text-purple-700 font-bold">CKCET: ₹65k</span>
                    <span>Max: ₹85k (PSG)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden relative">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-purple-500 to-purple-600 rounded-full" style={{ width: '50%' }} />
                  </div>
                </div>

                <div className="text-[11px] text-zinc-600 font-medium mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-blue-700 font-bold">
                    <CheckCircle2 size={11} /> 100% Market Parity with Saranathan (₹65k)
                  </div>
                  <div className="flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 size={11} /> +₹5,000 PM (+8.3%) vs MANAKULA (Pondy ₹60k)
                  </div>
                  <div className="flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 size={11} /> +₹15,000 PM (+30%) vs Syed Ammal (₹50k)
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-zinc-100 mt-2.5 flex items-center justify-between text-[10px] font-bold text-zinc-500">
                <span>Near Tier-1 Parity:</span>
                <span className="font-mono text-purple-700">Near RAMCO (₹66k, only ₹1k diff)</span>
              </div>
            </div>

            {/* Card 3: Professor (CKCET vs Peers) */}
            <div className={`rounded-2xl p-4.5 shadow-xs transition-all flex flex-col justify-between border ${benchmarkRole === "professor"
                ? "bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20"
                : "bg-white border-zinc-200"
              }`}>
              <div>
                <div className="flex items-center justify-between text-zinc-500 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <Crown size={12} className="text-emerald-600" /> Professor
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                    Rank #{benchmarkSummary.professor.rank} of 8 Peers
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tight mt-1 flex items-baseline gap-1">
                  <span>{benchmarkSummary.professor.ckcetDisplay}</span>
                  <span className="text-xs font-semibold text-zinc-500 font-sans">PM</span>
                  <span className="text-[11px] font-bold text-zinc-400 font-mono ml-auto">₹{benchmarkSummary.professor.annualLakh}L PA</span>
                </div>

                {/* Visual Mini Range Bar */}
                <div className="mt-2.5 pt-2 border-t border-zinc-100 space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold text-zinc-400">
                    <span>Min: ₹75k (Syed Ammal)</span>
                    <span className="text-emerald-700 font-bold">CKCET: ₹80k</span>
                    <span>Max: ₹1.4L (St.Joseph)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden relative">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 rounded-full" style={{ width: '40%' }} />
                  </div>
                </div>

                <div className="text-[11px] text-zinc-600 font-medium mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-blue-700 font-bold">
                    <CheckCircle2 size={11} /> 100% Parity with Saranathan (Trichy ₹80k)
                  </div>
                  <div className="flex items-center gap-1 text-blue-700 font-bold">
                    <CheckCircle2 size={11} /> 100% Parity with RAMCO (Rajapalayam ₹80k)
                  </div>
                  <div className="flex items-center gap-1 text-blue-700 font-bold">
                    <CheckCircle2 size={11} /> 100% Parity with MANAKULA (Pondy ₹80k)
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-zinc-100 mt-2.5 flex items-center justify-between text-[10px] font-bold text-zinc-500">
                <span>Regional Edge:</span>
                <span className="font-mono text-emerald-700">+₹5,000 PM vs Syed Ammal (₹75k)</span>
              </div>
            </div>

            {/* Card 4: Executive Competitive Standing (CKCET Pride) */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[#101b38] via-[#162752] to-[#1c356e] text-white rounded-2xl p-4.5 shadow-md border border-indigo-900/50 flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-28 h-28 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between text-indigo-200 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Star size={12} className="fill-amber-400 text-amber-400" />
                    CKCET (Our College)
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    Regional Leader
                  </span>
                </div>
                <div className="text-xl font-black text-white font-mono tracking-tight mt-1">
                  ₹30k / ₹65k / ₹80k
                  <span className="text-xs font-semibold text-blue-200 font-sans ml-1">PM</span>
                </div>
                <div className="text-[11px] text-blue-100 font-medium mt-1">
                  Annual Salary Band: <strong>₹3.60L – ₹9.60L PA</strong>
                </div>

                <div className="mt-3 pt-2 border-t border-white/10 space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                    <ShieldCheck size={13} /> #1 Pay Scale in Cuddalore Corridor
                  </div>
                  <div className="flex items-center gap-1.5 text-sky-200 font-medium">
                    <CheckCircle2 size={13} /> Zero faculty attrition to Pondicherry
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-200 font-medium">
                    <Award size={13} /> 100% Parity with top Trichy/Ramco peers
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-white/10 mt-2.5 flex items-center justify-between text-[10px] font-bold text-sky-200">
                <span>Benchmark Status:</span>
                <span className="font-mono text-amber-300 font-extrabold">Matches/Exceeds 62.5% Peers</span>
              </div>
            </div>

          </div>

          {/* VIEW A & B: Graphical Bar Chart View (Clustered or Single Role) */}
          {benchmarkView === "chart" && (
            <div className="bg-slate-50/70 border border-zinc-200/80 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <BarChart3 size={15} className="text-indigo-600" />
                    {benchmarkRole === "all"
                      ? "Clustered Designation-Wise Salary Structure Across Institutions"
                      : `${benchmarkRoleMetrics.roleName} – Institutional Salary Structure (Per Month)`}
                  </h4>
                  <p className="text-[11px] text-zinc-500 font-medium">
                    {includeAnnaUniv
                      ? "Showing all 9 benchmarked institutions including Anna University (19 Colleges)."
                      : "Showing 8 premier self-financing engineering peer institutions (Anna University excluded to provide higher resolution scale)."}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-950 bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-md shadow-2xs">
                    <Crown size={11} className="text-amber-500" />
                    CKCET (Our College)
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                    Private Peer Colleges
                  </span>
                  {includeAnnaUniv && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      Govt / University (7th CPC)
                    </span>
                  )}
                </div>
              </div>

              {/* Chart Canvas Container */}
              <div className="w-full h-80 sm:h-96 min-w-0 min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                  {benchmarkRole === "all" ? (
                    <BarChart data={benchmarkChartData} margin={{ top: 25, right: 20, left: 10, bottom: 65 }}>
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
                        tickFormatter={(v) => `₹${v >= 100000 ? (v / 100000).toFixed(1) + 'L' : (v / 1000).toFixed(0) + 'k'}`}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<BenchmarkCustomTooltip />} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: 10, fontSize: 11, fontWeight: 700 }}
                      />
                      {!includeAnnaUniv && (
                        <>
                          <ReferenceLine
                            y={80000}
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            label={{ value: "CKCET Prof: ₹80k", fill: "#047857", fontSize: 9, position: "insideTopRight", fontWeight: "bold" }}
                          />
                          <ReferenceLine
                            y={65000}
                            stroke="#0284c7"
                            strokeDasharray="3 3"
                            label={{ value: "CKCET Assoc: ₹65k", fill: "#0369a1", fontSize: 9, position: "insideTopRight", fontWeight: "bold" }}
                          />
                          <ReferenceLine
                            y={30000}
                            stroke="#6366f1"
                            strokeDasharray="3 3"
                            label={{ value: "CKCET Asst: ₹30k", fill: "#4338ca", fontSize: 9, position: "insideTopRight", fontWeight: "bold" }}
                          />
                        </>
                      )}
                      <Bar dataKey="asstProf" name="Assistant Professor" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="assocProf" name="Associate Professor" fill="#0284c7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="prof" name="Professor" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
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
                        tickFormatter={(v) => `₹${v >= 100000 ? (v / 100000).toFixed(1) + 'L' : (v / 1000).toFixed(0) + 'k'}`}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<BenchmarkCustomTooltip />} />
                      {!includeAnnaUniv && (
                        <ReferenceLine
                          y={benchmarkRoleMetrics.ckcetVal}
                          stroke="#4338ca"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          label={{
                            value: `★ CKCET Baseline: ₹${(benchmarkRoleMetrics.ckcetVal / 1000).toFixed(0)}k PM`,
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
                              entry.isCkcet
                                ? "#4338ca"
                                : entry.isGovt
                                  ? "#f59e0b"
                                  : entry.salary < benchmarkRoleMetrics.ckcetVal
                                    ? "#0d9488"
                                    : entry.salary === benchmarkRoleMetrics.ckcetVal
                                      ? "#0284c7"
                                      : "#64748b"
                            }
                            stroke={entry.isCkcet ? "#fbbf24" : "none"}
                            strokeWidth={entry.isCkcet ? 2.5 : 0}
                          />
                        ))}
                        <LabelList
                          dataKey="salary"
                          position="top"
                          formatter={(val) => `₹${val >= 100000 ? (val / 100000).toFixed(1) + 'L' : (val / 1000).toFixed(0) + 'k'}`}
                          style={{ fontSize: 10, fontWeight: 800, fill: "#1e293b" }}
                        />
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* VIEW C: CKCET Pay Advantage / Variance Differential Chart */}
          {benchmarkView === "variance" && (
            <div className="bg-slate-50/70 border border-zinc-200/80 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <ArrowUpDown size={15} className="text-emerald-600" />
                    Salary Variance: Peers vs CKCET Base (₹ Per Month)
                  </h4>
                  <p className="text-[11px] text-zinc-500 font-medium">
                    Green bars (increase ↑): Institutions paying <strong>higher than CKCET</strong> • Orange bars (decrease ↓): Institutions paying <strong>lower than CKCET</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                    +₹ : Peer Pays Higher (Green Bar ↑)
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                    -₹ : Peer Pays Lower (Orange Bar ↓)
                  </span>
                </div>
              </div>

              <div className="w-full h-80 sm:h-96 min-w-0 min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
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
                      tickFormatter={(v) => `${v > 0 ? '+' : ''}₹${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<BenchmarkCustomTooltip />} />
                    <ReferenceLine y={0} stroke="#334155" strokeWidth={1.5} />
                    <Bar dataKey="diffFromCkcet" radius={[6, 6, 0, 0]}>
                      {benchmarkChartData.map((entry) => (
                        <Cell
                          key={`var-${entry.id}`}
                          fill={
                            entry.isCkcet
                              ? "#4338ca"
                              : entry.diffFromCkcet > 0
                                ? "#10b981"
                                : entry.diffFromCkcet === 0
                                  ? "#0284c7"
                                  : "#f59e0b"
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="diffFromCkcet"
                        position="top"
                        formatter={(val) => val === 0 ? "★ CKCET Base" : `${val > 0 ? '+' : '-'}₹${Math.abs(val) >= 100000 ? (Math.abs(val) / 100000).toFixed(1) + 'L' : (Math.abs(val) / 1000).toFixed(0) + 'k'}`}
                        style={{ fontSize: 10, fontWeight: 800, fill: "#1e293b" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* VIEW D: Detailed 1:1 Spreadsheet Matrix Table Matching Uploaded Image */}
          {(benchmarkView === "table" || benchmarkRole === "all") && (
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={15} className="text-indigo-600" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Institutional Salary Structure Matrix Table (1:1 Verification)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex p-0.5 bg-zinc-200 rounded-lg text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setBenchmarkTableOrientation("exactImage")}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${benchmarkTableOrientation === "exactImage" ? "bg-white text-zinc-900 shadow-2xs font-black" : "text-zinc-600"
                        }`}
                    >
                      Exact Image Layout (10 Cols)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBenchmarkTableOrientation("detailed")}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${benchmarkTableOrientation === "detailed" ? "bg-white text-zinc-900 shadow-2xs font-black" : "text-zinc-600"
                        }`}
                    >
                      Institutional Roster View
                    </button>
                  </div>
                </div>
              </div>

              {/* Exact Image Table Orientation (Designations as Rows, Colleges as Columns) */}
              {benchmarkTableOrientation === "exactImage" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-100/90 text-zinc-700 font-black uppercase tracking-wider text-[10px] border-b border-zinc-200">
                        <th className="py-3 px-3.5 border-r border-zinc-200 sticky left-0 bg-zinc-100 z-10 min-w-[150px]">
                          SALARY STRUCTURE
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[130px]">
                          Anna University <span className="block text-[9px] font-medium text-zinc-500 lowercase">(19 colleges)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[120px]">
                          St.Joseph <span className="block text-[9px] font-medium text-zinc-500 lowercase">(chennai)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[120px]">
                          AIHT <span className="block text-[9px] font-medium text-zinc-500 lowercase">(chennai)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[140px]">
                          PSGiTech / Sri Krishna <span className="block text-[9px] font-medium text-zinc-500 lowercase">(coimbatore)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[110px]">
                          Saranathan <span className="block text-[9px] font-medium text-zinc-500 lowercase">(trichy)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[130px]">
                          RAMCO Institute <span className="block text-[9px] font-medium text-zinc-500 lowercase">(rajapalayam)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[140px]">
                          Syed Ammal Engg <span className="block text-[9px] font-medium text-zinc-500 lowercase">(ramnad)</span>
                        </th>
                        <th className="py-3 px-3 border-r border-zinc-200 text-center min-w-[110px]">
                          MANAKULA <span className="block text-[9px] font-medium text-zinc-500 lowercase">(pondy)</span>
                        </th>
                        <th className="py-3 px-4 text-center min-w-[130px] bg-indigo-900 text-white font-black border-l-2 border-indigo-400">
                          <span className="flex items-center justify-center gap-1">
                            <Crown size={12} className="text-amber-400" />
                            CKCET (Revised)
                          </span>
                          <span className="block text-[9px] font-normal text-indigo-200">Our College</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-mono">

                      {/* Row 1: Assistant Professor */}
                      <tr className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3.5 px-3.5 font-bold font-sans text-slate-900 border-r border-zinc-200 sticky left-0 bg-white z-10">
                          Assistant Professor
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          95,820
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          35,000 <span className="block text-[9px] font-sans text-zinc-400">(first year)</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          25,000 - 30,000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          35000-40000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          28,000
                          <span className="block text-[9px] font-sans text-emerald-700 font-bold">CKCET +₹2k</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          46,400
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          22,000
                          <span className="block text-[9px] font-sans text-emerald-700 font-bold">CKCET +₹8k</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          27,000
                          <span className="block text-[9px] font-sans text-emerald-700 font-bold">CKCET +₹3k</span>
                        </td>
                        <td className="py-3.5 px-4 text-center bg-indigo-50/80 font-black text-indigo-950 text-sm border-l-2 border-indigo-400">
                          30,000
                        </td>
                      </tr>

                      {/* Row 2: Associate Professor */}
                      <tr className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3.5 px-3.5 font-bold font-sans text-slate-900 border-r border-zinc-200 sticky left-0 bg-white z-10">
                          Associate Professor
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          2,13,740
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          85,000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          65,000 - 75,000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          70000-85000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          65,000
                          <span className="block text-[9px] font-sans text-blue-700 font-bold">100% Parity</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          66,000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          50,000
                          <span className="block text-[9px] font-sans text-emerald-700 font-bold">CKCET +₹15k</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          60,000
                          <span className="block text-[9px] font-sans text-emerald-700 font-bold">CKCET +₹5k</span>
                        </td>
                        <td className="py-3.5 px-4 text-center bg-indigo-50/80 font-black text-indigo-950 text-sm border-l-2 border-indigo-400">
                          65,000
                        </td>
                      </tr>

                      {/* Row 3: Professor */}
                      <tr className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3.5 px-3.5 font-bold font-sans text-slate-900 border-r border-zinc-200 sticky left-0 bg-white z-10">
                          Professor
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          2,34,220
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          1,40,000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          1,00,000
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          90000-1.2 Lakh
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          80,000
                          <span className="block text-[9px] font-sans text-blue-700 font-bold">100% Parity</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          80,000
                          <span className="block text-[9px] font-sans text-blue-700 font-bold">100% Parity</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          75,000
                          <span className="block text-[9px] font-sans text-emerald-700 font-bold">CKCET +₹5k</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-zinc-100 text-slate-800">
                          80,000
                          <span className="block text-[9px] font-sans text-blue-700 font-bold">100% Parity</span>
                        </td>
                        <td className="py-3.5 px-4 text-center bg-indigo-50/80 font-black text-indigo-950 text-sm border-l-2 border-indigo-400">
                          80,000
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              ) : (
                /* Institutional Roster View (Colleges as Rows) */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-100/90 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                        <th className="py-3 px-3.5 border-r border-zinc-200">Institution &amp; Region</th>
                        <th className="py-3 px-3.5 border-r border-zinc-200 text-right">Assistant Professor</th>
                        <th className="py-3 px-3.5 border-r border-zinc-200 text-right">Associate Professor</th>
                        <th className="py-3 px-3.5 border-r border-zinc-200 text-right">Professor</th>
                        <th className="py-3 px-3.5 text-center">Benchmark Standing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {BENCHMARK_SALARY_DATA.map((col) => {
                        const isCkcet = col.isCkcet;
                        return (
                          <tr
                            key={col.id}
                            className={`transition-colors ${isCkcet
                                ? "bg-indigo-50/90 font-bold border-y-2 border-indigo-400"
                                : "hover:bg-zinc-50/80 text-zinc-700"
                              }`}
                          >
                            <td className="py-3 px-3.5 border-r border-zinc-100">
                              <div className="flex items-center gap-2">
                                {isCkcet && <Crown size={14} className="text-amber-500 shrink-0" />}
                                <div>
                                  <div className={`font-black ${isCkcet ? "text-indigo-950 text-sm" : "text-slate-900"}`}>
                                    {col.name} {col.subName}
                                  </div>
                                  <div className="text-[10px] text-zinc-400 font-medium">
                                    {col.region} • {col.location}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-3.5 border-r border-zinc-100 text-right font-mono">
                              <span className={isCkcet ? "text-indigo-900 font-black text-sm" : "text-slate-800"}>
                                {col.assistantProfessor.rawText}
                              </span>
                              {!isCkcet && (
                                <div className="text-[10px] font-semibold mt-0.5">
                                  {col.assistantProfessor.avg > 30000 ? (
                                    <span className="text-amber-700 font-mono">
                                      +₹{(col.assistantProfessor.avg - 30000).toLocaleString("en-IN")}
                                    </span>
                                  ) : col.assistantProfessor.avg === 30000 ? (
                                    <span className="text-blue-700 font-bold">100% Parity</span>
                                  ) : (
                                    <span className="text-emerald-700 font-mono">
                                      CKCET +₹{(30000 - col.assistantProfessor.avg).toLocaleString("en-IN")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3.5 border-r border-zinc-100 text-right font-mono">
                              <span className={isCkcet ? "text-indigo-900 font-black text-sm" : "text-slate-800"}>
                                {col.associateProfessor.rawText}
                              </span>
                              {!isCkcet && (
                                <div className="text-[10px] font-semibold mt-0.5">
                                  {col.associateProfessor.avg > 65000 ? (
                                    <span className="text-amber-700 font-mono">
                                      +₹{(col.associateProfessor.avg - 65000).toLocaleString("en-IN")}
                                    </span>
                                  ) : col.associateProfessor.avg === 65000 ? (
                                    <span className="text-blue-700 font-bold">100% Parity</span>
                                  ) : (
                                    <span className="text-emerald-700 font-mono">
                                      CKCET +₹{(65000 - col.associateProfessor.avg).toLocaleString("en-IN")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3.5 border-r border-zinc-100 text-right font-mono">
                              <span className={isCkcet ? "text-indigo-900 font-black text-sm" : "text-slate-800"}>
                                {col.professor.rawText}
                              </span>
                              {!isCkcet && (
                                <div className="text-[10px] font-semibold mt-0.5">
                                  {col.professor.avg > 80000 ? (
                                    <span className="text-amber-700 font-mono">
                                      +₹{(col.professor.avg - 80000).toLocaleString("en-IN")}
                                    </span>
                                  ) : col.professor.avg === 80000 ? (
                                    <span className="text-blue-700 font-bold">100% Parity</span>
                                  ) : (
                                    <span className="text-emerald-700 font-mono">
                                      CKCET +₹{(80000 - col.professor.avg).toLocaleString("en-IN")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3.5 text-center">
                              {isCkcet ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-600 text-white shadow-2xs">
                                  <Star size={10} className="fill-amber-300 text-amber-300" />
                                  Current Institutional Standard
                                </span>
                              ) : col.isGovt ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Govt 7th CPC Benchmark
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  Private Peer College
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Strategic Executive Takeaways Callout Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
            <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/40 border border-indigo-100 rounded-2xl p-4 space-y-1.5">
              <div className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-indigo-600" />
                Assistant Professor Regional Edge
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                At <strong className="text-indigo-800 font-bold">₹30,000 PM</strong>, CKCET's revised package is higher than <strong>MANAKULA Pondy (₹27,000)</strong>, <strong>Saranathan Trichy (₹28,000)</strong>, and <strong>Syed Ammal (₹22,000)</strong>, while matching Chennai's AIHT upper band.
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/40 border border-emerald-100 rounded-2xl p-4 space-y-1.5">
              <div className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-emerald-600" />
                Senior Leadership 100% Parity
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                CKCET Associate Professors (<strong className="text-emerald-800 font-bold">₹65,000 PM</strong>) and Professors (<strong className="text-emerald-800 font-bold">₹80,000 PM</strong>) maintain full 100% parity with top tier institutions Saranathan (Trichy) and RAMCO (Rajapalayam).
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50/70 to-pink-50/40 border border-purple-100 rounded-2xl p-4 space-y-1.5">
              <div className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                <Award size={15} className="text-purple-600" />
                Talent Attraction &amp; Retention
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                The revised salary structure positions CKCET as the highest paying engineering institution in the Cuddalore and coastal Tamil Nadu corridor, driving superior faculty quality and retention.
              </p>
            </div>
          </div>

        </div>

        {/* Institutional Increment Criteria & Slab Reference Card (From User Spreadsheet) */}
        <div className="bg-white border border-zinc-200/90 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Performance Rubrics Matrix</div>
              <h3 className="text-sm font-black text-[#101b38] flex items-center gap-2">
                <Sliders size={16} className="text-indigo-600" />
                Active Score Criteria &amp; Salary Increment Slabs
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
            </div>
          </div>

          {/* Secondary Dropdown Filters */}
          <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-zinc-100 text-xs">
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

            <div className="ml-auto flex items-center gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnsDropdown(!showColumnsDropdown)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                    hiddenColumns.length > 0
                      ? "bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-200/50"
                      : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                  }`}
                  title="Manage visible columns"
                >
                  <Eye size={13} className={hiddenColumns.length > 0 ? "text-amber-600" : "text-indigo-600"} />
                  <span>Columns</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black bg-zinc-100 text-zinc-800">
                    {GROSS_ANALYTICS_COLUMNS.length - hiddenColumns.length}/{GROSS_ANALYTICS_COLUMNS.length}
                  </span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showColumnsDropdown ? "rotate-180" : ""}`} />
                </button>

                {showColumnsDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowColumnsDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-zinc-200 rounded-2xl shadow-2xl z-50 p-3 max-h-[460px] overflow-hidden flex flex-col animate-fadeIn">
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 mb-2">
                        <div className="flex items-center gap-1.5">
                          <Sliders size={13} className="text-indigo-600" />
                          <span className="text-xs font-black text-zinc-900 uppercase tracking-wider">Column Visibility</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {hiddenColumns.length > 0 && (
                            <button
                              type="button"
                              onClick={showAllColumns}
                              className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50 cursor-pointer"
                            >
                              Show All
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-y-auto pr-1 space-y-1 flex-1">
                        {GROSS_ANALYTICS_COLUMNS.map((col) => {
                          const isHidden = hiddenColumns.includes(col.id);
                          return (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() => toggleColumn(col.id)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                                isHidden
                                  ? "bg-zinc-50 text-zinc-400 hover:bg-zinc-100 line-through"
                                  : "bg-white hover:bg-indigo-50/60 text-zinc-800"
                              }`}
                            >
                              <span className="truncate">{col.label}</span>
                              <span
                                className={`p-1 rounded-md transition-colors ${
                                  isHidden ? "text-zinc-400 bg-zinc-200/50" : "text-emerald-600 bg-emerald-50"
                                }`}
                              >
                                {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">
                Showing <strong className="text-zinc-700 font-extrabold">{filteredRecords.length}</strong> evaluated records
              </div>
            </div>
          </div>
        </div>

        {/* Main Gross Analytics & Increment Table */}
        <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
          {/* Quick Hidden Columns Restore Bar */}
          {hiddenColumns.length > 0 && (
            <div className="px-5 py-2.5 bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-white border-b border-amber-200/80 flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-[11px] uppercase tracking-wider">
                <EyeOff size={14} className="text-amber-600" />
                <span>Hidden Columns ({hiddenColumns.length}):</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {hiddenColumns.map((colId) => {
                  const col = GROSS_ANALYTICS_COLUMNS.find((c) => c.id === colId);
                  if (!col) return null;
                  return (
                    <button
                      key={colId}
                      type="button"
                      onClick={() => toggleColumn(colId)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-950 font-bold text-xs hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-900 shadow-2xs transition-all cursor-pointer group"
                      title={`Click to view "${col.label}" column again`}
                    >
                      <Eye size={12} className="text-amber-600 group-hover:text-emerald-600 group-hover:scale-110 transition-transform" />
                      <span>{col.label}</span>
                      <span className="text-[10px] text-amber-600 group-hover:text-emerald-700 font-semibold ml-0.5">✕ unhide</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={showAllColumns}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
              >
                <Eye size={12} /> Show All Columns ({GROSS_ANALYTICS_COLUMNS.length})
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-left text-xs"
              style={{ minWidth: `${Math.max(750, (GROSS_ANALYTICS_COLUMNS.length - hiddenColumns.length) * 115)}px` }}
            >
              <thead>
                <tr className="bg-zinc-50/90 border-b border-zinc-200 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                  {/* 1. ID */}
                  {!hiddenColumns.includes("facultyId") && (
                    <th
                      onClick={() => handleSort("facultyId")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          ID <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("facultyId");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'ID' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 2. Faculty Member */}
                  {!hiddenColumns.includes("facultyName") && (
                    <th
                      onClick={() => handleSort("facultyName")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          Faculty Member <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("facultyName");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Faculty Member' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 3. Designation & Department */}
                  {!hiddenColumns.includes("designation") && (
                    <th
                      onClick={() => handleSort("designation")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          Designation & Dept <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("designation");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Designation & Dept' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 4. Date of Joining */}
                  {!hiddenColumns.includes("dateOfJoining") && (
                    <th
                      onClick={() => handleSort("dateOfJoining")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center border-r border-zinc-200 group"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          DOJ <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("dateOfJoining");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'DOJ' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 5. Gross PM (Monthly Salary) */}
                  {!hiddenColumns.includes("grossPM") && (
                    <th
                      onClick={() => handleSort("grossPM")}
                      className="p-3.5 cursor-pointer hover:bg-emerald-100/70 transition-colors text-center bg-emerald-50/60 border-r border-emerald-200/70 group"
                      title="Current Baseline Gross Per Month (PM)"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-emerald-950 font-black">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          <IndianRupee size={12} className="text-emerald-700" />
                          Gross PM <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("grossPM");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-emerald-200/80 text-emerald-800 hover:text-rose-700 transition-all cursor-pointer"
                          title="Hide 'Gross PM' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 6. Gross PA (Annual Baseline Salary) */}
                  {!hiddenColumns.includes("grossPA") && (
                    <th
                      onClick={() => handleSort("grossPA")}
                      className="p-3.5 cursor-pointer hover:bg-emerald-100/70 transition-colors text-center bg-emerald-50/60 border-r border-emerald-200/70 group"
                      title="Current Baseline Gross Per Annum (PA = Gross PM × 12)"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-emerald-950 font-black">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          <IndianRupee size={12} className="text-emerald-700" />
                          Gross PA <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("grossPA");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-emerald-200/80 text-emerald-800 hover:text-rose-700 transition-all cursor-pointer"
                          title="Hide 'Gross PA' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 7. Appraisal Review Form Mark (60%) */}
                  {!hiddenColumns.includes("appraisalMark") && (
                    <th
                      onClick={() => handleSort("appraisalMark")}
                      className="p-3.5 cursor-pointer hover:bg-blue-100/50 transition-colors text-center bg-blue-50/40 group"
                      title="Appraisal Review Form Mark (60% weightage)"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-blue-900">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Appraisal (60%) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("appraisalMark");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-blue-200/80 text-blue-700 hover:text-rose-700 transition-all cursor-pointer"
                          title="Hide 'Appraisal (60%)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 8. Attitude Form Mark (40%) */}
                  {!hiddenColumns.includes("attitudeMark") && (
                    <th
                      onClick={() => handleSort("attitudeMarkNormalized")}
                      className="p-3.5 cursor-pointer hover:bg-emerald-100/50 transition-colors text-center bg-emerald-50/40 group"
                      title="Attitude Form Mark (40% weightage)"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-emerald-900">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Attitude (40%) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("attitudeMark");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-emerald-200/80 text-emerald-700 hover:text-rose-700 transition-all cursor-pointer"
                          title="Hide 'Attitude (40%)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 9. Gross Mark (100) */}
                  {!hiddenColumns.includes("grossMark") && (
                    <th
                      onClick={() => handleSort("grossMark")}
                      className="p-3.5 cursor-pointer hover:bg-amber-100/50 transition-colors text-center bg-amber-50/30 group"
                      title="Gross Score = (0.6 * Appraisal) + (0.4 * Attitude)"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-amber-900 font-black">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Score (100) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("grossMark");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-amber-200/80 text-amber-800 hover:text-rose-700 transition-all cursor-pointer"
                          title="Hide 'Score (100)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 10. Performance Criteria & Increment % */}
                  {!hiddenColumns.includes("criteriaSlab") && (
                    <th
                      onClick={() => handleSort("baseIncrementPct")}
                      className="p-3.5 cursor-pointer hover:bg-indigo-100/50 transition-colors text-center bg-indigo-50/30 border-r border-zinc-200 group"
                      title="Performance Tier & Base Increment %"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-indigo-900 font-black">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Criteria Slab <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("criteriaSlab");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-indigo-200/80 text-indigo-700 hover:text-rose-700 transition-all cursor-pointer"
                          title="Hide 'Criteria Slab' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 11. Promotion % */}
                  {!hiddenColumns.includes("promotionPct") && (
                    <th
                      onClick={() => handleSort("promotionPct")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Promotion Recommendation Percentage"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Promotion % <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("promotionPct");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Promotion %' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 12. Promotion Amount */}
                  {!hiddenColumns.includes("promotionAmount") && (
                    <th
                      onClick={() => handleSort("promotionAmount")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Promotion Increment Amount (PA) = Gross PA × Promotion %"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Promotion Amount <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("promotionAmount");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Promotion Amount' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 13. % Increase */}
                  {!hiddenColumns.includes("pctIncrease") && (
                    <th
                      onClick={() => handleSort("pctIncrease")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Total % Increase = ((Revised Gross PA - Gross PA) / Gross PA) × 100"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          % Increase <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("pctIncrease");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide '% Increase' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 14. Salary Adjustment (PM) */}
                  {!hiddenColumns.includes("salaryAdjustmentPM") && (
                    <th
                      onClick={() => handleSort("salaryAdjustmentPM")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Monthly Discretionary Adjustment (₹ PM)"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Salary Adjustment (PM) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("salaryAdjustmentPM");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Salary Adjustment (PM)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 15. Salary Adjustment (PA) */}
                  {!hiddenColumns.includes("salaryAdjustmentPA") && (
                    <th
                      onClick={() => handleSort("salaryAdjustmentPA")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Annual Salary Adjustment = Adjustment (PM) × 12"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Salary Adjustment (PA) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("salaryAdjustmentPA");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Salary Adjustment (PA)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 16. Revised Gross (PM) */}
                  {!hiddenColumns.includes("revisedGrossPM") && (
                    <th
                      onClick={() => handleSort("revisedGrossPM")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Final Revised Gross Monthly Salary"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Revised Gross (PM) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("revisedGrossPM");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Revised Gross (PM)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 17. Revised Gross (PA) */}
                  {!hiddenColumns.includes("revisedGrossPA") && (
                    <th
                      onClick={() => handleSort("revisedGrossPA")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Revised Gross Annual Salary = Gross PA + Increment Amount (PA) + Promotion Amount + Salary Adjustment (PA)"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Revised Gross (PA) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("revisedGrossPA");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Revised Gross (PA)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 18. Increment Amount (PM) */}
                  {!hiddenColumns.includes("totalIncrementAmount") && (
                    <th
                      onClick={() => handleSort("totalIncrementAmount")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Net Total Increment Amount = Revised Gross (PM) - Original Gross (PM)"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Increment Amount (PM) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("totalIncrementAmount");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Increment Amount (PM)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 19. Increment Amount (PA) */}
                  {!hiddenColumns.includes("totalIncrementAmountPA") && (
                    <th
                      onClick={() => handleSort("totalIncrementAmountPA")}
                      className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center group"
                      title="Total Annual Increment = Revised Gross (PA) - Gross PA"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center justify-center gap-1 flex-1">
                          Increment Amount (PA) <ArrowUpDown size={11} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("totalIncrementAmountPA");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Increment Amount (PA)' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}

                  {/* 20. Action */}
                  {!hiddenColumns.includes("actions") && (
                    <th className="p-3.5 text-center whitespace-nowrap group">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Actions</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn("actions");
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 transition-all cursor-pointer"
                          title="Hide 'Actions' column"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={Math.max(1, GROSS_ANALYTICS_COLUMNS.length - hiddenColumns.length)} className="p-12 text-center text-zinc-400 font-semibold">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Gross Analytics Records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, GROSS_ANALYTICS_COLUMNS.length - hiddenColumns.length)} className="p-12 text-center text-zinc-400 font-medium">
                      <div className="max-w-md mx-auto space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                          <Filter size={20} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-700">No Records Found</h4>
                        <p className="text-xs text-zinc-500">
                          No appraisals match the current search filters.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-zinc-50/70 transition-all">

                      {/* 1. ID Column */}
                      {!hiddenColumns.includes("facultyId") && (
                        <td className="p-3.5">
                          <div className="inline-flex items-center gap-1 font-mono text-[11px] font-black text-[#101b38] bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
                            {rec.facultyId}
                          </div>
                        </td>
                      )}

                      {/* 2. Faculty Member */}
                      {!hiddenColumns.includes("facultyName") && (
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
                            ) : rec.collectionType === "faculty" ? "Teaching Faculty" : rec.collectionType === "hod" ? "HOD" : "Non-Teaching Staff"}
                          </div>
                        </td>
                      )}

                      {/* 3. Designation & Department */}
                      {!hiddenColumns.includes("designation") && (
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-700 text-xs">{rec.designation}</div>
                          <div className="text-[11px] font-bold text-[#101b38] mt-0.5">{rec.department}</div>
                        </td>
                      )}

                      {/* 4. Date of Joining */}
                      {!hiddenColumns.includes("dateOfJoining") && (
                        <td className="p-3.5 text-center border-r border-zinc-200">
                          <div className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-200/80">
                            <Calendar size={12} className="text-zinc-400" />
                            {rec.dateOfJoining}
                          </div>
                        </td>
                      )}

                      {/* 5. Gross PM (Monthly Salary) */}
                      {!hiddenColumns.includes("grossPM") && (
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
                      )}

                      {/* 6. Gross PA (Annual Baseline Salary = Gross PM × 12) */}
                      {!hiddenColumns.includes("grossPA") && (
                        <td className="p-3.5 text-center border-r border-zinc-200 whitespace-nowrap">
                          {rec.grossPA !== null && rec.grossPA !== undefined ? (
                            <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                              ₹{Number(rec.grossPA).toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-zinc-300 font-bold text-xs italic">-</span>
                          )}
                        </td>
                      )}

                      {/* 7. Appraisal Review Form Mark */}
                      {!hiddenColumns.includes("appraisalMark") && (
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
                      )}

                      {/* 8. Attitude Form Mark */}
                      {!hiddenColumns.includes("attitudeMark") && (
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
                      )}

                      {/* 9. Gross Total Mark */}
                      {!hiddenColumns.includes("grossMark") && (
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
                      )}

                      {/* 10. Performance Criteria Slab */}
                      {!hiddenColumns.includes("criteriaSlab") && (
                        <td className="p-3.5 text-center bg-indigo-50/20 border-r border-zinc-200">
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${rec.tierBadgeColor}`}>
                              {rec.tierCode} ({rec.baseIncrementPct}%)
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 11. Promotion % */}
                      {!hiddenColumns.includes("promotionPct") && (
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
                      )}

                      {/* 12. Promotion Amount */}
                      {!hiddenColumns.includes("promotionAmount") && (
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {rec.promotionAmount !== null ? (
                            <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                              {rec.promotionAmount > 0 ? `₹${Number(rec.promotionAmount).toLocaleString("en-IN")}` : "₹0"}
                            </span>
                          ) : (
                            <span className="text-zinc-300 font-bold text-xs">-</span>
                          )}
                        </td>
                      )}

                      {/* 13. % Increase */}
                      {!hiddenColumns.includes("pctIncrease") && (
                        <td className="p-3.5 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-950 border border-indigo-200">
                            {rec.pctIncrease}%
                          </span>
                        </td>
                      )}

                      {/* 14. Salary Adjustment (PM) */}
                      {!hiddenColumns.includes("salaryAdjustmentPM") && (
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
                      )}

                      {/* 15. Salary Adjustment (PA) */}
                      {!hiddenColumns.includes("salaryAdjustmentPA") && (
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span className="font-mono font-bold text-zinc-700 text-xs whitespace-nowrap inline-block">
                            ₹{Number(rec.salaryAdjustmentPA).toLocaleString("en-IN")}
                          </span>
                        </td>
                      )}

                      {/* 16. Revised Gross (PM) */}
                      {!hiddenColumns.includes("revisedGrossPM") && (
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {rec.revisedGrossPM !== null ? (
                            <span className="font-mono font-black text-emerald-950 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl text-xs shadow-2xs whitespace-nowrap inline-block">
                              ₹{Number(rec.revisedGrossPM).toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-zinc-300 font-bold text-xs">-</span>
                          )}
                        </td>
                      )}

                      {/* 17. Revised Gross (PA) - Right of Revised Gross (PM) */}
                      {!hiddenColumns.includes("revisedGrossPA") && (
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {rec.revisedGrossPA !== null ? (
                            <span className="font-mono font-black text-slate-900 text-xs whitespace-nowrap inline-block">
                              ₹{Number(rec.revisedGrossPA).toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-zinc-300 font-bold text-xs">-</span>
                          )}
                        </td>
                      )}

                      {/* 18. Increment Amount (PM) */}
                      {!hiddenColumns.includes("totalIncrementAmount") && (
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
                      )}

                      {/* 19. Increment Amount (PA) - Right of Increment Amount (PM) */}
                      {!hiddenColumns.includes("totalIncrementAmountPA") && (
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {rec.totalIncrementAmountPA !== null ? (
                            <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                              +₹{Number(rec.totalIncrementAmountPA).toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-zinc-300 font-bold text-xs">-</span>
                          )}
                        </td>
                      )}

                      {/* 20. Action Buttons: Analytics + Breakdown */}
                      {!hiddenColumns.includes("actions") && (
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
                      )}

                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100/95 border-t-2 border-slate-300 text-xs font-black text-slate-900 sticky bottom-0 z-10 shadow-md">
                <tr className="divide-x divide-zinc-200">
                  {/* 1-4. Summary Header */}
                  {["facultyId", "facultyName", "designation", "dateOfJoining"].filter(id => !hiddenColumns.includes(id)).length > 0 && (
                    <td
                      colSpan={["facultyId", "facultyName", "designation", "dateOfJoining"].filter(id => !hiddenColumns.includes(id)).length}
                      className="p-3.5 text-left bg-slate-200/90 font-black text-slate-900"
                    >
                      <div className="flex items-center gap-2">
                        <Calculator size={15} className="text-indigo-700" />
                        <span>Total / Summary ({filteredRecords.length} Staff)</span>
                      </div>
                    </td>
                  )}

                  {/* 5. Gross PM Total */}
                  {!hiddenColumns.includes("grossPM") && (
                    <td className="p-3.5 text-center whitespace-nowrap bg-emerald-100/70 font-mono font-black text-emerald-950">
                      ₹{Number(tableTotals.grossPMTotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 6. Gross PA Total (Gross PM × 12) */}
                  {!hiddenColumns.includes("grossPA") && (
                    <td className="p-3.5 text-center whitespace-nowrap bg-emerald-100/70 border-r border-emerald-200/70 font-mono font-black text-emerald-950">
                      ₹{Number(tableTotals.grossPATotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 7. Appraisal (60%) */}
                  {!hiddenColumns.includes("appraisalMark") && (
                    <td className="p-3.5 text-center text-zinc-400 font-bold bg-blue-50/20">—</td>
                  )}

                  {/* 8. Attitude (40%) */}
                  {!hiddenColumns.includes("attitudeMark") && (
                    <td className="p-3.5 text-center text-zinc-400 font-bold bg-emerald-50/20">—</td>
                  )}

                  {/* 9. Gross Mark (100) */}
                  {!hiddenColumns.includes("grossMark") && (
                    <td className="p-3.5 text-center text-zinc-400 font-bold bg-amber-50/20">—</td>
                  )}

                  {/* 10. Criteria Slab */}
                  {!hiddenColumns.includes("criteriaSlab") && (
                    <td className="p-3.5 text-center text-zinc-400 font-bold bg-indigo-50/20 border-r border-zinc-200">—</td>
                  )}

                  {/* 11. Promotion % */}
                  {!hiddenColumns.includes("promotionPct") && (
                    <td className="p-3.5 text-center text-zinc-400 font-bold">—</td>
                  )}

                  {/* 12. Promotion Amount Total */}
                  {!hiddenColumns.includes("promotionAmount") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-purple-900 bg-purple-50/60">
                      {tableTotals.promotionAmountTotal > 0
                        ? `₹${Number(tableTotals.promotionAmountTotal).toLocaleString("en-IN")}`
                        : "₹0"}
                    </td>
                  )}

                  {/* 13. % Increase Total = ((Revised PA Total - Gross PA Total) / Gross PA Total) * 100 */}
                  {!hiddenColumns.includes("pctIncrease") && (
                    <td className="p-3.5 text-center whitespace-nowrap bg-indigo-50/60">
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-2xs">
                        {tableTotals.totalPctIncrease}%
                      </span>
                    </td>
                  )}

                  {/* 14. Salary Adjustment (PM) Total */}
                  {!hiddenColumns.includes("salaryAdjustmentPM") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-amber-950 bg-amber-50/60">
                      ₹{Number(tableTotals.salaryAdjustmentPMTotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 15. Salary Adjustment (PA) Total */}
                  {!hiddenColumns.includes("salaryAdjustmentPA") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-amber-950 bg-amber-50/60">
                      ₹{Number(tableTotals.salaryAdjustmentPATotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 16. Revised Gross (PM) Total */}
                  {!hiddenColumns.includes("revisedGrossPM") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-emerald-950 bg-emerald-100/90">
                      ₹{Number(tableTotals.revisedGrossPMTotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 17. Revised Gross (PA) Total */}
                  {!hiddenColumns.includes("revisedGrossPA") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-slate-900 bg-emerald-100/90">
                      ₹{Number(tableTotals.revisedGrossPATotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 18. Increment Amount (PM) Total */}
                  {!hiddenColumns.includes("totalIncrementAmount") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-emerald-900 bg-emerald-200/80">
                      +₹{Number(tableTotals.totalIncrementPMTotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 19. Increment Amount (PA) Total */}
                  {!hiddenColumns.includes("totalIncrementAmountPA") && (
                    <td className="p-3.5 text-center whitespace-nowrap font-mono font-black text-slate-900 bg-emerald-200/80">
                      +₹{Number(tableTotals.totalIncrementPATotal).toLocaleString("en-IN")}
                    </td>
                  )}

                  {/* 20. Action */}
                  {!hiddenColumns.includes("actions") && (
                    <td className="p-3.5 text-center text-zinc-400 font-bold">—</td>
                  )}
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
                  <div className="text-xs text-zinc-300 flex items-center gap-3 mt-1">
                    <span>ID: <strong className="text-white font-mono">{selectedCandidate.facultyId}</strong></span>
                    <span>•</span>
                    <span>{selectedCandidate.designation}</span>
                    <span>•</span>
                    <span>{selectedCandidate.department}</span>
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
                    {selectedCandidate.rawApp?.attitudeEvaluation?.remarks && (
                      <div className="text-[11px] text-zinc-600 bg-white p-2.5 rounded-xl border border-emerald-100 italic">
                        "{selectedCandidate.rawApp.attitudeEvaluation.remarks}"
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
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                              <AreaChart
                                data={selectedCandidateAnalyticsData.chartData}
                                margin={{ top: 20, right: 20, left: -5, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="hrSalaryLineGrad" x1="0" y1="0" x2="0" y2="1">
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
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                              <BarChart
                                data={selectedCandidateAnalyticsData.chartData}
                                margin={{ top: 25, right: 20, left: -10, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="hrIncrementBarGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.8} />
                                  </linearGradient>
                                  <linearGradient id="hrIncrementBarGradActive" x1="0" y1="0" x2="0" y2="1">
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
                                      key={`hr-increment-bar-${index}`}
                                      fill={
                                        entry.isBase
                                          ? "#e2e8f0"
                                          : index === selectedCandidateAnalyticsData.chartData.length - 1
                                            ? "url(#hrIncrementBarGradActive)"
                                            : "url(#hrIncrementBarGrad)"
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
                      Salary figures have not yet been uploaded for this candidate ({selectedAnalyticsCandidate.facultyId}). Upload the multi-year Excel template above to visualize their progression timeline and increment graphs.
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

                {/* TAB 2: Performance Slabs */}
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
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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
                          {INSTITUTION_OPTIONS.find((i) => i.code === revenueTargetInst)?.name || userInstitution || revenueTargetInst.toUpperCase()}
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
    </Layout>
  );
}
