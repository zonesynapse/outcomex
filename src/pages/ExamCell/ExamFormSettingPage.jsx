import { useState, useEffect, useMemo, useRef } from "react";
import { onSnapshot, doc, setDoc, updateDoc, collection, query, orderBy, serverTimestamp, addDoc, getDoc, getDocs } from "firebase/firestore";
import { db, auth } from "../../firebase";
import Layout from "../../components/Layout";
import AnnaUniversityPhotocopyModal from "../../components/AnnaUniversityPhotocopyModal";
import AnnaUniversityFeeReportModal from "../../components/AnnaUniversityFeeReportModal";
import EsePaidFeeReportModal from "../../components/EsePaidFeeReportModal";
import * as XLSX from "xlsx";
import { formatDepartmentDisplay, isDeptMatch, sanitizeKey, formatProgrammeKey, formatProgDisplay, formatBatchDisplay, getRecentBatches } from "../../lib/utils";
import { useDepartments } from "../../hooks/useDepartments";
import { useBatches } from "../../hooks/useBatches";
import {
  Copy, RefreshCw, FileSearch, GraduationCap,
  Save, Loader2, CheckCircle2, AlertCircle,
  CalendarDays, IndianRupee, Power, FileText,
  Eye, UserCheck, Clock, CheckCircle, XCircle, ShieldCheck, FileSpreadsheet, RotateCcw, X, FileWarning, Download,
  Plus, Upload, Users, Search, Edit3, Trash2, Check, Sparkles, Filter, Lock
} from "lucide-react";
import PhotocopyProblemModal from "../../components/PhotocopyProblemModal";

const normAlpha = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const isBatchMatch = (b1, b2) => {
  if (!b1 || !b2) return false;
  const n1 = normAlpha(b1);
  const n2 = normAlpha(b2);
  if (!n1 || !n2) return false;
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  const y1 = String(b1).match(/20\d{2}/)?.[0] || String(b1).match(/\b\d{2}\b/)?.[0] || "";
  const y2 = String(b2).match(/20\d{2}/)?.[0] || String(b2).match(/\b\d{2}\b/)?.[0] || "";
  if (y1 && y2) {
    const c1 = y1.length === 2 ? `20${y1}` : y1;
    const c2 = y2.length === 2 ? `20${y2}` : y2;
    if (c1 === c2) return true;
  }
  return false;
};

// Global in-memory cache for loaded student class lists (0ms instant hits)
const studentRosterCache = new Map();

// In-flight request deduplication & shared all-students snapshot cache
let allStudentsCollectionPromise = null;
let cachedAllStudentsSnap = null;
let cachedAllStudentsTime = 0;

async function getAllStudentsSnapShared() {
  const now = Date.now();
  if (cachedAllStudentsSnap && now - cachedAllStudentsTime < 180000) {
    return cachedAllStudentsSnap;
  }
  if (allStudentsCollectionPromise) {
    return allStudentsCollectionPromise;
  }
  allStudentsCollectionPromise = getDocs(collection(db, "students"))
    .then((snap) => {
      cachedAllStudentsSnap = snap;
      cachedAllStudentsTime = Date.now();
      allStudentsCollectionPromise = null;
      return snap;
    })
    .catch((err) => {
      allStudentsCollectionPromise = null;
      throw err;
    });
  return allStudentsCollectionPromise;
}

function extractDeptVariations(dept) {
  if (!dept) return [];
  const raw = String(dept).trim();
  const variations = new Set();

  variations.add(raw);
  variations.add(sanitizeKey(raw));
  variations.add(raw.replace(/[^a-zA-Z0-9]/g, "_"));

  // Strip code prefix (e.g. "121 - B.E. Bio Medical Engineering" -> "B.E. Bio Medical Engineering")
  const noCode = raw.replace(/^\d+\s*[-_:]\s*/, "").trim();
  if (noCode && noCode !== raw) {
    variations.add(noCode);
    variations.add(sanitizeKey(noCode));
    variations.add(noCode.replace(/[^a-zA-Z0-9]/g, "_"));
  }

  // Strip degree prefix (e.g. "B.E. Bio Medical Engineering" -> "Bio Medical Engineering")
  const baseDept = (noCode || raw).replace(/^(B\.?Tech\.?|B\.?E\.?|M\.?E\.?|M\.?Tech\.?|MBA|MCA)\s+/i, "").trim();
  if (baseDept) {
    variations.add(baseDept);
    variations.add(sanitizeKey(baseDept));
    variations.add(baseDept.replace(/[^a-zA-Z0-9]/g, "_"));
    variations.add(baseDept.replace(/_/g, " "));
  }

  // Acronym (e.g. "Bio Medical Engineering" -> "BME")
  const words = baseDept.split(/[\s&/_-]+/).filter(Boolean);
  if (words.length > 1) {
    const acronym = words.map((w) => w[0]).join("").toUpperCase();
    variations.add(acronym);
  }

  return Array.from(variations).filter(Boolean);
}

function extractBatchVariations(batch) {
  if (!batch) return [];
  const raw = String(batch).trim();
  const variations = new Set();

  variations.add(raw);
  variations.add(sanitizeKey(raw));

  const yearsMatch = raw.match(/(\d{4})\s*[-_]\s*(\d{2,4})/);
  if (yearsMatch) {
    const y1 = yearsMatch[1];
    const rawY2 = yearsMatch[2];
    const y2 = rawY2.length === 2 ? `20${rawY2}` : rawY2;
    const shortY2 = y2.slice(-2);
    const shortY1 = y1.slice(-2);

    variations.add(`${y1}-${y2}`);
    variations.add(`${y1}_${y2}`);
    variations.add(`${y1}-${shortY2}`);
    variations.add(`${y1}_${shortY2}`);
    variations.add(`${shortY1}_Batch`);
    variations.add(`${shortY1} Batch`);
    variations.add(`${shortY1}`);
    variations.add(`${shortY1}_Batch__${y1}_${shortY2}_`);
    variations.add(`${shortY1}_Batch__${y1}_${y2}_`);
  }

  const batchNumMatch = raw.match(/(\d{2})\s*Batch/i);
  if (batchNumMatch) {
    variations.add(`${batchNumMatch[1]}_Batch`);
    variations.add(`${batchNumMatch[1]} Batch`);
    variations.add(`${batchNumMatch[1]}`);
  }

  return Array.from(variations).filter(Boolean);
}

async function fetchStudentsForClass({ programme, department, batch, section }) {
  if (!programme || !department || !batch) return [];

  const cacheKey = `${programme}_${department}_${batch}_${section || "ALL"}`.toLowerCase();
  if (studentRosterCache.has(cacheKey)) {
    return studentRosterCache.get(cacheKey);
  }

  const progKey = formatProgrammeKey(programme);
  const progCandidates = [progKey, programme, ""].filter((p, i, a) => a.indexOf(p) === i);
  const deptCandidates = extractDeptVariations(department);
  const batchCandidates = extractBatchVariations(batch);

  const secVariations = [];
  if (section && section !== "ALL" && section !== "All Sections") {
    const rawSec = String(section).trim();
    const cleanSec = sanitizeKey(rawSec);
    const secLetter = rawSec.replace(/[^a-zA-Z0-9]/g, "");
    secVariations.push(`_${cleanSec}`);
    secVariations.push(`_${cleanSec.replace(/-/g, "_")}`);
    secVariations.push(`_${cleanSec.replace(/_/g, "-")}`);
    if (secLetter) {
      secVariations.push(`_${secLetter}`);
      secVariations.push(`_Sec_${secLetter}`);
      secVariations.push(`_Sec-${secLetter}`);
    }
  }
  const allSecVariations = Array.from(new Set([...secVariations, ""]));

  // Generate prioritized candidate doc IDs
  const candidateDocIds = [];
  for (const b of batchCandidates) {
    for (const d of deptCandidates) {
      for (const p of progCandidates) {
        for (const s of allSecVariations) {
          if (p) {
            candidateDocIds.push(`${b}_${p}_${d}${s}`);
          }
          candidateDocIds.push(`${b}_${d}${s}`);
        }
      }
    }
  }

  const uniqueCandidateIds = Array.from(new Set(candidateDocIds));

  // 1. FAST PARALLEL CHECK: Check top candidates concurrently
  let studentData = null;
  const batchSize = 10;
  for (let i = 0; i < Math.min(uniqueCandidateIds.length, 30); i += batchSize) {
    const chunk = uniqueCandidateIds.slice(i, i + batchSize);
    const promises = chunk.map((cid) =>
      getDoc(doc(db, "students", cid))
        .then((snap) => {
          if (snap.exists()) {
            const d = snap.data();
            const count = Object.keys(d || {}).filter((k) => !k.startsWith("_")).length;
            if (count > 0) return { d, cid };
          }
          return null;
        })
        .catch(() => null)
    );

    const results = await Promise.all(promises);
    const matched = results.find((r) => r && r.d);
    if (matched) {
      studentData = matched.d;
      break;
    }
  }

  // 2. Broad fallback scan using shared cached snapshot (only if direct IDs missed)
  if (!studentData || Object.keys(studentData).filter((k) => !k.startsWith("_")).length === 0) {
    try {
      const studentsSnap = await getAllStudentsSnapShared();
      let matchedDoc = null;
      let matchedBaseDoc = null;

      studentsSnap.forEach((d) => {
        const data = d.data();
        const meta = data?._meta || {};
        const docDept = meta.department || d.id;
        const docBatch = meta.batch || d.id;

        if (isBatchMatch(docBatch, batch) && isDeptMatch(docDept, department)) {
          const count = Object.keys(data).filter((k) => !k.startsWith("_")).length;
          if (count > 0) {
            const docIdLower = d.id.toLowerCase();
            const secLower = section ? section.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
            if (secLower && secLower !== "all" && docIdLower.includes(secLower)) {
              matchedDoc = data;
            } else if (!matchedBaseDoc) {
              matchedBaseDoc = data;
            }
          }
        }
      });

      studentData = matchedDoc || matchedBaseDoc;
    } catch (e) {
      console.warn("Student fallback scan error:", e);
    }
  }

  if (!studentData) {
    studentRosterCache.set(cacheKey, []);
    return [];
  }

  const studentList = Object.entries(studentData)
    .filter(([key]) => !key.startsWith("_"))
    .map(([reg, value]) => ({
      reg,
      name: value !== null && typeof value === "object" ? value.name || "" : String(value || ""),
    }));

  const order = studentData._order || studentData.order;
  if (order && Array.isArray(order)) {
    studentList.sort((a, b) => {
      const idxA = order.indexOf(a.reg);
      const idxB = order.indexOf(b.reg);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: "base" });
    });
  } else {
    studentList.sort((a, b) =>
      String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: "base" })
    );
  }

  studentRosterCache.set(cacheKey, studentList);
  return studentList;
}

const FORM_TABS = [
  {
    id: "photocopy",
    label: "Photocopy",
    icon: Copy,
    desc: "Answer script photocopy applications (student end page hide / view control)",
    defaultFee: 300,
  },
  {
    id: "photocopy_problem",
    label: "Photo Copy Problem",
    icon: FileWarning,
    desc: "Answer script photocopy problem discrepancy reports",
    defaultFee: 0,
  },
  {
    id: "revaluation",
    label: "Revaluation",
    icon: RefreshCw,
    desc: "Answer script revaluation applications with marks re-check",
    defaultFee: 400,
  },
  {
    id: "review",
    label: "Review",
    icon: FileSearch,
    desc: "Answer script review / challenge applications",
    defaultFee: 400,
  },
  {
    id: "ese_registration",
    label: "ESE Registration",
    icon: GraduationCap,
    desc: "End Semester Examination registration window for students",
    defaultFee: 0,
  },
];

const emptyForm = (tab) => ({
  isOpen: true,
  fromDate: "",
  toDate: "",
  selectedExamId: "",
  feePerSubject: tab.defaultFee,
  instructions: "",
});

export default function ExamFormSettingPage() {
  const [activeTab, setActiveTab] = useState("photocopy");
  const [forms, setForms] = useState(() => {
    const init = {};
    FORM_TABS.forEach(t => { init[t.id] = emptyForm(t); });
    return init;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Departments and Batches hooks for ESE Student Fee Roster
  const { departments: progDepartments, durations: progDurations } = useDepartments();
  const { getActiveBatches } = useBatches(progDurations);

  // ESE Registration States
  const [eseExams, setEseExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [paidFeeReportModalOpen, setPaidFeeReportModalOpen] = useState(false);
  const [newExamName, setNewExamName] = useState("");
  const [newExamSession, setNewExamSession] = useState("");
  const [newExamAcademicYear, setNewExamAcademicYear] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  // ESE Student Roster Filters
  const [eseProgramme, setEseProgramme] = useState("");
  const [eseDepartment, setEseDepartment] = useState("");
  const [eseBatch, setEseBatch] = useState("");
  const [eseSection, setEseSection] = useState("ALL");
  const [batchSectionConfigs, setBatchSectionConfigs] = useState({});

  // Student list and fees state
  const [studentsList, setStudentsList] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentFees, setStudentFees] = useState({});
  const [eseFromDate, setEseFromDate] = useState("");
  const [eseToDate, setEseToDate] = useState("");
  const [commonFeeInput, setCommonFeeInput] = useState("");
  const [savingFees, setSavingFees] = useState(false);
  const [lastFeeSaveInfo, setLastFeeSaveInfo] = useState(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const fileInputRef = useRef(null);

  // Submitted Photocopy Applications state
  const [photocopyApps, setPhotocopyApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [revokeModal, setRevokeModal] = useState({ open: false, app: null });
  const [revokeMessage, setRevokeMessage] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTargetType, setExportTargetType] = useState("photocopy"); // "photocopy" | "revaluation"
  const [selectedExportStatuses, setSelectedExportStatuses] = useState(["ALL"]);
  const [feeReportModalOpen, setFeeReportModalOpen] = useState(false);
  const [feeReportTargetType, setFeeReportTargetType] = useState("photocopy"); // "photocopy" | "revaluation" | "review"

  // Submitted Review Applications state
  const [reviewApps, setReviewApps] = useState([]);
  const [loadingReviewApps, setLoadingReviewApps] = useState(true);
  const [selectedReviewApp, setSelectedReviewApp] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const getStatusCount = (statusId, targetType = exportTargetType) => {
    let targetApps = photocopyApps;
    if (targetType === "revaluation") targetApps = revaluationApps;
    else if (targetType === "review") targetApps = reviewApps;
    if (statusId === "ALL") return targetApps.length;
    return targetApps.filter((app) => (app.status || "Payment Pending") === statusId).length;
  };

  const toggleExportStatus = (statusKey) => {
    if (statusKey === "ALL") {
      setSelectedExportStatuses(["ALL"]);
      return;
    }
    setSelectedExportStatuses((prev) => {
      let filtered = prev.filter((s) => s !== "ALL");
      if (filtered.includes(statusKey)) {
        filtered = filtered.filter((s) => s !== statusKey);
      } else {
        filtered.push(statusKey);
      }
      if (filtered.length === 0) return ["ALL"];
      return filtered;
    });
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleRevokePhotocopyByExamCell = async () => {
    if (!revokeModal.app?.id) return;
    if (!revokeMessage.trim()) {
      showToast("Please enter a reason/message for revoking the application.", "error");
      return;
    }
    setRevoking(true);
    try {
      await updateDoc(doc(db, "photocopy_applications", revokeModal.app.id), {
        status: "Revoked by Exam Cell",
        revokeReason: revokeMessage.trim(),
        revokedBy: "Exam Cell Admin",
        revokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Application for ${revokeModal.app.studentName || revokeModal.app.regNo} revoked & returned to department / student.`, "success");
      setRevokeModal({ open: false, app: null });
      setRevokeMessage("");
    } catch (err) {
      console.error("Revoke photocopy error:", err);
      showToast("Failed to revoke application: " + err.message, "error");
    }
    setRevoking(false);
  };

  // Realtime sync of all form windows
  useEffect(() => {
    const unsubs = FORM_TABS.map((tab) =>
      onSnapshot(doc(db, "exam_cell_settings", tab.id), (snap) => {
        if (snap.exists()) {
          const d = snap.data() || {};
          setForms((prev) => ({
            ...prev,
            [tab.id]: {
              isOpen: d.isOpen !== false,
              fromDate: d.fromDate || "",
              toDate: d.toDate || "",
              selectedExamId: d.selectedExamId || "",
              feePerSubject: d.feePerSubject ?? tab.defaultFee,
              instructions: d.instructions || "",
            },
          }));
          if (tab.id === "ese_registration" && d.selectedExamId) {
            setSelectedExamId((prev) => prev || d.selectedExamId);
          }
        }
        setLoading(false);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Realtime sync of submitted photocopy applications (Filter out unpaid / Payment Pending applications)
  useEffect(() => {
    const q = query(collection(db, "photocopy_applications"), orderBy("appliedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(app => {
          // Strictly exclude applications with status "Payment Pending" or paymentStatus "Pending"
          const isPaid = app.paymentStatus === "Paid" || app.billAttached === true || !!app.electronicBill || !!app.transactionId;
          const isConfirmedStatus = ["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Copy Issued", "Closed", "Revoked by HOD", "Revoked by Exam Cell"].includes(app.status);
          return (isPaid || isConfirmedStatus) && app.status !== "Payment Pending" && app.paymentStatus !== "Pending";
        });
      setPhotocopyApps(list);
      setLoadingApps(false);
    }, (err) => {
      console.error("Error fetching photocopy applications:", err);
      setLoadingApps(false);
    });
    return () => unsub();
  }, []);

  // Submitted Photocopy Problem Discrepancy Applications state
  const [problemApps, setProblemApps] = useState([]);
  const [loadingProblemApps, setLoadingProblemApps] = useState(true);
  const [selectedProblemApp, setSelectedProblemApp] = useState(null);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [revokeProblemModal, setRevokeProblemModal] = useState({ open: false, app: null });
  const [revokeProblemMessage, setRevokeProblemMessage] = useState("");
  const [revokingProblem, setRevokingProblem] = useState(false);

  // Realtime sync of submitted photocopy problem applications
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "photocopy_problem_applications"), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => {
        const at = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const bt = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return bt - at;
      });
      setProblemApps(list);
      setLoadingProblemApps(false);
    }, (err) => {
      console.error("Error fetching photocopy problem applications:", err);
      setLoadingProblemApps(false);
    });
    return () => unsub();
  }, []);

  // Submitted Revaluation Applications state
  const [revaluationApps, setRevaluationApps] = useState([]);
  const [loadingRevalApps, setLoadingRevalApps] = useState(true);
  const [selectedRevalApp, setSelectedRevalApp] = useState(null);
  const [showRevalModal, setShowRevalModal] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "revaluation_applications"), orderBy("appliedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(app => {
          const isPaid = app.paymentStatus === "Paid" || app.billAttached === true || !!app.electronicBill || !!app.transactionId;
          const isConfirmedStatus = ["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Approved", "Result Published", "Revoked by HOD", "Revoked by Exam Cell"].includes(app.status);
          return (isPaid || isConfirmedStatus) && app.status !== "Payment Pending" && app.paymentStatus !== "Pending";
        });
      setRevaluationApps(list);
      setLoadingRevalApps(false);
    }, (err) => {
      console.error("Error fetching revaluation applications:", err);
      setLoadingRevalApps(false);
    });
    return () => unsub();
  }, []);

  const handleUpdateRevaluationStatus = async (appId, newStatus) => {
    setUpdatingStatusId(appId);
    try {
      await updateDoc(doc(db, "revaluation_applications", appId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Exam Cell",
      });
      showToast(`Revaluation application status updated to "${newStatus}"`, "success");
    } catch (err) {
      console.error("Error updating revaluation status:", err);
      showToast("Failed to update status: " + err.message, "error");
    }
    setUpdatingStatusId(null);
  };

  useEffect(() => {
    const q = query(collection(db, "review_applications"), orderBy("appliedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(app => {
          const isPaid = app.paymentStatus === "Paid" || app.billAttached === true || !!app.electronicBill || !!app.transactionId;
          const isConfirmedStatus = ["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Approved", "Result Published", "Revoked by HOD", "Revoked by Exam Cell"].includes(app.status);
          return (isPaid || isConfirmedStatus) && app.status !== "Payment Pending" && app.paymentStatus !== "Pending";
        });
      setReviewApps(list);
      setLoadingReviewApps(false);
    }, (err) => {
      console.error("Error fetching review applications:", err);
      setLoadingReviewApps(false);
    });
    return () => unsub();
  }, []);

  const handleUpdateReviewStatus = async (appId, newStatus) => {
    setUpdatingStatusId(appId);
    try {
      await updateDoc(doc(db, "review_applications", appId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Exam Cell",
      });
      showToast(`Review application status updated to "${newStatus}"`, "success");
    } catch (err) {
      console.error("Error updating review status:", err);
      showToast("Failed to update status: " + err.message, "error");
    }
    setUpdatingStatusId(null);
  };

  const handleRevokeProblemByExamCell = async () => {
    if (!revokeProblemModal.app?.id) return;
    if (!revokeProblemMessage.trim()) {
      showToast("Please enter a reason/message for revoking the application.", "error");
      return;
    }
    setRevokingProblem(true);
    try {
      await updateDoc(doc(db, "photocopy_problem_applications", revokeProblemModal.app.id), {
        status: "Revoked by Exam Cell",
        revokeReason: revokeProblemMessage.trim(),
        revokedBy: "Exam Cell Admin",
        revokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Problem report for ${revokeProblemModal.app.studentName || revokeProblemModal.app.regNo} revoked & returned.`, "success");
      setRevokeProblemModal({ open: false, app: null });
      setRevokeProblemMessage("");
    } catch (err) {
      console.error("Revoke problem error:", err);
      showToast("Failed to revoke application: " + err.message, "error");
    }
    setRevokingProblem(false);
  };

  const setField = (field, value) => {
    setForms((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], [field]: value } }));
  };

  const handleSave = async () => {
    const tab = FORM_TABS.find((t) => t.id === activeTab);
    const form = forms[activeTab];
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      showToast("To Date cannot be earlier than From Date.", "error");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "exam_cell_settings", activeTab), {
        ...form,
        selectedExamId: selectedExamId || form.selectedExamId || "",
        feePerSubject: Number(form.feePerSubject) || 0,
        updatedBy: auth.currentUser?.email || "",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(`${tab.label} window saved successfully!`, "success");
    } catch (err) {
      console.error("Save exam form setting error:", err);
      showToast("Failed to save. " + err.message, "error");
    }
    setSaving(false);
  };

  // Realtime sync of ESE exams list
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "ese_exams"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setEseExams(list);
      if (list.length > 0 && !selectedExamId) {
        const savedExam = forms.ese_registration?.selectedExamId;
        if (savedExam && list.some(e => e.id === savedExam)) {
          setSelectedExamId(savedExam);
        }
      }
    }, (err) => {
      console.warn("ese_exams listener error:", err);
    });
    return () => unsub();
  }, [forms.ese_registration?.selectedExamId, selectedExamId]);

  // Realtime sync of batch sections configuration directly from Curriculum.jsx (batch_sections)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "batch_sections"), (snap) => {
      const cfgs = {};
      snap.forEach((d) => { cfgs[d.id] = d.data(); });
      setBatchSectionConfigs(cfgs);
    }, (err) => {
      console.warn("batch_sections listener error:", err);
    });
    return () => unsub();
  }, []);

  // Realtime sync of department metadata (codes) directly from Curriculum.jsx (department_metadata)
  const [deptMetadata, setDeptMetadata] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "department_metadata"), (snap) => {
      const data = {};
      snap.forEach((d) => { data[d.id] = d.data(); });
      setDeptMetadata(data);
    }, (err) => {
      console.warn("department_metadata listener error:", err);
    });
    return () => unsub();
  }, []);

  // 1. Available Programmes from Curriculum.jsx (programme_durations / programme_departments)
  const availableProgrammes = useMemo(() => {
    const fromDurations = Object.keys(progDurations || {});
    const fromDepts = Object.keys(progDepartments || {});
    const combined = [...new Set([...fromDurations, ...fromDepts])];
    return combined.sort();
  }, [progDurations, progDepartments]);

  // 2. Available Departments for selected Programme configured in Curriculum.jsx
  const availableDepartments = useMemo(() => {
    if (!eseProgramme) return [];
    const depts = progDepartments[eseProgramme] || [];
    // Academic departments prioritized first, general administration sorted to end
    return [...depts].sort((a, b) => {
      const aIsAdmin = a.toLowerCase().includes("administration");
      const bIsAdmin = b.toLowerCase().includes("administration");
      if (aIsAdmin && !bIsAdmin) return 1;
      if (!aIsAdmin && bIsAdmin) return -1;
      return a.localeCompare(b);
    });
  }, [progDepartments, eseProgramme]);

  // 3. Available Batches identical to Curriculum.jsx getBatchesForProg (useBatches / batch_status)
  const getBatchesForProg = (prog) => {
    if (!prog) return [];
    const progKey = formatProgrammeKey(prog);
    const active = getActiveBatches(progKey);
    if (active && active.length > 0) return active;
    const duration = progDurations[progKey] || progDurations[prog] || 4;
    return getRecentBatches(duration).sort((a, b) => b.localeCompare(a));
  };

  const availableBatches = useMemo(() => {
    if (!eseProgramme) return [];
    return getBatchesForProg(eseProgramme);
  }, [eseProgramme, getActiveBatches, progDurations]);

  // 4. Section Configuration matching Curriculum.jsx Section Configuration (batch_sections)
  const currentSectionConfig = useMemo(() => {
    if (!eseProgramme || !eseDepartment || !eseBatch) return null;
    const pKey = formatProgrammeKey(eseProgramme);
    const bKey = sanitizeKey(eseBatch);
    const dKey = sanitizeKey(eseDepartment);

    // 1. Exact document ID: ${progKey}_${deptKey}_${batchKey}
    const directDocId = `${pKey}_${dKey}_${bKey}`;
    if (batchSectionConfigs[directDocId]) {
      return batchSectionConfigs[directDocId];
    }

    // 2. Resilient match against batch_sections collection
    const match = Object.values(batchSectionConfigs || {}).find((cfg) => {
      if (!cfg) return false;
      const progMatch = formatProgrammeKey(cfg.progKey || cfg.programme) === pKey;
      const batchMatch = cfg.batch === eseBatch || sanitizeKey(cfg.batch) === bKey;
      const deptMatch =
        cfg.department === eseDepartment ||
        sanitizeKey(cfg.department) === dKey ||
        isDeptMatch(cfg.department, eseDepartment);
      return progMatch && batchMatch && deptMatch;
    });

    return match || null;
  }, [eseProgramme, eseDepartment, eseBatch, batchSectionConfigs]);

  // Sections dynamically derived strictly from Curriculum.jsx Section Configuration
  const availableSections = useMemo(() => {
    if (!eseProgramme || !eseDepartment || !eseBatch) return ["ALL"];

    // Configured in Curriculum Section Configuration with numSections
    if (currentSectionConfig && currentSectionConfig.numSections) {
      const count = Math.max(1, parseInt(currentSectionConfig.numSections, 10) || 1);
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const customSecs = ["ALL"];
      for (let i = 0; i < count; i++) {
        customSecs.push(`Sec-${letters[i]}`);
      }
      return customSecs;
    }

    // Single-section class (unconfigured or 1 section in Curriculum)
    return ["ALL", "Sec-A"];
  }, [eseProgramme, eseDepartment, eseBatch, currentSectionConfig]);

  // Auto-select initial Programme, Department, Batch
  useEffect(() => {
    if (availableProgrammes.length > 0 && !eseProgramme) {
      setEseProgramme(availableProgrammes[0]);
    }
  }, [availableProgrammes, eseProgramme]);

  useEffect(() => {
    if (availableDepartments.length > 0) {
      if (!eseDepartment || !availableDepartments.includes(eseDepartment)) {
        // Automatically choose first academic department rather than Administration
        const firstAcademic = availableDepartments.find((d) => !d.toLowerCase().includes("administration"));
        setEseDepartment(firstAcademic || availableDepartments[0]);
      }
    } else {
      setEseDepartment("");
    }
  }, [availableDepartments, eseDepartment]);

  useEffect(() => {
    if (availableBatches.length > 0) {
      if (!eseBatch || !availableBatches.includes(eseBatch)) {
        setEseBatch(availableBatches[0]);
      }
    } else {
      setEseBatch("");
    }
  }, [availableBatches, eseBatch]);

  // Sync selected section when availableSections changes
  useEffect(() => {
    if (availableSections.length > 0 && !availableSections.includes(eseSection)) {
      setEseSection(availableSections[0] || "ALL");
    }
  }, [availableSections, eseSection]);

  // Fetch students when Programme, Department, Batch, Section change (debounced for rapid filter switching)
  useEffect(() => {
    if (!eseProgramme || !eseDepartment || !eseBatch) {
      setStudentsList([]);
      setLoadingStudents(false);
      return;
    }

    let isMounted = true;
    setLoadingStudents(true);

    const timer = setTimeout(() => {
      fetchStudentsForClass({
        programme: eseProgramme,
        department: eseDepartment,
        batch: eseBatch,
        section: eseSection,
      })
        .then((list) => {
          if (isMounted) {
            setStudentsList(list || []);
            setLoadingStudents(false);
          }
        })
        .catch((err) => {
          console.warn("fetchStudentsForClass error:", err);
          if (isMounted) {
            setStudentsList([]);
            setLoadingStudents(false);
          }
        });
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [eseProgramme, eseDepartment, eseBatch, eseSection]);

  // Realtime sync of saved fees for chosen exam + class filters
  useEffect(() => {
    if (!selectedExamId || !eseProgramme || !eseDepartment || !eseBatch) {
      setStudentFees({});
      setEseFromDate("");
      setEseToDate("");
      setLastFeeSaveInfo(null);
      return;
    }

    const feeDocId = `ese_fee_${selectedExamId}_${formatProgrammeKey(eseProgramme)}_${sanitizeKey(eseDepartment)}_${sanitizeKey(eseBatch)}_${sanitizeKey(eseSection || 'ALL')}`;
    const unsub = onSnapshot(doc(db, "ese_student_fees", feeDocId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setStudentFees(d.fees || {});
        setEseFromDate(d.fromDate || "");
        setEseToDate(d.toDate || "");
        setLastFeeSaveInfo({
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toLocaleString() : "Recently",
          updatedBy: d.updatedBy || "Exam Cell",
          count: Object.keys(d.fees || {}).length,
          total: d.totalAllocatedFee || 0,
          fromDate: d.fromDate || "",
          toDate: d.toDate || "",
        });
      } else {
        setStudentFees({});
        setEseFromDate("");
        setEseToDate("");
        setLastFeeSaveInfo(null);
      }
    }, (err) => {
      console.warn("ese_student_fees listener error:", err);
    });

    return () => unsub();
  }, [selectedExamId, eseProgramme, eseDepartment, eseBatch, eseSection]);

  // Realtime sync of student fee payments to lock fees for paid students
  const [feeRegistrations, setFeeRegistrations] = useState([]);
  useEffect(() => {
    const qRegs = query(collection(db, "ese_fee_registrations"));
    const unsub = onSnapshot(
      qRegs,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setFeeRegistrations(list);
      },
      (err) => {
        console.warn("ese_fee_registrations listener error:", err);
      }
    );
    return () => unsub();
  }, []);

  // Map of students who have completed payment for the active exam/class
  const paidStudentsMap = useMemo(() => {
    const map = new Map();

    feeRegistrations.forEach((p) => {
      const pStatus = (p.paymentStatus || p.status || "").toLowerCase();
      const isPaid =
        pStatus === "paid" ||
        pStatus === "success" ||
        pStatus === "successful" ||
        p.billAttached === true ||
        Boolean(p.receiptNo) ||
        Boolean(p.paidAt);

      if (!isPaid) return;

      const reg = p.regNo || p.studentRegNo;
      if (!reg) return;
      const cleanReg = normAlpha(reg);

      // Match selected examination if set
      if (selectedExamId && p.examId && p.examId !== selectedExamId) {
        return;
      }

      // Match department if present on payment record
      if (eseDepartment && p.department && !isDeptMatch(p.department, eseDepartment)) {
        return;
      }

      map.set(cleanReg, {
        isPaid: true,
        amountPaid: Number(p.feeAmount || 0),
        orderId: p.orderId || p.transactionId || "",
        receiptNo: p.receiptNo || "",
        paidAt: p.paidAt || p.timestamp || null,
      });
    });

    return map;
  }, [feeRegistrations, selectedExamId, eseDepartment]);

  // Create new Exam handler
  const handleCreateExam = async (e) => {
    e?.preventDefault();
    if (!newExamName.trim()) {
      showToast("Please enter an Examination Name.", "error");
      return;
    }

    setCreatingExam(true);
    try {
      const docRef = await addDoc(collection(db, "ese_exams"), {
        name: newExamName.trim(),
        session: newExamSession.trim() || "",
        academicYear: newExamAcademicYear.trim() || "",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || "Exam Cell",
      });

      showToast(`Exam "${newExamName.trim()}" created successfully!`, "success");
      setSelectedExamId(docRef.id);
      setField("selectedExamId", docRef.id);
      setShowCreateExamModal(false);
      setNewExamName("");
      setNewExamSession("");
      setNewExamAcademicYear("");
    } catch (err) {
      console.error("Create exam error:", err);
      showToast("Failed to create exam: " + err.message, "error");
    } finally {
      setCreatingExam(false);
    }
  };

  // Fee modification handlers (strictly locked if student has already paid)
  const handleFeeChange = (reg, value) => {
    if (paidStudentsMap.has(normAlpha(reg))) {
      showToast(`Cannot edit fee: Student ${reg} has already paid the examination fee.`, "error");
      return;
    }
    const num = value === "" ? "" : Number(value);
    setStudentFees((prev) => ({
      ...prev,
      [reg]: num,
    }));
  };

  const handleApplyCommonFee = () => {
    const val = Number(commonFeeInput);
    if (isNaN(val) || val < 0) {
      showToast("Please enter a valid common fee amount.", "error");
      return;
    }
    const updated = { ...studentFees };
    let appliedCount = 0;
    let skippedPaidCount = 0;

    studentsList.forEach((st) => {
      if (paidStudentsMap.has(normAlpha(st.reg))) {
        skippedPaidCount++;
      } else {
        updated[st.reg] = val;
        appliedCount++;
      }
    });

    setStudentFees(updated);

    if (skippedPaidCount > 0) {
      showToast(`Applied ₹${val} to ${appliedCount} unpaid student(s). ${skippedPaidCount} paid student(s) are locked and preserved.`, "info");
    } else {
      showToast(`Applied ₹${val} to all ${studentsList.length} students!`, "success");
    }
  };

  const handleDownloadTemplate = () => {
    if (!studentsList.length) {
      showToast("No students found in the selected class.", "error");
      return;
    }

    const rows = studentsList.map((st, idx) => ({
      "S.No": idx + 1,
      "Register Number": st.reg,
      "Name": st.name,
      "Fee Amount": studentFees[st.reg] !== undefined ? studentFees[st.reg] : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 8 },  // S.No
      { wch: 22 }, // Register Number
      { wch: 32 }, // Name
      { wch: 18 }, // Fee Amount
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ESE Fee Allocation");

    const curExam = eseExams.find(e => e.id === selectedExamId);
    const examLabel = (curExam?.name || "ESE_Exam").replace(/[^a-zA-Z0-9_-]/g, "_");
    const deptLabel = sanitizeKey(eseDepartment);
    const batchLabel = sanitizeKey(eseBatch);
    const secLabel = sanitizeKey(eseSection || "ALL");

    XLSX.writeFile(wb, `ESE_Fee_Template_${examLabel}_${deptLabel}_${batchLabel}_${secLabel}.xlsx`);
    showToast("Excel template downloaded successfully!", "success");
  };

  const handleUploadExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rawRows.length) {
          showToast("The uploaded Excel file has no rows.", "error");
          return;
        }

        let matchedCount = 0;
        let skippedPaidCount = 0;
        const updatedFees = { ...studentFees };

        rawRows.forEach((row) => {
          const regKey = Object.keys(row).find((k) =>
            /reg/i.test(k) || /roll/i.test(k) || /number/i.test(k)
          );
          const rawReg = regKey ? String(row[regKey]).trim() : "";

          const feeKey = Object.keys(row).find((k) =>
            /fee/i.test(k) || /amount/i.test(k) || /total/i.test(k) || /rs/i.test(k) || /cost/i.test(k)
          );
          const rawFee = feeKey ? Number(String(row[feeKey]).replace(/[^0-9.]/g, "")) : 0;

          const matchedStudent = studentsList.find((s) => {
            if (rawReg && String(s.reg).trim() === rawReg) return true;
            const nameKey = Object.keys(row).find((k) => /name/i.test(k) && !/reg/i.test(k));
            if (nameKey && row[nameKey]) {
              return normAlpha(s.name) === normAlpha(row[nameKey]);
            }
            return false;
          });

          if (matchedStudent && !isNaN(rawFee)) {
            if (paidStudentsMap.has(normAlpha(matchedStudent.reg))) {
              skippedPaidCount++;
            } else {
              updatedFees[matchedStudent.reg] = rawFee;
              matchedCount++;
            }
          }
        });

        setStudentFees(updatedFees);

        if (matchedCount > 0) {
          const skipMsg = skippedPaidCount > 0 ? ` (${skippedPaidCount} already-paid students locked and preserved)` : "";
          showToast(`Successfully imported fee amounts for ${matchedCount} student(s) from Excel!${skipMsg}`, "success");
        } else if (skippedPaidCount > 0) {
          showToast(`All matching students in Excel have already paid fees and are locked.`, "info");
        } else {
          showToast("No matching students found in Excel. Check Register Number column.", "error");
        }
      } catch (err) {
        console.error("Excel import error:", err);
        showToast("Failed to parse Excel file: " + err.message, "error");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveStudentFees = async () => {
    if (!selectedExamId) {
      showToast("Please select an Examination first.", "error");
      return;
    }
    if (!eseProgramme || !eseDepartment || !eseBatch) {
      showToast("Please choose Programme, Department, and Batch.", "error");
      return;
    }
    if (eseFromDate && eseToDate && eseToDate < eseFromDate) {
      showToast("To Date cannot be earlier than From Date for this batch.", "error");
      return;
    }
    if (!studentsList.length) {
      showToast("No students to save.", "error");
      return;
    }

    setSavingFees(true);
    try {
      const feeDocId = `ese_fee_${selectedExamId}_${formatProgrammeKey(eseProgramme)}_${sanitizeKey(eseDepartment)}_${sanitizeKey(eseBatch)}_${sanitizeKey(eseSection || 'ALL')}`;
      const curExam = eseExams.find(e => e.id === selectedExamId);

      // Ensure any paid student retains their paid fee amount
      const mergedFees = { ...studentFees };
      paidStudentsMap.forEach((paidData, cleanReg) => {
        const student = studentsList.find((s) => normAlpha(s.reg) === cleanReg);
        if (student) {
          mergedFees[student.reg] = paidData.amountPaid || mergedFees[student.reg] || 0;
        }
      });
      const totalAllocatedFee = Object.values(mergedFees).reduce((sum, v) => sum + (Number(v) || 0), 0);

      await setDoc(doc(db, "ese_student_fees", feeDocId), {
        examId: selectedExamId,
        examName: curExam?.name || "",
        programme: eseProgramme,
        department: eseDepartment,
        batch: eseBatch,
        section: eseSection || "ALL",
        fromDate: eseFromDate || "",
        toDate: eseToDate || "",
        fees: mergedFees,
        students: studentsList.map(s => ({
          reg: s.reg,
          name: s.name,
          fee: Number(mergedFees[s.reg]) || 0,
        })),
        totalAllocatedFee,
        totalStudents: studentsList.length,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Exam Cell",
      }, { merge: true });

      // Also sync batch registration window to exam_cell_settings/ese_registration
      try {
        await setDoc(doc(db, "exam_cell_settings", "ese_registration"), {
          batchWindows: {
            [feeDocId]: {
              examId: selectedExamId,
              programme: eseProgramme,
              department: eseDepartment,
              batch: eseBatch,
              section: eseSection || "ALL",
              fromDate: eseFromDate || "",
              toDate: eseToDate || "",
              updatedAt: serverTimestamp(),
            }
          }
        }, { merge: true });
      } catch (e) {
        console.warn("Sync batchWindows to exam_cell_settings error:", e);
      }

      showToast(`Student fees & registration dates saved successfully for ${studentsList.length} students!`, "success");
    } catch (err) {
      console.error("Save student fees error:", err);
      showToast("Failed to save student fees: " + err.message, "error");
    } finally {
      setSavingFees(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!studentSearchQuery.trim()) return studentsList;
    const q = studentSearchQuery.toLowerCase().trim();
    return studentsList.filter((st) =>
      String(st.reg).toLowerCase().includes(q) || String(st.name).toLowerCase().includes(q)
    );
  }, [studentsList, studentSearchQuery]);

  const totalAllocatedFees = useMemo(() => {
    return studentsList.reduce((sum, st) => {
      const paidInfo = paidStudentsMap.get(normAlpha(st.reg));
      const v = paidInfo?.amountPaid !== undefined ? paidInfo.amountPaid : Number(studentFees[st.reg]);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [studentsList, studentFees, paidStudentsMap]);

  const studentsWithFeeCount = useMemo(() => {
    return studentsList.filter((st) => {
      const paidInfo = paidStudentsMap.get(normAlpha(st.reg));
      return (paidInfo?.amountPaid || Number(studentFees[st.reg])) > 0;
    }).length;
  }, [studentsList, studentFees, paidStudentsMap]);

  const paidStudentsCount = useMemo(() => {
    return studentsList.filter((st) => paidStudentsMap.has(normAlpha(st.reg))).length;
  }, [studentsList, paidStudentsMap]);

  const selectedExam = useMemo(() => {
    return eseExams.find((e) => e.id === selectedExamId);
  }, [eseExams, selectedExamId]);

  const handleUpdatePhotocopyStatus = async (appId, newStatus) => {
    setUpdatingStatusId(appId);
    try {
      await updateDoc(doc(db, "photocopy_applications", appId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Exam Cell",
      });
      showToast(`Application status updated to "${newStatus}"`, "success");
    } catch (err) {
      console.error("Error updating photocopy application status:", err);
      showToast("Failed to update status: " + err.message, "error");
    }
    setUpdatingStatusId(null);
  };

  const handleExportMaster = () => {
    let targetApps = photocopyApps;
    let targetName = "Photocopy";
    if (exportTargetType === "revaluation") {
      targetApps = revaluationApps;
      targetName = "Revaluation";
    } else if (exportTargetType === "review") {
      targetApps = reviewApps;
      targetName = "Review";
    }

    if (!targetApps || targetApps.length === 0) {
      showToast(`No submitted ${targetName.toLowerCase()} applications available to export.`, "error");
      return;
    }

    const isAll = selectedExportStatuses.includes("ALL") || selectedExportStatuses.length === 0;
    const filteredApps = isAll
      ? targetApps
      : targetApps.filter((app) => selectedExportStatuses.includes(app.status || "Payment Pending"));

    if (filteredApps.length === 0) {
      showToast("No applications match the selected status filter.", "error");
      return;
    }

    try {
      const cleanCourseCode = (rawCode) => {
        if (!rawCode) return "";
        return String(rawCode).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      };

      const rawRows = [];

      filteredApps.forEach((app) => {
        const studentReg = app.regNo || app.registerNo || "—";
        const studentName = app.studentName || app.name || "—";
        const rawDept = app.department || app.dept || "";
        const deptName = formatDepartmentDisplay(rawDept, app.programme) || rawDept || "—";
        const statusLabel = app.status || "Payment Pending";

        const subjects = Array.isArray(app.subjects) && app.subjects.length > 0 ? app.subjects : [null];

        subjects.forEach((s, idx) => {
          let code = "";
          let title = "";
          let sem = s?.semesterNo || s?.sem || app.semester || app.year || `${idx + 1}`;

          if (s) {
            code = (s.subjectCode || s.code || "").trim();
            title = (s.subjectTitle || s.title || s.name || "").trim();
            if (code && !title) {
              const spaceIdx = code.indexOf(" ");
              if (spaceIdx > 0) {
                title = code.slice(spaceIdx + 1).trim();
                code = code.slice(0, spaceIdx).trim();
              }
            }
          }

          const cleanedCode = cleanCourseCode(code);

          rawRows.push({
            studentReg,
            studentName,
            deptName,
            sem: sem ? (String(sem).toLowerCase().startsWith("sem") ? sem : `Sem ${sem}`) : "—",
            courseCode: cleanedCode || code || "—",
            courseTitle: title || "—",
            statusLabel,
          });
        });
      });

      // Sort rows by Course Code (alphanumeric sort)
      rawRows.sort((a, b) => {
        const codeA = a.courseCode || "";
        const codeB = b.courseCode || "";
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: "base" });
      });

      // Map sorted entries to final spreadsheet columns with sequential SL.No.
      const rows = rawRows.map((item, index) => ({
        "SL.No.": index + 1,
        "Reg. No of the Student": item.studentReg,
        "Name of the Student": item.studentName,
        "Department": item.deptName,
        "Year / Sem": item.sem,
        "Course Code": item.courseCode,
        "Course Name": item.courseTitle,
        "Application Status": item.statusLabel,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      ws["!cols"] = [
        { wch: 8 },  // SL.No.
        { wch: 22 }, // Reg. No of the Student
        { wch: 28 }, // Name of the Student
        { wch: 35 }, // Department
        { wch: 14 }, // Year / Sem
        { wch: 16 }, // Course Code
        { wch: 42 }, // Course Name
        { wch: 24 }, // Application Status
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Master ${targetName} Applications`);

      const dateStamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${targetName}_Master_Applications_${dateStamp}.xlsx`);

      showToast(`Master Excel exported for ${rows.length} rows (${filteredApps.length} applications)!`, "success");
      setExportModalOpen(false);
    } catch (err) {
      console.error("Export Master Error:", err);
      showToast("Failed to export Master Excel: " + err.message, "error");
    }
  };

  const windowStatus = (form) => {
    if (!form.isOpen) return { label: "Closed", cls: "bg-rose-100 text-rose-700 border-rose-200" };
    const today = new Date().toISOString().slice(0, 10);
    if (form.fromDate && today < form.fromDate)
      return { label: `Opens ${form.fromDate}`, cls: "bg-amber-100 text-amber-800 border-amber-200" };
    if (form.toDate && today > form.toDate)
      return { label: "Window Expired", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" };
    if (form.fromDate || form.toDate)
      return { label: "Open (Scheduled)", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    return { label: "Open", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  };

  const activeForm = forms[activeTab];
  const activeTabMeta = FORM_TABS.find((t) => t.id === activeTab);

  return (
    <Layout title="Exam Form Setting">
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold shadow-xl ${toast.type === "error" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}>
          {toast.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="p-4 md:p-8 w-full space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl rounded-3xl">
          <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
            <CalendarDays size={22} className="text-amber-300" /> Exam Form Setting
          </h1>
          <p className="text-blue-200 text-xs md:text-sm mt-1 font-medium">
            Control student-end exam form windows — Photocopy, Revaluation, Review & ESE Registration — with date ranges, fees and instructions.
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-2 flex flex-wrap gap-2">
          {FORM_TABS.map((tab) => {
            const Icon = tab.icon;
            const st = windowStatus(forms[tab.id]);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive ? "bg-[#120c7a] text-white shadow-md" : "text-zinc-600 hover:bg-slate-100"}`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${isActive ? "bg-white/15 text-white border-white/20" : st.cls}`}>
                  {forms[tab.id].isOpen ? (st.label.startsWith("Open") || st.label.startsWith("Opens") ? "●" : "○") : "○"} {st.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Form card */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
            <Loader2 size={32} className="mx-auto text-[#120c7a] animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50/70 border-b border-zinc-200 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  {activeTabMeta && <activeTabMeta.icon size={16} className="text-[#120c7a]" />}
                  {activeTabMeta?.label} Window
                </h3>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{activeTabMeta?.desc}</p>
              </div>
              {/* Open / Close toggle */}
              <button
                onClick={() => setField("isOpen", !activeForm.isOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${activeForm.isOpen ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-zinc-100 border-zinc-200 text-zinc-500"}`}
              >
                <Power size={14} />
                {activeForm.isOpen ? "OPEN" : "CLOSED"}
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Exam selection (ESE Registration only - Placed before From Date & To Date) */}
              {activeTab === "ese_registration" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500">
                      <span className="inline-flex items-center gap-1.5">
                        <GraduationCap size={13} className="text-[#120c7a]" /> Examination
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCreateExamModal(true)}
                      className="text-[11px] font-black text-indigo-700 hover:text-indigo-900 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus size={13} /> Create New Exam
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={selectedExamId}
                      onChange={(e) => {
                        if (e.target.value === "__create_new__") {
                          setShowCreateExamModal(true);
                        } else {
                          setSelectedExamId(e.target.value);
                          setField("selectedExamId", e.target.value);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      <option value="">-- Select Exam --</option>
                      <option value="__create_new__" className="font-bold text-indigo-700 bg-indigo-50">
                        + Create New Exam...
                      </option>
                      {eseExams.map((exam) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.name || exam.title} {exam.session ? `(${exam.session})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCreateExamModal(true)}
                      title="Create New Exam"
                      className="px-3.5 py-2.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98"
                    >
                      <Plus size={14} />
                      <span className="hidden sm:inline">New Exam</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Date window (Only for Photocopy, Revaluation, Review, Photocopy Problem; ESE Registration has batch-specific date window below dropdowns) */}
              {activeTab !== "ese_registration" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">From Date</label>
                      <input
                        type="date"
                        value={activeForm.fromDate}
                        onChange={(e) => setField("fromDate", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">To Date</label>
                      <input
                        type="date"
                        value={activeForm.toDate}
                        min={activeForm.fromDate || undefined}
                        onChange={(e) => setField("toDate", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-medium -mt-3">
                    Student end la indha form {activeForm.fromDate || activeForm.toDate
                      ? <><b>{activeForm.fromDate || '...'}</b> muthal <b>{activeForm.toDate || '...'}</b> varai mattum theriyum</>
                      : 'eppovum theriyum (date fix pannala-na)'}.
                    Date veliya student ku page hide aayidum.
                  </p>
                </>
              ) : (
                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-indigo-900 text-xs flex items-center gap-2">
                  <CalendarDays size={16} className="text-indigo-600 shrink-0" />
                  <span>
                    Batch-wise Registration Schedule (From Date & To Date) is configured below under <b>ESE Student Fee Allocation & Namelist</b> according to each batch.
                  </span>
                </div>
              )}

              {/* Fee per subject (Only for Photocopy, Revaluation, Review; Removed for ESE Registration) */}
              {activeTab !== "ese_registration" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                      <span className="inline-flex items-center gap-1"><IndianRupee size={12} /> Fee per Subject (₹)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={activeForm.feePerSubject}
                      onChange={(e) => setField("feePerSubject", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div>
                <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                  <span className="inline-flex items-center gap-1"><FileText size={12} /> Student Instructions</span>
                </label>
                <textarea
                  rows={3}
                  value={activeForm.instructions}
                  onChange={(e) => setField("instructions", e.target.value)}
                  placeholder="e.g. Apply before the last date. Pay the fee at the Exam Cell counter..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-[#120c7a] hover:opacity-90 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {saving ? "Saving..." : `Save ${activeTabMeta?.label} Setting`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ESE Registration Student Fee Allocation Section ═══ */}
        {activeTab === "ese_registration" && (
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden space-y-0">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#120c7a] via-indigo-900 to-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
              <div>
                <h3 className="font-black text-base flex items-center gap-2">
                  <Users size={18} className="text-amber-300" /> ESE Student Fee Allocation & Namelist
                </h3>
                <p className="text-xs text-blue-200 font-medium mt-0.5">
                  Select Programme, Department, Batch, and Section to view students, download/upload Excel, and configure fee amounts.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedExam && (
                  <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 text-xs font-bold text-amber-200">
                    <GraduationCap size={14} className="text-amber-300" />
                    <span>{selectedExam.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPaidFeeReportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-900 rounded-xl text-xs font-black shadow-md transition cursor-pointer active:scale-95"
                >
                  <FileText size={14} className="text-slate-900" />
                  <span>Paid Fee Report</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-6 bg-slate-50/70 border-b border-zinc-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Programme */}
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                    Programme
                  </label>
                  <select
                    value={eseProgramme}
                    onChange={(e) => setEseProgramme(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
                  >
                    {availableProgrammes.map((p) => (
                      <option key={p} value={p}>{formatProgDisplay(p)}</option>
                    ))}
                  </select>
                </div>

                {/* Department */}
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                    Department
                  </label>
                  <select
                    value={eseDepartment}
                    onChange={(e) => setEseDepartment(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
                  >
                    {availableDepartments.map((d) => {
                      const code = deptMetadata[formatProgrammeKey(eseProgramme)]?.[d] || "";
                      return (
                        <option key={d} value={d}>
                          {code ? `${code} - ${d}` : formatDepartmentDisplay(d, eseProgramme)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Batch */}
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                    Batch
                  </label>
                  <select
                    value={eseBatch}
                    onChange={(e) => setEseBatch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
                  >
                    {availableBatches.map((b) => (
                      <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                    ))}
                  </select>
                </div>

                {/* Section */}
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1 flex items-center justify-between">
                    <span>Section</span>
                    {currentSectionConfig?.numSections ? (
                      <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        {currentSectionConfig.numSections} Sec (Curriculum)
                      </span>
                    ) : null}
                  </label>
                  <select
                    value={eseSection}
                    onChange={(e) => setEseSection(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
                  >
                    {availableSections.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Batch-specific Registration Window (From Date & To Date) */}
              <div className="p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-[#120c7a] shrink-0">
                      <CalendarDays size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        Registration Window for {eseBatch ? `${formatBatchDisplay(eseBatch)} Batch` : "Selected Batch"}
                      </h4>
                      <p className="text-[11px] text-zinc-500 font-medium">
                        Set From Date and To Date for {eseDepartment ? formatDepartmentDisplay(eseDepartment, eseProgramme) : "this department"} ({eseSection || "ALL"}).
                      </p>
                    </div>
                  </div>

                  {eseFromDate || eseToDate ? (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1.5">
                      <Clock size={12} className="text-emerald-600" />
                      {eseFromDate && eseToDate ? `${eseFromDate} to ${eseToDate}` : eseFromDate ? `From ${eseFromDate}` : `Until ${eseToDate}`}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-zinc-50 text-zinc-500 border-zinc-200">
                      No date limit (Form open state controls access)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-600 block mb-1">
                      From Date ({eseBatch ? formatBatchDisplay(eseBatch) : "Batch"})
                    </label>
                    <input
                      type="date"
                      value={eseFromDate}
                      onChange={(e) => setEseFromDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-600 block mb-1">
                      To Date ({eseBatch ? formatBatchDisplay(eseBatch) : "Batch"})
                    </label>
                    <input
                      type="date"
                      value={eseToDate}
                      min={eseFromDate || undefined}
                      onChange={(e) => setEseToDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 font-medium">
                  Student portal-ல் இந்த batch மாணவர்களுக்கு {eseFromDate || eseToDate
                    ? <><b>{eseFromDate || "..."}</b> முதல் <b>{eseToDate || "..."}</b> வரை ESE registration form open-ஆக இருக்கும். Date முடிந்தவுடன் auto-close ஆகிவிடும்.</>
                    : "தேதி குறிப்பிடவில்லை எனில், Form OPEN-ல் இருக்கும் வரை இந்த batch மாணவர்கள் எப்போது வேண்டுமானாலும் register செய்யலாம்."}
                </p>
              </div>

              {/* Status banner if fees were previously saved */}
              {lastFeeSaveInfo && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>
                      Saved data loaded for this class: <b>{lastFeeSaveInfo.count}</b> student(s) with total fee of <b>₹{lastFeeSaveInfo.total.toLocaleString("en-IN")}</b>
                      {(lastFeeSaveInfo.fromDate || lastFeeSaveInfo.toDate) && (
                        <> &bull; Window: <b>{lastFeeSaveInfo.fromDate || "Start"}</b> to <b>{lastFeeSaveInfo.toDate || "Open"}</b></>
                      )}
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Last updated: {lastFeeSaveInfo.updatedAt} by {lastFeeSaveInfo.updatedBy}
                  </span>
                </div>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6">
              {loadingStudents ? (
                <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-200">
                  <Loader2 size={32} className="mx-auto text-[#120c7a] animate-spin mb-2" />
                  <p className="text-xs font-bold text-slate-600">Loading student namelist...</p>
                </div>
              ) : studentsList.length === 0 ? (
                <div className="p-12 text-center bg-amber-50/50 rounded-2xl border border-amber-200">
                  <AlertCircle size={32} className="mx-auto text-amber-600 mb-2" />
                  <h4 className="text-sm font-bold text-amber-900">No Students Found</h4>
                  <p className="text-xs text-amber-700 mt-1">
                    No student records found in Firestore for {formatDepartmentDisplay(eseDepartment, eseProgramme)}, {eseBatch} {eseSection !== "ALL" ? `(${eseSection})` : ""}.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl">
                      <span className="text-[11px] font-extrabold uppercase text-blue-700 block">Total Students</span>
                      <p className="text-2xl font-black text-blue-950 mt-1">{studentsList.length}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl">
                      <span className="text-[11px] font-extrabold uppercase text-emerald-700 block">Total Allocated Fees</span>
                      <p className="text-2xl font-black text-emerald-950 mt-1">
                        ₹{totalAllocatedFees.toLocaleString("en-IN")}
                      </p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl">
                      <span className="text-[11px] font-extrabold uppercase text-purple-700 block">Configured Fees</span>
                      <p className="text-2xl font-black text-purple-950 mt-1">
                        {studentsWithFeeCount} <span className="text-xs font-medium text-purple-600">/ {studentsList.length} students</span>
                      </p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase text-amber-800 block">Paid &bull; Locked</span>
                        <Lock size={13} className="text-amber-700" />
                      </div>
                      <p className="text-2xl font-black text-amber-950 mt-1">
                        {paidStudentsCount} <span className="text-xs font-bold text-emerald-600">({paidStudentsCount > 0 ? "Non-editable" : "None"})</span>
                      </p>
                    </div>
                  </div>

                  {/* Action Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    {/* Search & Quick Apply */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Search */}
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search reg no or name..."
                          value={studentSearchQuery}
                          onChange={(e) => setStudentSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none w-52"
                        />
                      </div>

                      {/* Quick Apply Fee */}
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                        <span className="pl-2 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Common Fee"
                          value={commonFeeInput}
                          onChange={(e) => setCommonFeeInput(e.target.value)}
                          className="w-24 px-2 py-1 text-xs font-bold text-slate-800 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCommonFee}
                          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition cursor-pointer"
                        >
                          Apply All
                        </button>
                      </div>
                    </div>

                    {/* Excel & Save Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Download Excel Template */}
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        <FileSpreadsheet size={14} />
                        <span>Download Excel Template</span>
                      </button>

                      {/* Upload Excel */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".xlsx, .xls, .csv"
                        className="hidden"
                        onChange={handleUploadExcel}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        <Upload size={14} />
                        <span>Upload Excel</span>
                      </button>

                      {/* Save Student Fees */}
                      <button
                        type="button"
                        onClick={handleSaveStudentFees}
                        disabled={savingFees}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#120c7a] hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                      >
                        {savingFees ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>{savingFees ? "Saving Fees..." : "Save Student Fees"}</span>
                      </button>

                      {/* Paid Students Report Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => setPaidFeeReportModalOpen(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-[#120c7a] border border-indigo-200 rounded-xl text-xs font-extrabold transition shadow-sm cursor-pointer"
                      >
                        <FileText size={14} className="text-indigo-600" />
                        <span>Paid Students Report</span>
                      </button>
                    </div>
                  </div>

                  {/* Student Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200">
                          <tr>
                            <th className="py-3.5 px-4 text-[11px] font-black uppercase text-slate-500 w-16 text-center">
                              S.No
                            </th>
                            <th className="py-3.5 px-4 text-[11px] font-black uppercase text-slate-500 w-48">
                              Register Number
                            </th>
                            <th className="py-3.5 px-4 text-[11px] font-black uppercase text-slate-500">
                              Name
                            </th>
                            <th className="py-3.5 px-4 text-[11px] font-black uppercase text-slate-500 w-52">
                              Fee Amount (₹)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-medium">
                          {filteredStudents.map((st, idx) => {
                            const feeVal = studentFees[st.reg] !== undefined ? studentFees[st.reg] : "";
                            const paidInfo = paidStudentsMap.get(normAlpha(st.reg));
                            const isPaid = Boolean(paidInfo?.isPaid);
                            const hasFee = Number(feeVal) > 0 || isPaid;
                            const displayFee = isPaid ? (paidInfo.amountPaid || feeVal) : feeVal;

                            return (
                              <tr
                                key={st.reg}
                                className={`hover:bg-indigo-50/40 transition-colors ${
                                  isPaid ? "bg-emerald-50/30" : hasFee ? "bg-white" : "bg-amber-50/20"
                                }`}
                              >
                                <td className="py-3 px-4 text-center text-slate-400 font-bold">
                                  {idx + 1}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-slate-800">
                                  {st.reg}
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  <div className="flex items-center gap-2">
                                    <span>{st.name || "—"}</span>
                                    {isPaid && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wide border border-emerald-300 shadow-2xs">
                                        <CheckCircle2 size={11} className="text-emerald-700" />
                                        Paid &bull; Locked
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="relative flex items-center">
                                    <span
                                      className={`absolute left-3 font-bold text-xs pointer-events-none ${
                                        isPaid ? "text-emerald-700" : "text-slate-400"
                                      }`}
                                    >
                                      ₹
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      disabled={isPaid}
                                      readOnly={isPaid}
                                      value={displayFee}
                                      onChange={(e) => handleFeeChange(st.reg, e.target.value)}
                                      className={`w-40 pl-7 pr-8 py-1.5 rounded-xl text-xs font-bold border transition-all outline-none ${
                                        isPaid
                                          ? "bg-slate-100/90 border-emerald-300 text-emerald-950 cursor-not-allowed select-none opacity-90 shadow-inner font-mono"
                                          : hasFee
                                          ? "bg-emerald-50/40 border-emerald-200 text-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                                          : "bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                      }`}
                                      title={isPaid ? "Fee locked: Student has already paid" : "Enter fee amount"}
                                    />
                                    {isPaid && (
                                      <Lock
                                        size={13}
                                        className="absolute right-3 text-emerald-600 pointer-events-none"
                                        title="Payment Completed - Fee Locked"
                                      />
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ Submitted Applications Section (Photocopy Tab) ═══ */}
        {activeTab === "photocopy" && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-lg overflow-hidden space-y-0">
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Copy size={18} className="text-amber-300" /> Submitted Photocopy Applications
                </h3>
                <p className="text-xs text-blue-200 font-medium">
                  Review student photocopy forms with attached payment bills and HOD recommendations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setFeeReportTargetType("photocopy");
                    setFeeReportModalOpen(true);
                  }}
                  disabled={photocopyApps.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-500"
                  title="Generate and print official Department-wise Photocopy Fee Collection Report"
                >
                  <FileText size={15} /> Fee Report
                </button>
                <button
                  onClick={() => {
                    setExportTargetType("photocopy");
                    setSelectedExportStatuses(["ALL"]);
                    setExportModalOpen(true);
                  }}
                  disabled={photocopyApps.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-emerald-500"
                  title="Export Master Excel report with status selection filter"
                >
                  <FileSpreadsheet size={15} /> Export Master
                </button>
                <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                  Total Applications: {photocopyApps.length}
                </span>
              </div>
            </div>

            <div className="p-6">
              {loadingApps ? (
                <div className="py-12 text-center text-zinc-400">
                  <Loader2 size={24} className="mx-auto animate-spin mb-2 text-[#120c7a]" />
                  <p className="text-xs font-medium">Loading submitted applications...</p>
                </div>
              ) : photocopyApps.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 bg-slate-50 rounded-xl border border-dashed border-zinc-200">
                  <FileText size={32} className="mx-auto mb-2 opacity-40 text-zinc-400" />
                  <p className="text-sm font-bold text-zinc-600">No Submitted Applications Yet</p>
                  <p className="text-xs text-zinc-400 mt-0.5">When students submit photocopy requests and HOD recommends them, they will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                      <tr>
                        <th className="p-3">Candidate / Reg No</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Subjects</th>
                        <th className="p-3">Payment Bill</th>
                        <th className="p-3">HOD Recommendation</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-700 font-medium">
                      {photocopyApps.map((app) => {
                        const isHodRecommended = app.status === "Recommended by HOD" || !!app.hodSignature;
                        return (
                          <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-zinc-900">{app.studentName || 'Student'}</div>
                              <div className="text-[11px] font-mono text-indigo-700 font-semibold">{app.regNo || '—'}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-zinc-800">{app.department || app.dept || '—'}</div>
                              <div className="text-[10px] text-zinc-400">{app.batch ? `Batch ${app.batch}` : ''}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-zinc-900">{app.subjectCount || app.subjects?.length || 1} Subject(s)</div>
                              <div className="text-[10px] text-zinc-500 line-clamp-1">
                                {app.subjects?.map(s => s.code).join(", ")}
                              </div>
                            </td>
                            <td className="p-3">
                              {app.paymentStatus === "Paid" || app.billAttached === true || !!app.electronicBill || !!app.transactionId ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle size={11} /> PAID (₹{app.feeAmount || (app.subjectCount * 350)})
                                  </span>
                                  {(app.electronicBill?.transactionId || app.transactionId || app.receiptNo || app.orderId) && (
                                    <div className="text-[9px] font-mono text-zinc-500 mt-0.5 font-semibold">
                                      {app.electronicBill?.transactionId || app.transactionId || app.receiptNo || app.orderId}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Clock size={11} /> Payment Pending
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {isHodRecommended ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                                    <UserCheck size={11} /> Recommended
                                  </span>
                                  {app.hodSignature && (
                                    <div className="text-[9px] text-emerald-700 font-semibold italic flex items-center gap-1">
                                      <span>Signature attached</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Clock size={11} /> Pending HOD
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${app.status === "Copy Issued"
                                  ? "bg-purple-100 text-purple-800 border-purple-200"
                                  : app.status === "Closed"
                                    ? "bg-zinc-200 text-zinc-700 border-zinc-300"
                                    : app.status === "Recommended by HOD"
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                      : "bg-blue-100 text-blue-800 border-blue-200"
                                }`}>
                                {app.status || "Applied"}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedApp(app);
                                    setShowModal(true);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all flex items-center gap-1 border border-indigo-200"
                                >
                                  <Eye size={13} /> View Form
                                </button>

                                <button
                                  onClick={() => setRevokeModal({ open: true, app })}
                                  className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all flex items-center gap-1 border border-amber-200"
                                >
                                  <RotateCcw size={13} /> Revoke
                                </button>

                                {app.status !== "Copy Issued" && (
                                  <button
                                    onClick={() => handleUpdatePhotocopyStatus(app.id, "Copy Issued")}
                                    disabled={updatingStatusId === app.id}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                                  >
                                    {updatingStatusId === app.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                    Issue Copy
                                  </button>
                                )}

                                {app.status !== "Closed" && (
                                  <button
                                    onClick={() => handleUpdatePhotocopyStatus(app.id, "Closed")}
                                    disabled={updatingStatusId === app.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 border border-zinc-300 disabled:opacity-50"
                                  >
                                    <XCircle size={13} /> Close
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
          </div>
        )}

        {/* Submitted Photocopy Problem Applications (Exam Cell View) */}
        {activeTab === "photocopy_problem" && (
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden mt-6">
            <div className="bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-950 p-6 text-white flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-base md:text-lg flex items-center gap-2">
                  <FileWarning size={20} className="text-amber-300" />
                  Submitted Photocopy Problem Discrepancy Reports
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Review student answer script missing pages, wrong scripts, or valuation errors forwarded by department HODs
                </p>
              </div>
              <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                Total Reports: {problemApps.length}
              </span>
            </div>

            <div className="p-6">
              {loadingProblemApps ? (
                <div className="py-12 text-center text-zinc-400">
                  <Loader2 size={24} className="mx-auto animate-spin mb-2 text-[#120c7a]" />
                  <p className="text-xs font-medium">Loading discrepancy reports...</p>
                </div>
              ) : problemApps.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 bg-slate-50 rounded-xl border border-dashed border-zinc-200">
                  <FileWarning size={32} className="mx-auto mb-2 opacity-40 text-amber-500" />
                  <p className="text-sm font-bold text-zinc-600">No Problem Discrepancy Reports Submitted Yet</p>
                  <p className="text-xs text-zinc-400 mt-0.5">When students submit photocopy problem forms and HOD moves them, they will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                      <tr>
                        <th className="p-3">Candidate / Reg No</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Subjects</th>
                        <th className="p-3">Reported Issues</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-700 font-medium">
                      {problemApps.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-zinc-900">{app.studentName || 'Student'}</div>
                            <div className="text-[11px] font-mono text-indigo-700 font-semibold">{app.regNo || app.admissionNo || '—'}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-zinc-800">{formatDepartmentDisplay(app.department, app.programme)}</div>
                            <div className="text-[10px] text-zinc-400">{app.batch ? `Batch ${app.batch}` : ''}</div>
                          </td>
                          <td className="p-3 font-bold text-zinc-900">
                            {Array.isArray(app.subjects) ? app.subjects.map(s => s.subjectCode).join(", ") : "1 Subject"}
                          </td>
                          <td className="p-3 font-medium text-amber-900 max-w-xs truncate">
                            {app.selectedProblems?.map(p => p.replace(/^\d+\.\s*/, '')).join(", ") || '—'}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border uppercase ${app.status === "Moved to Exam Cell" || app.status === "Recommended to Exam Cell"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : app.status === "Revoked by Exam Cell" || app.status === "Revoked by HOD"
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : "bg-blue-100 text-blue-800 border-blue-200"
                              }`}>
                              {app.status || "Submitted"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedProblemApp(app);
                                  setShowProblemModal(true);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all flex items-center gap-1 border border-indigo-200 cursor-pointer"
                              >
                                <Eye size={13} /> View Form
                              </button>

                              <button
                                onClick={() => {
                                  setRevokeProblemModal({ open: true, app });
                                  setRevokeProblemMessage("");
                                }}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold transition-all flex items-center gap-1 border border-rose-200 cursor-pointer"
                              >
                                <RotateCcw size={13} /> Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submitted Revaluation Applications Section (Revaluation Tab) */}
        {activeTab === "revaluation" && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-lg overflow-hidden space-y-0 mt-6">
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <RefreshCw size={18} className="text-amber-300" /> Submitted Revaluation Applications
                </h3>
                <p className="text-xs text-blue-200 font-medium">
                  Review student revaluation forms with attached candidate files, payment status, and HOD recommendations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setFeeReportTargetType("revaluation");
                    setFeeReportModalOpen(true);
                  }}
                  disabled={revaluationApps.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-500"
                  title="Generate and print official Department-wise Revaluation Fee Collection Report"
                >
                  <FileText size={15} /> Fee Report
                </button>
                <button
                  onClick={() => {
                    setExportTargetType("revaluation");
                    setSelectedExportStatuses(["ALL"]);
                    setExportModalOpen(true);
                  }}
                  disabled={revaluationApps.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-emerald-500"
                  title="Export Master Excel report with status selection filter"
                >
                  <FileSpreadsheet size={15} /> Export Master
                </button>
                <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                  Total Applications: {revaluationApps.length}
                </span>
              </div>
            </div>

            <div className="p-6">
              {loadingRevalApps ? (
                <div className="py-12 text-center text-zinc-400">
                  <Loader2 size={24} className="mx-auto animate-spin mb-2 text-[#120c7a]" />
                  <p className="text-xs font-medium">Loading submitted revaluation applications...</p>
                </div>
              ) : revaluationApps.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 bg-slate-50 rounded-xl border border-dashed border-zinc-200">
                  <RefreshCw size={32} className="mx-auto mb-2 opacity-40 text-zinc-400" />
                  <p className="text-sm font-bold text-zinc-600">No Submitted Revaluation Applications Yet</p>
                  <p className="text-xs text-zinc-400 mt-0.5">When students submit revaluation requests and HOD recommends them, they will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                      <tr>
                        <th className="p-3">Candidate / Reg No</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Subjects</th>
                        <th className="p-3 text-center">Fee Status</th>
                        <th className="p-3 text-center">HOD Recommendation</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-medium">
                      {revaluationApps.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-zinc-900">{app.studentName}</div>
                            <div className="font-mono text-[11px] text-zinc-500">{app.regNo}</div>
                          </td>
                          <td className="p-3 font-semibold text-zinc-700">
                            {formatDepartmentDisplay(app.department, app.programme)}
                          </td>
                          <td className="p-3">
                            {Array.isArray(app.subjects) && app.subjects.length > 0 ? (
                              <div className="space-y-1">
                                {app.subjects.map((sub, idx) => (
                                  <div key={idx} className="text-[11px]">
                                    <span className="font-mono font-bold text-slate-900 mr-1">[{sub.subjectCode}]</span>
                                    <span className="text-slate-700">{sub.subjectTitle}</span>
                                    {sub.fileData ? (
                                      <a href={sub.fileData} download={sub.fileName || `reval_${sub.subjectCode}.pdf`} className="ml-2 text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5">
                                        <Download size={11} /> File
                                      </a>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-center font-bold text-emerald-700">
                            ₹{app.feeAmount || 0} (Paid ✓)
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase ${app.status === 'Recommended by HOD' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                              {app.status === 'Recommended by HOD' ? `✓ ${app.hodSignature || 'Recommended'}` : app.status || 'Pending'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <select
                              value={app.status}
                              onChange={(e) => handleUpdateRevaluationStatus(app.id, e.target.value)}
                              disabled={updatingStatusId === app.id}
                              className="bg-white border border-zinc-300 rounded-lg text-[11px] font-bold px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                            >
                              <option value="Submitted to HOD">Submitted to HOD</option>
                              <option value="Recommended by HOD">Recommended by HOD</option>
                              <option value="Approved">Approved</option>
                              <option value="Result Published">Result Published</option>
                              <option value="Revoked by Exam Cell">Revoked by Exam Cell</option>
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => { setSelectedRevalApp(app); setShowRevalModal(true); }}
                              className="px-3 py-1.5 bg-[#120c7a] hover:bg-[#0f0a66] text-white rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <Eye size={13} /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submitted Review Applications Section (Review Tab) */}
        {activeTab === "review" && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-lg overflow-hidden space-y-0 mt-6">
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <FileSearch size={18} className="text-amber-300" /> Submitted Review Applications
                </h3>
                <p className="text-xs text-blue-200 font-medium">
                  Review student challenge/review requests with attached candidate files, payment status, and HOD recommendations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setFeeReportTargetType("review");
                    setFeeReportModalOpen(true);
                  }}
                  disabled={reviewApps.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-500"
                  title="Generate and print official Department-wise Review Fee Collection Report"
                >
                  <FileText size={15} /> Fee Report
                </button>
                <button
                  onClick={() => {
                    setExportTargetType("review");
                    setSelectedExportStatuses(["ALL"]);
                    setExportModalOpen(true);
                  }}
                  disabled={reviewApps.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-emerald-500"
                  title="Export Master Excel report with status selection filter"
                >
                  <FileSpreadsheet size={15} /> Export Master
                </button>
                <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                  Total Applications: {reviewApps.length}
                </span>
              </div>
            </div>

            <div className="p-6">
              {loadingReviewApps ? (
                <div className="py-12 text-center text-zinc-400">
                  <Loader2 size={24} className="mx-auto animate-spin mb-2 text-[#120c7a]" />
                  <p className="text-xs font-medium">Loading submitted review applications...</p>
                </div>
              ) : reviewApps.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 bg-slate-50 rounded-xl border border-dashed border-zinc-200">
                  <FileSearch size={32} className="mx-auto mb-2 opacity-40 text-zinc-400" />
                  <p className="text-sm font-bold text-zinc-600">No Submitted Review Applications Yet</p>
                  <p className="text-xs text-zinc-400 mt-0.5">When students submit review requests and HOD recommends them, they will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                      <tr>
                        <th className="p-3">Candidate / Reg No</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Subjects</th>
                        <th className="p-3 text-center">Fee Status</th>
                        <th className="p-3 text-center">HOD Recommendation</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-medium">
                      {reviewApps.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-zinc-900">{app.studentName}</div>
                            <div className="font-mono text-[11px] text-zinc-500">{app.regNo}</div>
                          </td>
                          <td className="p-3 font-semibold text-zinc-700">
                            {formatDepartmentDisplay(app.department, app.programme)}
                          </td>
                          <td className="p-3">
                            {Array.isArray(app.subjects) && app.subjects.length > 0 ? (
                              <div className="space-y-1">
                                {app.subjects.map((sub, idx) => (
                                  <div key={idx} className="text-[11px]">
                                    <span className="font-mono font-bold text-slate-900 mr-1">[{sub.subjectCode}]</span>
                                    <span className="text-slate-700">{sub.subjectTitle}</span>
                                    {sub.fileData ? (
                                      <a href={sub.fileData} download={sub.fileName || `review_${sub.subjectCode}.pdf`} className="ml-2 text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5">
                                        <Download size={11} /> File
                                      </a>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-center font-bold text-emerald-700">
                            ₹{app.feeAmount || 0} (Paid ✓)
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase ${app.status === 'Recommended by HOD' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                              {app.status === 'Recommended by HOD' ? `✓ ${app.hodSignature || 'Recommended'}` : app.status || 'Pending'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <select
                              value={app.status}
                              onChange={(e) => handleUpdateReviewStatus(app.id, e.target.value)}
                              disabled={updatingStatusId === app.id}
                              className="bg-white border border-zinc-300 rounded-lg text-[11px] font-bold px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                            >
                              <option value="Submitted to HOD">Submitted to HOD</option>
                              <option value="Recommended by HOD">Recommended by HOD</option>
                              <option value="Approved">Approved</option>
                              <option value="Result Published">Result Published</option>
                              <option value="Revoked by Exam Cell">Revoked by Exam Cell</option>
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => { setSelectedReviewApp(app); setShowReviewModal(true); }}
                              className="px-3 py-1.5 bg-[#120c7a] hover:bg-[#0f0a66] text-white rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <Eye size={13} /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dedicated Exam Cell HDFC Gateway Credentials Card */}
        <ExamCellGatewayCard showToast={showToast} />
      </div>

      {/* Official Anna University Form View Modal for Exam Cell */}
      {showModal && selectedApp && (
        <AnnaUniversityPhotocopyModal
          app={selectedApp}
          onClose={() => {
            setShowModal(false);
            setSelectedApp(null);
          }}
          isExamCell={true}
        />
      )}

      {/* Exam Cell Photocopy Revoke Modal */}
      {revokeModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setRevokeModal({ open: false, app: null })}>
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-amber-100" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-900 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-sm text-white">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">Revoke Photocopy Application</h3>
                  <p className="text-amber-100 text-[11px] font-semibold">Send back to Department HOD & Student for corrections (Fee stays Paid ✓)</p>
                </div>
              </div>
              <button
                onClick={() => setRevokeModal({ open: false, app: null })}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 text-xs font-semibold text-amber-900 space-y-1">
                <p><strong>Candidate:</strong> {revokeModal.app?.studentName} ({revokeModal.app?.regNo})</p>
                <p><strong>Department:</strong> {formatDepartmentDisplay(revokeModal.app?.department, revokeModal.app?.programme)}</p>
                <p className="text-[11px] text-amber-700 pt-1">Enter correction instructions. This will return the application to the student and department HOD for correction & re-submission.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Revoke Reason / Correction Instructions *
                </label>
                <textarea
                  value={revokeMessage}
                  onChange={(e) => setRevokeMessage(e.target.value)}
                  placeholder="e.g. Subject code GE3751 has grade mismatch. Please correct and re-submit via HOD."
                  rows={4}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setRevokeModal({ open: false, app: null })}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokePhotocopyByExamCell}
                  disabled={revoking || !revokeMessage.trim()}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  {revoking ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Confirm Revoke & Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Master Status Filter Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-700">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Export Master Excel Report</h3>
                  <p className="text-xs font-medium text-slate-500">Select application status(es) to include in the exported report</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Select Status(es) to Export</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedExportStatuses(["ALL"])}
                  className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedExportStatuses([])}
                  className="text-xs font-bold text-slate-500 hover:underline cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {(exportTargetType === "revaluation"
                ? [
                  { id: "ALL", label: "All Statuses", badge: "bg-slate-200 text-slate-900" },
                  { id: "Submitted to HOD", label: "Submitted to HOD", badge: "bg-blue-100 text-blue-800" },
                  { id: "Recommended by HOD", label: "Recommended by HOD", badge: "bg-emerald-100 text-emerald-800" },
                  { id: "Approved", label: "Approved", badge: "bg-teal-100 text-teal-800" },
                  { id: "Result Published", label: "Result Published", badge: "bg-purple-100 text-purple-800" },
                  { id: "Payment Pending", label: "Payment Pending", badge: "bg-amber-100 text-amber-800" },
                  { id: "Revoked by Exam Cell", label: "Revoked by Exam Cell", badge: "bg-red-100 text-red-800" },
                ]
                : [
                  { id: "ALL", label: "All Statuses", badge: "bg-slate-200 text-slate-900" },
                  { id: "Payment Confirmed", label: "Payment Confirmed", badge: "bg-sky-100 text-sky-800" },
                  { id: "Submitted to HOD", label: "Submitted to HOD", badge: "bg-blue-100 text-blue-800" },
                  { id: "Recommended by HOD", label: "Recommended by HOD", badge: "bg-emerald-100 text-emerald-800" },
                  { id: "Copy Issued", label: "Copy Issued", badge: "bg-purple-100 text-purple-800" },
                  { id: "Payment Pending", label: "Payment Pending", badge: "bg-amber-100 text-amber-800" },
                  { id: "Revoked by HOD", label: "Revoked by HOD", badge: "bg-orange-100 text-orange-800" },
                  { id: "Revoked by Exam Cell", label: "Revoked by Exam Cell", badge: "bg-red-100 text-red-800" },
                  { id: "Closed", label: "Closed", badge: "bg-zinc-200 text-zinc-700" },
                ]
              ).map((opt) => {
                const count = getStatusCount(opt.id);
                const isChecked = selectedExportStatuses.includes(opt.id) || (selectedExportStatuses.includes("ALL") && opt.id === "ALL");
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleExportStatus(opt.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl border-2 transition-all cursor-pointer ${isChecked
                        ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/80"
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 pointer-events-none"
                      />
                      <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${opt.badge}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-semibold">Matching Applications to Export:</span>
              <span className="font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                {selectedExportStatuses.includes("ALL")
                  ? (exportTargetType === "revaluation" ? revaluationApps.length : photocopyApps.length)
                  : (exportTargetType === "revaluation" ? revaluationApps : photocopyApps).filter((a) => selectedExportStatuses.includes(a.status || "Payment Pending")).length}{" "}
                Applications
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportMaster}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet size={15} />
                Download Excel Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anna University Fee Collection Report Modal */}
      <AnnaUniversityFeeReportModal
        isOpen={feeReportModalOpen}
        onClose={() => setFeeReportModalOpen(false)}
        applications={feeReportTargetType === "review" ? reviewApps : (feeReportTargetType === "revaluation" ? revaluationApps : photocopyApps)}
        reportType={feeReportTargetType === "review" ? "Review" : (feeReportTargetType === "revaluation" ? "Revaluation" : "Photocopy")}
      />

      {/* Official Review View Modal for Exam Cell */}
      {showReviewModal && selectedReviewApp && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowReviewModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-950 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-sm">
                  <FileSearch size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base">Answer Script Review Application</h3>
                  <p className="text-blue-200 text-[11px] font-medium">Candidate: {selectedReviewApp.studentName} ({selectedReviewApp.regNo})</p>
                </div>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Register No</span>
                  <span className="font-mono font-bold text-slate-900">{selectedReviewApp.regNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Student Name</span>
                  <span className="font-bold text-slate-900">{selectedReviewApp.studentName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Department</span>
                  <span className="font-bold text-slate-900">{selectedReviewApp.department}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Fee Amount</span>
                  <span className="font-bold text-emerald-700">₹{selectedReviewApp.feeAmount} (Paid ✓)</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3">Applied Review Subjects</h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Sem</th>
                        <th className="p-3">Code</th>
                        <th className="p-3">Title</th>
                        <th className="p-3 text-center">Grade</th>
                        <th className="p-3 text-center">Result</th>
                        <th className="p-3 text-center">Attached File</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {Array.isArray(selectedReviewApp.subjects) && selectedReviewApp.subjects.map((sub, idx) => (
                        <tr key={idx}>
                          <td className="p-3 text-slate-500">{sub.semesterNo || '—'}</td>
                          <td className="p-3 font-mono text-slate-900">{sub.subjectCode}</td>
                          <td className="p-3 text-slate-800">{sub.subjectTitle}</td>
                          <td className="p-3 text-center"><span className="bg-blue-50 text-[#120c7a] px-2 py-0.5 rounded font-black">{sub.grade || 'U'}</span></td>
                          <td className="p-3 text-center"><span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-black">{sub.result || 'Fail'}</span></td>
                          <td className="p-3 text-center">
                            {sub.fileData ? (
                              <a href={sub.fileData} download={sub.fileName || `review_${sub.subjectCode}.pdf`} className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline">
                                <Download size={13} /> Download ({sub.fileSize ? `${Math.round(sub.fileSize / 1024)}KB` : '<60KB'})
                              </a>
                            ) : (
                              <span className="text-slate-400 text-[11px]">No file</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button onClick={() => setShowReviewModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Photocopy Problem View Modal for Exam Cell */}
      <PhotocopyProblemModal
        open={showProblemModal}
        app={selectedProblemApp}
        onClose={() => {
          setShowProblemModal(false);
          setSelectedProblemApp(null);
        }}
        isExamCell={true}
        onRevoke={(app) => {
          setRevokeProblemModal({ open: true, app });
          setRevokeProblemMessage("");
        }}
      />

      {/* Exam Cell Photocopy Problem Revoke Modal */}
      {revokeProblemModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[230] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setRevokeProblemModal({ open: false, app: null })}>
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-rose-100 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-rose-900 to-red-800 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl text-white">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">Revoke Photocopy Problem Report</h3>
                  <p className="text-rose-200 text-xs">Return problem report with feedback to Department & Student</p>
                </div>
              </div>
              <button
                onClick={() => setRevokeProblemModal({ open: false, app: null })}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs">
                <p className="text-rose-950 font-semibold">
                  You are revoking the discrepancy report for <span className="font-bold">{revokeProblemModal.app?.studentName} ({revokeProblemModal.app?.regNo})</span>.
                </p>
                <p className="text-rose-700 mt-1">
                  Specify the reason below. The student will be allowed to edit and re-submit.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  Revoke Reason / Correction Feedback *
                </label>
                <textarea
                  rows={4}
                  value={revokeProblemMessage}
                  onChange={(e) => setRevokeProblemMessage(e.target.value)}
                  placeholder="e.g. Invalid register number or subject details provided..."
                  className="w-full p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:border-rose-600 focus:bg-white transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setRevokeProblemModal({ open: false, app: null })}
                  className="px-4 py-2.5 bg-zinc-100 text-zinc-700 font-bold rounded-xl text-xs hover:bg-zinc-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRevokeProblemByExamCell}
                  disabled={revokingProblem || !revokeProblemMessage.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {revokingProblem ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Confirm Revoke & Send Feedback
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Exam Modal */}
      {showCreateExamModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-[#120c7a] via-indigo-900 to-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                  <GraduationCap size={18} className="text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Create New Examination</h3>
                  <p className="text-[11px] text-blue-200 font-medium">Add a new examination title to ESE Registration</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateExamModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateExam} className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                  Examination Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nov / Dec 2026 End Semester Examinations"
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                    Session / Month
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Nov/Dec 2026"
                    value={newExamSession}
                    onChange={(e) => setNewExamSession(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                    Academic Year
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-2027"
                    value={newExamAcademicYear}
                    onChange={(e) => setNewExamAcademicYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateExamModal(false)}
                  className="px-4 py-2 bg-zinc-100 text-zinc-700 font-bold rounded-xl text-xs hover:bg-zinc-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingExam || !newExamName.trim()}
                  className="px-5 py-2 bg-[#120c7a] hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {creatingExam ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {creatingExam ? "Creating..." : "Create Examination"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ESE Paid Fee Report Modal with Date Range Filter, Search & Excel/PDF Export */}
      <EsePaidFeeReportModal
        isOpen={paidFeeReportModalOpen}
        onClose={() => setPaidFeeReportModalOpen(false)}
        selectedExam={selectedExam}
        allExams={eseExams}
        availableDepartments={availableDepartments}
        availableBatches={availableBatches}
      />
    </Layout>
  );
}

function ExamCellGatewayCard() {
  return (
    <div className="bg-white rounded-2xl border border-indigo-100 shadow-lg p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <IndianRupee size={17} className="text-emerald-600" /> Exam Cell HDFC Payment Gateway
          </h3>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            Dedicated HDFC Merchant Gateway hardcoded in Cloud Environment for Exam Cell payments (Photocopy, Revaluation, Review & ESE Registration). Isolated from tuition fee account.
          </p>
        </div>
        <span className="px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
          <ShieldCheck size={13} /> Cloud Env Active (Merchant ID: 76983)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs font-mono font-bold text-slate-700">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Merchant ID</span>
          <span className="text-slate-900">76983</span>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Gateway Endpoint</span>
          <span className="text-emerald-700">https://smartgateway.hdfc.bank.in</span>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Environment</span>
          <span className="text-indigo-700 font-sans">Production (Live Gateway)</span>
        </div>
      </div>
    </div>
  );
}
