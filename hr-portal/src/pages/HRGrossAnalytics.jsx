import React, { useState, useEffect, useMemo, useRef } from "react";
import HRLayout from "../components/HRLayout";
import { auth, db } from "../firebase";
import { collection, doc, onSnapshot, setDoc, getDoc, deleteDoc } from "firebase/firestore";
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
  Building2,
  Trash2
} from "lucide-react";
import { isSameInstitution, normalizeInstitution, getSchoolShortName } from "../utils/appraisalScore";

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

export default function HRGrossAnalytics() {
  const [facultyAppraisals, setFacultyAppraisals] = useState([]);
  const [teacherAppraisals, setTeacherAppraisals] = useState([]);
  const [nonTeachingAppraisals, setNonTeachingAppraisals] = useState([]);
  const [hodAppraisals, setHodAppraisals] = useState([]);
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
        } catch (e) {}

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
  const [approvalFilter, setApprovalFilter] = useState("Approved"); // "Approved", "All"
  const [sortField, setSortField] = useState("grossMark"); // "grossMark", "grossPM", "incrementAmount", "facultyName", "dateOfJoining", "appraisalMark"
  const [sortDirection, setSortDirection] = useState("desc");

  // Modal States
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState(DEFAULT_INCREMENT_CRITERIA);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [parsedPreviewList, setParsedPreviewList] = useState([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadDetectedYears, setUploadDetectedYears] = useState([]);

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
    const rawList = [...facultyAppraisals, ...teacherAppraisals, ...nonTeachingAppraisals, ...hodAppraisals];

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
        app.formData?.empId
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

      // Faculty Name resolution
      const facultyName = (
        app.facultyName ||
        app.formData?.name ||
        app.staffName ||
        app.hodName ||
        matchedUser.displayName ||
        matchedUser.facultyName ||
        "Faculty Member"
      );

      // Designation resolution
      const designation = (
        app.designation ||
        app.formData?.designation ||
        app.staffDesignation ||
        matchedUser.designation ||
        "Faculty"
      );

      // Department resolution
      const department = (
        app.department ||
        app.formData?.department ||
        app.dept ||
        app.formData?.dept ||
        matchedUser.department ||
        matchedUser.dept ||
        "General"
      );

      // Institution resolution (e.g. 'CKSPK (Matric)', 'CKSPE (CBSE)', 'CKCOE', 'CKCET')
      const institution = (
        app.institution ||
        app.formData?.institution ||
        app.school ||
        app.formData?.school ||
        matchedUser.institution ||
        matchedUser.school ||
        (app.collectionType === "teacher" ? "CKSPK (Matric)" : app.collectionType === "faculty" ? "CKCOE" : "")
      );

      // Date of Joining (DOJ) resolution
      const dateOfJoining = (
        app.formData?.dojCollege ||
        app.formData?.dateOfJoining ||
        app.formData?.doj ||
        app.dojCollege ||
        app.dateOfJoining ||
        app.doj ||
        matchedUser.dateOfJoining ||
        matchedUser.dojCollege ||
        "-"
      );

      // 1. Appraisal Review Form Mark (out of 100)
      // The Principal's explicit Final Rating entered in AppraisalReviews takes highest priority
      let appraisalMark = 0;
      const rawFinalRating = app.principalReview?.finalRating ?? app.principalReview?.rating ?? app.performanceEvaluation?.finalRating ?? app.finalRating;
      const hasFinalRating = rawFinalRating !== undefined && rawFinalRating !== null && rawFinalRating !== "" && !isNaN(Number(rawFinalRating));

      if (hasFinalRating) {
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

      // 3. Mark = (0.6 * appraisal review form mark) + (0.4 * attitude form mark)
      const weightedAppraisal = 0.6 * appraisalMark;
      const weightedAttitude = 0.4 * attitudeMarkNormalized;
      const grossMark = Number((weightedAppraisal + weightedAttitude).toFixed(2));

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

      // Col Q: % Increase = Base Increment % + Promotion %
      const pctIncrease = baseIncrementPct + promotionPct;

      // Col T: Revised Gross (PM) = Revised Gross PA / 12
      const revisedGrossPM = grossPM !== null && revisedGrossPA !== null
        ? Number((revisedGrossPA / 12).toFixed(2))
        : null;

      // Col U: INCREMENT AMOUNT = Revised Gross (PM) - Gross PM
      const totalIncrementAmount = grossPM !== null && revisedGrossPM !== null
        ? Number((revisedGrossPM - grossPM).toFixed(2))
        : null;
      const totalIncrementAmountPA = totalIncrementAmount !== null
        ? Number((totalIncrementAmount * 12).toFixed(2))
        : null;

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
        isPrincipalApproved: app.status === "Approved" || Boolean(app.principalReview)
      };
    });
  }, [facultyAppraisals, teacherAppraisals, nonTeachingAppraisals, hodAppraisals, usersMap, salariesMap, criteriaConfig, promotionsMap, salaryAdjustmentsMap]);

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
      // Approval Filter: by default "Approved", showing only Principal approved
      if (approvalFilter === "Approved" && !rec.isPrincipalApproved) {
        return false;
      }

      // Department Filter (from dropdown)
      if (selectedDept !== "All" && rec.department !== selectedDept) {
        return false;
      }

      // Type Filter
      if (selectedType !== "All") {
        if (selectedType === "Faculty" && rec.collectionType !== "faculty" && rec.collectionType !== "teacher") return false;
        if (selectedType === "Non-Teaching" && rec.collectionType !== "non_teaching") return false;
        if (selectedType === "HOD" && rec.collectionType !== "hod") return false;
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
        "revisedGrossPM", "totalIncrementAmount", "incrementAmount"
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
        r.incrementAmountPA !== null ? r.incrementAmountPA : ""
      ]);
    });

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
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border ${
              toast.type === "error"
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
              <p className="text-zinc-300 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
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
                <div className="text-[10px] text-zinc-300 mt-0.5">
                  Increment % derived from Gross Mark slab • Increment ₹ = Gross PM × Increment %
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Executive Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Approved Staff */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between text-zinc-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Approved Faculty</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users size={18} />
              </div>
            </div>
            <div className="text-3xl font-black text-[#101b38]">{metrics.totalEvaluated}</div>
            <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1 mt-1">
              <CheckCircle2 size={12} /> Principal Reviewed & Approved
            </div>
          </div>

          {/* Card 2: Average Gross Score */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between text-zinc-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Avg. Gross Mark</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Percent size={18} />
              </div>
            </div>
            <div className="text-3xl font-black text-indigo-900">{metrics.avgGross} <span className="text-xs font-bold text-zinc-400">/ 100</span></div>
            <div className="text-[11px] font-medium text-indigo-600 flex items-center gap-1 mt-1">
              <TrendingUp size={12} /> Institutional Average Increment: <strong>{metrics.avgIncrementPct}%</strong>
            </div>
          </div>

          {/* Card 3: Total Gross PM Outlay */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between text-zinc-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Total Gross PM Outlay</span>
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <IndianRupee size={18} />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              ₹{Number(metrics.totalGrossPM).toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] font-medium text-zinc-500 mt-1">
              Uploaded for {metrics.salariesUploadedCount} of {metrics.totalEvaluated} staff
            </div>
          </div>

          {/* Card 4: Projected Monthly Increment Outlay */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between text-zinc-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Monthly Increment Outlay</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <BadgePercent size={18} />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-950 font-mono">
              +₹{Number(metrics.totalIncrementPM).toLocaleString("en-IN")} <span className="text-xs text-zinc-400 font-sans font-bold">PM</span>
            </div>
            <div className="text-[11px] font-bold text-emerald-700 mt-1">
              Annual: +₹{Number(metrics.totalIncrementPM * 12).toLocaleString("en-IN")} / yr
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
              {/* Approval Filter Switch */}
              <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setApprovalFilter("Approved")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    approvalFilter === "Approved"
                      ? "bg-white text-[#101b38] shadow-xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  Approved by Principal
                </button>
                <button
                  onClick={() => setApprovalFilter("All")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    approvalFilter === "All"
                      ? "bg-white text-[#101b38] shadow-xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  All Appraisals
                </button>
              </div>

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
            <table className="w-full min-w-[2200px] border-collapse text-left text-xs">
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

                  {/* 6. Appraisal Review Form Mark (60%) */}
                  <th
                    onClick={() => handleSort("appraisalMark")}
                    className="p-3.5 cursor-pointer hover:bg-blue-100/50 transition-colors text-center bg-blue-50/40"
                    title="Appraisal Review Form Mark (60% weightage)"
                  >
                    <div className="flex items-center justify-center gap-1 text-blue-900">
                      Appraisal (60%) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 7. Attitude Form Mark (40%) */}
                  <th
                    onClick={() => handleSort("attitudeMarkNormalized")}
                    className="p-3.5 cursor-pointer hover:bg-emerald-100/50 transition-colors text-center bg-emerald-50/40"
                    title="Attitude Form Mark (40% weightage)"
                  >
                    <div className="flex items-center justify-center gap-1 text-emerald-900">
                      Attitude (40%) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 8. Gross Mark (100) */}
                  <th
                    onClick={() => handleSort("grossMark")}
                    className="p-3.5 cursor-pointer hover:bg-amber-100/50 transition-colors text-center bg-amber-50/30"
                    title="Gross Score = (0.6 * Appraisal) + (0.4 * Attitude)"
                  >
                    <div className="flex items-center justify-center gap-1 text-amber-900 font-black">
                      Score (100) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 9. Performance Criteria & Increment % */}
                  <th
                    onClick={() => handleSort("baseIncrementPct")}
                    className="p-3.5 cursor-pointer hover:bg-indigo-100/50 transition-colors text-center bg-indigo-50/30 border-r border-zinc-200"
                    title="Performance Tier & Base Increment %"
                  >
                    <div className="flex items-center justify-center gap-1 text-indigo-900 font-black">
                      Criteria Slab <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 10. Promotion % */}
                  <th
                    onClick={() => handleSort("promotionPct")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Promotion Recommendation Percentage"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Promotion % <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 11. Promotion Amount */}
                  <th
                    onClick={() => handleSort("promotionAmount")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Promotion Increment Amount (PA) = Gross PA × Promotion %"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Promotion Amount <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 12. % Increase */}
                  <th
                    onClick={() => handleSort("pctIncrease")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Total % Increase = Tier Increment % + Promotion %"
                  >
                    <div className="flex items-center justify-center gap-1">
                      % Increase <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 13. Salary Adjustment (PM) */}
                  <th
                    onClick={() => handleSort("salaryAdjustmentPM")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Monthly Discretionary Adjustment (₹ PM)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Salary Adjustment (PM) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 14. Salary Adjustment (PA) */}
                  <th
                    onClick={() => handleSort("salaryAdjustmentPA")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Annual Salary Adjustment = Adjustment (PM) × 12"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Salary Adjustment (PA) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 15. Revised Gross (PM) */}
                  <th
                    onClick={() => handleSort("revisedGrossPM")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Final Revised Gross Monthly Salary"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Revised Gross (PM) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 16. Revised Gross (PA) - Right of Revised Gross (PM) */}
                  <th
                    onClick={() => handleSort("revisedGrossPA")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Revised Gross Annual Salary = Gross PA + Increment Amount (PA) + Promotion Amount + Salary Adjustment (PA)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Revised Gross (PA) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 17. Increment Amount (PM) */}
                  <th
                    onClick={() => handleSort("totalIncrementAmount")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Net Total Increment Amount = Revised Gross (PM) - Original Gross (PM)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Increment Amount (PM) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 18. Increment Amount (PA) - Right of Increment Amount (PM) */}
                  <th
                    onClick={() => handleSort("incrementAmountPA")}
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors text-center"
                    title="Annual Increment Amount = Gross PA × Tier Increment %"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Increment Amount (PA) <ArrowUpDown size={11} />
                    </div>
                  </th>

                  {/* 19. Action */}
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={19} className="p-12 text-center text-zinc-400 font-semibold">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Gross Analytics Records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="p-12 text-center text-zinc-400 font-medium">
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
                          {rec.collectionType === "teacher"
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

                      {/* 6. Appraisal Review Form Mark (60%) */}
                      <td className="p-3.5 text-center bg-blue-50/20">
                        <div className="font-black text-blue-950 text-xs">
                          {rec.appraisalMark} <span className="text-[10px] font-bold text-blue-500">/ 100</span>
                        </div>
                        <div className="text-[10px] font-bold text-blue-700 mt-0.5">
                          60% = <strong className="text-blue-900">{rec.weightedAppraisal} pts</strong>
                        </div>
                      </td>

                      {/* 7. Attitude Form Mark (40%) */}
                      <td className="p-3.5 text-center bg-emerald-50/20">
                        <div className="font-black text-emerald-950 text-xs">
                          {rec.attitudeMarkNormalized}%
                          <span className="text-[10px] font-bold text-zinc-400 ml-1">
                            ({rec.attitudeTotalScore}/{rec.attitudeMaxScore})
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
                          40% = <strong className="text-emerald-900">{rec.weightedAttitude} pts</strong>
                        </div>
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
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                            rec.promotionPct > 0
                              ? "bg-purple-100 text-purple-900 border-purple-300"
                              : "bg-zinc-100 text-zinc-500 border-zinc-200"
                          }`}>
                            {rec.promotionPct}%
                          </span>
                          <button
                            type="button"
                            onClick={() => handleTogglePromotion(rec.facultyId)}
                            className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                              rec.isPromoted
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

                      {/* 18. Increment Amount (PA) - Right of Increment Amount (PM) */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {rec.incrementAmountPA !== null ? (
                          <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap inline-block">
                            ₹{Number(rec.incrementAmountPA).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-zinc-300 font-bold text-xs">-</span>
                        )}
                      </td>

                      {/* 19. Action Button */}
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => setSelectedCandidate(rec)}
                          className="px-3 py-1.5 bg-[#101b38] hover:bg-[#1c356e] text-white rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs"
                          title="View Complete Salary Revision Breakdown"
                        >
                          <Eye size={12} /> Breakdown
                        </button>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
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
                  <div className="font-mono text-xs bg-white p-3 rounded-xl border border-amber-200 text-slate-800 space-y-1">
                    <div>Gross Mark = (0.60 × Appraisal Review Mark) + (0.40 × Attitude Form Mark)</div>
                    <div className="text-amber-800 font-bold">
                      Gross Mark = (0.60 × {selectedCandidate.appraisalMark}) + (0.40 × {selectedCandidate.attitudeMarkNormalized})
                    </div>
                    <div className="text-emerald-700 font-black text-sm pt-1 border-t border-zinc-100">
                      = {selectedCandidate.weightedAppraisal} + {selectedCandidate.weightedAttitude} = <span className="underline">{selectedCandidate.grossMark} / 100</span>
                    </div>
                  </div>
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
                      className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                        selectedCandidate.isPromoted
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

      </div>
    </HRLayout>
  );
}
