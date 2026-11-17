import { useState, useEffect, useMemo, useCallback } from "react";
import { auth, db, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, Timestamp, query, where, getDocs, writeBatch, deleteField } from "firebase/firestore";
import {
  IndianRupee, Plus, Search, Edit3, Trash2, X, CheckCircle2, AlertCircle,
  CreditCard, Building2, Users, Download, Printer,
  ChevronDown, ChevronRight, FileText, Wallet, Percent, BadgeCheck,
  CalendarDays, Banknote, QrCode, ShieldCheck, Filter, Copy,
  Tags, Pencil, Layers, Save, Bus, BarChart3, ExternalLink,
  Upload, FileSpreadsheet, Check, RefreshCw, HelpCircle, FileUp, Landmark, Clock, UploadCloud
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { getSeatConfigurationsRealtime } from "../services/seatService";
import { formatProgrammeKey, formatProgDisplay, sanitizeKey, getRecentBatches } from "../lib/utils";
import { isDeptMatch as isDeptMatchRegistry, getDeptFromRegNo } from "../lib/departmentRegistry";
import OfficialFeeReceiptModal from "../components/OfficialFeeReceiptModal";

const normAlpha = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
import { getCanonicalDept } from "./FeeDashboard";
import { 
  computePaidByConfig,
  isBatchMatch,
  isProgMatch,
  normalizeQuotaStr,
  isQuotaMatchExact,
  isQuotaApplicable,
  normalizeCategoryStr,
  isCategoryMatchExact,
  isCategoryApplicable,
  parseYearStart,
  normHead,
  buildStudentCanonicalLookup,
  aggregatePaymentsByStudent,
  aggregateConcessionsByStudent,
  aggregateOpeningDuesByStudent,
  getActiveSemesterConfigs
} from "../utils/feeAllocation";
import Layout from "../components/Layout";
import DirectScholarshipSettlementModal from "../components/DirectScholarshipSettlementModal";
import { getPaymentMode, getPaymentAcademicYear, getPaymentDateObj } from "./FeeDashboard";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

const STUDENT_CATEGORY_OPTIONS = ["Regular", "Lateral Entry", "Transfer", "Readmission"];

export const COE_FEE_HEADS = [
  "ESE registration Fee",
  "Photocopy Fee",
  "Revaluation Fee",
  "Review Fee"
];

const subscribeAppPaymentsForStudent = (student, setAppPayments) => {
  if (!student) {
    setAppPayments([]);
    return () => { };
  }

  const keys = new Set();
  const addKey = (k) => {
    if (k && typeof k === "string" && k.trim()) {
      keys.add(k.trim());
    }
  };

  addKey(student.applicationNo);
  addKey(student.enquiryId);
  addKey(student.regNo);
  addKey(student.examNumber);
  addKey(student.admissionNo);
  addKey(student.id);
  addKey(student._docId);
  addKey(student.uid);
  addKey(student._profile_data?.enquiryId);
  addKey(student._profile_data?.applicationNo);

  const email = (student.email || student.emailId || student._profile_data?.emailId || "").trim();
  const mobile = (student.mobile || student.parentMobile || student.studentMobile || student._profile_data?.mobile || "").trim();

  const matchingDocSnaps = new Map();

  const parseAndSet = () => {
    const collected = [];
    const seenPayments = new Set();

    matchingDocSnaps.forEach((data, docId) => {
      // 1. Array of payments
      if (Array.isArray(data.payments) && data.payments.length > 0) {
        data.payments.forEach((p, i) => {
          const amt = Number(p.feeAmount || p.amount || 0);
          if (!amt || amt <= 0) return;
          const pId = `app-${docId}-${i}`;
          if (!seenPayments.has(pId)) {
            seenPayments.add(pId);
            const dateVal = p.paymentDate
              ? (p.paymentDate.toDate ? p.paymentDate : Timestamp.fromDate(new Date(p.paymentDate)))
              : (data.createdAt ? (data.createdAt.toDate ? data.createdAt : Timestamp.fromDate(new Date(data.createdAt))) : Timestamp.now());
            collected.push({
              id: pId,
              status: "SUCCESS",
              feeHead: p.feeCategory || p.feeHead || p.head || "Application Fee",
              amount: amt,
              chargedAmount: amt,
              paymentDate: dateVal,
              createdAt: dateVal,
              mode: p.paymentMode || p.mode || "cash",
              receiptNo: `APP ${data.applicationNo || data.enquiryId || docId}`,
              orderId: `APP ${data.applicationNo || data.enquiryId || docId}`,
              _source: "Application",
            });
          }
        });
      }

      // 2. Single payment fields
      if (Number(data.feeAmount) > 0) {
        const amt = Number(data.feeAmount);
        const pId = `app-${docId}-single`;
        if (!seenPayments.has(pId)) {
          seenPayments.add(pId);
          const dateVal = data.paymentDate
            ? (data.paymentDate.toDate ? data.paymentDate : Timestamp.fromDate(new Date(data.paymentDate)))
            : (data.createdAt ? (data.createdAt.toDate ? data.createdAt : Timestamp.fromDate(new Date(data.createdAt))) : Timestamp.now());
          collected.push({
            id: pId,
            status: "SUCCESS",
            feeHead: data.feeCategory || "Application Fee",
            amount: amt,
            chargedAmount: amt,
            paymentDate: dateVal,
            createdAt: dateVal,
            mode: data.paymentMode || "cash",
            receiptNo: `APP ${data.applicationNo || data.enquiryId || docId}`,
            orderId: `APP ${data.applicationNo || data.enquiryId || docId}`,
            _source: "Application",
          });
        }
      }
    });

    setAppPayments(collected);
  };

  const handleSnapshot = (snap) => {
    snap.forEach((d) => matchingDocSnaps.set(d.id, d.data()));
    parseAndSet();
  };

  const unsubs = [];
  for (const k of keys) {
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("applicationNo", "==", k)), handleSnapshot, () => { }));
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("enquiryId", "==", k)), handleSnapshot, () => { }));
  }
  if (email) {
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("emailId", "==", email)), handleSnapshot, () => { }));
  }
  if (mobile) {
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("mobile", "==", mobile)), handleSnapshot, () => { }));
  }

  return () => {
    unsubs.forEach(u => u());
  };
};

const DEFAULT_FEE_HEADS = [
  { name: "Tuition Fee", splitType: "academic-year" },
  { name: "Development Fee", splitType: "academic-year" },
  { name: "Library Fee", splitType: "academic-year" },
  { name: "Lab Fee", splitType: "academic-year" },
  { name: "Exam Fee", splitType: "semester" },
  { name: "No Due Fee", splitType: "semester" },
  { name: "Sports Fee", splitType: "academic-year" },
  { name: "Transport Fee", splitType: "academic-year" },
  { name: "Hostel Fee", splitType: "academic-year" },
  { name: "Caution Deposit", splitType: "student" },
  { name: "Placement Fee", splitType: "student" },
  { name: "Revaluation Fee", splitType: "student" },
  { name: "Breakage Fee", splitType: "student" },
  { name: "Addon Fee", splitType: "student" },
  { name: "Alumni Fee", splitType: "student" },
  { name: "Other", splitType: "student" }
];

const PAYMENT_MODES = [
  { value: "cash", label: "Cash (Counter)", icon: "💵" },
  { value: "gateway", label: "HDFC SmartGateway", icon: "🌐" },
  { value: "upi", label: "UPI", icon: "📱" },
  { value: "dd", label: "Demand Draft", icon: "🏛️" },
  { value: "card", label: "Card", icon: "💳" },
  { value: "neft", label: "NEFT/RTGS", icon: "🏦" },
  { value: "cheque", label: "Cheque", icon: "📝" },
];

// QUOTA_OPTIONS now derived dynamically from seat configurations
const BRANCHES = ["CSE", "ECE", "EEE", "ME", "CE", "CSBS", "AIML", "DS", "IT", "AIDS"];

const displayDept = (v) => {
  if (typeof v !== 'string' || !v.trim()) return v || '—';
  let result = v.trim();
  result = result
    .replace(/^B_?Tech_?/gi, "B.Tech. ")
    .replace(/^B_?E_?/gi, "B.E. ")
    .replace(/^M_?Tech_?/gi, "M.Tech. ")
    .replace(/^M_?E_?/gi, "M.E. ")
    .replace(/^B_?Sc_?/gi, "B.Sc. ")
    .replace(/^M_?Sc_?/gi, "M.Sc. ")
    .replace(/^B_?C_?A_?/gi, "B.C.A. ")
    .replace(/^M_?C_?A_?/gi, "MCA ")
    .replace(/^B_?B_?A_?/gi, "B.B.A. ")
    .replace(/^M_?B_?A_?/gi, "MBA ")
    .replace(/^B_?Com_?/gi, "B.Com. ")
    .replace(/^M_?Com_?/gi, "M.Com. ")
    .replace(/^B_?A_?/gi, "B.A. ")
    .replace(/^M_?A_?/gi, "M.A. ");
  return result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim() || '—';
};

const numberToWordsINR = (num) => {
  if (!num || isNaN(num) || num <= 0) return "Zero Rupees Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convert = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };
  const mainPart = Math.floor(num);
  const paisePart = Math.round((num - mainPart) * 100);
  let words = "Rupees " + convert(mainPart);
  if (paisePart > 0) {
    words += " and " + convert(paisePart) + " Paise";
  }
  return words + " Only";
};

const getQuota = (obj) => obj?.seatCategory || obj?.quotaAskedFor || obj?.quota || "";
const getCategory = (obj) => obj?.studentCategory || obj?.category || obj?.admissionType || obj?.entryType || "";

const parseStudentDoc = (docId, data) => {
  const meta = data?._meta || {};
  let batch = meta.batch || meta.Batch || meta.batch_name || data?.batch || "";
  let department = meta.department || meta.dept || meta.department_name || data?.department || "";
  let programme = meta.programme || meta.programme_name || meta.prog || data?.programme || "";
  let section = meta.section || data?.section || "";

  if (!batch) {
    const bMatch = String(docId).match(/(\d{4}\s*[-_]\s*\d{2,4})/);
    if (bMatch) {
      const parts = bMatch[1].split(/[-_]/);
      const y1 = parts[0].trim();
      let y2 = parts[1].trim();
      if (y2.length === 2) y2 = '20' + y2;
      batch = `${y1}-${y2}`;
    }
  }

  if (!section) {
    const sMatch = String(docId).match(/Sec-([A-Za-z0-9]+)/i);
    if (sMatch) section = sMatch[0];
  }

  if (!department && docId) {
    let clean = String(docId);
    if (batch) {
      const idx = clean.indexOf(batch);
      if (idx >= 0) clean = clean.slice(idx + batch.length).replace(/^[_-]+/, '');
    }
    if (section) {
      const sIdx = clean.lastIndexOf(section);
      if (sIdx >= 0) clean = clean.slice(0, sIdx).replace(/[_-]+$/, '');
    }
    clean = clean.replace(/^(UG|PG)[_-]+/i, '');
    department = displayDept(clean);
  }

  return { batch, department, programme, section };
};

const deriveBatch = (existingBatch, regNo, dept) => {
  if (existingBatch && existingBatch !== "—" && String(existingBatch).trim()) {
    return String(existingBatch).trim();
  }
  if (!regNo) return "—";
  const clean = String(regNo).trim();
  const match12 = clean.match(/^4207(\d{2})/);
  if (match12) {
    const yr = 2000 + parseInt(match12[1], 10);
    const isPG = (dept || "").toLowerCase().includes("m_b_a") || (dept || "").toLowerCase().includes("mba") || (dept || "").toLowerCase().includes("m_e") || (dept || "").toLowerCase().includes("master");
    const endYr = yr + (isPG ? 2 : 4);
    return `${yr}-${endYr}`;
  }
  const match7 = clean.match(/^(20\d{2})/);
  if (match7) {
    const yr = parseInt(match7[1], 10);
    const isPG = (dept || "").toLowerCase().includes("m_b_a") || (dept || "").toLowerCase().includes("mba") || (dept || "").toLowerCase().includes("m_e") || (dept || "").toLowerCase().includes("master");
    const endYr = yr + (isPG ? 2 : 4);
    return `${yr}-${endYr}`;
  }
  return "—";
};

const formatExcelDate = (dateVal) => {
  if (!dateVal) return "—";
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const deriveStudyYear = (batchStr, academicYearStr) => {
  if (!batchStr) return "I";
  const bMatch = String(batchStr).match(/(20\d{2})/);
  if (!bMatch) return "I";
  const batchStart = parseInt(bMatch[1], 10);

  let ayStart = batchStart;
  if (academicYearStr) {
    const ayMatch = String(academicYearStr).match(/(20\d{2})/);
    if (ayMatch) ayStart = parseInt(ayMatch[1], 10);
  }

  const diff = (ayStart - batchStart) + 1;
  const romanMap = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };
  if (diff <= 1) return "I";
  if (diff in romanMap) return romanMap[diff];
  if (diff > 5) return "Passed Out";
  return String(diff);
};

export default function FeeOperations() {
  const navigate = useNavigate();
  const location = useLocation();
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);
  const [tab, setTab] = useState(() => {
    const qTab = new URLSearchParams(window.location.search).get("tab");
    if (qTab && ["structure", "collect", "receipts", "concessions", "reports", "transport"].includes(qTab)) {
      return qTab;
    }
    if (location.pathname.includes("/fee/operations")) return "collect";
    return "structure";
  });

  useEffect(() => {
    const qTab = new URLSearchParams(location.search).get("tab");
    if (qTab && ["structure", "collect", "receipts", "concessions", "reports", "transport"].includes(qTab)) {
      setTab(qTab);
    }
  }, [location.search]);

  const handleTabChange = (targetTab) => {
    setTab(targetTab);
    navigate(`/fee/operations?tab=${targetTab}`, { replace: true });
  };

  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [feeHeads, setFeeHeads] = useState([]);
  const [seatConfigs, setSeatConfigs] = useState({});
  const [feeFilter, setFeeFilter] = useState({ programme: "", department: "", batch: "", academicYear: "" });
  const filteredFeeConfigs = useMemo(() => {
    const { programme, department, batch, academicYear } = feeFilter;
    if (!programme && !department && !batch && !academicYear) return feeConfigs;
    return feeConfigs.filter(f => {
      if (programme && f.programme !== programme) return false;
      if (department && f.department !== department) return false;
      if (batch && f.batch !== batch) return false;
      if (academicYear && f.academicYear !== academicYear) return false;
      return true;
    });
  }, [feeConfigs, feeFilter]);
  const filterOptions = useMemo(() => {
    const opts = { programmes: {}, departments: {}, batches: {}, academicYears: {} };
    const filtered = feeFilter.programme
      ? feeConfigs.filter(f => f.programme === feeFilter.programme)
      : feeConfigs;
    for (const f of filtered) {
      if (f.programme) opts.programmes[f.programme] = true;
      if (f.department) opts.departments[f.department] = true;
      if (f.batch) opts.batches[f.batch] = true;
      if (f.academicYear) opts.academicYears[f.academicYear] = true;
    }
    const byDept = feeFilter.department
      ? filtered.filter(f => f.department === feeFilter.department)
      : filtered;
    const batches2 = {};
    for (const f of byDept) { if (f.batch) batches2[f.batch] = true; }
    const byBatch = feeFilter.batch
      ? byDept.filter(f => f.batch === feeFilter.batch)
      : byDept;
    const years2 = {};
    for (const f of byBatch) { if (f.academicYear) years2[f.academicYear] = true; }
    return {
      programmes: Object.keys(opts.programmes).sort(),
      departments: Object.keys(opts.departments).sort(),
      batches: Object.keys(batches2).sort(),
      academicYears: Object.keys(years2).sort(),
    };
  }, [feeConfigs, feeFilter]);
  const quotaOptions = useMemo(() => {
    const quotas = new Set();
    Object.values(seatConfigs || {}).forEach(cfg => {
      if (cfg.quotas) Object.keys(cfg.quotas).forEach(q => quotas.add(q));
    });
    return Array.from(quotas);
  }, [seatConfigs]);
  const groupedRows = useMemo(() => {
    const sorted = [...filteredFeeConfigs].sort((a, b) => {
      const pg = (a.programme || '').localeCompare(b.programme || '');
      if (pg) return pg;
      const dp = (a.department || '').localeCompare(b.department || '');
      if (dp) return dp;
      const bt = (a.batch || '').localeCompare(b.batch || '');
      if (bt) return bt;
      return (a.academicYear || '').localeCompare(b.academicYear || '');
    });
    const groups = [];
    let currentGroup = null;
    let currentYear = null;
    sorted.forEach((f) => {
      const batchKey = `${f.programme || ''}|${f.department || ''}|${f.batch || ''}`;
      if (!currentGroup || currentGroup.key !== batchKey) {
        currentYear = null;
        currentGroup = { key: batchKey, programme: f.programme, department: f.department, batch: f.batch, yearGroups: [] };
        groups.push(currentGroup);
      }
      const yr = f.academicYear || '';
      if (!currentYear || currentYear.key !== yr) {
        currentYear = { key: yr, academicYear: yr, headGroups: [] };
        currentGroup.yearGroups.push(currentYear);
      }
      const heads = currentYear.headGroups;
      const last = heads[heads.length - 1];
      if (last && last.head === f.head) {
        last.rows.push(f);
      } else {
        heads.push({ head: f.head, rows: [f] });
      }
    });
    return groups;
  }, [filteredFeeConfigs]);
  const headSplitTypes = useMemo(() => {
    const map = {};
    (feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS).forEach(h => {
      map[h.name || h] = h.splitType || "student";
    });
    return map;
  }, [feeHeads]);

  const allAvailableBatches = useMemo(() => {
    const activeConfigs = getActiveSemesterConfigs(semesterConfigs);
    const activeBatchSet = new Set();
    activeConfigs.forEach(c => {
      const bList = Array.isArray(c.batch) ? c.batch : (c.batch ? [c.batch] : []);
      bList.forEach(b => b && activeBatchSet.add(b.trim()));
    });

    const set = new Set();
    // Prioritize active calendar batches
    activeBatchSet.forEach(b => set.add(b));

    // Also include batches from active studying students
    students.forEach(s => {
      const b = (s.batch || s._profile_data?.batch || "").trim();
      if (b && (activeBatchSet.size === 0 || Array.from(activeBatchSet).some(ab => isBatchMatch(ab, b)))) {
        set.add(b);
      }
    });

    // If no active batches found, fallback to feeConfigs and standard batches
    if (set.size === 0) {
      feeConfigs.forEach(f => {
        if (f.batch) set.add(f.batch.trim());
      });
      ["2025-2029", "2024-2028", "2023-2027", "2022-2026"].forEach(b => set.add(b));
    }

    return Array.from(set).sort().reverse();
  }, [students, feeConfigs, semesterConfigs]);

  const activeHeadsList = useMemo(() => {
    const raw = (feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS);
    const seen = new Set();
    const list = [];
    raw.forEach(h => {
      const name = (typeof h === "string" ? h : h.name || "").trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push(name);
      }
    });
    return list;
  }, [feeHeads]);
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [headEditIdx, setHeadEditIdx] = useState(null);
  const [headEditVal, setHeadEditVal] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Fee Structure state
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [editFeeId, setEditFeeId] = useState(null);
  const [feeForm, setFeeForm] = useState({ programme: "", batch: "", academicYear: "", semester: "", department: "", quota: "", studentCategory: "", head: "", amount: "", sameForAllYears: false });

  // Payment state
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentQuota, setSelectedStudentQuota] = useState("");
  const [selectedStudentCategory, setSelectedStudentCategory] = useState("");
  const [selectedStudentStage, setSelectedStudentStage] = useState("");
  const [appPayments, setAppPayments] = useState([]);
  const [selectedHeads, setSelectedHeads] = useState([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "cash", feeHead: "", academicYear: "", remarks: "", refNo: "", paymentDate: new Date().toISOString().split("T")[0] });

  // Receipt state
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptDateFrom, setReceiptDateFrom] = useState("");
  const [receiptDateTo, setReceiptDateTo] = useState("");
  const [receiptModal, setReceiptModal] = useState({ open: false, payment: null });
  const [selectedHistoryPayments, setSelectedHistoryPayments] = useState([]);

  const handleToggleSelectHistoryPayment = (paymentId) => {
    setSelectedHistoryPayments((prev) =>
      prev.includes(paymentId) ? prev.filter((id) => id !== paymentId) : [...prev, paymentId]
    );
  };

  const handleSelectAllHistoryPayments = (checked) => {
    const allPayments = (studentFeeDetails?.allStudentPayments || studentFeeDetails?.studentPayments || []);
    if (checked) {
      const successfulIds = allPayments
        .filter(isSuccessfulPayment)
        .map((p) => p.id || p.orderId || p.receiptNo);
      setSelectedHistoryPayments(successfulIds);
    } else {
      setSelectedHistoryPayments([]);
    }
  };

  const handlePrintConsolidatedHistory = () => {
    const allPayments = (studentFeeDetails?.allStudentPayments || studentFeeDetails?.studentPayments || []);
    const selected = allPayments.filter(
      (p) => selectedHistoryPayments.includes(p.id || p.orderId || p.receiptNo) && isSuccessfulPayment(p)
    );
    if (selected.length === 0) return;
    if (selected.length === 1) {
      setReceiptModal({ open: true, payment: selected[0] });
      return;
    }
    const totalAmount = selected.reduce(
      (sum, p) => sum + Number(p.chargedAmount || p.amount || 0),
      0
    );
    const combinedItems = selected.flatMap((p) => {
      if (Array.isArray(p.items) && p.items.length > 0) return p.items;
      if (Array.isArray(p.allocations) && p.allocations.length > 0) return p.allocations;
      return [
        {
          head: p.feeHead || "Fee Item",
          amount: Number(p.chargedAmount || p.amount || 0),
          academicYear: p.academicYear || studentFeeDetails?.activeAy || "2026-2027",
          semester: p.semester || "",
        },
      ];
    });

    const studentObj = selectedStudent || studentFeeDetails?.student || {};
    const consolidatedReceipt = {
      isConsolidated: true,
      receiptNo: `REC-CONS-${studentObj.regNo || "STU"}-${Date.now().toString(36).toUpperCase()}`,
      orderId: `CONS-${selected.map((s) => String(s.orderId || s.receiptNo || "REF").slice(-4)).join("-")}`,
      paymentDate: new Date(),
      items: combinedItems,
      amount: totalAmount,
      mode: "Consolidated (Online / Counter)",
      studentName: studentObj.name || studentObj.displayName || "Candidate",
      regNo: studentObj.regNo || studentObj.rollNo || "",
      department: studentObj.department,
      programme: studentObj.programme,
      batch: studentObj.batch,
      section: studentObj.section,
    };
    setReceiptModal({ open: true, payment: consolidatedReceipt });
  };

  const handlePrintDueDemandBill = () => {
    if (selectedHeads.length === 0) return;
    const totalDue = selectedHeads.reduce((sum, h) => sum + Number(h.amount || h.due || 0), 0);
    const studentObj = selectedStudent || studentFeeDetails?.student || {};
    const dueDemandPayment = {
      isDueDemand: true,
      demandNo: `DEM-${studentObj.regNo || "STU"}-${Date.now().toString(36).toUpperCase()}`,
      demandRef: `DEM-${studentObj.regNo || "STU"}-${selectedHeads.length}H`,
      demandDate: new Date(),
      items: selectedHeads.map((h) => ({
        head: h.head,
        amount: Number(h.amount || h.due || 0),
        academicYear: h.academicYear || studentFeeDetails?.activeAy || "2026-2027",
        semester: h.semester || "",
      })),
      totalDue: totalDue,
      amount: totalDue,
      mode: "Payment Due (Demand Voucher)",
      studentName: studentObj.name || studentObj.displayName || "Candidate",
      regNo: studentObj.regNo || studentObj.rollNo || "",
      department: studentObj.department,
      programme: studentObj.programme,
      batch: studentObj.batch,
      section: studentObj.section,
    };
    setReceiptModal({ open: true, payment: dueDemandPayment });
  };

  // Concession state
  const [showConcessionModal, setShowConcessionModal] = useState(false);
  const [concessionForm, setConcessionForm] = useState({ studentId: "", studentName: "", examNumber: "", type: "Merit", amount: "", percentage: "", validTill: "", status: "pending", remarks: "" });
  const [saving, setSaving] = useState(false);

  // Transport state
  const [transportStages, setTransportStages] = useState([]);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [editTransportId, setEditTransportId] = useState(null);
  const [transportForm, setTransportForm] = useState({ stageNo: "", location: "", fee: "" });

  // Opening Dues / Arrears State (Previous Academic Year Dues)
  const [openingDues, setOpeningDues] = useState([]);
  const [showOpeningDuesModal, setShowOpeningDuesModal] = useState(false);
  const [showScholarshipSettlementModal, setShowScholarshipSettlementModal] = useState(false);
  const [openingDuesTab, setOpeningDuesTab] = useState("template"); // "template" | "upload" | "preview" | "view"
  const [selectedBatchForTemplate, setSelectedBatchForTemplate] = useState("");
  const [selectedYearForTemplate, setSelectedYearForTemplate] = useState("2024-2025");
  const [uploadedDuesData, setUploadedDuesData] = useState([]);
  const [duesUploading, setDuesUploading] = useState(false);
  const [openingDuesSearch, setOpeningDuesSearch] = useState("");
  const [openingDuesBatchFilter, setOpeningDuesBatchFilter] = useState("ALL");

  // Bulk Fee Upload State (Netkampus / Prior ERP Settlement)
  const [showNetkampusModal, setShowNetkampusModal] = useState(false);
  const [netkampusTab, setNetkampusTab] = useState("template"); // "template" | "upload" | "preview" | "view"
  const [netkampusProg, setNetkampusProg] = useState("UG");
  const [netkampusBatch, setNetkampusBatch] = useState("");
  const [netkampusYear, setNetkampusYear] = useState("");
  const [uploadedNetkampusData, setUploadedNetkampusData] = useState([]);
  const [netkampusUploading, setNetkampusUploading] = useState(false);
  const [netkampusSearch, setNetkampusSearch] = useState("");
  const [netkampusBatchFilter, setNetkampusBatchFilter] = useState("ALL");

  // Admin Payment Recovery Tool State
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryOrderId, setRecoveryOrderId] = useState("");
  const [recoveringPayment, setRecoveringPayment] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);

  const handleAdminVerifyAndRecover = async (e) => {
    if (e) e.preventDefault();
    if (!recoveryOrderId.trim()) {
      showToast("Please enter an Order ID", "error");
      return;
    }
    setRecoveringPayment(true);
    setRecoveryResult(null);

    let cleanOrderId = recoveryOrderId.trim();
    const attemptMatch = cleanOrderId.match(/^(?:76980|76983)-(.+)-\d+$/);
    if (attemptMatch) {
      cleanOrderId = attemptMatch[1];
    }
    const isExam = cleanOrderId.startsWith("EXAM") || cleanOrderId.includes("EXAM");

    try {
      let resultData = null;

      // 1. Try deployed Cloud Function based on order category
      if (isExam) {
        try {
          const verifyFn = httpsCallable(functions, "verifyExamCellPayment");
          const res = await verifyFn({ orderId: cleanOrderId });
          if (res.data) {
            resultData = {
              success: true,
              orderId: cleanOrderId,
              merchantId: "76983 (Exam Cell)",
              status: res.data.status || "SUCCESS",
              amount: Number(res.data.amount || 0),
              rrn: res.data.rrn || "N/A",
              txnId: res.data.txnId || "N/A",
              recovered: true,
              receiptNo: res.data.receiptNo || null,
            };
          }
        } catch (fnErr) {
          console.warn("verifyExamCellPayment call notice:", fnErr?.message || fnErr);
        }
      } else {
        try {
          const verifyFn = httpsCallable(functions, "verifyPayment");
          const res = await verifyFn({ orderId: cleanOrderId });
          if (res.data) {
            resultData = {
              success: true,
              orderId: cleanOrderId,
              merchantId: "76980 (College Fees)",
              status: res.data.status || "SUCCESS",
              amount: Number(res.data.amount || 0),
              rrn: res.data.rrn || "N/A",
              txnId: res.data.txnId || "N/A",
              recovered: true,
              receiptNo: res.data.receiptNo || null,
            };
          }
        } catch (fnErr) {
          console.warn("verifyPayment call notice:", fnErr?.message || fnErr);
        }
      }

      // 2. Direct Firestore recovery fallback if cloud function did not return
      if (!resultData) {
        if (isExam) {
          const exDoc = await getDoc(doc(db, "exam_cell_payments", cleanOrderId));
          if (exDoc.exists()) {
            const data = exDoc.data();
            resultData = {
              success: true,
              orderId: cleanOrderId,
              merchantId: "76983 (Exam Cell)",
              status: (data.status || "SUCCESS").toUpperCase(),
              amount: Number(data.amount || data.chargedAmount || 0),
              rrn: data.rrn || data.gatewayResponse?.rrn || "N/A",
              txnId: data.txnId || data.transactionId || "N/A",
              recovered: true,
              receiptNo: data.receiptNo || null,
            };
          } else {
            const q1 = query(collection(db, "ese_fee_registrations"), where("orderId", "==", cleanOrderId));
            const snap1 = await getDocs(q1);
            if (!snap1.empty) {
              const data = snap1.docs[0].data();
              resultData = {
                success: true,
                orderId: cleanOrderId,
                merchantId: "76983 (Exam Cell)",
                status: (data.status || data.paymentStatus || "SUCCESS").toUpperCase(),
                amount: Number(data.amount || data.chargedAmount || data.feeAmount || 0),
                rrn: data.rrn || data.electronicBill?.rrn || "N/A",
                txnId: data.transactionId || data.txnId || "N/A",
                recovered: true,
                receiptNo: data.receiptNo || null,
              };
            }
          }
        } else {
          const feeDoc = await getDoc(doc(db, "fee_payments", cleanOrderId));
          if (feeDoc.exists()) {
            const data = feeDoc.data();
            await ensureReceiptExists(data, cleanOrderId);
            resultData = {
              success: true,
              orderId: cleanOrderId,
              merchantId: "76980 (College Fees)",
              status: (data.status || "SUCCESS").toUpperCase(),
              amount: Number(data.amount || data.chargedAmount || 0),
              rrn: data.rrn || data.gatewayResponse?.rrn || "N/A",
              txnId: data.txnId || data.transactionId || "N/A",
              recovered: true,
              receiptNo: data.receiptNo || null,
            };
          }
        }
      }

      if (resultData) {
        setRecoveryResult(resultData);
        if (resultData.recovered) {
          showToast(`Payment verified & recovered! ${resultData.receiptNo ? `Receipt #${resultData.receiptNo}` : ""}`, "success");
        } else {
          showToast(`Gateway Status: ${resultData.status || "PENDING"}`, "info");
        }
      } else {
        showToast("No record found for this Order ID in gateway or database.", "error");
      }
    } catch (err) {
      console.warn("Payment recovery fallback check:", err?.message || err);
      showToast("Recovery error: " + (err.message || "Failed to query gateway"), "error");
    } finally {
      setRecoveringPayment(false);
    }
  };

  // COE Collections state (Exam Cell Account #76983)
  const [eseRegistrations, setEseRegistrations] = useState([]);
  const [eseFeePayments, setEseFeePayments] = useState([]);
  const [photocopyApps, setPhotocopyApps] = useState([]);
  const [revaluationApps, setRevaluationApps] = useState([]);
  const [reviewApps, setReviewApps] = useState([]);
  const [examCellPayments, setExamCellPayments] = useState([]);
  const [enquiriesList, setEnquiriesList] = useState([]);
  const [userLookup, setUserLookup] = useState(new Map());

  // Helper to test if a name is staff/admin/placeholder
  const isInvalidStudentName = (name) => {
    if (!name || typeof name !== "string") return true;
    const n = name.trim().toLowerCase();
    if (!n || n === "student" || n === "unknown" || n === "undefined" || n === "null") return true;
    if (n.includes("master") || n.includes("admin") || n.includes("cashier") || n.includes("staff") || n.includes("super")) return true;
    if (auth?.currentUser?.displayName && n === auth.currentUser.displayName.toLowerCase()) return true;
    if (auth?.currentUser?.email && n === auth.currentUser.email.toLowerCase()) return true;
    return false;
  };

  // Helper to match a payment or receipt with a specific student
  const matchesStudentRecord = (student, p) => {
    if (!student || !p) return false;
    const studentKeys = new Set(
      [
        student.id,
        student.uid,
        student.regNo,
        student.examNumber,
        student.rollNo,
        student.applicationNo,
        student.enquiryId,
        student._profile_data?.applicationNo,
        student._profile_data?.regNo,
        student._profile_data?.examNumber
      ].filter(Boolean).map(k => String(k).trim().toLowerCase())
    );

    const pKeys = [
      p.regNo,
      p.examNumber,
      p.rollNo,
      p.studentId,
      p.uid,
      p.applicationNo,
      p.studentReg
    ].filter(Boolean).map(k => String(k).trim().toLowerCase());

    if (pKeys.some(k => studentKeys.has(k))) return true;

    // If both payment and student have explicit register/roll/exam numbers and they don't match, NEVER match by name alone!
    const pReg = String(p.regNo || p.examNumber || p.rollNo || "").trim().toLowerCase();
    const sReg = String(student.regNo || student.examNumber || student.rollNo || "").trim().toLowerCase();
    if (pReg && sReg && pReg !== sReg) {
      return false;
    }

    const studentNameKey = (student.displayName || student.studentName || student.name || "").trim().toLowerCase();
    if (studentNameKey && p.studentName && p.studentName.trim().toLowerCase() === studentNameKey) {
      if (!p.department || !student.department || isDeptMatchRegistry(p.department, student.department)) {
        return true;
      }
    }
    return false;
  };

  const isSuccessfulPayment = (p) => {
    if (!p) return false;
    const st = String(p.status || "").toUpperCase().trim();
    if (st === "FAILED" || st === "CANCELLED" || st === "REJECTED" || st === "EXPIRED" || st === "VOID") return false;
    if (st === "SUCCESS" || st === "CHARGED" || st === "ACTIVE" || st === "PAID" || st === "COMPLETED" || !st) return true;
    return false;
  };

  // Helper to extract the genuine student name from student records or fallbacks
  const getCleanStudentName = useCallback((record, fallbackStudent = null) => {
    if (!record && !fallbackStudent) return "Student";

    // 1. Check fallback student / selected student
    const candStudent = fallbackStudent || (selectedStudent && matchesStudentRecord(selectedStudent, record) ? selectedStudent : null);
    if (candStudent) {
      const cName = candStudent.displayName || candStudent.studentName || candStudent.name;
      if (!isInvalidStudentName(cName)) return cName;
    }

    // 2. Search in students list
    const regNo = record?.examNumber || record?.regNo || record?.studentReg;
    const stId = record?.studentId || record?.uid;
    const matched = (students || []).find(s =>
      (regNo && (s.regNo === regNo || s.examNumber === regNo || s.rollNo === regNo)) ||
      (stId && (s.id === stId || s.uid === stId)) ||
      (record?.studentEmail && s.email && s.email.toLowerCase() === record.studentEmail.toLowerCase())
    );
    if (matched) {
      const mName = matched.displayName || matched.studentName || matched.name;
      if (!isInvalidStudentName(mName)) return mName;
    }

    // 3. Check record's own studentName
    if (record?.studentName && !isInvalidStudentName(record.studentName)) {
      return record.studentName;
    }

    // 4. Fallback: try selectedStudent
    if (selectedStudent) {
      const selName = selectedStudent.displayName || selectedStudent.studentName || selectedStudent.name;
      if (!isInvalidStudentName(selName)) return selName;
    }

    return "Student";
  }, [selectedStudent, students]);

  // Helper to ensure an official receipt exists in fee_receipts for any verified payment
  const ensureReceiptExists = async (paymentData, orderId) => {
    try {
      if (!orderId && !paymentData?.orderId && !paymentData?.id) return;
      const targetOrderId = orderId || paymentData.orderId || paymentData.id;

      // Check if receipt already exists by orderId, refNo, or receiptNo
      let existingSnap = await getDocs(query(collection(db, "fee_receipts"), where("refNo", "==", targetOrderId)));
      if (existingSnap.empty) {
        existingSnap = await getDocs(query(collection(db, "fee_receipts"), where("orderId", "==", targetOrderId)));
      }
      if (existingSnap.empty && paymentData.receiptNo) {
        existingSnap = await getDocs(query(collection(db, "fee_receipts"), where("receiptNo", "==", paymentData.receiptNo)));
      }

      // Resolve clean student name
      const targetStudent = (selectedStudent && matchesStudentRecord(selectedStudent, paymentData))
        ? selectedStudent
        : (students || []).find(s =>
            (paymentData.examNumber && (s.regNo === paymentData.examNumber || s.examNumber === paymentData.examNumber || s.rollNo === paymentData.examNumber)) ||
            (paymentData.regNo && (s.regNo === paymentData.regNo || s.examNumber === paymentData.regNo)) ||
            (paymentData.studentId && (s.id === paymentData.studentId || s.uid === paymentData.studentId)) ||
            (paymentData.uid && (s.id === paymentData.uid || s.uid === paymentData.uid))
          );

      const targetStudentName = (!isInvalidStudentName(targetStudent?.displayName) && targetStudent?.displayName) ||
                                (!isInvalidStudentName(targetStudent?.studentName) && targetStudent?.studentName) ||
                                (!isInvalidStudentName(paymentData.studentName) && paymentData.studentName) ||
                                selectedStudent?.displayName ||
                                "Student";

      // If already exists, ensure clean name is synced
      if (!existingSnap.empty) {
        const existDoc = existingSnap.docs[0];
        const existData = existDoc.data();
        if (isInvalidStudentName(existData.studentName) && !isInvalidStudentName(targetStudentName)) {
          await updateDoc(doc(db, "fee_receipts", existDoc.id), { studentName: targetStudentName }).catch(() => {});
        }
        if (targetOrderId && (!paymentData.receiptNo || isInvalidStudentName(paymentData.studentName))) {
          await updateDoc(doc(db, "fee_payments", targetOrderId), {
            receiptNo: existData.receiptNo || paymentData.receiptNo,
            studentName: targetStudentName
          }).catch(() => {});
        }
        return { id: existDoc.id, ...existData, studentName: targetStudentName };
      }

      const receiptNo = paymentData.receiptNo || `FEE${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const studentUid = paymentData.uid || paymentData.studentId || targetStudent?.id || "";
      const examNo = paymentData.examNumber || paymentData.regNo || targetStudent?.regNo || "";
      const pDate = paymentData.paymentDate || Timestamp.now();
      const amt = Number(paymentData.chargedAmount || paymentData.amount || 0);

      const receiptRecord = {
        orderId: targetOrderId,
        uid: studentUid,
        studentId: studentUid,
        examNumber: examNo,
        regNo: examNo,
        studentName: targetStudentName,
        programme: paymentData.programme || targetStudent?.programme || "",
        department: paymentData.department || targetStudent?.department || "",
        batch: paymentData.batch || targetStudent?.batch || "",
        amount: amt,
        status: "active",
        mode: paymentData.mode || "gateway",
        feeHead: paymentData.feeHead || "No Due Fee",
        academicYear: paymentData.academicYear || "2026-2027",
        remarks: paymentData.remarks || `HDFC SmartGateway Payment ${targetOrderId}`,
        refNo: targetOrderId,
        receiptNo,
        paymentDate: pDate,
        createdAt: Timestamp.now(),
        cancelledAt: null,
        reason: null,
        reprintCount: 0,
        items: (paymentData.allocations && Array.isArray(paymentData.allocations) && paymentData.allocations.length > 0)
          ? paymentData.allocations.map(a => ({
              head: a.feeHead || a.head,
              amount: a.allocatedAmount || a.amount
            }))
          : [{ head: paymentData.feeHead || "No Due Fee", amount: amt }]
      };

      const newReceiptRef = await addDoc(collection(db, "fee_receipts"), receiptRecord);

      // Stamp receiptNo and clean studentName back on fee_payments doc
      if (targetOrderId) {
        await updateDoc(doc(db, "fee_payments", targetOrderId), {
          receiptNo,
          studentName: targetStudentName,
          receiptDocId: newReceiptRef.id
        }).catch(() => {});
      }

      return { id: newReceiptRef.id, ...receiptRecord };
    } catch (recErr) {
      console.warn("ensureReceiptExists error:", recErr);
    }
  };

  // Verify return from HDFC SmartGateway or stored session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedOrderId = params.get("order_id") || params.get("orderId") || params.get("orderNo");
    const storedOrderId = sessionStorage.getItem("pending_smartgateway_order_id");
    const storedStudentSearch = sessionStorage.getItem("pending_smartgateway_student_search");
    const targetOrderId = returnedOrderId || storedOrderId;

    if (targetOrderId) {
      if (returnedOrderId) {
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=collect");
      }
      sessionStorage.removeItem("pending_smartgateway_order_id");

      const verifySmartGatewayReturn = async () => {
        try {
          const pDoc = await getDoc(doc(db, "fee_payments", targetOrderId));
          let pData = pDoc.exists() ? pDoc.data() : null;

          if (pData && (String(pData.status || "").toUpperCase() === "SUCCESS" || String(pData.status || "").toUpperCase() === "CHARGED")) {
            await ensureReceiptExists(pData, targetOrderId);
            setToast({ show: true, message: `HDFC SmartGateway Payment of ₹${(pData.chargedAmount || pData.amount)?.toLocaleString()} is successful!`, type: "success" });
            const sKey = storedStudentSearch || pData.examNumber || pData.regNo || pData.studentName;
            if (sKey) setStudentSearch(sKey);
            return;
          }

          // 1. Verify via cloud function
          try {
            const verifyFn = httpsCallable(functions, "verifyPayment");
            const res = await verifyFn({ orderId: targetOrderId });
            if (res.data?.success) {
              const verifiedAmount = Number(res.data.amount) || pData?.amount || 0;
              const updatedSnap = await getDoc(doc(db, "fee_payments", targetOrderId));
              const updatedData = updatedSnap.exists() ? updatedSnap.data() : { ...pData, amount: verifiedAmount, chargedAmount: verifiedAmount, status: "SUCCESS" };
              await ensureReceiptExists(updatedData, targetOrderId);
              setToast({ show: true, message: `HDFC SmartGateway Payment of ₹${verifiedAmount.toLocaleString()} verified successfully!`, type: "success" });
              const sKey = storedStudentSearch || updatedData.examNumber || updatedData.regNo || updatedData.studentName;
              if (sKey) setStudentSearch(sKey);
              return;
            }
          } catch (fnErr) {
            console.warn("verifyPayment function check:", fnErr);
          }

          // 2. Secondary check for Exam Cell orders if applicable
          if (targetOrderId.startsWith("EXAM") || targetOrderId.includes("EXAM")) {
            try {
              const verifyExamFn = httpsCallable(functions, "verifyExamCellPayment");
              const exRes = await verifyExamFn({ orderId: targetOrderId });
              if (exRes.data?.success || exRes.data?.status === "SUCCESS") {
                const verifiedAmount = Number(exRes.data.amount) || pData?.amount || 0;
                setToast({ show: true, message: `Exam Cell Payment of ₹${verifiedAmount.toLocaleString()} verified successfully!`, type: "success" });
                return;
              }
            } catch (exErr) {
              console.warn("verifyExamCellPayment return check:", exErr?.message || exErr);
            }
          }
        } catch (err) {
          console.error("Error verifying payment on return:", err);
        }
      };

      verifySmartGatewayReturn();
    }
  }, []);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "fee_payments"), snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => { });
    const u2 = onSnapshot(collection(db, "fee_receipts"), snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => { });
    const u3 = onSnapshot(collection(db, "fee_concessions"), snap => setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => { });
    // Official Student Namelist Master Bridge (students + approved_admissions + users + enquiries)
    let rawNamelistDocs = [];
    let rawAdmissionsDocs = [];
    let rawUserDocs = [];
    let rawEnquiriesDocs = [];

    const resolveStudentProg = (rawProg, dept, bch) => {
      const explicit = (rawProg || "").trim();
      if (explicit && (explicit.toUpperCase() === "UG" || explicit.toUpperCase() === "PG")) {
        return explicit.toUpperCase();
      }
      if (dept) {
        const dLower = dept.trim().toLowerCase();
        for (const [pName, depts] of Object.entries(PROGRAMME_DEPARTMENTS || {})) {
          if (Array.isArray(depts)) {
            const match = depts.some(item => {
              const iLower = item.trim().toLowerCase();
              return iLower === dLower || dLower.includes(iLower) || iLower.includes(dLower);
            });
            if (match) return pName.toUpperCase();
          }
        }
      }
      if (bch) {
        const [s, e] = bch.split("-").map(Number);
        if (s && e) {
          const diff = e - s;
          if (diff === 2) return "PG";
          if (diff === 4) return "UG";
        }
      }
      return explicit || "UG";
    };

    const rebuildStudentsList = () => {
      const studentMap = new Map();

      // 1. Process students collection FIRST (Primary academic namelist uploaded via Student Namelist)
      rawNamelistDocs.forEach(d => {
        const data = d.data || {};
        const { batch, department, programme, section } = parseStudentDoc(d.id, data);
        const studentDataMap = data._student_data || {};

        Object.entries(data).forEach(([k, val]) => {
          if (k.startsWith("_") || k === "id") return;
          const reg = String(k).trim();
          if (!reg) return;
          const regKey = reg.toUpperCase();
          const extra = studentDataMap[reg] || {};

          let sName = "";
          if (typeof val === "object" && val !== null) {
            sName = val.name || val.studentName || val.displayName || "";
          } else if (typeof val === "string") {
            sName = val.trim();
          }
          if (!sName && extra.name) sName = extra.name;
          if (!sName && extra.studentName) sName = extra.studentName;

          const rawDept = extra.department || department;
          const stuDept = getCanonicalDept(rawDept);
          const stuBatch = extra.batch || batch;
          const existing = studentMap.get(regKey);
          const quota = getQuota(extra) || getQuota(val) || existing?.quota || "";
          const category = getCategory(extra) || getCategory(val) || existing?.category || "Regular";
          const transportStage = extra.transportStage || (typeof val === "object" && val !== null ? val.transportStage : "") || existing?.transportStage || "";

          studentMap.set(regKey, {
            id: reg,
            regNo: reg,
            examNumber: reg,
            rollNo: reg,
            displayName: sName || existing?.displayName || reg,
            studentName: sName || existing?.studentName || reg,
            name: sName || existing?.name || reg,
            department: stuDept || existing?.department || "",
            batch: stuBatch || existing?.batch || "",
            programme: resolveStudentProg(programme || existing?.programme, stuDept || existing?.department, stuBatch || existing?.batch),
            section: section || existing?.section || "",
            quota,
            category,
            transportStage,
            _profile_data: { ...(existing?._profile_data || {}), ...extra }
          });
        });
      });

      // 2. Process approved_admissions (confirmed new admissions)
      rawAdmissionsDocs.forEach(d => {
        const data = d.data || {};
        const { batch, department, programme, section } = parseStudentDoc(d.id, data);
        Object.entries(data).forEach(([k, val]) => {
          if (k.startsWith("_") || k === "id") return;
          const reg = String(k).trim();
          if (!reg) return;
          const regKey = reg.toUpperCase();
          const sName = typeof val === "object" && val !== null ? (val.name || "") : String(val || "");
          if (studentMap.has(regKey)) {
            const existing = studentMap.get(regKey);
            if (!existing.quota && val.seatCategory) existing.quota = val.seatCategory;
            if ((!existing.category || existing.category === "Regular") && val.category) existing.category = val.category;
            if (!existing.transportStage && val.transportStage) existing.transportStage = val.transportStage;
          } else {
            const stuDept = getCanonicalDept(department);
            studentMap.set(regKey, {
              id: reg,
              regNo: reg,
              examNumber: reg,
              rollNo: reg,
              displayName: sName || reg,
              studentName: sName || reg,
              name: sName || reg,
              department: stuDept || "",
              batch: batch || "",
              programme: resolveStudentProg(programme, stuDept, batch),
              section: section || "",
              quota: val.seatCategory || "",
              category: val.category || "Regular",
              transportStage: val.transportStage || "",
              _profile_data: typeof val === "object" && val !== null ? { ...val } : {}
            });
          }
        });
      });

      // 3. Attach login / auth info (email, uid) from users collection without duplicating student list
      rawUserDocs.forEach(u => {
        const reg = (u.regNo || u.examNumber || u.rollNo || "").trim();
        if (reg) {
          const regKey = reg.toUpperCase();
          const existing = studentMap.get(regKey);
          if (existing) {
            existing.uid = u.id || u.uid || existing.uid;
            existing.email = u.email || existing.email;
            existing.emailId = u.emailId || u.email || existing.emailId;
            if (!existing.quota) existing.quota = getQuota(u);
            if (!existing.category || existing.category === "Regular") {
              const uCat = getCategory(u);
              if (uCat) existing.category = uCat;
            }
            if (!existing.transportStage) existing.transportStage = u.transportStage || "";
          }
        }
      });

      // 4. Attach verified Quota, Category & Transport Stage from enquiries (Primary admission records)
      rawEnquiriesDocs.forEach(enq => {
        const q = getQuota(enq);
        const c = getCategory(enq);
        const stage = enq.transportStage || "";
        if (!q && !c && !stage) return;

        const regKeys = [
          enq.regNo,
          enq.studentRegNo,
          enq.rollNo,
          enq.examNumber,
          enq.applicationNo,
          enq.enquiryId,
          enq.id
        ].filter(Boolean).map(r => String(r).trim().toUpperCase());

        const enqName = (enq.studentName || `${enq.firstName || ''} ${enq.lastName || ''}`.trim() || "").trim().toLowerCase();

        let targetStudent = null;
        for (const rk of regKeys) {
          if (studentMap.has(rk)) {
            targetStudent = studentMap.get(rk);
            break;
          }
        }
        if (!targetStudent && enqName) {
          for (const s of studentMap.values()) {
            const sName = (s.displayName || s.studentName || s.name || "").trim().toLowerCase();
            if (sName && sName === enqName) {
              targetStudent = s;
              break;
            }
          }
        }

        if (targetStudent) {
          if (!targetStudent.quota && q) targetStudent.quota = q;
          if ((!targetStudent.category || targetStudent.category === "Regular") && c) targetStudent.category = c;
          if (!targetStudent.transportStage && stage) targetStudent.transportStage = stage;
          targetStudent._profile_data = {
            ...(targetStudent._profile_data || {}),
            quota: targetStudent.quota || q,
            seatCategory: targetStudent.quota || q,
            studentCategory: targetStudent.category || c,
            transportStage: targetStudent.transportStage || stage
          };
        }
      });

      setStudents(Array.from(studentMap.values()));
    };

    const uStudents = onSnapshot(collection(db, "students"), snap => {
      rawNamelistDocs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      rebuildStudentsList();
    }, err => console.warn("students namelist listener error:", err));

    const uAdmissions = onSnapshot(collection(db, "approved_admissions"), snap => {
      rawAdmissionsDocs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      rebuildStudentsList();
    }, err => console.warn("approved_admissions listener error:", err));

    const uUsers = onSnapshot(collection(db, "users"), snap => {
      rawUserDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const map = new Map();
      snap.forEach(d => {
        const u = d.data();
        const reg = (u.regNo || u.registerNumber || u.examNumber || u.rollNo || "").trim();
        const cleanReg = normAlpha(reg);
        const name = (u.displayName || u.name || u.studentName || "").trim();
        const dept = u.department || "";
        const batch = u.batch || "";
        const programme = u.programme || "UG";
        const section = u.section || "A";
        const email = (u.email || u.studentEmail || "").trim().toLowerCase();

        const profile = {
          id: d.id,
          uid: u.uid || d.id,
          regNo: cleanReg || reg,
          registerNumber: cleanReg || reg,
          name,
          displayName: name,
          studentName: name,
          department: dept,
          batch,
          programme,
          section,
          email
        };

        if (cleanReg) map.set(cleanReg.toLowerCase(), profile);
        if (reg) map.set(reg.toLowerCase(), profile);
        if (d.id) map.set(d.id.toLowerCase(), profile);
        if (u.uid) map.set(String(u.uid).toLowerCase(), profile);
        if (email) map.set(email, profile);
        if (name) {
          map.set(name.toLowerCase(), profile);
          const stripped = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (stripped) map.set(stripped, profile);
        }
      });
      setUserLookup(map);
      rebuildStudentsList();
    }, err => console.warn("users listener error:", err));
    const u5 = onSnapshot(collection(db, "fee_configurations"), snap => setFeeConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => { });
    const u6 = getSeatConfigurationsRealtime(data => setSeatConfigs(data || {}), () => { });
    const u7 = onSnapshot(collection(db, "transport_stages"), snap => setTransportStages(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => { });
    const u8 = onSnapshot(collection(db, "semester_config"), snap => setSemesterConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => { });
    const uOD = onSnapshot(collection(db, "fee_opening_dues"), snap => {
      setOpeningDues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("fee_opening_dues listener error:", err));

    // Exam Cell fee collections real-time listeners
    const uCOE1 = onSnapshot(collection(db, "ese_fee_registrations"), snap => {
      setEseRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("ese_fee_registrations listener error:", err));

    const uCOE1b = onSnapshot(collection(db, "ese_fee_payments"), snap => {
      setEseFeePayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("ese_fee_payments listener error:", err));

    const uCOE2 = onSnapshot(collection(db, "photocopy_applications"), snap => {
      setPhotocopyApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("photocopy_applications listener error:", err));

    const uCOE3 = onSnapshot(collection(db, "revaluation_applications"), snap => {
      setRevaluationApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("revaluation_applications listener error:", err));

    const uCOE4 = onSnapshot(collection(db, "review_applications"), snap => {
      setReviewApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("review_applications listener error:", err));

    const uCOE5 = onSnapshot(collection(db, "exam_cell_payments"), snap => {
      setExamCellPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("exam_cell_payments listener error:", err));

    const uEnq = onSnapshot(collection(db, "enquiries"), snap => {
      const enqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rawEnquiriesDocs = enqs;
      setEnquiriesList(enqs);
      rebuildStudentsList();
    }, err => console.warn("enquiries listener error:", err));

    getDoc(doc(db, "fee_categories", "global")).then(snap => {
      if (snap.exists() && snap.data().categories) {
        const cats = snap.data().categories;
        // Handle both old string[] and new object[] format
        if (cats.length && typeof cats[0] === 'string') {
          setFeeHeads(cats.map(n => ({ name: n, splitType: "student" })));
        } else {
          setFeeHeads(cats);
        }
      }
    }).catch(() => { });
    return () => {
      u1(); u2(); u3(); uStudents(); uAdmissions(); uUsers(); u5(); u6(); u7(); u8(); uOD();
      uCOE1(); uCOE1b(); uCOE2(); uCOE3(); uCOE4(); uCOE5(); uEnq();
    };
  }, []);

  useEffect(() => {
    setSelectedHeads([]);
    setPaymentForm(prev => ({ ...prev, amount: "", feeHead: "" }));
    if (!selectedStudent) {
      setSelectedStudentQuota("");
      setSelectedStudentCategory("");
      setSelectedStudentStage("");
      return;
    }
    const reg = selectedStudent.regNo || selectedStudent.examNumber || "";
    const appNo = selectedStudent.applicationNo || selectedStudent.enquiryId || selectedStudent._profile_data?.applicationNo || "";

    (async () => {
      let foundQuota = getQuota(selectedStudent) || getQuota(selectedStudent._profile_data);
      let foundCategory = getCategory(selectedStudent) || getCategory(selectedStudent._profile_data);
      let foundStage = selectedStudent._profile_data?.transportStage || "";

      if (reg) {
        try {
          const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
          if (idxSnap.exists()) {
            const sDocId = idxSnap.data().studentDocId;
            if (sDocId) {
              const sSnap = await getDoc(doc(db, 'students', sDocId));
              if (sSnap.exists()) {
                const extra = sSnap.data()._student_data?.[reg] || {};
                if (!foundQuota) foundQuota = getQuota(extra);
                if (!foundCategory) foundCategory = getCategory(extra);
                if (!foundStage) foundStage = extra.transportStage || "";
              }
            }
          }
        } catch (_) { }
      }

      // If still missing, check enquiries collection
      if (!foundQuota || !foundCategory) {
        const lookupKeys = [appNo, reg, selectedStudent.id, selectedStudent.uid, selectedStudent._docId].filter(Boolean);
        for (const k of lookupKeys) {
          try {
            const q1 = await getDocs(query(collection(db, "enquiries"), where("applicationNo", "==", k)));
            if (!q1.empty) {
              const d = q1.docs[0].data();
              if (!foundQuota) foundQuota = getQuota(d);
              if (!foundCategory) foundCategory = getCategory(d);
              if (foundQuota && foundCategory) break;
            }
            const q2 = await getDocs(query(collection(db, "enquiries"), where("enquiryId", "==", k)));
            if (!q2.empty) {
              const d = q2.docs[0].data();
              if (!foundQuota) foundQuota = getQuota(d);
              if (!foundCategory) foundCategory = getCategory(d);
              if (foundQuota && foundCategory) break;
            }
          } catch (_) { }
        }
      }

      setSelectedStudentQuota(foundQuota || "");
      setSelectedStudentCategory(foundCategory || "Regular");
      setSelectedStudentStage(foundStage || "");
    })();
  }, [selectedStudent]);

  useEffect(() => {
    return subscribeAppPaymentsForStudent(selectedStudent, setAppPayments);
  }, [selectedStudent]);

  // Auto-clean orphaned duplicate pending payments, repair corrupted student names, and clean up duplicate receipts
  useEffect(() => {
    if (!selectedStudent) return;
    const reg = selectedStudent.regNo || selectedStudent.examNumber;
    if (!reg) return;

    const cleanupDuplicatesAndRepairNames = async () => {
      try {
        const studentCanonicalName = selectedStudent.displayName || selectedStudent.studentName || selectedStudent.name;
        if (!studentCanonicalName || isInvalidStudentName(studentCanonicalName)) return;

        // 1. Check for orphaned pending payments that duplicate an existing SUCCESS payment
        const activeStudentPayments = payments.filter(p => matchesStudentRecord(selectedStudent, p));
        const successPayments = activeStudentPayments.filter(p => isSuccessfulPayment(p));

        for (const p of activeStudentPayments) {
          const st = String(p.status || "").toUpperCase().trim();
          if (st === "PENDING" || st === "STARTED" || st === "AUTHORIZING") {
            const pAmt = Number(p.amount || p.chargedAmount || 0);
            const pHead = normHead(p.feeHead || p.allocations?.[0]?.feeHead);
            const duplicateSuccess = successPayments.find(sp => {
              const spAmt = Number(sp.amount || sp.chargedAmount || 0);
              const spHead = normHead(sp.feeHead || sp.allocations?.[0]?.feeHead);
              return spAmt === pAmt && spHead === pHead && sp.id !== p.id;
            });

            if (duplicateSuccess) {
              console.log("Auto-cleaning orphaned duplicate pending payment:", p.id);
              await deleteDoc(doc(db, "fee_payments", p.id)).catch(() => {
                updateDoc(doc(db, "fee_payments", p.id), { status: "CANCELLED", remarks: "Orphaned duplicate auto-cleaned" }).catch(() => {});
              });
            }
          }

          // If payment doc has invalid admin/staff studentName, update it to real student's name
          if (p.id && isInvalidStudentName(p.studentName)) {
            console.log("Fixing studentName on fee_payments doc:", p.id, "->", studentCanonicalName);
            await updateDoc(doc(db, "fee_payments", p.id), {
              studentName: studentCanonicalName,
              displayName: studentCanonicalName
            }).catch(() => {});
          }
        }

        // 2. Check receipts for this student
        const activeStudentReceipts = receipts.filter(r => matchesStudentRecord(selectedStudent, r));
        for (const r of activeStudentReceipts) {
          if (r.id && isInvalidStudentName(r.studentName)) {
            console.log("Fixing studentName on fee_receipts doc:", r.id, "->", studentCanonicalName);
            await updateDoc(doc(db, "fee_receipts", r.id), {
              studentName: studentCanonicalName
            }).catch(() => {});
          }
        }

        // 3. If there are duplicate receipts for the same transaction
        if (activeStudentReceipts.length > 1) {
          const seenRef = new Map();
          for (const r of activeStudentReceipts) {
            const key = `${r.refNo || r.orderId || ''}_${r.amount}_${normHead(r.feeHead || r.items?.[0]?.head)}`;
            if (seenRef.has(key)) {
              console.log("Auto-cleaning duplicate receipt doc:", r.id);
              await deleteDoc(doc(db, "fee_receipts", r.id)).catch(() => {
                updateDoc(doc(db, "fee_receipts", r.id), { status: "cancelled", reason: "Duplicate receipt auto-cleaned" }).catch(() => {});
              });
            } else {
              seenRef.set(key, r);
            }
          }
        }

        // 4. Clean up corrupted regNo on the admin user profile if present
        if (auth?.currentUser?.uid) {
          const adminDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
          if (adminDoc.exists()) {
            const aData = adminDoc.data();
            if (aData.regNo === reg || aData.examNumber === reg) {
              console.log("Cleaning up corrupted regNo from admin profile:", auth.currentUser.uid);
              await updateDoc(doc(db, "users", auth.currentUser.uid), {
                regNo: deleteField(),
                examNumber: deleteField(),
                studentId: deleteField()
              }).catch(() => {});
            }
          }
        }

        // 5. Clean up duplicate ese_fee_registrations documents sharing the same orderId or receiptNo
        if (eseRegistrations && eseRegistrations.length > 0) {
          const seenEseOrders = new Map();
          for (const er of eseRegistrations) {
            const ord = (er.orderId || er.transactionId || "").trim();
            const rec = (er.receiptNo || "").trim();
            const key = ord ? `ord_${ord}` : (rec ? `rec_${rec}` : null);
            if (!key) continue;

            if (seenEseOrders.has(key)) {
              const previous = seenEseOrders.get(key);
              const prevHasUnderscore = (previous.department || "").includes("_");
              const currHasUnderscore = (er.department || "").includes("_");
              const toDelete = (prevHasUnderscore && !currHasUnderscore) ? previous : er;
              const toKeep = toDelete === er ? previous : er;

              console.log("Auto-cleaning duplicate ese_fee_registrations doc:", toDelete.id, "keeping:", toKeep.id);
              await deleteDoc(doc(db, "ese_fee_registrations", toDelete.id)).catch(() => {
                updateDoc(doc(db, "ese_fee_registrations", toDelete.id), { status: "cancelled", remarks: "Auto-cleaned duplicate" }).catch(() => {});
              });
              seenEseOrders.set(key, toKeep);
            } else {
              seenEseOrders.set(key, er);
            }
          }
        }
      } catch (cleanErr) {
        console.warn("Auto-cleanup notice:", cleanErr);
      }
    };

    cleanupDuplicatesAndRepairNames();
  }, [selectedStudent?.id, selectedStudent?.regNo, payments.length, receipts.length, eseRegistrations.length]);

  // Auto-search & auto-select student from URL query parameters (e.g. ?tab=collect&search=420725121015)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qSearch = params.get("search") || params.get("regNo") || params.get("student");
    if (!qSearch) return;

    const trimmed = qSearch.trim();
    if (!trimmed) return;

    setStudentSearch(trimmed);

    if (students && students.length > 0) {
      const qLower = trimmed.toLowerCase();
      const matched = students.find(s => {
        const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").toLowerCase();
        return reg === qLower;
      }) || students.find(s => {
        const name = (s.displayName || s.studentName || s.name || "").toLowerCase();
        return name === qLower;
      }) || students.find(s => {
        const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").toLowerCase();
        const name = (s.displayName || s.studentName || s.name || "").toLowerCase();
        return (reg && reg.includes(qLower)) || (name && name.includes(qLower));
      });

      if (matched) {
        setSelectedStudent(matched);
      }
    }
  }, [location.search, students]);

  const showToast = (msg, type = "success") => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleSaveFee = async () => {
    if (!feeForm.programme || !feeForm.batch || !feeForm.amount) return;
    setSaving(true);
    try {
      const splitType = headSplitTypes[feeForm.head] || "student";
      const amount = Number(feeForm.amount);
      const baseData = { programme: feeForm.programme, batch: feeForm.batch, department: feeForm.department, quota: feeForm.quota, head: feeForm.head, amount };

      if (editFeeId) {
        await updateDoc(doc(db, "fee_configurations", editFeeId), { ...feeForm, amount, updatedAt: Timestamp.now() });
        showToast("Fee updated");
      } else if (splitType === "academic-year" && feeForm.sameForAllYears) {
        const [batchStart] = feeForm.batch.split("-").map(Number);
        const progKey = feeForm.programme.replace(/[^a-zA-Z0-9]/g, '_');
        const dur = durations[progKey] || 4;
        const baseDoc = { ...feeForm, amount, sameForAllYears: false };
        delete baseDoc.academicYear;
        const entries = [];
        const depts = feeForm.department ? [feeForm.department] : (PROGRAMME_DEPARTMENTS[feeForm.programme] || []);
        for (const dept of depts) {
          for (let i = 0; i < dur; i++) {
            entries.push({ ...baseDoc, department: dept, academicYear: `${batchStart + i}-${batchStart + i + 1}`, createdAt: Timestamp.now() });
          }
        }
        const col = collection(db, "fee_configurations");
        await Promise.all(entries.map(d => addDoc(col, d)));
        showToast(`Fee added for all ${dur} years × ${depts.length} departments`);
      } else {
        const depts = feeForm.department ? [feeForm.department] : (PROGRAMME_DEPARTMENTS[feeForm.programme] || []);
        const entries = depts.map(dept => ({ ...feeForm, department: dept, amount, createdAt: Timestamp.now() }));
        const col = collection(db, "fee_configurations");
        await Promise.all(entries.map(d => addDoc(col, d)));
        showToast(`Fee added for ${depts.length} department${depts.length > 1 ? 's' : ''}`);
      }
      setShowFeeModal(false);
      setEditFeeId(null);
      setFeeForm({ programme: "", batch: "", academicYear: "", semester: "", department: "", quota: "", studentCategory: "", head: "", amount: "", sameForAllYears: false });
    } catch (err) { showToast("Error saving fee", "error"); }
    finally { setSaving(false); }
  };

  const handleToggleHead = (cfg, due, ay, sem, isChecked) => {
    let updated;
    if (isChecked) {
      updated = [
        ...selectedHeads.filter(h => h.id !== cfg.id),
        {
          id: cfg.id,
          head: cfg.head || "Fee",
          due: Number(due) || 0,
          academicYear: cfg.academicYear || ay || "2026-2027",
          semester: cfg.semester || sem || "",
          totalAmount: Number(cfg.amount) || 0
        }
      ];
    } else {
      updated = selectedHeads.filter(h => h.id !== cfg.id);
    }
    setSelectedHeads(updated);

    if (updated.length > 0) {
      const totalSelectedDue = updated.reduce((sum, h) => sum + h.due, 0);
      setPaymentForm(prev => ({
        ...prev,
        amount: String(totalSelectedDue),
        feeHead: updated.map(h => h.head).join(" + "),
        academicYear: updated[0].academicYear || prev.academicYear || "2026-2027"
      }));
    } else {
      setPaymentForm(prev => ({
        ...prev,
        amount: "",
        feeHead: ""
      }));
    }
  };

  const computedAllocations = useMemo(() => {
    if (!selectedHeads.length) return [];
    const maxAllowed = selectedHeads.reduce((sum, h) => sum + h.due, 0);
    const enteredAmount = Math.min(Number(paymentForm.amount) || 0, maxAllowed);
    let remainingPay = enteredAmount;
    return selectedHeads.map(item => {
      const allocated = Math.min(remainingPay, item.due);
      const balanceDueAfter = Math.max(0, item.due - allocated);
      remainingPay = Math.max(0, remainingPay - allocated);
      return {
        ...item,
        allocatedAmount: allocated,
        balanceDueAfter,
        isFullyCovered: allocated >= item.due
      };
    });
  }, [selectedHeads, paymentForm.amount]);

  const handleRecordPayment = async () => {
    if (!selectedStudent || !paymentForm.amount || !paymentForm.feeHead) return;
    const amt = Number(paymentForm.amount);
    if (maxPayableAmount > 0 && amt > maxPayableAmount) {
      setToast({ show: true, message: `Amount cannot exceed the total due of ₹${maxPayableAmount.toLocaleString()}`, type: "error" });
      return;
    }
    setSaving(true);
    try {
      const receiptNo = `FEE${new Date().getFullYear()}-${String(receipts.length + 1).padStart(5, "0")}`;
      const examNo = selectedStudent.regNo || selectedStudent.examNumber || selectedStudent.id;
      const studentUid = selectedStudent.id || selectedStudent.uid || examNo;
      const pDate = Timestamp.fromDate(new Date(paymentForm.paymentDate || new Date()));

      const allocsToSave = computedAllocations.length > 0
        ? computedAllocations.filter(a => a.allocatedAmount > 0)
        : [{ head: paymentForm.feeHead, allocatedAmount: Number(paymentForm.amount), academicYear: paymentForm.academicYear }];

      const cleanStudentName = getCleanStudentName(null, selectedStudent);

      for (const alloc of allocsToSave) {
        const payData = {
          uid: studentUid,
          studentId: studentUid,
          examNumber: examNo,
          studentName: cleanStudentName,
          programme: selectedStudent.programme || "",
          department: selectedStudent.department || "",
          batch: selectedStudent.batch || "",
          amount: Number(alloc.allocatedAmount),
          chargedAmount: Number(alloc.allocatedAmount),
          status: "SUCCESS",
          mode: paymentForm.mode,
          feeHead: alloc.head,
          academicYear: alloc.academicYear || paymentForm.academicYear || "2026-2027",
          semester: alloc.semester || "",
          remarks: paymentForm.remarks || paymentForm.refNo || "",
          refNo: paymentForm.refNo || paymentForm.remarks || "",
          receiptNo,
          paymentDate: pDate,
          createdAt: Timestamp.now()
        };
        await addDoc(collection(db, "fee_payments"), payData);
      }

      const receiptRecord = {
        uid: studentUid,
        studentId: studentUid,
        examNumber: examNo,
        studentName: cleanStudentName,
        programme: selectedStudent.programme || "",
        department: selectedStudent.department || "",
        batch: selectedStudent.batch || "",
        amount: Number(paymentForm.amount),
        status: "active",
        mode: paymentForm.mode,
        feeHead: paymentForm.feeHead,
        academicYear: paymentForm.academicYear || "2026-2027",
        remarks: paymentForm.remarks || paymentForm.refNo || "",
        refNo: paymentForm.refNo || paymentForm.remarks || "",
        receiptNo,
        paymentDate: pDate,
        createdAt: Timestamp.now(),
        cancelledAt: null,
        reason: null,
        reprintCount: 0,
        items: allocsToSave.map(a => ({
          head: a.head,
          amount: a.allocatedAmount
        }))
      };
      await addDoc(collection(db, "fee_receipts"), receiptRecord);

      showToast(`Payment recorded — Receipt #${receiptNo}`);
      setReceiptModal({ open: true, payment: receiptRecord });
      setSelectedHeads([]);
      setPaymentForm({ amount: "", mode: "cash", feeHead: "", academicYear: "", remarks: "", refNo: "", paymentDate: new Date().toISOString().split("T")[0] });
    } catch (err) { showToast("Error recording payment: " + err.message, "error"); }
    finally { setSaving(false); }
  };

  const handleSmartGatewayPay = async () => {
    const amt = Number(paymentForm.amount);
    if (!amt || amt <= 0) {
      setToast({ show: true, message: "Please enter a valid amount", type: "error" });
      return;
    }
    if (maxPayableAmount > 0 && amt > maxPayableAmount) {
      setToast({ show: true, message: `Amount cannot exceed the total due of ₹${maxPayableAmount.toLocaleString()}`, type: "error" });
      return;
    }
    if (!selectedStudent) {
      setToast({ show: true, message: "Please select a student", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const returnUrl = window.location.origin + "/fee/operations?tab=collect";
      const targetAy = paymentForm.academicYear || (selectedStudent.batch ? getPaymentAcademicYear({ batch: selectedStudent.batch }, semesterConfigs) : "2026-2027");
      let orderId = `FEEM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const studentName = getCleanStudentName(null, selectedStudent);
      const studentEmail = selectedStudent.email || selectedStudent.emailId || "student@ckcet.ac.in";
      const studentPhone = selectedStudent.phone || selectedStudent.mobile || "9999999999";
      const studentProg = selectedStudent.programme || "UG";
      const studentBatch = selectedStudent.batch || "2026-2030";
      const studentDept = selectedStudent.department || "";
      const studentReg = selectedStudent.regNo || selectedStudent.examNumber || "";

      const allocationsToPass = computedAllocations.length > 0
        ? computedAllocations.filter(a => a.allocatedAmount > 0).map(a => ({
          feeHead: a.head,
          head: a.head,
          amount: a.allocatedAmount,
          allocatedAmount: a.allocatedAmount,
          academicYear: a.academicYear || targetAy,
          semester: a.semester || ""
        }))
        : [{ feeHead: paymentForm.feeHead || "Tuition Fee", head: paymentForm.feeHead || "Tuition Fee", amount: amt, allocatedAmount: amt, academicYear: targetAy }];

      // 1. Prepare HDFC SmartGateway payload with Merchant ID 76980 (CK COLLEGE OF ENGINEERING AND TECHNOLOGY CUDDALORE)
      const payload = {
        order_id: orderId,
        amount: amt.toFixed(2),
        currency: "INR",
        customer_id: selectedStudent.id || selectedStudent.uid || studentReg || "student",
        customer_email: studentEmail,
        customer_phone: studentPhone,
        payment_page_client_id: "76980",
        action: "paymentPage",
        return_url: `${returnUrl}&order_id=${orderId}`,
        description: `Fee payment: ${allocationsToPass.map(a => a.feeHead).join(" + ")}`,
        first_name: studentName.split(" ")[0] || "Student",
        last_name: studentName.split(" ").slice(1).join(" ") || "",
        source_object: "PAYMENT_LINK"
      };

      let responseData = null;

      // Ensure student profile is complete in users collection for the target student
        const studentUid = selectedStudent.id || selectedStudent.uid;
        const targetProg = studentProg || "UG";
        const targetBatch = studentBatch || "2026-2030";
        const targetDept = studentDept || "";
        const targetReg = studentReg || "";

        try {
          const syncData = {
            programme: targetProg,
            batch: targetBatch,
            department: targetDept,
            regNo: targetReg,
            examNumber: targetReg,
            studentName: studentName,
            displayName: studentName,
            role: "Student",
            studentId: studentUid
          };

          if (studentUid) {
            await setDoc(doc(db, "users", studentUid), syncData, { merge: true });
          }
        } catch (syncErr) {
          console.warn("User profile sync warning before payment:", syncErr);
        }

        const primaryFeeHead = allocationsToPass[0]?.feeHead || paymentForm.feeHead || "Tuition Fee";
        const createSession = httpsCallable(functions, "createPaymentSession");
        const fnResult = await createSession({
          amount: amt,
          feeHead: primaryFeeHead,
          academicYear: targetAy,
          returnUrl: `${returnUrl}`,
          phone: studentPhone,
          studentId: studentUid,
          studentEmail: studentEmail,
          studentName: studentName,
          programme: targetProg,
          batch: targetBatch,
          department: targetDept,
          regNo: targetReg,
          allocations: allocationsToPass
        });

        const returnedOrderId = fnResult.data.orderId;
        responseData = {
          id: returnedOrderId,
          payment_links: { web: fnResult.data.paymentUrl }
        };
        orderId = returnedOrderId;

      if (!responseData?.payment_links?.web) {
        throw new Error("Unable to obtain payment URL from HDFC SmartGateway");
      }

      const activeOrderId = responseData.id || orderId;

      // Record/merge payment intent in fee_payments so it reflects in fee records without duplicating
      const paymentRecord = {
        orderId: activeOrderId,
        uid: selectedStudent.id || selectedStudent.uid || activeOrderId,
        studentId: selectedStudent.id || selectedStudent.uid || activeOrderId,
        studentEmail: studentEmail,
        studentName: studentName,
        examNumber: studentReg,
        regNo: studentReg,
        programme: studentProg,
        department: studentDept,
        batch: studentBatch,
        academicYear: targetAy,
        feeHead: allocationsToPass.map(a => a.feeHead).join(" + "),
        amount: amt,
        chargedAmount: amt,
        currency: "INR",
        status: "PENDING",
        hdfcOrderId: activeOrderId,
        paymentUrl: responseData.payment_links.web,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        environment: "production",
        returnUrl: `${returnUrl}&order_id=${activeOrderId}`,
        isOnline: true,
        mode: "gateway",
        allocations: allocationsToPass
      };

      await setDoc(doc(db, "fee_payments", activeOrderId), paymentRecord, { merge: true });

      sessionStorage.setItem("pending_smartgateway_order_id", activeOrderId);
      sessionStorage.setItem("pending_smartgateway_student_search", studentReg || selectedStudent.displayName || selectedStudent.studentName || selectedStudent.id);

      // Redirect to HDFC SmartGateway payment page
      window.location.href = responseData.payment_links.web;
    } catch (err) {
      console.error("SmartGateway payment initiation error:", err);
      setToast({ show: true, message: err.message || "Failed to initiate HDFC SmartGateway payment", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const [verifyingOrderId, setVerifyingOrderId] = useState(null);

  const handleVerifyPendingOrder = async (orderId, silent = false) => {
    if (!orderId) return;
    setVerifyingOrderId(orderId);
    try {
      const pDoc = await getDoc(doc(db, "fee_payments", orderId));
      if (!pDoc.exists()) {
        if (!silent) showToast("Payment order record not found", "error");
        return;
      }
      const pData = pDoc.data();
      const currStatus = String(pData.status || "").toUpperCase();
      if (currStatus === "SUCCESS" || currStatus === "CHARGED") {
        await ensureReceiptExists(pData, orderId);
        if (!silent) showToast(`Payment of ₹${(pData.chargedAmount || pData.amount)?.toLocaleString()} is already verified & active!`);
        return;
      }

      // Check cloud function
      try {
        const verifyFn = httpsCallable(functions, "verifyPayment");
        const res = await verifyFn({ orderId });
        if (res.data?.success) {
          const verifiedAmount = Number(res.data.amount) || pData.amount || 0;
          const updatedSnap = await getDoc(doc(db, "fee_payments", orderId));
          const updatedData = updatedSnap.exists() ? updatedSnap.data() : { ...pData, amount: verifiedAmount, chargedAmount: verifiedAmount, status: "SUCCESS" };
          await ensureReceiptExists(updatedData, orderId);
          showToast(`HDFC SmartGateway Payment of ₹${verifiedAmount.toLocaleString()} verified successfully!`);
          return;
        }
      } catch (fnErr) {
        console.warn("verifyPayment function failed:", fnErr);
      }

      // Secondary verification for Exam Cell orders if applicable
      if (orderId.startsWith("EXAM") || orderId.includes("EXAM")) {
        try {
          const verifyExamFn = httpsCallable(functions, "verifyExamCellPayment");
          const exRes = await verifyExamFn({ orderId });
          if (exRes.data?.success || exRes.data?.status === "SUCCESS") {
            const verifiedAmount = Number(exRes.data.amount) || pData.amount || 0;
            showToast(`Exam Cell Payment of ₹${verifiedAmount.toLocaleString()} verified successfully!`);
            return;
          }
        } catch (exErr) {
          console.warn("verifyExamCellPayment manual check:", exErr?.message || exErr);
        }
      }

      if (!silent) {
        showToast("Gateway shows payment is still pending or not completed by bank yet.", "warning");
      }
    } catch (err) {
      if (!silent) showToast("Error verifying order: " + err.message, "error");
    } finally {
      setVerifyingOrderId(null);
    }
  };

  const handleConfirmPendingPayment = async (p) => {
    const orderId = p.orderId || p.id;
    if (!orderId) return;
    const cleanStudentName = getCleanStudentName(p, selectedStudent);

    // Guard against duplicate payments: Check if this fee head has already been paid for this student
    const pAmt = Number(p.amount || p.chargedAmount || 0);
    const pHead = normHead(p.feeHead || p.allocations?.[0]?.feeHead);
    const existingSuccess = payments.find(sp => {
      if (sp.id === orderId) return false;
      const spMatches = matchesStudentRecord(selectedStudent, sp);
      if (!spMatches || !isSuccessfulPayment(sp)) return false;
      const spAmt = Number(sp.amount || sp.chargedAmount || 0);
      const spHead = normHead(sp.feeHead || sp.allocations?.[0]?.feeHead);
      return spAmt === pAmt && spHead === pHead;
    });

    if (existingSuccess) {
      const proceed = window.confirm(
        `WARNING: A successful payment of ₹${pAmt.toLocaleString()} for ${p.feeHead || "this fee"} is ALREADY recorded (Receipt #${existingSuccess.receiptNo || existingSuccess.orderId || existingSuccess.id}).\n\nConfirming this pending attempt (${orderId}) will create a DUPLICATE payment entry and deduct fees twice.\n\nDo you want to cancel/void this orphaned pending attempt instead? Click OK to void, or Cancel to abort.`
      );
      if (proceed) {
        await updateDoc(doc(db, "fee_payments", orderId), {
          status: "CANCELLED",
          remarks: `Orphaned duplicate of ${existingSuccess.orderId || existingSuccess.id}`,
          updatedAt: Timestamp.now()
        });
        showToast("Orphaned pending attempt marked as CANCELLED to prevent duplicate billing.");
      }
      return;
    }

    const confirmAction = window.confirm(
      `Confirm payment of ₹${Number(p.amount || p.chargedAmount || 0).toLocaleString()} for ${cleanStudentName} (${p.feeHead || "Fee"})?\n\nThis will mark the payment as SUCCESS, generate an official receipt, and immediately clear the due.`
    );
    if (!confirmAction) return;

    setVerifyingOrderId(orderId);
    try {
      const receiptNo = p.receiptNo || `FEE${new Date().getFullYear()}-${String(receipts.length + 1).padStart(5, "0")}`;
      const updatePayload = {
        status: "SUCCESS",
        receiptNo,
        studentName: cleanStudentName,
        chargedAmount: Number(p.amount || p.chargedAmount || 0),
        verifiedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      await updateDoc(doc(db, "fee_payments", orderId), updatePayload);
      const fullPayment = { ...p, ...updatePayload, studentName: cleanStudentName };
      await ensureReceiptExists(fullPayment, orderId);

      showToast(`Payment confirmed! Official Receipt #${receiptNo} generated.`);
      setReceiptModal({ open: true, payment: fullPayment });
    } catch (err) {
      showToast("Error confirming payment: " + err.message, "error");
    } finally {
      setVerifyingOrderId(null);
    }
  };

  const handleSaveConcession = async () => {
    if (!concessionForm.studentName || (!concessionForm.amount && !concessionForm.percentage)) return;
    setSaving(true);
    try {
      const amt = concessionForm.amount ? Number(concessionForm.amount) : 0;
      const pct = concessionForm.percentage ? Number(concessionForm.percentage) : 0;
      await addDoc(collection(db, "fee_concessions"), { ...concessionForm, amount: amt, percentage: pct, appliedAt: Timestamp.now(), validTill: concessionForm.validTill ? Timestamp.fromDate(new Date(concessionForm.validTill)) : null, createdAt: Timestamp.now() });
      showToast("Concession applied");
      setShowConcessionModal(false);
      setConcessionForm({ studentId: "", studentName: "", examNumber: "", type: "Merit", amount: "", percentage: "", validTill: "", status: "pending", remarks: "" });
    } catch (err) { showToast("Error saving concession", "error"); }
    finally { setSaving(false); }
  };

  const cancelReceipt = async (receiptId, reason) => {
    try {
      await updateDoc(doc(db, "fee_receipts", receiptId), { status: "cancelled", cancelledAt: Timestamp.now(), cancelReason: reason });
      showToast("Receipt cancelled");
    } catch (err) { showToast("Error cancelling receipt", "error"); }
  };

  const handleSaveTransportStage = async () => {
    if (!transportForm.stageNo || !transportForm.location || !transportForm.fee) return;
    setSaving(true);
    try {
      const data = {
        stageNo: String(transportForm.stageNo).trim(),
        location: String(transportForm.location).trim(),
        fee: Number(transportForm.fee),
        updatedAt: Timestamp.now()
      };
      if (editTransportId) {
        await updateDoc(doc(db, "transport_stages", editTransportId), data);
        showToast("Transport stage updated");
      } else {
        await addDoc(collection(db, "transport_stages"), { ...data, createdAt: Timestamp.now() });
        showToast("Transport stage added");
      }
      setShowTransportModal(false);
      setEditTransportId(null);
      setTransportForm({ stageNo: "", location: "", fee: "" });
    } catch (err) { showToast("Error saving transport stage", "error"); }
    finally { setSaving(false); }
  };

  const filteredStudents = students.filter(s => {
    if (!studentSearch) return false;
    const q = studentSearch.toLowerCase();
    return (s.displayName || s.studentName || "").toLowerCase().includes(q) ||
      (s.regNo || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.examNumber || "").toLowerCase().includes(q);
  }).slice(0, 10);

  // Set default batch for template download
  useEffect(() => {
    if (!selectedBatchForTemplate && allAvailableBatches.length > 0) {
      setSelectedBatchForTemplate(allAvailableBatches[0]);
    }
  }, [allAvailableBatches, selectedBatchForTemplate]);

  // Download Opening Dues Excel Template for selected Batch & Academic Year
  const handleDownloadOpeningDuesTemplate = () => {
    if (!selectedBatchForTemplate) {
      showToast("Please select a batch first", "error");
      return;
    }

    // Filter students belonging to this batch strictly from official Student Namelist
    // Deduplicate strictly by Register / Exam Number so NO student ever appears multiple times
    const batchMap = new Map();

    students.forEach(s => {
      const reg = String(s.regNo || s.examNumber || s.rollNo || "").trim();
      if (!reg) return;

      const studentBatch = (s.batch || s._profile_data?.batch || "").trim();
      if (!isBatchMatch(studentBatch, selectedBatchForTemplate)) return;

      const regKey = reg.toUpperCase();
      if (!batchMap.has(regKey)) {
        batchMap.set(regKey, {
          regNo: reg,
          studentName: (s.displayName || s.studentName || s.name || "").trim(),
          department: displayDept(s.department || s._profile_data?.department || ""),
          batch: selectedBatchForTemplate,
        });
      }
    });

    const batchStudents = Array.from(batchMap.values()).sort((a, b) => {
      return a.regNo.localeCompare(b.regNo, undefined, { numeric: true, sensitivity: 'base' });
    });

    const rows = [];
    const defaultAY = selectedYearForTemplate || "2024-2025";

    if (batchStudents.length > 0) {
      batchStudents.forEach(s => {
        const row = {
          "Register No": s.regNo,
          "Student Name": s.studentName,
          "Department": s.department,
          "Batch": selectedBatchForTemplate,
          "Academic Year": defaultAY,
        };
        // Initialise all configured fee head columns to 0
        activeHeadsList.forEach(h => {
          row[h] = 0;
        });
        rows.push(row);
      });
    } else {
      // Sample rows for demonstration if no student profiles are in DB yet for that batch
      const sampleRow = {
        "Register No": "2826849",
        "Student Name": "Sample Student",
        "Department": "B.E. Mechanical Engineering",
        "Batch": selectedBatchForTemplate,
        "Academic Year": defaultAY,
      };
      activeHeadsList.forEach(h => {
        sampleRow[h] = h === "Tuition Fee" ? 15000 : 0;
      });
      rows.push(sampleRow);
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    // Apply clean column widths
    ws['!cols'] = [
      { wch: 18 }, // Register No
      { wch: 28 }, // Student Name
      { wch: 28 }, // Department
      { wch: 14 }, // Batch
      { wch: 16 }, // Academic Year
      ...activeHeadsList.map(() => ({ wch: 18 }))
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opening Dues");
    XLSX.writeFile(wb, `Fee_Opening_Dues_Template_${selectedBatchForTemplate}_${defaultAY}.xlsx`);
    showToast(`Template downloaded with ${rows.length} rows for Batch ${selectedBatchForTemplate}!`);
  };

  // Upload and parse filled Excel for Opening Dues
  const handleUploadOpeningDuesExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        const firstSheet = wb.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        if (!rawRows || rawRows.length === 0) {
          showToast("Uploaded Excel file is empty", "error");
          return;
        }

        const parsedEntries = [];

        rawRows.forEach((row) => {
          // Identify Register No from variants
          const regKey = Object.keys(row).find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes("register") || lk.includes("regno") || lk.includes("reg_no") || lk.includes("reg no") || lk.includes("exam number") || lk.includes("roll");
          });
          const rawReg = String(regKey ? row[regKey] : "").trim();
          if (!rawReg || rawReg.toLowerCase().startsWith("sample_")) return;

          const matchedStudent = studentLookup.get(rawReg.toLowerCase());
          const studentName = (matchedStudent?.displayName || matchedStudent?.studentName || row["Student Name"] || row["Name"] || "Student").toString().trim();
          const dept = (matchedStudent?.department || row["Department"] || row["Dept"] || "—").toString().trim();
          const batch = (matchedStudent?.batch || row["Batch"] || selectedBatchForTemplate || "—").toString().trim();
          const prog = matchedStudent?.programme || "UG";

          // Academic Year
          const ayKey = Object.keys(row).find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes("academic") || lk.includes("year") || lk === "ay";
          });
          const academicYear = String(ayKey && row[ayKey] ? row[ayKey] : (selectedYearForTemplate || "2024-2025")).trim();

          // Check all configured Fee Heads
          activeHeadsList.forEach(headName => {
            const colKey = Object.keys(row).find(k => k.trim().toLowerCase() === headName.trim().toLowerCase());
            if (colKey) {
              const rawVal = row[colKey];
              const numVal = Number(String(rawVal).replace(/[^0-9.-]+/g, ""));
              if (!isNaN(numVal) && numVal > 0) {
                parsedEntries.push({
                  studentId: matchedStudent?.id || matchedStudent?.uid || "",
                  regNo: rawReg,
                  studentName: studentName,
                  department: dept,
                  batch: batch,
                  programme: prog,
                  academicYear: academicYear,
                  head: headName,
                  amount: numVal,
                  semester: "All",
                  isOpeningDue: true,
                  matched: Boolean(matchedStudent)
                });
              }
            }
          });
        });

        if (parsedEntries.length === 0) {
          showToast("No valid positive due amounts found in Excel", "error");
          return;
        }

        setUploadedDuesData(parsedEntries);
        setOpeningDuesTab("preview");
        showToast(`Parsed ${parsedEntries.length} opening dues for ${new Set(parsedEntries.map(e => e.regNo)).size} students!`);
      } catch (err) {
        console.error("Excel parse error:", err);
        showToast("Failed to parse Excel file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Confirm Save Opening Dues to Firestore
  const handleConfirmSaveOpeningDues = async () => {
    if (!uploadedDuesData || uploadedDuesData.length === 0) return;
    setDuesUploading(true);
    try {
      const chunkSize = 400;
      for (let i = 0; i < uploadedDuesData.length; i += chunkSize) {
        const chunk = uploadedDuesData.slice(i, i + chunkSize);
        const b = writeBatch(db);
        chunk.forEach(item => {
          const docId = `od_${item.regNo.replace(/[^a-zA-Z0-9]/g, '_')}_${item.academicYear.replace(/[^a-zA-Z0-9]/g, '_')}_${item.head.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const docRef = doc(db, "fee_opening_dues", docId);
          b.set(docRef, {
            ...item,
            updatedAt: Timestamp.now(),
            createdAt: Timestamp.now()
          }, { merge: true });
        });
        await b.commit();
      }
      showToast(`Successfully saved ${uploadedDuesData.length} opening due records!`);
      setUploadedDuesData([]);
      setOpeningDuesTab("view");
    } catch (err) {
      console.error("Save error:", err);
      showToast("Failed to save opening dues to database", "error");
    } finally {
      setDuesUploading(false);
    }
  };

  // Delete an opening due record
  const handleDeleteOpeningDue = async (id) => {
    if (!window.confirm("Are you sure you want to delete this opening due?")) return;
    try {
      await deleteDoc(doc(db, "fee_opening_dues", id));
      showToast("Opening due deleted");
    } catch {
      showToast("Error deleting opening due", "error");
    }
  };

  // Available Programmes for Netkampus Bulk Upload
  const netkampusAvailableProgs = useMemo(() => {
    const set = new Set();
    Object.keys(PROGRAMME_DEPARTMENTS || {}).forEach(p => p && set.add(p.toUpperCase()));
    feeConfigs.forEach(f => f.programme && set.add(f.programme.toUpperCase()));
    students.forEach(s => s.programme && set.add(s.programme.toUpperCase()));
    if (set.size === 0) {
      set.add("UG");
      set.add("PG");
    }
    return Array.from(set).sort();
  }, [PROGRAMME_DEPARTMENTS, feeConfigs, students]);

  // Check if student belongs to programme strictly using user-configured programme, batch duration, and departments (NO REGEX)
  const isStudentInProgramme = useCallback((student, prog) => {
    if (!student || !prog) return false;
    const targetProg = prog.trim().toUpperCase();
    const progKey = formatProgrammeKey(prog);
    const expectedDuration = Number(durations[progKey] || durations[prog] || (targetProg === "PG" ? 2 : 4));

    // 1. Strict batch duration check if batch is available:
    const sBatch = (student.batch || student._profile_data?.batch || "").trim();
    if (sBatch) {
      const [s, e] = sBatch.split("-").map(Number);
      if (s && e && (e - s !== expectedDuration)) {
        return false; // Student batch duration does not match programme duration
      }
    }

    // 2. Department check against user-configured PROGRAMME_DEPARTMENTS
    const depts = (PROGRAMME_DEPARTMENTS[prog] || PROGRAMME_DEPARTMENTS[targetProg] || []).map(d => d.trim().toLowerCase());
    const sDept = (student.department || student._profile_data?.department || "").trim().toLowerCase();
    if (sDept && depts.length > 0) {
      return depts.some(d => d === sDept || sDept.includes(d) || d.includes(sDept));
    }

    // 3. Programme field check
    const sProg = (student.programme || student._profile_data?.programme || "").trim().toUpperCase();
    if (sProg && sProg === targetProg) return true;

    return false;
  }, [PROGRAMME_DEPARTMENTS, durations]);

  // Reactive Batches strictly filtered by programme duration (UG: 4-yr batches, PG: 2-yr batches)
  const netkampusBatches = useMemo(() => {
    if (!netkampusProg) return [];
    const progKey = formatProgrammeKey(netkampusProg);
    const targetProg = netkampusProg.trim().toUpperCase();
    const expectedDuration = Number(durations[progKey] || durations[netkampusProg] || (targetProg === "PG" ? 2 : 4));
    const set = new Set();

    const isMatchingBatch = (b) => {
      if (!b) return false;
      const [s, e] = String(b).split("-").map(Number);
      if (s && e && (e - s !== expectedDuration)) return false;
      return true;
    };

    // 1. User-configured active batches from batch_status for this programme
    try {
      const active = getActiveBatches(progKey);
      if (Array.isArray(active)) {
        active.forEach(b => {
          if (b && isMatchingBatch(b.trim())) {
            set.add(b.trim());
          }
        });
      }
    } catch (_) {}

    // 2. Batches from fee configurations configured by admin for this programme
    feeConfigs.forEach(f => {
      const fProg = (f.programme || "").trim().toUpperCase();
      if (fProg === targetProg && f.batch && isMatchingBatch(f.batch.trim())) {
        set.add(f.batch.trim());
      }
    });

    // 3. Batches from enrolled students matching this programme
    students.forEach(s => {
      if (isStudentInProgramme(s, netkampusProg)) {
        const b = (s.batch || s._profile_data?.batch || "").trim();
        if (b && isMatchingBatch(b)) {
          set.add(b);
        }
      }
    });

    // Fallback if none found, using getRecentBatches(expectedDuration)
    if (set.size === 0) {
      getRecentBatches(expectedDuration).forEach(b => set.add(b));
    }

    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [netkampusProg, feeConfigs, students, getActiveBatches, durations, isStudentInProgramme]);

  // Set default batch when programme changes
  useEffect(() => {
    if (netkampusBatches.length > 0) {
      if (!netkampusBatch || !netkampusBatches.includes(netkampusBatch)) {
        setNetkampusBatch(netkampusBatches[0]);
      }
    } else {
      setNetkampusBatch("");
    }
  }, [netkampusBatches, netkampusBatch]);

  // Reactive Academic Years derived from batch start year and configured programme duration
  const netkampusYears = useMemo(() => {
    if (!netkampusBatch) return ["2024-2025", "2025-2026"];
    const [start] = netkampusBatch.split("-").map(Number);
    const progKey = formatProgrammeKey(netkampusProg);
    const targetProg = (netkampusProg || "").trim().toUpperCase();
    const duration = Number(durations[progKey] || durations[netkampusProg] || (targetProg === "PG" ? 2 : 4));
    const years = [];
    if (start && duration) {
      for (let i = 0; i < duration; i++) {
        years.push(`${start + i}-${start + i + 1}`);
      }
    }
    return years.length ? years : ["2024-2025", "2025-2026"];
  }, [netkampusBatch, netkampusProg, durations]);

  // Reset academic year to the starting year whenever batch changes
  useEffect(() => {
    if (netkampusYears.length > 0) {
      setNetkampusYear(netkampusYears[0]);
    } else {
      setNetkampusYear("");
    }
  }, [netkampusBatch, netkampusYears]);

  // Configured Fee Heads for the selected Programme, Batch & Academic Year
  const netkampusTemplateHeads = useMemo(() => {
    const configuredHeads = [];
    feeConfigs.forEach(f => {
      const pMatch = !netkampusProg || (f.programme || "").toUpperCase() === netkampusProg.toUpperCase();
      const bMatch = !netkampusBatch || isBatchMatch(f.batch, netkampusBatch);
      const yMatch = !netkampusYear || f.academicYear === netkampusYear;
      if (pMatch && bMatch && yMatch && f.head) {
        const hName = (f.head.name || f.head).toString().trim();
        if (hName && !configuredHeads.includes(hName)) {
          configuredHeads.push(hName);
        }
      }
    });

    if (configuredHeads.length > 0) return configuredHeads;

    return activeHeadsList.length > 0
      ? activeHeadsList
      : ["Tuition Fee", "Development Fee", "Other Fee", "Admission Fee", "Caution Deposit", "Hostel Fee", "Transport Fee"];
  }, [netkampusProg, netkampusBatch, netkampusYear, feeConfigs, activeHeadsList]);

  // Filtered enrolled students for the chosen Programme & Batch
  const netkampusEnrolledStudents = useMemo(() => {
    if (!netkampusBatch) return [];
    const batchMap = new Map();

    students.forEach(s => {
      const reg = String(s.regNo || s.examNumber || s.rollNo || "").trim();
      if (!reg) return;

      const studentBatch = (s.batch || s._profile_data?.batch || "").trim();
      if (!isBatchMatch(studentBatch, netkampusBatch)) return;
      if (!isStudentInProgramme(s, netkampusProg)) return;

      const regKey = reg.toUpperCase();
      if (!batchMap.has(regKey)) {
        batchMap.set(regKey, {
          regNo: reg,
          studentName: (s.displayName || s.studentName || s.name || "").trim(),
          department: displayDept(s.department || s._profile_data?.department || ""),
          batch: netkampusBatch,
          academicYear: netkampusYear || "2024-2025",
        });
      }
    });

    return Array.from(batchMap.values()).sort((a, b) =>
      a.regNo.localeCompare(b.regNo, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [students, netkampusProg, netkampusBatch, netkampusYear, isStudentInProgramme]);

  // Download Bulk Netkampus Fee Upload Template pre-filled with students
  const handleDownloadNetkampusTemplate = () => {
    if (!netkampusBatch) {
      showToast("Please select a batch first", "error");
      return;
    }
    const ay = netkampusYear || (netkampusYears[0] || "2024-2025");
    const rows = [];
    const todayStr = new Date().toISOString().split("T")[0];

    if (netkampusEnrolledStudents.length > 0) {
      netkampusEnrolledStudents.forEach(s => {
        const row = {
          "Register No": s.regNo,
          "Student Name": s.studentName,
          "Department": s.department,
          "Batch": s.batch,
          "Academic Year": ay,
        };
        netkampusTemplateHeads.forEach(h => {
          row[h] = 0;
        });
        row["Date of Transaction"] = todayStr;
        row["Transaction ID"] = "";
        row["Payment Mode"] = "Settled by Netkampus";
        row["Remarks"] = "";
        rows.push(row);
      });
    } else {
      const sampleRow = {
        "Register No": "2026001",
        "Student Name": "Sample Student",
        "Department": (netkampusProg || "").toUpperCase() === "PG" ? "M.B.A." : "B.E. Mechanical Engineering",
        "Batch": netkampusBatch,
        "Academic Year": ay,
      };
      netkampusTemplateHeads.forEach(h => {
        sampleRow[h] = h === "Tuition Fee" ? 25000 : 0;
      });
      sampleRow["Date of Transaction"] = todayStr;
      sampleRow["Transaction ID"] = "UPI4281902482";
      sampleRow["Payment Mode"] = "Settled by Netkampus";
      sampleRow["Remarks"] = "Paid prior via Netkampus";
      rows.push(sampleRow);
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
      ...netkampusTemplateHeads.map(() => ({ wch: 18 })),
      { wch: 20 },
      { wch: 22 },
      { wch: 24 },
      { wch: 26 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Netkampus Payments");
    XLSX.writeFile(wb, `Bulk_Fee_Upload_Netkampus_${netkampusProg}_${netkampusBatch}_${ay}.xlsx`);
    showToast(`Template downloaded with ${rows.length} students for ${netkampusProg} Batch ${netkampusBatch} (${ay})!`);
  };

  // Upload and parse filled Netkampus Excel
  const handleUploadNetkampusExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        if (!rawRows || rawRows.length === 0) {
          showToast("Uploaded Excel file is empty", "error");
          return;
        }

        const parsedEntries = [];

        rawRows.forEach((row) => {
          const regKey = Object.keys(row).find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes("register") || lk.includes("regno") || lk.includes("reg_no") || lk.includes("reg no") || lk.includes("exam number") || lk.includes("roll");
          });
          const rawReg = String(regKey ? row[regKey] : "").trim();
          if (!rawReg || rawReg.toLowerCase().startsWith("sample_")) return;

          const matchedStudent = studentLookup.get(rawReg.toLowerCase());
          const studentName = (matchedStudent?.displayName || matchedStudent?.studentName || row["Student Name"] || row["Name"] || "Student").toString().trim();
          const dept = (matchedStudent?.department || row["Department"] || row["Dept"] || "—").toString().trim();
          const batch = (matchedStudent?.batch || row["Batch"] || netkampusBatch || "—").toString().trim();
          const prog = matchedStudent?.programme || netkampusProg || "UG";

          const ayKey = Object.keys(row).find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes("academic") || lk.includes("year") || lk === "ay";
          });
          const academicYear = String(ayKey && row[ayKey] ? row[ayKey] : (netkampusYear || "2024-2025")).trim();

          const dateKey = Object.keys(row).find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes("date") || lk.includes("transaction date") || lk.includes("txn date") || lk.includes("paid date");
          });
          let txnDate = new Date();
          if (dateKey && row[dateKey]) {
            const rawD = row[dateKey];
            if (typeof rawD === "number") {
              txnDate = new Date(Math.round((rawD - 25569) * 86400 * 1000));
            } else {
              const dParsed = new Date(rawD);
              if (!isNaN(dParsed.getTime())) txnDate = dParsed;
            }
          }

          const txnKey = Object.keys(row).find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes("transaction id") || lk.includes("txn id") || lk.includes("txn") || lk.includes("utr") || lk.includes("ref");
          });
          const rawTxnId = String(txnKey && row[txnKey] ? row[txnKey] : "").trim();

          const remKey = Object.keys(row).find(k => k.trim().toLowerCase().includes("remark"));
          const rowRemarks = String(remKey && row[remKey] ? row[remKey] : "").trim();

          const modeKey = Object.keys(row).find(k => k.trim().toLowerCase().includes("mode"));
          const rowMode = String(modeKey && row[modeKey] ? row[modeKey] : "Settled by Netkampus").trim();

          const nonHeadKeys = new Set(["register no", "reg no", "regno", "student name", "name", "department", "dept", "batch", "academic year", "ay", "date of transaction", "transaction id", "txn id", "payment mode", "mode", "remarks", "remark"]);

          Object.keys(row).forEach(colKey => {
            const colLower = colKey.trim().toLowerCase();
            if (nonHeadKeys.has(colLower)) return;
            if (colLower.includes("register") || colLower.includes("date") || colLower.includes("transaction") || colLower.includes("mode") || colLower.includes("remark") || colLower.includes("department") || colLower.includes("batch")) return;

            const rawVal = row[colKey];
            const numVal = Number(String(rawVal).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(numVal) && numVal > 0) {
              const headName = colKey.trim();
              const uniqueTxnId = rawTxnId || `NETKAMPUS-${rawReg}-${headName.replace(/[^a-zA-Z0-9]/g, '')}`;

              parsedEntries.push({
                studentId: matchedStudent?.id || matchedStudent?.uid || `legacy_${rawReg}`,
                uid: matchedStudent?.uid || matchedStudent?.id || "",
                regNo: rawReg,
                examNumber: rawReg,
                studentName,
                department: dept,
                batch,
                programme: prog,
                academicYear,
                head: headName,
                amount: numVal,
                chargedAmount: numVal,
                dateOfTransaction: txnDate,
                transactionId: uniqueTxnId,
                mode: rowMode || "Settled by Netkampus",
                remarks: rowRemarks || `Settled via Netkampus (${headName})`,
                matched: Boolean(matchedStudent)
              });
            }
          });
        });

        if (parsedEntries.length === 0) {
          showToast("No valid positive payment amounts found in Excel", "error");
          return;
        }

        setUploadedNetkampusData(parsedEntries);
        setNetkampusTab("preview");
        const uniqueStudents = new Set(parsedEntries.map(e => e.regNo)).size;
        const totalAmount = parsedEntries.reduce((s, e) => s + e.amount, 0);
        showToast(`Parsed ${parsedEntries.length} fee settlements for ${uniqueStudents} students totaling ₹${totalAmount.toLocaleString()}!`);
      } catch (err) {
        console.error("Excel parse error:", err);
        showToast("Failed to parse Excel file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Confirm Save Netkampus Payments to Firestore
  const handleConfirmSaveNetkampus = async () => {
    if (!uploadedNetkampusData || uploadedNetkampusData.length === 0) return;
    setNetkampusUploading(true);
    try {
      const chunkSize = 400;
      for (let i = 0; i < uploadedNetkampusData.length; i += chunkSize) {
        const chunk = uploadedNetkampusData.slice(i, i + chunkSize);
        const b = writeBatch(db);

        chunk.forEach(item => {
          const cleanReg = item.regNo.replace(/[^a-zA-Z0-9]/g, '_');
          const cleanAY = item.academicYear.replace(/[^a-zA-Z0-9]/g, '_');
          const cleanHead = item.head.replace(/[^a-zA-Z0-9]/g, '_');
          const cleanTxn = String(item.transactionId || "").replace(/[^a-zA-Z0-9]/g, '_').slice(-16);
          const docId = `nk_${cleanReg}_${cleanAY}_${cleanHead}_${cleanTxn}`;

          const docRef = doc(db, "fee_payments", docId);
          b.set(docRef, {
            studentId: item.studentId,
            uid: item.uid || item.studentId,
            regNo: item.regNo,
            examNumber: item.examNumber,
            studentName: item.studentName,
            department: item.department,
            batch: item.batch,
            programme: item.programme,
            amount: Number(item.amount),
            chargedAmount: Number(item.amount),
            status: "SUCCESS",
            mode: item.mode || "Settled by Netkampus",
            rawMode: "netkampus",
            feeHead: item.head,
            academicYear: item.academicYear,
            semester: "All",
            remarks: item.remarks || "Settled by Netkampus (Prior ERP / Direct Payment)",
            refNo: item.transactionId,
            orderId: item.transactionId,
            transactionId: item.transactionId,
            isLegacySettlement: true,
            settlementSource: "Netkampus",
            paymentDate: item.dateOfTransaction,
            createdAt: Timestamp.now(),
            receiptNo: null // NO ERP bill generated for prior legacy settlements!
          }, { merge: true });
        });

        await b.commit();
      }

      const totalAmt = uploadedNetkampusData.reduce((s, e) => s + e.amount, 0);
      showToast(`Successfully saved ${uploadedNetkampusData.length} Netkampus fee payments totaling ₹${totalAmt.toLocaleString()}! Student dues are now reduced.`);
      setUploadedNetkampusData([]);
      setNetkampusTab("view");
    } catch (err) {
      console.error("Save Netkampus error:", err);
      showToast("Failed to save Netkampus payments to database", "error");
    } finally {
      setNetkampusUploading(false);
    }
  };

  // Delete a Netkampus payment record
  const handleDeleteNetkampusSettlement = async (id) => {
    if (!window.confirm("Are you sure you want to delete this Netkampus settlement? The student's due will increase accordingly.")) return;
    try {
      await deleteDoc(doc(db, "fee_payments", id));
      showToast("Netkampus settlement record deleted");
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Error deleting settlement record", "error");
    }
  };

  // Filtered Netkampus settlements for Tab 3 View
  const netkampusSettlements = useMemo(() => {
    return payments.filter(p =>
      p.isLegacySettlement ||
      p.settlementSource === "Netkampus" ||
      (p.mode || "").toLowerCase().includes("netkampus") ||
      (p.remarks || "").toLowerCase().includes("netkampus")
    );
  }, [payments]);

  const studentFeeDetails = useMemo(() => {
    if (!selectedStudent) return null;
    const prog = selectedStudent.programme || '';
    const dept = selectedStudent.department || '';
    const batch = selectedStudent.batch || '';
    const sDept = getCanonicalDept(dept);

    // 1. Filter configs based on programme, department, batch AND quota/seatCategory AND studentCategory
    const matchedFees = feeConfigs.filter(f => {
      const isProg = isProgMatch(f.programme, prog);
      const isDept = !f.department || f.department.toLowerCase() === "all" || isDeptMatchRegistry(f.department, sDept);
      const batchMatch = !f.batch || f.batch.toLowerCase() === "all" || isBatchMatch(f.batch, batch);
      const isQuota = isQuotaApplicable(f.quota, selectedStudentQuota);
      const isCategory = isCategoryApplicable(f.studentCategory, selectedStudentCategory);

      return isProg && isDept && batchMatch && isQuota && isCategory;
    });

    const configMap = new Map();
    matchedFees.forEach((c) => {
      const key = `${c.academicYear || ''}_${c.semester || ''}_${normHead(c.head)}`;
      const existing = configMap.get(key);
      if (!existing) {
        configMap.set(key, c);
      } else {
        const existingMatchesExact = isQuotaMatchExact(existing.quota, selectedStudentQuota);
        const currentMatchesExact = isQuotaMatchExact(c.quota, selectedStudentQuota);

        if (currentMatchesExact && !existingMatchesExact) {
          configMap.set(key, c);
        } else if (!existingMatchesExact && (!existing.quota || existing.quota.trim().toLowerCase() === 'all')) {
          const currentHasQuota = Boolean(c.quota && c.quota.trim().toLowerCase() !== 'all');
          if (currentHasQuota) {
            configMap.set(key, c);
          }
        }
      }
    });

    const fees = Array.from(configMap.values());

    // Transport fee: match the student's transport stage to a configured stage
    if (selectedStudentStage && transportStages.length) {
      const stageMatch = transportStages.find(t => String(t.stageNo).trim() === String(selectedStudentStage).trim() || String(t.stageName || t.name).toLowerCase().trim() === String(selectedStudentStage).toLowerCase().trim());
      if (stageMatch && Number(stageMatch.fee || stageMatch.amount)) {
        fees.push({
          id: `transport_${stageMatch.id}`,
          head: "Transport Fee",
          academicYear: "—",
          semester: "All",
          amount: Number(stageMatch.fee || stageMatch.amount),
          _transport: true
        });
      }
    }

    // Previous Academic Year Opening Dues / Arrears for selected student
    const studentOpeningDues = openingDues.filter(od => {
      const odReg = (od.regNo || "").trim().toLowerCase();
      const sReg = (selectedStudent.regNo || selectedStudent.examNumber || "").trim().toLowerCase();
      const matchesStudent =
        (selectedStudent.id && (od.studentId === selectedStudent.id || od.uid === selectedStudent.id)) ||
        (sReg && odReg && odReg === sReg);
      return matchesStudent && Number(od.amount) > 0;
    });

    studentOpeningDues.forEach(od => {
      fees.push({
        id: od.id || `od_${od.regNo}_${od.head}_${od.academicYear}`,
        head: od.head,
        academicYear: od.academicYear || "Previous AY",
        semester: od.semester || "All",
        amount: Number(od.amount) || 0,
        isOpeningDue: true,
        openingDueId: od.id
      });
    });

    const matchesStudent = (p) => matchesStudentRecord(selectedStudent, p);

    // Unified payment list: combine fee_payments and fee_receipts without double counting
    const unifiedStudentPayments = [];
    const seenTxnIds = new Set();

    const getTxnIdentifiers = (record) => {
      const keys = [];
      if (record.id) keys.push(String(record.id).trim().toLowerCase());
      if (record.orderId) keys.push(String(record.orderId).trim().toLowerCase());
      if (record.hdfcOrderId) keys.push(String(record.hdfcOrderId).trim().toLowerCase());
      if (record.refNo) keys.push(String(record.refNo).trim().toLowerCase());
      if (record.receiptNo) keys.push(String(record.receiptNo).trim().toLowerCase());
      const rrn = record.gatewayResponse?.rrn || record.rrn;
      if (rrn) keys.push(`rrn_${String(rrn).trim().toLowerCase()}`);
      return keys;
    };

    // 1. Process verified payments from fee_payments
    const successfulPayments = payments.filter(p => matchesStudent(p) && isSuccessfulPayment(p));
    successfulPayments.forEach(p => {
      const ids = getTxnIdentifiers(p);
      const isDupe = ids.some(id => seenTxnIds.has(id));
      if (!isDupe) {
        ids.forEach(id => seenTxnIds.add(id));
        unifiedStudentPayments.push({ ...p });
      }
    });

    // 2. Process matched active receipts from fee_receipts
    const matchedReceipts = (receipts || []).filter(r => matchesStudent(r) && String(r.status || "").toLowerCase() !== "cancelled");
    matchedReceipts.forEach(r => {
      const rIds = getTxnIdentifiers(r);
      const existingPayment = unifiedStudentPayments.find(p => {
        const pIds = getTxnIdentifiers(p);
        if (pIds.some(id => rIds.includes(id))) return true;
        // Same student, exact same feeHead, and exact same amount
        const pAmt = Number(p.chargedAmount || p.amount || 0);
        const rAmt = Number(r.chargedAmount || r.amount || 0);
        if (pAmt > 0 && pAmt === rAmt && normHead(p.feeHead) === normHead(r.feeHead || r.items?.[0]?.head)) {
          return true;
        }
        return false;
      });

      if (existingPayment) {
        // Enrich existing payment with receipt metadata — DO NOT duplicate payment!
        if (!existingPayment.receiptNo && r.receiptNo) {
          existingPayment.receiptNo = r.receiptNo;
        }
        existingPayment.receiptDoc = r;
        existingPayment.receiptId = r.id;
        rIds.forEach(id => seenTxnIds.add(id));
      } else {
        const isDupe = rIds.some(id => seenTxnIds.has(id));
        if (!isDupe) {
          rIds.forEach(id => seenTxnIds.add(id));
          unifiedStudentPayments.push({ ...r });
        }
      }
    });

    const studentPayments = unifiedStudentPayments;

    // Filter pending payments, automatically omitting orphaned pending records where a matching SUCCESS payment exists
    const pendingStudentPayments = payments.filter(p => {
      if (!matchesStudent(p)) return false;
      const st = String(p.status || "").toUpperCase().trim();
      if (st !== "PENDING" && st !== "STARTED" && st !== "AUTHORIZING") return false;

      const pAmt = Number(p.amount || p.chargedAmount || 0);
      const pHead = normHead(p.feeHead || p.allocations?.[0]?.feeHead);
      const isAlreadyPaid = studentPayments.some(sp => {
        const spAmt = Number(sp.amount || sp.chargedAmount || 0);
        const spHead = normHead(sp.feeHead || sp.allocations?.[0]?.feeHead);
        return spAmt === pAmt && spHead === pHead;
      });
      if (isAlreadyPaid) return false;

      return true;
    });

    const allStudentPayments = [...studentPayments, ...appPayments].sort((a, b) => {
      const getTS = (p) => p.paymentDate || p.createdAt || p.verifiedAt || 0;
      const da = getTS(a).toDate ? getTS(a).toDate() : new Date(getTS(a));
      const dbVal = getTS(b).toDate ? getTS(b).toDate() : new Date(getTS(b));
      return dbVal - da;
    });

    // Active Academic Year determination
    const activeAy = semesterConfigs.find(s => s.status === "active")?.academicYear || "2026-2027";
    const activeAYStart = parseYearStart(activeAy);

    // Current Academic Year fee configs (up to active AY, matching FeeDashboard and FeeControl!)
    const currentYearFeesList = fees.filter(f => {
      if (activeAYStart > 0 && f.academicYear && f.academicYear !== "—" && f.academicYear !== "Previous AY") {
        const yStart = parseYearStart(f.academicYear);
        if (yStart > activeAYStart) return false;
      }
      return true;
    });

    const currentFees = currentYearFeesList.reduce((s, f) => s + (f.amount || 0), 0);
    const totalFees = fees.reduce((s, f) => s + (f.amount || 0), 0);
    const totalPaid = allStudentPayments.reduce((s, p) => s + (p.chargedAmount || p.amount || 0), 0);

    // Concessions for selected student
    const studentConcessions = concessions.filter(c => {
      const cReg = (c.regNo || c.studentRegNo || "").trim().toLowerCase();
      const sReg = (selectedStudent.regNo || selectedStudent.examNumber || "").trim().toLowerCase();
      return (cReg && sReg && cReg === sReg) || (c.studentId && c.studentId === selectedStudent.id);
    });
    const totalConcessions = studentConcessions.reduce((s, c) => s + Number(c.amount || 0), 0);

    const currentOutstanding = Math.max(0, currentFees - totalPaid - totalConcessions);
    const totalOutstanding = Math.max(0, totalFees - totalPaid - totalConcessions);

    // Each portal payment reduces exactly ONE config (year-tagged → that year,
    // untagged legacy → oldest due first). Shared allocator keeps office & portal consistent.
    const paidByConfigId = computePaidByConfig({
      configs: fees,
      portalPayments: studentPayments.filter((p) => isSuccessfulPayment(p)),
      appPayments: appPayments.filter((p) => isSuccessfulPayment(p)),
    });

    const paidForHead = (cfg) => paidByConfigId.get(cfg.id) || 0;

    // Calculate individual paid amount head-wise
    const headBreakdown = fees.map(f => {
      const pfh = paidForHead(f);
      return {
        id: f.id,
        head: f.head,
        academicYear: f.academicYear || '—',
        semester: f.semester || 'All',
        amount: f.amount || 0,
        paid: pfh,
        due: Math.max(0, (f.amount || 0) - pfh),
        isOpeningDue: Boolean(f.isOpeningDue)
      };
    });

    const sortedBreakdown = [...headBreakdown].sort((a, b) => {
      const yr = (a.academicYear || '').localeCompare(b.academicYear || '');
      if (yr) return yr;
      const semA = a.semester || 'All';
      const semB = b.semester || 'All';
      return semA.localeCompare(semB);
    });

    return {
      fees,
      studentPayments,
      appPayments,
      allStudentPayments,
      activeAy,
      currentFees,
      currentOutstanding,
      totalFees,
      totalPaid,
      totalConcessions,
      outstanding: currentOutstanding,
      totalOutstanding,
      pendingStudentPayments,
      headBreakdown: sortedBreakdown
    };
  }, [selectedStudent, selectedStudentQuota, selectedStudentCategory, selectedStudentStage, transportStages, feeConfigs, payments, receipts, appPayments, openingDues, semesterConfigs, concessions]);

  const maxPayableAmount = useMemo(() => {
    if (selectedHeads.length > 0) {
      return selectedHeads.reduce((sum, h) => sum + h.due, 0);
    }
    if (paymentForm.feeHead && studentFeeDetails?.headBreakdown) {
      const match = studentFeeDetails.headBreakdown.find(h =>
        h.head === paymentForm.feeHead && (!paymentForm.academicYear || h.academicYear === paymentForm.academicYear)
      );
      if (match) return match.due;
    }
    return studentFeeDetails?.outstanding || 0;
  }, [selectedHeads, paymentForm.feeHead, paymentForm.academicYear, studentFeeDetails]);

  const groupedStudentFees = useMemo(() => {
    if (!studentFeeDetails || !studentFeeDetails.fees) return [];
    const sorted = [...studentFeeDetails.fees].sort((a, b) => {
      const yr = (a.academicYear || '').localeCompare(b.academicYear || '');
      if (yr) return yr;
      const semA = a.semester || 'All';
      const semB = b.semester || 'All';
      return semA.localeCompare(semB);
    });
    const groups = [];
    let currentYear = null;
    let currentSem = null;
    sorted.forEach((cfg) => {
      const year = cfg.academicYear || '—';
      const sem = cfg.semester || 'All';
      if (!currentYear || currentYear.key !== year) {
        currentSem = null;
        currentYear = { key: year, academicYear: year, semGroups: [] };
        groups.push(currentYear);
      }
      if (!currentSem || currentSem.key !== sem) {
        currentSem = { key: sem, semester: sem, rows: [] };
        currentYear.semGroups.push(currentSem);
      }
      currentSem.rows.push(cfg);
    });
    return groups;
  }, [studentFeeDetails]);

  // Fast lookup map for students by id, uid, regNo, registerNumber, examNumber, rollNo, studentName, displayName
  const studentLookup = useMemo(() => {
    const map = new Map();
    students.forEach(s => {
      if (s.id) map.set(String(s.id).toLowerCase(), s);
      if (s.uid) map.set(String(s.uid).toLowerCase(), s);
      if (s.regNo) map.set(String(s.regNo).toLowerCase(), s);
      if (s.registerNumber) map.set(String(s.registerNumber).toLowerCase(), s);
      if (s.examNumber) map.set(String(s.examNumber).toLowerCase(), s);
      if (s.rollNo) map.set(String(s.rollNo).toLowerCase(), s);
      if (s.studentName) map.set(String(s.studentName).toLowerCase(), s);
      if (s.displayName) map.set(String(s.displayName).toLowerCase(), s);
      if (s.name) map.set(String(s.name).toLowerCase(), s);
      if (s.email) map.set(String(s.email).toLowerCase(), s);
      if (s.emailId) map.set(String(s.emailId).toLowerCase(), s);
      if (s._profile_data?.emailId) map.set(String(s._profile_data.emailId).toLowerCase(), s);
      if (s._profile_data?.email) map.set(String(s._profile_data.email).toLowerCase(), s);
      if (s._profile_data?.regNo) map.set(String(s._profile_data.regNo).toLowerCase(), s);
    });
    return map;
  }, [students]);

  const combinedReceiptList = useMemo(() => {
    // 1. Build lookup maps of fee_receipts by receiptNo, orderId, id, and composite key
    const activeReceiptsByNo = new Map();
    const activeReceiptsById = new Map();
    const activeReceiptsByComp = new Map();

    receipts.forEach(r => {
      if (String(r.status || "").toLowerCase() === "cancelled") return; // Skip cancelled receipts
      if (r.receiptNo) activeReceiptsByNo.set(r.receiptNo.trim().toLowerCase(), r);
      if (r.orderId) activeReceiptsByNo.set(r.orderId.trim().toLowerCase(), r);
      activeReceiptsById.set(r.id, r);

      const pDate = getPaymentDateObj(r);
      const dateStr = pDate && !isNaN(pDate.getTime()) ? pDate.toISOString().split("T")[0] : "";
      const amt = Number(r.amount) || 0;
      const compKey = `${(r.studentId || r.studentName || "").trim().toLowerCase()}_${(r.feeHead || "").trim().toLowerCase()}_${amt}_${dateStr}`;
      activeReceiptsByComp.set(compKey, r);
    });

    const seenReceiptIds = new Set();
    const matchedReceiptKeys = new Set();

    // 2. Map all SUCCESS / verified payments from fee_payments (The single source of truth for all fee collections)
    const list = payments.filter(p => isSuccessfulPayment(p)).map(p => {
      const rNoKey = (p.receiptNo || "").trim().toLowerCase();
      const oIdKey = (p.orderId || "").trim().toLowerCase();

      const pDate = getPaymentDateObj(p);
      const dateStr = pDate && !isNaN(pDate.getTime()) ? pDate.toISOString().split("T")[0] : "";
      const amt = Number(p.chargedAmount || p.amount || 0);
      const compKey = `${(p.studentId || p.uid || p.studentName || "").trim().toLowerCase()}_${(p.feeHead || "").trim().toLowerCase()}_${amt}_${dateStr}`;

      const matchedReceipt =
        (rNoKey ? activeReceiptsByNo.get(rNoKey) : null) ||
        (oIdKey ? activeReceiptsByNo.get(oIdKey) : null) ||
        activeReceiptsById.get(p.id) ||
        activeReceiptsByComp.get(compKey);

      if (matchedReceipt?.id) {
        seenReceiptIds.add(matchedReceipt.id);
        if (matchedReceipt.receiptNo) matchedReceiptKeys.add(matchedReceipt.receiptNo.trim().toLowerCase());
        if (matchedReceipt.orderId) matchedReceiptKeys.add(matchedReceipt.orderId.trim().toLowerCase());
      }
      if (p.receiptNo) matchedReceiptKeys.add(p.receiptNo.trim().toLowerCase());
      if (p.orderId) matchedReceiptKeys.add(p.orderId.trim().toLowerCase());

      const sIdKey = (p.studentId || p.uid || matchedReceipt?.studentId || "").trim().toLowerCase();
      const exKey = (p.regNo || p.examNumber || matchedReceipt?.regNo || matchedReceipt?.examNumber || p.rollNo || "").trim().toLowerCase();
      const nameKey = (p.studentName || matchedReceipt?.studentName || "").trim().toLowerCase();

      const matchedStudent =
        (sIdKey ? studentLookup.get(sIdKey) : null) ||
        (exKey ? studentLookup.get(exKey) : null) ||
        (nameKey ? studentLookup.get(nameKey) : null);

      const resolvedMode = getPaymentMode(p);
      const isGateway = resolvedMode === "gateway";
      const displayMode = isGateway
        ? "SmartGateway"
        : resolvedMode === "dd"
          ? "DD"
          : resolvedMode === "upi"
            ? "UPI"
            : resolvedMode === "cash"
              ? "Cash"
              : resolvedMode === "cheque"
                ? "Cheque"
                : "Online";

      const receiptNo = p.receiptNo || matchedReceipt?.receiptNo || p.orderId || p.id;
      const orderId = p.orderId || matchedReceipt?.orderId || p.id;
      const studentName = p.studentName || matchedReceipt?.studentName || matchedStudent?.displayName || matchedStudent?.studentName || matchedStudent?.name || "Student";
      const resolvedReg = (p.regNo && p.regNo !== "—")
        ? p.regNo
        : (p.examNumber && p.examNumber !== "—")
          ? p.examNumber
          : (matchedReceipt?.regNo || matchedReceipt?.examNumber || matchedStudent?.regNo || matchedStudent?.registerNumber || matchedStudent?.examNumber || p.rollNo || p.studentId || "—");
      const department = (p.department && p.department !== "—")
        ? p.department
        : (matchedReceipt?.department || matchedStudent?.department || "—");
      const batch = deriveBatch(p.batch || matchedReceipt?.batch || matchedStudent?.batch, resolvedReg, department);
      const semester = p.semester || p.sem || matchedReceipt?.semester || matchedReceipt?.sem || matchedStudent?.semester || matchedStudent?.currentSemester || "";
      const feeHead = p.feeHead || matchedReceipt?.feeHead || "Fee";
      const paymentDate = p.verifiedAt || p.createdAt || p.paymentDate || matchedReceipt?.paymentDate;
      const ay = p.academicYear || matchedReceipt?.academicYear || getPaymentAcademicYear(p, semesterConfigs);

      return {
        id: p.id,
        receiptNo,
        orderId,
        studentId: p.uid || p.studentId || matchedReceipt?.studentId,
        studentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department,
        batch,
        semester,
        feeHead,
        mode: displayMode,
        rawMode: resolvedMode,
        amount: amt,
        status: matchedReceipt?.status || "active",
        paymentDate,
        academicYear: ay,
        isOnline: isGateway || resolvedMode === "online",
        refNo: p.refNo || matchedReceipt?.refNo || p.remarks || matchedReceipt?.remarks || "",
        remarks: p.remarks || matchedReceipt?.remarks || p.refNo || matchedReceipt?.refNo || "",
        accountNo: "76980",
        accountName: "College Account #76980",
        accountShort: "#76980 College",
        isCoe: false,
        rawRecord: { ...(p || {}), ...(matchedReceipt || {}) }
      };
    });

    // 2b. Include any unmatched active receipts from fee_receipts
    receipts.forEach(r => {
      if (String(r.status || "").toLowerCase() === "cancelled") return;
      if (seenReceiptIds.has(r.id)) return;
      const rNoKey = (r.receiptNo || "").trim().toLowerCase();
      const oIdKey = (r.orderId || "").trim().toLowerCase();
      if (rNoKey && matchedReceiptKeys.has(rNoKey)) return;
      if (oIdKey && matchedReceiptKeys.has(oIdKey)) return;

      const sIdKey = (r.studentId || r.uid || "").trim().toLowerCase();
      const exKey = (r.regNo || r.examNumber || r.rollNo || "").trim().toLowerCase();
      const nameKey = (r.studentName || "").trim().toLowerCase();

      const matchedStudent =
        (sIdKey ? studentLookup.get(sIdKey) : null) ||
        (exKey ? studentLookup.get(exKey) : null) ||
        (nameKey ? studentLookup.get(nameKey) : null);

      const resolvedMode = getPaymentMode(r);
      const isGateway = resolvedMode === "gateway";
      const displayMode = isGateway
        ? "SmartGateway"
        : resolvedMode === "dd"
          ? "DD"
          : resolvedMode === "upi"
            ? "UPI"
            : resolvedMode === "cash"
              ? "Cash"
              : resolvedMode === "cheque"
                ? "Cheque"
                : "Online";

      const receiptNo = r.receiptNo || r.orderId || r.id;
      const orderId = r.orderId || r.receiptNo || r.id;
      const studentName = r.studentName || matchedStudent?.displayName || matchedStudent?.studentName || matchedStudent?.name || "Student";
      const resolvedReg = (r.regNo && r.regNo !== "—")
        ? r.regNo
        : (r.examNumber && r.examNumber !== "—")
          ? r.examNumber
          : (matchedStudent?.regNo || matchedStudent?.registerNumber || matchedStudent?.examNumber || r.rollNo || r.studentId || "—");
      const department = (r.department && r.department !== "—")
        ? r.department
        : (matchedStudent?.department || "—");
      const batch = deriveBatch(r.batch || matchedStudent?.batch, resolvedReg, department);
      const semester = r.semester || r.sem || matchedStudent?.semester || matchedStudent?.currentSemester || "";
      const feeHead = r.feeHead || r.items?.[0]?.head || "Fee";
      const paymentDate = r.paymentDate || r.createdAt;
      const ay = r.academicYear || getPaymentAcademicYear(r, semesterConfigs);
      const amt = Number(r.amount) || 0;

      list.push({
        id: r.id,
        receiptNo,
        orderId,
        studentId: r.studentId || r.uid,
        studentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department,
        batch,
        semester,
        feeHead,
        mode: displayMode,
        rawMode: resolvedMode,
        amount: amt,
        status: r.status || "active",
        paymentDate,
        academicYear: ay,
        isOnline: isGateway || resolvedMode === "online",
        refNo: r.refNo || r.remarks || "",
        remarks: r.remarks || r.refNo || "",
        accountNo: "76980",
        accountName: "College Account #76980",
        accountShort: "#76980 College",
        isCoe: false,
        rawRecord: r
      });
    });

    // 3. Map all paid records from Exam Cell Account (#76983):
    // ESE registration Fee, Photocopy Fee, Revaluation Fee, Review Fee
    const coeItems = [];
    const seenCoeKeys = new Set();

    // Helper to resolve student profile from studentLookup & userLookup
    const resolveStudentMeta = (reg, name, sId, email, docId) => {
      const kReg = (reg || "").trim().toLowerCase();
      const kName = (name || "").trim().toLowerCase();
      const kId = (sId || "").trim().toLowerCase();
      const kEmail = (email || "").trim().toLowerCase();
      const kDoc = (docId || "").trim().toLowerCase();
      const cleanUid = kDoc.startsWith("ese_") ? kDoc.replace("ese_", "") : "";

      let found = (kReg ? studentLookup.get(kReg) : null) ||
        (kEmail ? studentLookup.get(kEmail) : null) ||
        (kId ? studentLookup.get(kId) : null) ||
        (cleanUid ? studentLookup.get(cleanUid) : null) ||
        (kName ? studentLookup.get(kName) : null);

      if (found) return found;

      const userMeta = (kReg ? userLookup.get(kReg) : null) ||
        (kEmail ? userLookup.get(kEmail) : null) ||
        (kId ? userLookup.get(kId) : null) ||
        (cleanUid ? userLookup.get(cleanUid) : null) ||
        (kDoc ? userLookup.get(kDoc) : null) ||
        (kName ? userLookup.get(kName) : null);

      if (userMeta) {
        if (userMeta.regNo) {
          const sByReg = studentLookup.get(String(userMeta.regNo).trim().toLowerCase());
          if (sByReg) return sByReg;
        }
        return userMeta;
      }
      return null;
    };

    // A. ese_fee_registrations & ese_fee_payments ("ESE registration Fee")
    const combinedEseList = [...eseRegistrations, ...eseFeePayments];

    combinedEseList.forEach(p => {
      const pStatus = (p.paymentStatus || p.status || p.hdfcStatus || "").toLowerCase();
      const isPaid =
        pStatus === "paid" ||
        pStatus === "success" ||
        pStatus === "successful" ||
        pStatus === "charged" ||
        pStatus === "completed" ||
        p.billAttached === true ||
        Boolean(p.receiptNo) ||
        Boolean(p.paidAt);
      if (!isPaid) return;

      const amt = Number(p.feeAmount || p.amount || p.chargedAmount || 0);
      if (amt <= 0) return;

      let regNo = (p.regNo || p.studentRegNo || p.examNumber || p.rollNo || "").trim();
      if (!regNo || !/4207\d{8}/.test(regNo)) {
        const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
        for (const f of scanFields) {
          if (typeof f === "string" && f) {
            const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
            if (m) {
              regNo = m[1];
              break;
            }
          }
        }
      }

      const rawEmail = p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "";
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid || p.uid, rawEmail, p.id);

      const rawName = p.studentName || p.candidateName || p.name || "";
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || "Student"));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = displayDept(rawDept);
      const resolvedBatch = deriveBatch(p.batch || sMeta?.batch, resolvedReg, resolvedDept);
      const resolvedProg = p.programme || sMeta?.programme || "UG";
      const resolvedSem = p.semester || p.sem || sMeta?.semester || sMeta?.currentSemester || "";

      const orderId = (p.orderId || p.transactionId || (p.id && !p.id.startsWith("ESE_") ? p.id : "") || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-ESE-${orderId}` : `ESE-${p.id}`)).trim();
      const paymentDate = p.paidAt || p.paymentDate || p.appliedAt || p.createdAt || p.timestamp || p.verifiedAt;
      let ay = p.academicYear || (p.examSession ? p.examSession : null) || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027";
      if (typeof ay === "string" && ay.trim().length === 4 && !ay.includes("-")) {
        ay = `${ay.trim()}-${Number(ay.trim()) + 1}`;
      }

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_ese_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);
      seenCoeKeys.add(`ese_${p.id}_${orderId}_${amt}`);

      coeItems.push({
        id: `coe_ese_${p.id}`,
        receiptNo,
        studentId: p.studentUid || p.uid || sMeta?.id,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        programme: resolvedProg,
        semester: resolvedSem,
        feeHead: "ESE registration Fee",
        mode: "SmartGateway",
        rawMode: "gateway",
        amount: amt,
        status: "active",
        paymentDate,
        academicYear: ay,
        isOnline: true,
        isCoe: true,
        accountNo: "76983",
        accountName: "Exam Cell Account #76983",
        accountShort: "#76983 COE",
        orderId,
        refNo: orderId,
        remarks: `Exam Cell ESE Fee - ${p.examName || p.examId || ""}`,
        rawRecord: { ...p, orderId, feeHead: "ESE registration Fee", amount: amt, accountNo: "76983" }
      });
    });

    // B. photocopy_applications ("Photocopy Fee")
    photocopyApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" ||
        p.billAttached === true ||
        Boolean(p.electronicBill) ||
        Boolean(p.transactionId) ||
        Boolean(p.paidAt) ||
        ["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Copy Issued", "Closed", "Revoked by HOD", "Revoked by Exam Cell"].includes(p.status);
      if (!isPaid) return;
      if (p.status === "Payment Pending" && p.paymentStatus === "Pending" && !p.transactionId && !p.paidAt) return;

      const amt = Number(p.feeAmount || p.totalFee || p.amount || (p.subjectCount ? p.subjectCount * (p.feePerSubject || 350) : 0));
      if (amt <= 0) return;

      const regNo = p.regNo || p.studentRegNo || "";
      const rawEmail = p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "";
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid, rawEmail);

      const rawName = p.studentName || p.candidateName || p.name || "";
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || rawName || "Student"));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || "—";
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || "—";
      const resolvedDept = displayDept(rawDept);
      const resolvedBatch = deriveBatch(p.batch || sMeta?.batch, resolvedReg, resolvedDept);
      const resolvedProg = p.programme || sMeta?.programme || "UG";
      const resolvedSem = p.semester || p.sem || sMeta?.semester || "";

      const orderId = (p.orderId || p.electronicBill?.transactionId || p.transactionId || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-PHOTO-${orderId}` : `PHOTO-${p.id}`)).trim();
      const paymentDate = p.paidAt || p.paymentDate || p.appliedAt || p.createdAt;
      const ay = p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027";

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_photo_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);
      seenCoeKeys.add(`photo_${p.id}_${orderId}_${amt}`);

      coeItems.push({
        id: `coe_photo_${p.id}`,
        receiptNo,
        studentId: p.studentUid || sMeta?.id,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        programme: resolvedProg,
        semester: resolvedSem,
        feeHead: "Photocopy Fee",
        mode: "SmartGateway",
        rawMode: "gateway",
        amount: amt,
        status: "active",
        paymentDate,
        academicYear: ay,
        isOnline: true,
        isCoe: true,
        accountNo: "76983",
        accountName: "Exam Cell Account #76983",
        accountShort: "#76983 COE",
        orderId,
        refNo: orderId,
        remarks: "Exam Cell Photocopy Application Fee",
        rawRecord: { ...p, orderId, feeHead: "Photocopy Fee", amount: amt, accountNo: "76983" }
      });
    });

    // C. revaluation_applications ("Revaluation Fee")
    revaluationApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" ||
        p.billAttached === true ||
        Boolean(p.electronicBill) ||
        Boolean(p.transactionId) ||
        Boolean(p.paidAt) ||
        ["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Approved", "Result Published", "Revoked by HOD", "Revoked by Exam Cell"].includes(p.status);
      if (!isPaid) return;
      if (p.status === "Payment Pending" && p.paymentStatus === "Pending" && !p.transactionId && !p.paidAt) return;

      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;

      const regNo = p.regNo || p.studentRegNo || "";
      const rawEmail = p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "";
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid, rawEmail);

      const rawName = p.studentName || p.candidateName || p.name || "";
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || rawName || "Student"));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || "—";
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || "—";
      const resolvedDept = displayDept(rawDept);
      const resolvedBatch = deriveBatch(p.batch || sMeta?.batch, resolvedReg, resolvedDept);
      const resolvedProg = p.programme || sMeta?.programme || "UG";
      const resolvedSem = p.semester || p.sem || sMeta?.semester || "";

      const orderId = (p.orderId || p.electronicBill?.transactionId || p.transactionId || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-REVAL-${orderId}` : `REVAL-${p.id}`)).trim();
      const paymentDate = p.paidAt || p.paymentDate || p.appliedAt || p.createdAt;
      const ay = p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027";

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_reval_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);
      seenCoeKeys.add(`reval_${p.id}_${orderId}_${amt}`);

      coeItems.push({
        id: `coe_reval_${p.id}`,
        receiptNo,
        studentId: p.studentUid || sMeta?.id,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        programme: resolvedProg,
        semester: resolvedSem,
        feeHead: "Revaluation Fee",
        mode: "SmartGateway",
        rawMode: "gateway",
        amount: amt,
        status: "active",
        paymentDate,
        academicYear: ay,
        isOnline: true,
        isCoe: true,
        accountNo: "76983",
        accountName: "Exam Cell Account #76983",
        accountShort: "#76983 COE",
        orderId,
        refNo: orderId,
        remarks: "Exam Cell Revaluation Application Fee",
        rawRecord: { ...p, orderId, feeHead: "Revaluation Fee", amount: amt, accountNo: "76983" }
      });
    });

    // D. review_applications ("Review Fee")
    reviewApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" ||
        p.billAttached === true ||
        Boolean(p.electronicBill) ||
        Boolean(p.transactionId) ||
        Boolean(p.paidAt) ||
        ["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Approved", "Result Published", "Revoked by HOD", "Revoked by Exam Cell"].includes(p.status);
      if (!isPaid) return;
      if (p.status === "Payment Pending" && p.paymentStatus === "Pending" && !p.transactionId && !p.paidAt) return;

      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;

      const regNo = p.regNo || p.studentRegNo || "";
      const rawEmail = p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "";
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid, rawEmail);

      const rawName = p.studentName || p.candidateName || p.name || "";
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || rawName || "Student"));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || "—";
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || "—";
      const resolvedDept = displayDept(rawDept);
      const resolvedBatch = deriveBatch(p.batch || sMeta?.batch, resolvedReg, resolvedDept);
      const resolvedProg = p.programme || sMeta?.programme || "UG";
      const resolvedSem = p.semester || p.sem || sMeta?.semester || "";

      const orderId = (p.orderId || p.electronicBill?.transactionId || p.transactionId || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-REVIEW-${orderId}` : `REVIEW-${p.id}`)).trim();
      const paymentDate = p.paidAt || p.paymentDate || p.appliedAt || p.createdAt;
      const ay = p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027";

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_review_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);
      seenCoeKeys.add(`review_${p.id}_${orderId}_${amt}`);

      coeItems.push({
        id: `coe_review_${p.id}`,
        receiptNo,
        studentId: p.studentUid || sMeta?.id,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        programme: resolvedProg,
        semester: resolvedSem,
        feeHead: "Review Fee",
        mode: "SmartGateway",
        rawMode: "gateway",
        amount: amt,
        status: "active",
        paymentDate,
        academicYear: ay,
        isOnline: true,
        isCoe: true,
        accountNo: "76983",
        accountName: "Exam Cell Account #76983",
        accountShort: "#76983 COE",
        orderId,
        refNo: orderId,
        remarks: "Exam Cell Review Application Fee",
        rawRecord: { ...p, orderId, feeHead: "Review Fee", amount: amt, accountNo: "76983" }
      });
    });

    // E. Fallback: Any SUCCESS in exam_cell_payments not already mapped
    examCellPayments.forEach(p => {
      const pStatus = (p.status || "").toUpperCase();
      if (pStatus !== "SUCCESS") return;
      const orderId = (p.id || p.orderId || "").trim();
      const normOrder = orderId.toLowerCase();
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;

      const amt = Number(p.amount || p.chargedAmount || 0);
      if (amt <= 0) return;

      const catLower = (p.category || "").toLowerCase();
      let head = "ESE registration Fee";
      if (catLower.includes("review")) head = "Review Fee";
      else if (catLower.includes("revaluation")) head = "Revaluation Fee";
      else if (catLower.includes("photocopy")) head = "Photocopy Fee";

      const receiptNo = (p.receiptNo || `REC-EXAM-${orderId}`).trim();
      const normReceipt = receiptNo.toLowerCase();
      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;

      let regNo = (p.regNo || p.examNumber || p.studentRegNo || p.rollNo || "").trim();
      if (!regNo || !/4207\d{8}/.test(regNo)) {
        const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
        for (const f of scanFields) {
          if (typeof f === "string" && f) {
            const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
            if (m) {
              regNo = m[1];
              break;
            }
          }
        }
      }

      const rawEmail = p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "";
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.uid || p.studentId, rawEmail, p.id || p.orderId);

      const rawName = p.studentName || p.candidateName || p.name || "";
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || "Student"));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = displayDept(rawDept);
      const resolvedBatch = deriveBatch(p.batch || sMeta?.batch, resolvedReg, resolvedDept);
      const resolvedProg = p.programme || sMeta?.programme || "UG";
      const resolvedSem = p.semester || p.sem || sMeta?.semester || "";

      const paymentDate = p.verifiedAt || p.createdAt || p.paymentDate;
      const ay = p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027";

      const studentTxnKey = `${(resolvedReg || "").toLowerCase()}_${head.toLowerCase()}_${amt}_${normOrder || normReceipt}`;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);

      coeItems.push({
        id: `coe_pay_${orderId}`,
        receiptNo,
        studentId: p.uid || p.studentId || sMeta?.id,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        programme: resolvedProg,
        semester: resolvedSem,
        feeHead: head,
        mode: "SmartGateway",
        rawMode: "gateway",
        amount: amt,
        status: "active",
        paymentDate,
        academicYear: ay,
        isOnline: true,
        isCoe: true,
        accountNo: "76983",
        accountName: "Exam Cell Account #76983",
        accountShort: "#76983 COE",
        orderId,
        refNo: orderId,
        remarks: `Exam Cell Payment (${head})`,
        rawRecord: { ...p, orderId, feeHead: head, amount: amt, accountNo: "76983" }
      });
    });

    // 4. Map Admission Enquiry & Application payments from enquiriesList
    const enquiryItems = [];
    const seenEnquiryKeys = new Set();
    list.forEach(item => {
      if (item.receiptNo) seenEnquiryKeys.add(item.receiptNo.trim().toLowerCase());
      if (item.id) seenEnquiryKeys.add(item.id.trim().toLowerCase());
    });

    enquiriesList.forEach(enq => {
      const rawPayments = Array.isArray(enq.payments) && enq.payments.length > 0
        ? enq.payments
        : (enq.feeAmount ? [{
            feeCategory: enq.feeCategory || "Application Fee",
            feeAmount: enq.feeAmount,
            paymentMode: enq.paymentMode || "cash",
            paymentDate: enq.paymentDate || enq.enquiryDate,
            upiNumber: enq.upiNumber || ""
          }] : []);

      rawPayments.forEach((p, idx) => {
        const amt = Number(p.feeAmount);
        if (isNaN(amt) || amt <= 0) return;

        const enqId = enq.enquiryId || enq.id;
        const appNo = enq.applicationNo || enqId;
        const receiptNo = p.receiptNo || `REC-APP-${String(enqId).replace(/[^A-Za-z0-9]/g, '')}-${idx + 1}`;
        const payDocId = `enq_pay_${enqId}_${idx}`;

        if (seenEnquiryKeys.has(payDocId.toLowerCase()) || seenEnquiryKeys.has(receiptNo.toLowerCase())) {
          return;
        }
        seenEnquiryKeys.add(payDocId.toLowerCase());
        seenEnquiryKeys.add(receiptNo.toLowerCase());

        const rawMode = String(p.paymentMode || "cash").toLowerCase();
        const resolvedMode = (rawMode === "cash" || rawMode.includes("hand")) ? "cash"
          : (rawMode === "pay_online" || rawMode === "upi" || rawMode === "online" || Boolean(p.upiNumber)) ? "upi"
          : rawMode === "dd" ? "dd"
          : rawMode === "cheque" ? "cheque"
          : "cash";

        const displayMode = resolvedMode === "cash" ? "Cash"
          : resolvedMode === "upi" ? "UPI"
          : resolvedMode === "dd" ? "DD"
          : resolvedMode === "cheque" ? "Cheque"
          : "Cash";

        const resolvedProg = enq.programme || (/pg|mba|mca|me/i.test(enq.department || "") ? "PG" : "UG");
        const resolvedDept = enq.department || enq.departmentName || "—";
        const resolvedBatch = deriveBatch(enq.batch, appNo, resolvedDept);
        const feeHead = p.feeCategory || (enq.status === "Admission" || enq.status === "Approved" ? "Admission Fee" : "Application Fee");
        const paymentDate = p.paymentDate || enq.enquiryDate || enq.admissionDate || enq.createdAt;
        const ay = enq.academicYear || getPaymentAcademicYear({ paymentDate, createdAt: paymentDate }, semesterConfigs) || "2026-2027";
        const studentName = enq.studentName || `${enq.firstName || ""} ${enq.lastName || ""}`.trim() || "Student";

        enquiryItems.push({
          id: payDocId,
          receiptNo,
          studentId: enqId,
          studentName,
          examNumber: appNo,
          department: resolvedDept,
          batch: resolvedBatch,
          programme: resolvedProg,
          semester: "All",
          feeHead,
          mode: displayMode,
          rawMode: rawMode,
          amount: amt,
          status: "active",
          paymentDate,
          academicYear: ay,
          isOnline: rawMode === "pay_online" || rawMode === "online" || rawMode === "gateway",
          isCoe: false,
          isApplicationFee: true,
          accountNo: "76980",
          accountName: "College Account #76980",
          accountShort: "#76980 College",
          refNo: p.upiNumber || appNo,
          remarks: `Admission Application (${feeHead}) - ${appNo}`,
          items: [{ head: feeHead, amount: amt }],
          rawRecord: { ...p, ...enq, receiptNo, amount: amt, feeHead, accountNo: "76980" }
        });
      });
    });

    const fullList = [...list, ...coeItems, ...enquiryItems];

    // Master deduplication pass across fullList
    const uniqueReceipts = [];
    const seenReceiptKeys = new Set();

    fullList.forEach(item => {
      const rNo = (item.receiptNo || "").trim().toLowerCase();
      const oId = (item.orderId || item.refNo || "").trim().toLowerCase();
      const regNo = (item.examNumber || item.studentId || item.studentName || "").trim().toLowerCase();
      const feeHead = (item.feeHead || "").trim().toLowerCase();
      const amt = Number(item.amount) || 0;

      const keysToCheck = [];
      if (rNo) keysToCheck.push(`r_${rNo}`);
      if (oId) keysToCheck.push(`o_${oId}`);
      if (regNo && feeHead && amt > 0) {
        keysToCheck.push(`comp_${regNo}_${feeHead}_${amt}`);
      }

      const duplicate = keysToCheck.some(k => seenReceiptKeys.has(k));
      if (duplicate) {
        // Enrich existing item if this one has better department or academic year
        const existing = uniqueReceipts.find(u =>
          (rNo && (u.receiptNo || "").trim().toLowerCase() === rNo) ||
          (oId && (u.orderId || u.refNo || "").trim().toLowerCase() === oId) ||
          (regNo && feeHead && amt > 0 &&
           (u.examNumber || u.studentId || u.studentName || "").trim().toLowerCase() === regNo &&
           (u.feeHead || "").trim().toLowerCase() === feeHead &&
           Number(u.amount) === amt)
        );
        if (existing) {
          if ((!existing.department || existing.department === "—" || existing.department.includes("_")) && item.department && item.department !== "—") {
            existing.department = displayDept(item.department);
          }
          if ((!existing.academicYear || existing.academicYear === "2026") && item.academicYear && item.academicYear !== "2026") {
            existing.academicYear = item.academicYear;
          }
        }
        return;
      }

      keysToCheck.forEach(k => seenReceiptKeys.add(k));
      item.department = displayDept(item.department);
      uniqueReceipts.push(item);
    });

    // Sort by date descending
    return uniqueReceipts.sort((a, b) => {
      const getTS = (x) => x.paymentDate || 0;
      const da = getTS(a).toDate ? getTS(a).toDate() : new Date(getTS(a));
      const db = getTS(b).toDate ? getTS(b).toDate() : new Date(getTS(b));
      return db - da;
    });
  }, [receipts, payments, semesterConfigs, studentLookup, eseRegistrations, eseFeePayments, photocopyApps, revaluationApps, reviewApps, examCellPayments, enquiriesList, userLookup]);

  // Smart Search Matcher for Receipts and Reports:
  // Resolves false-positive substring matches (e.g. searching candidate number "2026052" should ONLY show
  // student 2026052's records, NOT another student 2026053 whose enquiry receipt happened to embed "ENQ2026052").
  const filterReceiptsBySearch = useCallback((list, rawQuery) => {
    if (!rawQuery || !list || !list.length) return list || [];
    const q = rawQuery.trim().toLowerCase();
    if (!q) return list;

    // Check if query is an exact match for ANY candidate's roll / reg / exam / application number
    const hasExactCandidate = list.some(r => {
      const ids = [r.examNumber, r.regNo, r.rollNo, r.rawRecord?.applicationNo];
      return ids.some(id => id && String(id).trim().toLowerCase() === q);
    });

    if (hasExactCandidate) {
      // The user entered an exact candidate identifier (e.g., "2026052" or "420724106036"):
      // Strictly isolate to that specific candidate's fee records only.
      return list.filter(r => {
        const ids = [r.examNumber, r.regNo, r.rollNo, r.rawRecord?.applicationNo];
        return ids.some(id => id && String(id).trim().toLowerCase() === q);
      });
    }

    const isPureNumber = /^[0-9]+$/.test(q);

    return list.filter(r => {
      // 1. Candidate ID match (partial prefix or studentId/enquiryId exact)
      const c1 = (r.examNumber || "").toLowerCase();
      const c2 = (r.regNo || "").toLowerCase();
      const c3 = (r.rollNo || "").toLowerCase();
      const c4 = (r.studentId || "").toLowerCase();
      if (c1.includes(q) || c2.includes(q) || c3.includes(q) || c4 === q) return true;

      // 2. Student Name match
      if ((r.studentName || "").toLowerCase().includes(q)) return true;

      // 3. Receipt No match:
      // If query is pure numbers, do not do loose substring match on receipt strings (e.g. "REC-APP-ENQ2026052-1"
      // must NOT match "2026052" unless the token itself equals "2026052" or receipt equals "2026052").
      const rNo = (r.receiptNo || "").toLowerCase();
      if (rNo) {
        if (!isPureNumber) {
          if (rNo.includes(q)) return true;
        } else {
          if (rNo === q || rNo.endsWith(`-${q}`) || rNo.endsWith(`/${q}`)) {
            return true;
          }
          const tokens = rNo.split(/[-/_\s]+/);
          if (tokens.includes(q)) return true;
        }
      }

      // 4. Order ID / Ref / UTR / Txn No match
      if ((r.orderId || "").toLowerCase().includes(q)) return true;
      if ((r.refNo || "").toLowerCase().includes(q)) return true;

      // 5. Fee Head, Department, Remarks, Account No
      if ((r.feeHead || "").toLowerCase().includes(q)) return true;
      if ((r.department || "").toLowerCase().includes(q)) return true;
      if ((r.remarks || "").toLowerCase().includes(q)) return true;
      if ((r.accountNo || "").includes(q)) return true;
      if (String(r.amount || "") === q) return true;

      return false;
    });
  }, []);

  const filteredReceipts = useMemo(() => {
    let list = combinedReceiptList;
    if (receiptSearch) {
      list = filterReceiptsBySearch(list, receiptSearch);
    }
    return list.filter(r => {
      if (receiptDateFrom || receiptDateTo) {
        const rDate = r.paymentDate?.toDate?.() || new Date(r.paymentDate || 0);
        if (isNaN(rDate.getTime())) return false;
        if (receiptDateFrom) {
          const from = new Date(receiptDateFrom);
          from.setHours(0, 0, 0, 0);
          if (rDate < from) return false;
        }
        if (receiptDateTo) {
          const to = new Date(receiptDateTo);
          to.setHours(23, 59, 59, 999);
          if (rDate > to) return false;
        }
      }
      return true;
    });
  }, [combinedReceiptList, receiptSearch, receiptDateFrom, receiptDateTo, filterReceiptsBySearch]);

  // Reports Tab state in FeeOperations
  const [reportSearch, setReportSearch] = useState("");
  const [reportHeadFilter, setReportHeadFilter] = useState("");
  const [reportModeFilter, setReportModeFilter] = useState("");
  const [reportAyFilter, setReportAyFilter] = useState("");
  const [reportAccountFilter, setReportAccountFilter] = useState("ALL");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");

  const reportAcademicYears = useMemo(() => {
    const set = new Set();
    semesterConfigs.forEach(c => {
      if (c.academicYear && typeof c.academicYear === "string" && c.academicYear.trim()) {
        set.add(c.academicYear.trim());
      }
    });
    combinedReceiptList.forEach(r => {
      if (r.academicYear && typeof r.academicYear === "string" && r.academicYear.trim()) {
        set.add(r.academicYear.trim());
      }
    });
    return Array.from(set).sort().reverse();
  }, [semesterConfigs, combinedReceiptList]);

  const reportHeadOptions = useMemo(() => {
    const set = new Set();
    (feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS).forEach(h => {
      const name = h.name || h;
      if (name) set.add(name);
    });
    COE_FEE_HEADS.forEach(ch => set.add(ch));
    combinedReceiptList.forEach(r => {
      if (r.feeHead && typeof r.feeHead === "string" && r.feeHead.trim()) {
        set.add(r.feeHead.trim());
      }
    });
    return Array.from(set);
  }, [feeHeads, combinedReceiptList]);

  useEffect(() => {
    if (reportAcademicYears.length > 0 && !reportAyFilter) {
      setReportAyFilter(reportAcademicYears[0]);
    }
  }, [reportAcademicYears, reportAyFilter]);

  // Base reports data filtered by AY, Search, Head, Mode, Date (without Account filter)
  const baseReportsData = useMemo(() => {
    let list = combinedReceiptList;
    if (reportSearch) {
      list = filterReceiptsBySearch(list, reportSearch);
    }
    return list.filter(r => {
      if (reportAyFilter && reportAyFilter !== "ALL" && r.academicYear !== reportAyFilter) {
        return false;
      }
      if (reportHeadFilter && (r.feeHead || "").trim().toLowerCase() !== reportHeadFilter.trim().toLowerCase()) {
        return false;
      }
      if (reportModeFilter) {
        const itemMode = (r.rawMode || getPaymentMode(r.rawRecord || r)).toLowerCase();
        const filterVal = reportModeFilter.toLowerCase();
        const matchesMode = itemMode === filterVal ||
          (filterVal === "gateway" && (itemMode === "gateway" || (r.mode || "").toLowerCase().includes("gateway"))) ||
          (filterVal === "online" && (itemMode === "online" || itemMode === "gateway" || r.isOnline)) ||
          (filterVal === "dd" && (itemMode === "dd" || (r.mode || "").toLowerCase().includes("dd") || (r.mode || "").toLowerCase().includes("draft"))) ||
          (r.mode || "").toLowerCase() === filterVal;
        if (!matchesMode) return false;
      }
      if (reportDateFrom || reportDateTo) {
        const pDate = getPaymentDateObj(r.rawRecord || r);
        if (!pDate || isNaN(pDate.getTime())) return false;
        if (reportDateFrom) {
          const from = new Date(reportDateFrom);
          from.setHours(0, 0, 0, 0);
          if (pDate < from) return false;
        }
        if (reportDateTo) {
          const to = new Date(reportDateTo);
          to.setHours(23, 59, 59, 999);
          if (pDate > to) return false;
        }
      }
      return true;
    });
  }, [combinedReceiptList, reportAyFilter, reportSearch, reportHeadFilter, reportModeFilter, reportDateFrom, reportDateTo, filterReceiptsBySearch]);

  // Comprehensive Account-wise Split metrics computed over baseReportsData
  const accountReportStats = useMemo(() => {
    let collegeTotal = 0;
    let collegeCount = 0;
    let collegeGateway = 0;
    let collegeCounter = 0;

    let coeTotal = 0;
    let coeCount = 0;
    let coeGateway = 0;

    baseReportsData.forEach(r => {
      const amt = Number(r.amount) || 0;
      const isGateway = r.rawMode === "gateway" || (r.mode || "").toLowerCase().includes("smartgateway");
      const isCoe = r.isCoe || r.accountNo === "76983";

      if (isCoe) {
        coeTotal += amt;
        coeCount += 1;
        coeGateway += amt;
      } else {
        collegeTotal += amt;
        collegeCount += 1;
        if (isGateway) collegeGateway += amt;
        else collegeCounter += amt;
      }
    });

    const grandTotal = collegeTotal + coeTotal;
    const grandCount = collegeCount + coeCount;
    const grandGateway = collegeGateway + coeGateway;
    const grandCounter = collegeCounter;

    return {
      grandTotal,
      grandCount,
      grandGateway,
      grandCounter,
      collegeTotal,
      collegeCount,
      collegeGateway,
      collegeCounter,
      coeTotal,
      coeCount,
      coeGateway,
    };
  }, [baseReportsData]);

  // Final filtered reports data taking into account the selected Account tab/filter
  const filteredReportsData = useMemo(() => {
    if (!reportAccountFilter || reportAccountFilter === "ALL") {
      return baseReportsData;
    }
    return baseReportsData.filter(r => {
      const isCoe = r.isCoe || r.accountNo === "76983";
      if (reportAccountFilter === "76980") return !isCoe;
      if (reportAccountFilter === "76983") return isCoe;
      return true;
    });
  }, [baseReportsData, reportAccountFilter]);

  const reportTotalAmount = useMemo(() => {
    return filteredReportsData.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [filteredReportsData]);

  const handleExportReportsExcel = async () => {
    if (!filteredReportsData.length) {
      showToast("No report data to export", "error");
      return;
    }

    // Determine date range text
    let dateRangeStr = "All";
    if (reportDateFrom && reportDateTo) {
      dateRangeStr = `${formatExcelDate(reportDateFrom)} to ${formatExcelDate(reportDateTo)}`;
    } else if (reportDateFrom) {
      dateRangeStr = `From ${formatExcelDate(reportDateFrom)}`;
    } else if (reportDateTo) {
      dateRangeStr = `Up to ${formatExcelDate(reportDateTo)}`;
    } else {
      const dates = filteredReportsData
        .map(r => getPaymentDateObj(r.rawRecord || r))
        .filter(d => d && !isNaN(d.getTime()));
      if (dates.length > 0) {
        const minD = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
        dateRangeStr = minD.getTime() === maxD.getTime()
          ? formatExcelDate(minD)
          : `${formatExcelDate(minD)} to ${formatExcelDate(maxD)}`;
      }
    }

    // Determine payment mode text
    let modeDisplayStr = "All";
    if (reportModeFilter) {
      const mLow = reportModeFilter.toLowerCase();
      if (mLow === "gateway") modeDisplayStr = "hdfc smartgateway";
      else if (mLow === "dd") modeDisplayStr = "dd";
      else if (mLow === "upi") modeDisplayStr = "upi";
      else if (mLow === "cash") modeDisplayStr = "cash";
      else if (mLow === "online") modeDisplayStr = "online";
      else modeDisplayStr = reportModeFilter;
    }

    // Determine academic year text
    const ayDisplayStr = reportAyFilter && reportAyFilter !== "ALL"
      ? reportAyFilter.replace(/^AY\s*/i, "")
      : "All";

    // Dynamic fee head columns
    const canonicalOrder = [
      "Tuition Fee",
      "Other Fee",
      "Caution Deposit",
      "Admission Fee",
      "Exam Fee",
      "Placement Fee",
      "Bus Fee",
      "Hostel Fee"
    ];

    // 4 Fixed COE heads under "COE Breakup" (Exam Cell Account #76983)
    const coeHeadDefs = [
      { key: "ESE registration Fee", colName: "ESE REGISTRATION FEE", width: 24 },
      { key: "Photocopy Fee", colName: "PHOTOCOPY FEE", width: 18 },
      { key: "Revaluation Fee", colName: "REVALUATION FEE", width: 18 },
      { key: "Review Fee", colName: "REVIEW FEE", width: 16 }
    ];

    // Institutional fee heads under "Heads Breakup" (excluding COE heads)
    const presentHeadsSet = new Set(
      filteredReportsData
        .map(r => r.feeHead)
        .filter(Boolean)
        .filter(h => !coeHeadDefs.some(ch => ch.key.toLowerCase() === h.toLowerCase()))
    );

    const distinctInstHeads = Array.from(presentHeadsSet).sort((a, b) => {
      const ia = canonicalOrder.findIndex(c => c.toLowerCase() === a.toLowerCase());
      const ib = canonicalOrder.findIndex(c => c.toLowerCase() === b.toLowerCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    if (!distinctInstHeads.length) {
      distinctInstHeads.push("Tuition Fee", "Other Fee");
    }

    const formatFeeHeadColName = (headName) => {
      const upper = String(headName).trim().toUpperCase();
      if (upper === "TUITION FEE") return "TUITION FEES";
      if (upper === "OTHER FEE") return "OTHER FEES";
      if (upper === "ADMISSION FEE") return "ADMISSION FEES";
      return upper;
    };

    const isSemWiseHead = (headName) => {
      if (!headName) return false;
      const st = headSplitTypes[headName];
      if (st === "semester") return true;
      const cfg = feeConfigs.find(f => (f.head || f.feeHead)?.toLowerCase() === headName.toLowerCase());
      if (cfg?.splitType === "semester" || (cfg?.semester && cfg.semester !== "All")) return true;
      const lower = headName.toLowerCase();
      if (lower.includes("exam") || lower.includes("sem fee") || lower.includes("semester")) return true;
      return false;
    };

    // Column Order:
    // 1: S.No
    // 2: Register No
    // 3: Student (Next to Register No)
    // 4: Payment Mode (Next to Student)
    // 5: Batch
    // 6: Year (Roman numeral next to Batch)
    // 7: instalment (AY/Sem)
    // 8: Department
    // 9: Transaction Date
    // 10: Transaction No
    // 11-14: COE Breakup (ESE REGISTRATION FEE, PHOTOCOPY FEE, REVALUATION FEE, REVIEW FEE)
    // 15+: Heads Breakup (Institutional fee heads)
    // Last: Total Amount
    const baseHeaders = [
      "S.No",
      "Register No",
      "Student",
      "Payment Mode",
      "Batch",
      "Year",
      "instalment (AY/Sem)",
      "Department",
      "Transaction Date",
      "Transaction No"
    ];
    const coeHeadCols = coeHeadDefs.map(c => c.colName);
    const instHeadCols = distinctInstHeads.map(formatFeeHeadColName);
    const headers = [...baseHeaders, ...coeHeadCols, ...instHeadCols, "Total Amount"];
    const totalCols = headers.length;
    const grandTotalAmt = filteredReportsData.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CKCET Autonomous ERP";
    workbook.lastModifiedBy = "CKCET Accounts & Finance";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet("Collection Report", {
      views: [
        {
          state: "frozen",
          xSplit: 0,
          ySplit: 9, // Freeze rows 1-9 so table header stays pinned during scroll!
          activeCell: "A10",
          showGridLines: true
        }
      ],
      pageSetup: {
        paperSize: 9, // A4
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      }
    });

    // ── Pre-calculate Column Widths & Mathematical Center for Logo ──
    const colWidths = [
      8,   // 1: S.No
      18,  // 2: Register No
      28,  // 3: Student
      22,  // 4: Payment Mode
      14,  // 5: Batch
      10,  // 6: Year
      22,  // 7: instalment (AY/Sem)
      38,  // 8: Department
      16,  // 9: Transaction Date
      34,  // 10: Transaction No
      ...coeHeadDefs.map(c => c.width || 22),
      ...distinctInstHeads.map(() => 18),
      20   // Total Amount
    ];

    const pxPerChar = 7.8;
    const totalSheetWidthPx = colWidths.reduce((sum, w) => sum + (w * pxPerChar), 0);
    const logoImgWidth = 550;
    const logoImgHeight = 58;
    const targetStartPx = Math.max(0, (totalSheetWidthPx - logoImgWidth) / 2);

    let accumPx = 0;
    let startColIndex = 0;
    for (let c = 0; c < colWidths.length; c++) {
      const colPx = colWidths[c] * pxPerChar;
      if (accumPx + colPx >= targetStartPx) {
        const remainder = targetStartPx - accumPx;
        startColIndex = c + (remainder / colPx);
        break;
      }
      accumPx += colPx;
    }

    // ── Row 1–3: Centered Institution Logo Banner (No redundant text) ──
    worksheet.getRow(1).height = 22;
    worksheet.getRow(2).height = 22;
    worksheet.getRow(3).height = 18;
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= totalCols; c++) {
        worksheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      }
    }

    let hasLogo = false;
    try {
      const resp = await fetch("/logo.png");
      if (resp.ok) {
        const blob = await resp.blob();
        const base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (base64Data) {
          const imageId = workbook.addImage({
            base64: base64Data,
            extension: "png"
          });
          worksheet.addImage(imageId, {
            tl: { col: startColIndex, row: 0.1 },
            ext: { width: logoImgWidth, height: logoImgHeight }
          });
          hasLogo = true;
        }
      }
    } catch (err) {
      console.warn("Could not load /logo.png for Excel export:", err);
    }

    // Fallback only if logo image failed to load
    if (!hasLogo) {
      worksheet.mergeCells(1, 1, 1, totalCols);
      const colNameCell = worksheet.getCell(1, 1);
      colNameCell.value = "C.K. COLLEGE OF ENGINEERING & TECHNOLOGY";
      colNameCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF120C7A" } };
      colNameCell.alignment = { horizontal: "center", vertical: "middle" };

      worksheet.mergeCells(2, 1, 2, totalCols);
      const colAffCell = worksheet.getCell(2, 1);
      colAffCell.value = "(An Autonomous Institution | Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai)";
      colAffCell.font = { name: "Segoe UI", size: 9, bold: false, color: { argb: "FF475569" } };
      colAffCell.alignment = { horizontal: "center", vertical: "middle" };

      worksheet.mergeCells(3, 1, 3, totalCols);
      const colAddrCell = worksheet.getCell(3, 1);
      colAddrCell.value = "Jayaram Nagar, Chellangkuppam, Cuddalore, Tamil Nadu 607003";
      colAddrCell.font = { name: "Segoe UI", size: 8.5, italic: true, color: { argb: "FF64748B" } };
      colAddrCell.alignment = { horizontal: "center", vertical: "middle" };
    }

    // ── Row 4: Executive Report Title Bar ──
    const row4 = worksheet.getRow(4);
    row4.height = 28;
    worksheet.mergeCells(4, 1, 4, totalCols);
    const titleCell = worksheet.getCell(4, 1);
    titleCell.value = "FEE HEAD-WISE COLLECTION & AUDIT RECONCILIATION REPORT";
    titleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF120C7A" } };

    // ── Rows 5 & 6: Executive Metadata Summary Card ──
    worksheet.getRow(5).height = 20;
    worksheet.getRow(6).height = 20;

    const accountDisplayName = reportAccountFilter === "76980"
      ? "College Account #76980 Only"
      : reportAccountFilter === "76983"
        ? "Exam Cell Account #76983 Only"
        : "All Accounts (#76980 College & #76983 COE Consolidated)";

    // Style function for metadata cells
    const setMetaRow = (rNum, cells) => {
      cells.forEach(({ sCol, eCol, label, val, isHighlight, isBold }) => {
        if (eCol > sCol) worksheet.mergeCells(rNum, sCol, rNum, eCol);
        const cell = worksheet.getCell(rNum, sCol);
        cell.value = `${label ? label + " " : ""}${val || "—"}`;
        cell.font = {
          name: "Segoe UI",
          size: isHighlight ? 10 : 9,
          bold: Boolean(label || isBold || isHighlight),
          color: { argb: isHighlight ? "FF065F46" : (label ? "FF334155" : "FF0F172A") }
        };
        cell.alignment = { horizontal: "left", vertical: "middle" };
      });
      // Fill background for row
      for (let c = 1; c <= totalCols; c++) {
        const cell = worksheet.getCell(rNum, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    };

    setMetaRow(5, [
      { sCol: 1, eCol: 4, label: "Report Period :", val: dateRangeStr },
      { sCol: 5, eCol: 6, label: "Academic Year :", val: ayDisplayStr },
      { sCol: 7, eCol: 9, label: "Payment Mode :", val: modeDisplayStr },
      { sCol: 10, eCol: totalCols, label: "Account Scope :", val: accountDisplayName, isBold: true }
    ]);

    const generatedTimestamp = `${formatExcelDate(new Date())} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    setMetaRow(6, [
      { sCol: 1, eCol: 4, label: "Generated On :", val: generatedTimestamp },
      { sCol: 5, eCol: 6, label: "Programme :", val: "All Programmes" },
      { sCol: 7, eCol: 9, label: "Total Transactions :", val: `${filteredReportsData.length} entries` },
      { sCol: 10, eCol: totalCols, label: "Total Collection :", val: `₹ ${grandTotalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, isHighlight: true }
    ]);

    // Border across metadata box
    for (let c = 1; c <= totalCols; c++) {
      worksheet.getCell(5, c).border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: c === 1 ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined,
        right: c === totalCols ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined
      };
      worksheet.getCell(6, c).border = {
        bottom: { style: "medium", color: { argb: "FF94A3B8" } },
        left: c === 1 ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined,
        right: c === totalCols ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined
      };
    }

    // Row 7: Blank spacer row
    worksheet.getRow(7).height = 10;

    // ── Row 8: Tier 1 Section Headers ──
    const row8 = worksheet.getRow(8);
    row8.height = 26;

    // A. Cols 1 to 10: Transaction & Candidate Details
    worksheet.mergeCells(8, 1, 8, 10);
    const candGrpCell = worksheet.getCell(8, 1);
    candGrpCell.value = "TRANSACTION & CANDIDATE DETAILS";
    candGrpCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    candGrpCell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= 10; c++) {
      const cell = worksheet.getCell(8, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; // Slate 800
      cell.border = {
        top: { style: "thin", color: { argb: "FF475569" } },
        left: { style: "thin", color: { argb: "FF475569" } },
        bottom: { style: "thin", color: { argb: "FF475569" } },
        right: { style: "thin", color: { argb: "FF475569" } }
      };
    }

    // B. Cols 11 to 14: COE Breakup (A/C #76983)
    const coeStartCol = 11;
    const coeEndCol = 14;
    worksheet.mergeCells(8, coeStartCol, 8, coeEndCol);
    const coeBreakupCell = worksheet.getCell(8, coeStartCol);
    coeBreakupCell.value = "COE BREAKUP (A/C #76983 - EXAM CELL)";
    coeBreakupCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    coeBreakupCell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = coeStartCol; c <= coeEndCol; c++) {
      const cell = worksheet.getCell(8, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } }; // Deep Indigo
      cell.border = {
        top: { style: "thin", color: { argb: "FF4338CA" } },
        left: { style: "thin", color: { argb: "FF4338CA" } },
        bottom: { style: "thin", color: { argb: "FF4338CA" } },
        right: { style: "thin", color: { argb: "FF4338CA" } }
      };
    }

    // C. Cols 15 to (14 + distinctInstHeads.length): Institutional Heads Breakup (A/C #76980)
    const instStartCol = 15;
    const instEndCol = 14 + distinctInstHeads.length;
    if (distinctInstHeads.length > 1) {
      worksheet.mergeCells(8, instStartCol, 8, instEndCol);
    }
    const instBreakupCell = worksheet.getCell(8, instStartCol);
    instBreakupCell.value = "INSTITUTIONAL HEADS BREAKUP (A/C #76980 - COLLEGE)";
    instBreakupCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    instBreakupCell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = instStartCol; c <= instEndCol; c++) {
      const cell = worksheet.getCell(8, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } }; // Deep Blue
      cell.border = {
        top: { style: "thin", color: { argb: "FF2563EB" } },
        left: { style: "thin", color: { argb: "FF2563EB" } },
        bottom: { style: "thin", color: { argb: "FF2563EB" } },
        right: { style: "thin", color: { argb: "FF2563EB" } }
      };
    }

    // D. Last Column: Total Amount (Vertical merge across Row 8 & 9)
    const totalColIdx = 15 + distinctInstHeads.length;
    worksheet.mergeCells(8, totalColIdx, 9, totalColIdx);
    const totalHdrCell = worksheet.getCell(8, totalColIdx);
    totalHdrCell.value = "TOTAL AMOUNT (₹)";
    totalHdrCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    totalHdrCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    [8, 9].forEach(r => {
      const cell = worksheet.getCell(r, totalColIdx);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } }; // Deep Emerald
      cell.border = {
        top: { style: "thin", color: { argb: "FF047857" } },
        left: { style: "thin", color: { argb: "FF047857" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        right: { style: "thin", color: { argb: "FF047857" } }
      };
    });

    // ── Row 9: Tier 2 Column Sub-headers ──
    const row9 = worksheet.getRow(9);
    row9.height = 28;

    headers.forEach((h, idx) => {
      const colNum = idx + 1;
      if (colNum === totalColIdx) return; // Already merged vertically with Row 8

      const cell = row9.getCell(colNum);
      cell.value = h;
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      const isCenter = h === "S.No" || h === "Year" || h === "Transaction Date" || h === "Batch";
      const isNum = coeHeadCols.includes(h) || instHeadCols.includes(h);
      cell.alignment = {
        vertical: "middle",
        horizontal: isCenter ? "center" : (isNum ? "right" : "left"),
        wrapText: true
      };

      // Color coding per section
      if (colNum <= 10) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }; // Slate 700
      } else if (colNum <= 14) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } }; // Indigo 700
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; // Blue 600
      }

      cell.border = {
        top: { style: "thin", color: { argb: "FF64748B" } },
        left: { style: "thin", color: { argb: "FF64748B" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        right: { style: "thin", color: { argb: "FF64748B" } }
      };
    });

    // ── Data Rows (Row 10 onwards) with Zebra Striping ──
    filteredReportsData.forEach((r, i) => {
      const rowNum = 10 + i;
      const row = worksheet.getRow(rowNum);
      row.height = 22;

      const isEven = i % 2 === 0;
      const rowBgColor = isEven ? "FFFFFFFF" : "FFF8FAFC"; // Crisp White vs Soft Slate 50
      const rowFill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBgColor } };

      const sIdKey = (r.studentId || "").trim().toLowerCase();
      const exKey = (r.examNumber || "").trim().toLowerCase();
      const nameKey = (r.studentName || "").trim().toLowerCase();
      const matchedStudent =
        (sIdKey ? studentLookup.get(sIdKey) : null) ||
        (exKey ? studentLookup.get(exKey) : null) ||
        (nameKey ? studentLookup.get(nameKey) : null);

      const regNo = (r.examNumber && r.examNumber !== "—")
        ? r.examNumber
        : (matchedStudent?.regNo || matchedStudent?.registerNumber || matchedStudent?.examNumber || "—");

      // Professional formatted payment mode
      let modeFormatted = "Online";
      const rawMode = (r.rawMode || r.mode || getPaymentMode(r.rawRecord || r) || "").toLowerCase();
      if (rawMode.includes("smartgateway") || rawMode.includes("gateway") || r.isOnline || r.isCoe) {
        modeFormatted = "HDFC SmartGateway";
      } else if (rawMode.includes("dd")) {
        modeFormatted = "Demand Draft (DD)";
      } else if (rawMode.includes("upi")) {
        modeFormatted = "UPI Payment";
      } else if (rawMode.includes("cash")) {
        modeFormatted = "Cash (Counter)";
      } else if (rawMode.includes("cheque")) {
        modeFormatted = "Cheque";
      } else {
        modeFormatted = (r.mode || "Online");
      }

      // Student name (avoid raw email addresses)
      let studentName = (r.studentName || matchedStudent?.displayName || matchedStudent?.studentName || "Student").toString().trim();
      if (studentName.includes("@") && matchedStudent) {
        studentName = matchedStudent.displayName || matchedStudent.studentName || studentName;
      }
      studentName = studentName.toUpperCase();

      const dept = displayDept(r.department || matchedStudent?.department || "—");
      const batch = deriveBatch(r.batch || matchedStudent?.batch, regNo, dept);

      // Year column (Roman numeral: I, II, III, IV)
      const recordAy = r.academicYear || reportAyFilter || "2026-2027";
      const studyYear = deriveStudyYear(batch, recordAy);

      // Installment (AY/Sem) logic
      const cleanAy = (r.academicYear || "2026-2027").replace(/^AY\s*/i, "").trim();
      let installmentText = cleanAy;
      if (isSemWiseHead(r.feeHead) || r.isCoe) {
        const semNum = r.semester || r.sem || r.rawRecord?.semester || r.rawRecord?.sem || matchedStudent?.semester || matchedStudent?.currentSemester || "";
        if (semNum) {
          const semLabel = String(semNum).toLowerCase().startsWith("sem") ? semNum : `Sem ${semNum}`;
          installmentText = `${cleanAy} / ${semLabel}`;
        }
      }

      const pDate = getPaymentDateObj(r.rawRecord || r);
      const dateFormatted = formatExcelDate(pDate);
      const isGatewayMode = modeFormatted === "HDFC SmartGateway" || r.isOnline || !!r.rawRecord?.hdfcOrderId || r.isCoe;
      const nonGatewayRef = r.refNo || r.remarks || r.rawRecord?.refNo || r.rawRecord?.remarks;
      const txnNo = isGatewayMode
        ? (r.rawRecord?.orderId || r.orderId || r.rawRecord?.transactionId || r.rawRecord?.receiptNo || r.rawRecord?.gatewayResponse?.epgTxnId || r.id || "—")
        : (nonGatewayRef || "—");
      const amt = Number(r.amount) || 0;

      // Col 1: S.No
      const c1 = row.getCell(1);
      c1.value = i + 1;
      c1.alignment = { horizontal: "center", vertical: "middle" };
      c1.font = { name: "Segoe UI", size: 9, color: { argb: "FF64748B" } };

      // Col 2: Register No
      const c2 = row.getCell(2);
      c2.value = regNo;
      c2.alignment = { horizontal: "center", vertical: "middle" };
      c2.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };

      // Col 3: Student
      const c3 = row.getCell(3);
      c3.value = studentName;
      c3.alignment = { horizontal: "left", vertical: "middle" };
      c3.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF1E293B" } };

      // Col 4: Payment Mode
      const c4 = row.getCell(4);
      c4.value = modeFormatted;
      c4.alignment = { horizontal: "left", vertical: "middle" };
      c4.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

      // Col 5: Batch
      const c5 = row.getCell(5);
      c5.value = batch;
      c5.alignment = { horizontal: "center", vertical: "middle" };
      c5.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

      // Col 6: Year (Roman numeral)
      const c6 = row.getCell(6);
      c6.value = studyYear;
      c6.alignment = { horizontal: "center", vertical: "middle" };
      c6.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };

      // Col 7: Instalment (AY/Sem)
      const c7 = row.getCell(7);
      c7.value = installmentText;
      c7.alignment = { horizontal: "center", vertical: "middle" };
      c7.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

      // Col 8: Department
      const c8 = row.getCell(8);
      c8.value = dept;
      c8.alignment = { horizontal: "left", vertical: "middle" };
      c8.font = { name: "Segoe UI", size: 9, color: { argb: "FF1E293B" } };

      // Col 9: Transaction Date
      const c9 = row.getCell(9);
      c9.value = dateFormatted;
      c9.alignment = { horizontal: "center", vertical: "middle" };
      c9.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

      // Col 10: Transaction No
      const c10 = row.getCell(10);
      c10.value = txnNo;
      c10.alignment = { horizontal: "left", vertical: "middle" };
      c10.font = { name: "Consolas", size: 8.5, color: { argb: "FF475569" } };

      // COE Breakup cells (Cols 11-14)
      coeHeadDefs.forEach((cDef, cIdx) => {
        const cell = row.getCell(11 + cIdx);
        if ((r.feeHead || "").trim().toLowerCase() === cDef.key.trim().toLowerCase()) {
          cell.value = amt;
          cell.numFmt = "#,##0.00";
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF1E1B4B" } };
        } else {
          cell.value = "—";
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
        }
      });

      // Institutional Heads Breakup cells (Cols 15+)
      distinctInstHeads.forEach((h, hIdx) => {
        const cell = row.getCell(15 + hIdx);
        if ((r.feeHead || "").trim().toLowerCase() === h.trim().toLowerCase()) {
          cell.value = amt;
          cell.numFmt = "#,##0.00";
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
        } else {
          cell.value = "—";
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
        }
      });

      // Total Amount cell
      const totalCell = row.getCell(totalColIdx);
      totalCell.value = amt;
      totalCell.numFmt = "#,##0.00";
      totalCell.alignment = { horizontal: "right", vertical: "middle" };
      totalCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF065F46" } };

      // Apply row fills and crisp borders
      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        if (c === totalColIdx) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? "FFF0FDF4" : "FFDCFCE7" } };
        } else {
          cell.fill = rowFill;
        }
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      }
    });

    // ── Grand Total Row ──
    const totalRowIndex = 10 + filteredReportsData.length;
    const totalRow = worksheet.getRow(totalRowIndex);
    totalRow.height = 26;

    // Merge Cols 1 to 10 for label
    worksheet.mergeCells(totalRowIndex, 1, totalRowIndex, 10);
    const gLabelCell = totalRow.getCell(1);
    gLabelCell.value = "GRAND TOTAL COLLECTION (ALL ACCOUNTS)";
    gLabelCell.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    gLabelCell.alignment = { horizontal: "right", vertical: "middle" };
    for (let c = 1; c <= 10; c++) {
      totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    }

    // COE Head Sums (Cols 11-14)
    coeHeadDefs.forEach((cDef, cIdx) => {
      const sum = filteredReportsData
        .filter(r => (r.feeHead || "").trim().toLowerCase() === cDef.key.trim().toLowerCase())
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      const cell = totalRow.getCell(11 + cIdx);
      if (sum > 0) {
        cell.value = sum;
        cell.numFmt = "#,##0.00";
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.value = "—";
        cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E1B4B" } };
    });

    // Institutional Head Sums (Cols 15+)
    distinctInstHeads.forEach((h, hIdx) => {
      const sum = filteredReportsData
        .filter(r => (r.feeHead || "").trim().toLowerCase() === h.trim().toLowerCase())
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      const cell = totalRow.getCell(15 + hIdx);
      if (sum > 0) {
        cell.value = sum;
        cell.numFmt = "#,##0.00";
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.value = "—";
        cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    });

    // Total Amount sum
    const grandCell = totalRow.getCell(totalColIdx);
    grandCell.value = grandTotalAmt;
    grandCell.numFmt = "#,##0.00";
    grandCell.font = { name: "Segoe UI", size: 11.5, bold: true, color: { argb: "FFFFFFFF" } };
    grandCell.alignment = { horizontal: "right", vertical: "middle" };
    grandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } }; // Rich Emerald

    for (let c = 1; c <= totalCols; c++) {
      totalRow.getCell(c).border = {
        top: { style: "medium", color: { argb: "FFCBD5E1" } },
        bottom: { style: "double", color: { argb: "FF000000" } }, // Official GAAP Accounting Double Line
        left: { style: "thin", color: { argb: "FF334155" } },
        right: { style: "thin", color: { argb: "FF334155" } }
      };
    }

    // ── Audit Footer Note ──
    const footerRowIdx = totalRowIndex + 2;
    worksheet.getRow(footerRowIdx).height = 18;
    worksheet.mergeCells(footerRowIdx, 1, footerRowIdx, totalCols);
    const footerCell = worksheet.getCell(footerRowIdx, 1);
    footerCell.value = `* CONFIDENTIAL RECORD • Generated from CKCET Autonomous ERP System on ${formatExcelDate(new Date())} • Official Accounts & Audit Reconciliation Copy`;
    footerCell.font = { name: "Segoe UI", size: 8.5, italic: true, color: { argb: "FF64748B" } };
    footerCell.alignment = { horizontal: "left", vertical: "middle" };

    // ── Enable Excel Native Auto-Filter on Table Headers ──
    worksheet.autoFilter = {
      from: { row: 9, column: 1 },
      to: { row: 9, column: totalCols }
    };

    // ── Professional Column Widths ──
    worksheet.getColumn(1).width = 8;   // S.No
    worksheet.getColumn(2).width = 18;  // Register No
    worksheet.getColumn(3).width = 28;  // Student
    worksheet.getColumn(4).width = 22;  // Payment Mode
    worksheet.getColumn(5).width = 14;  // Batch
    worksheet.getColumn(6).width = 10;  // Year
    worksheet.getColumn(7).width = 22;  // instalment (AY/Sem)
    worksheet.getColumn(8).width = 38;  // Department (wide enough for long titles)
    worksheet.getColumn(9).width = 16;  // Transaction Date
    worksheet.getColumn(10).width = 34; // Transaction No (wide enough for order IDs)
    // COE Heads (Cols 11-14)
    coeHeadDefs.forEach((cDef, idx) => {
      worksheet.getColumn(11 + idx).width = 22;
    });
    // Institutional Heads (Cols 15+)
    distinctInstHeads.forEach((_, idx) => {
      worksheet.getColumn(15 + idx).width = 18;
    });
    // Total Amount
    worksheet.getColumn(totalColIdx).width = 20;

    // Trigger browser file download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateLabel = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `Fee_Headwise_Collection_Report_${dateLabel}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Fee Headwise Collection Report exported successfully to Excel");
  };

  const tabs = [
    { id: "structure", label: "Fee Structure", icon: Building2 },
    { id: "collect", label: "Collect Payment", icon: IndianRupee },
    { id: "receipts", label: "Receipts", icon: FileText },
    { id: "concessions", label: "Concessions", icon: Percent },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "transport", label: "Transport Configuration", icon: Bus },
  ];

  return (
    <Layout title="Fee Operations">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      <div className="no-print p-3 sm:p-4 md:p-6 w-full space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200 w-fit">
            {tabs.map(t => (
              <button key={t.id} onClick={() => handleTabChange(t.id)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setRecoveryOrderId("");
              setRecoveryResult(null);
              setShowRecoveryModal(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 hover:from-blue-800 hover:to-indigo-950 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer ml-auto"
            title="Independently query HDFC SmartGateway and recover missing or unconfirmed payment"
          >
            <ShieldCheck size={15} />
            <span>Verify / Recover Payment</span>
          </button>
        </div>

        {/* TAB 1: Fee Structure */}
        {tab === "structure" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <select value={feeFilter.programme} onChange={e => setFeeFilter({ ...feeFilter, programme: e.target.value, department: "", batch: "", academicYear: "" })}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">All Programmes</option>
                {filterOptions.programmes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={feeFilter.department} onChange={e => setFeeFilter({ ...feeFilter, department: e.target.value, batch: "", academicYear: "" })}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">All Departments</option>
                {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={feeFilter.batch} onChange={e => setFeeFilter({ ...feeFilter, batch: e.target.value, academicYear: "" })}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">All Batches</option>
                {filterOptions.batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={feeFilter.academicYear} onChange={e => setFeeFilter({ ...feeFilter, academicYear: e.target.value })}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">All Academic Years</option>
                {filterOptions.academicYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {Object.values(feeFilter).some(v => v) && (
                <button onClick={() => setFeeFilter({ programme: "", department: "", batch: "", academicYear: "" })}
                  className="px-3 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-600">
                  ✕ Clear
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNetkampusModal(true);
                    setNetkampusTab("template");
                  }}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-purple-200 shadow-sm cursor-pointer"
                  title="Bulk upload prior student fee payments settled via Netkampus / UPI before ERP rollout"
                >
                  <UploadCloud size={14} className="text-purple-700" />
                  Bulk Fee Upload (Netkampus)
                  {netkampusSettlements.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-purple-200 text-purple-900 text-[10px] font-extrabold rounded-full">
                      {netkampusSettlements.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOpeningDuesModal(true);
                    setOpeningDuesTab("template");
                  }}
                  className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-amber-200 shadow-sm cursor-pointer"
                  title="Download batch-wise Excel template and import previous academic year dues"
                >
                  <FileSpreadsheet size={14} className="text-amber-700" />
                  Import Previous Dues (Excel)
                  {openingDues.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-amber-200 text-amber-900 text-[10px] font-extrabold rounded-full">
                      {openingDues.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowScholarshipSettlementModal(true)}
                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-emerald-200 shadow-sm cursor-pointer"
                  title="Direct Government Scholarship Settlement (FG / PMSS / 7.5% Quota)"
                >
                  <Landmark size={14} className="text-emerald-700" />
                  <span>Direct Scholarship Settlement</span>
                </button>
                <button onClick={() => setShowHeadModal(true)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-zinc-200">
                  <Tags size={14} /> Manage Fee Heads
                </button>
                <button onClick={() => { setEditFeeId(null); setFeeForm({ programme: "", batch: "", academicYear: "", semester: "", department: "", quota: "", studentCategory: "", head: "", amount: "" }); setShowFeeModal(true); }}
                  className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
                  <Plus size={14} /> Add Fee Entry
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-zinc-50">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Programme</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Dept</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Batch</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Academic Year</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Sem</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Fee Head</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase border border-zinc-200">Quota</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right border border-zinc-200">Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center border border-zinc-200">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredFeeConfigs.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-zinc-400 text-sm border border-zinc-200">{feeConfigs.length === 0 ? "No fee structures configured. Add your first fee entry." : "No entries match the selected filters."}</td></tr>
                    ) : groupedRows.flatMap((group) => {
                      const totalRows = group.yearGroups.reduce((s, yg) => s + yg.headGroups.reduce((h, hg) => h + hg.rows.length, 0), 0);
                      let batchRowIdx = 0;
                      return group.yearGroups.flatMap((yg) => {
                        const yearRows = yg.headGroups.reduce((s, hg) => s + hg.rows.length, 0);
                        let yearRowIdx = 0;
                        return yg.headGroups.flatMap((hg) => hg.rows.map((f, idx) => {
                          const isFirstBatchRow = batchRowIdx === 0;
                          const isFirstYearRow = yearRowIdx === 0;
                          const isFirstHeadRow = idx === 0;
                          const tr = (
                            <tr key={f.id || `${group.key}_${yg.key}_${hg.head}_${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                              {isFirstBatchRow ? (
                                <>
                                  <td className="px-4 py-3 text-sm font-medium text-zinc-700 align-middle border border-zinc-200" rowSpan={totalRows}>{f.programme}</td>
                                  <td className="px-4 py-3 text-sm text-zinc-600 align-middle border border-zinc-200" rowSpan={totalRows}>{f.department || "All"}</td>
                                  <td className="px-4 py-3 text-sm text-zinc-600 align-middle border border-zinc-200" rowSpan={totalRows}>{f.batch}</td>
                                </>
                              ) : null}
                              {isFirstYearRow ? (
                                <td className="px-4 py-3 text-sm text-zinc-600 align-middle border border-zinc-200" rowSpan={yearRows}>{yg.academicYear || "—"}</td>
                              ) : null}
                              <td className="px-4 py-3 text-sm text-zinc-600 border border-zinc-200">{f.semester}</td>
                              {isFirstHeadRow ? (
                                <td className="px-4 py-3 border border-zinc-200 align-middle" rowSpan={hg.rows.length}><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold">{hg.head}</span></td>
                              ) : null}
                              <td className="px-4 py-3 text-sm text-zinc-600 border border-zinc-200">{f.quota || "All"}</td>
                              <td className="px-4 py-3 text-right text-sm font-black text-zinc-800 border border-zinc-200">₹{(f.amount || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center border border-zinc-200">
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => { setEditFeeId(f.id); setFeeForm(f); setShowFeeModal(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Edit3 size={14} /></button>
                                  <button onClick={async () => { try { await deleteDoc(doc(db, "fee_configurations", f.id)); showToast("Deleted"); } catch (e) { showToast("Error", "error"); } }} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                          batchRowIdx++;
                          yearRowIdx++;
                          return tr;
                        }));
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Collect Payment */}
        {tab === "collect" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Student Search */}
            <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <button
                type="button"
                onClick={() => setShowScholarshipSettlementModal(true)}
                className="w-full mb-2.5 px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Landmark size={15} className="text-amber-300" />
                  <span>Govt Scholarship Settlement</span>
                </span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                  FG / PMSS
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowNetkampusModal(true);
                  setNetkampusTab("template");
                }}
                className="w-full mb-4 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs transition-all cursor-pointer"
                title="Bulk upload prior student fee payments settled via Netkampus / UPI"
              >
                <span className="flex items-center gap-2">
                  <UploadCloud size={14} className="text-purple-700" />
                  <span>Bulk Fee Upload (Netkampus)</span>
                </span>
                <span className="text-[10px] bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full font-black">
                  Prior
                </span>
              </button>

              <h3 className="font-bold text-sm text-zinc-700 mb-4 flex items-center gap-2"><Search size={16} /> Search Student</h3>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search by reg no, name, or email..."
                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                {studentSearch && (
                  <button onClick={() => { setStudentSearch(""); setSelectedStudent(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {filteredStudents.map(s => (
                  <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentSearch(s.displayName || s.studentName || s.regNo || ""); }}
                    className={`w-full text-left p-3 rounded-xl transition-all text-sm flex items-center gap-3 ${selectedStudent?.id === s.id ? 'bg-[#120c7a]/5 border border-[#120c7a]/20' : 'hover:bg-zinc-50 border border-transparent'}`}>
                    <div className="w-9 h-9 bg-[#120c7a]/10 rounded-xl flex items-center justify-center text-[#120c7a] font-bold text-xs shrink-0">
                      {(s.displayName || s.studentName || "S").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-700 truncate text-sm">{s.displayName || s.studentName || "—"}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">{s.regNo || s.examNumber || "—"}</p>
                      <p className="text-[9px] text-zinc-300 truncate">{s.programme || ""} {s.department ? `• ${displayDept(s.department)}` : ""}</p>
                    </div>
                  </button>
                ))}
                {studentSearch && filteredStudents.length === 0 && <p className="text-xs text-zinc-400 text-center py-6">No students found</p>}
                {!studentSearch && <p className="text-xs text-zinc-400 text-center py-6">Type to search for a student</p>}
              </div>
            </div>

            {/* Right panel */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-5">
              {!selectedStudent ? (
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-12 text-center">
                  <Users size={48} className="mx-auto mb-4 text-zinc-200" />
                  <p className="text-sm font-bold text-zinc-400">Select a student to view fee details</p>
                  <p className="text-xs text-zinc-300 mt-1">Search by register number, name, or email</p>
                </div>
              ) : (
                <>
                  {/* Student Info Card */}
                  <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#120c7a]/10 rounded-2xl flex items-center justify-center text-[#120c7a] font-bold text-lg">
                        {(selectedStudent.displayName || selectedStudent.studentName || "S").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-zinc-800">{selectedStudent.displayName || selectedStudent.studentName || "—"}</h3>
                        <p className="text-xs text-zinc-400">Reg: <span className="font-mono font-bold text-[#120c7a]">{selectedStudent.regNo || selectedStudent.examNumber || "—"}</span></p>
                      </div>
                      <div className="flex gap-4 text-right items-center">
                        <div>
                          <p className="text-[9px] text-zinc-400 uppercase">Programme</p>
                          <p className="text-xs font-bold text-zinc-600">{selectedStudent.programme || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-zinc-400 uppercase">Dept</p>
                          <p className="text-xs font-bold text-zinc-600">{displayDept(selectedStudent.department) || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-zinc-400 uppercase">Batch</p>
                          <p className="text-xs font-bold text-zinc-600">{selectedStudent.batch || "—"}</p>
                        </div>
                        {selectedStudentQuota && (
                          <div>
                            <p className="text-[9px] text-zinc-400 uppercase">Quota</p>
                            <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-150 mt-0.5">
                              {selectedStudentQuota}
                            </span>
                          </div>
                        )}
                        {selectedStudentCategory && (
                          <div>
                            <p className="text-[9px] text-zinc-400 uppercase">Category</p>
                            <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-lg border border-purple-150 mt-0.5">
                              {selectedStudentCategory}
                            </span>
                          </div>
                        )}
                        {selectedStudentStage && (
                          <div>
                            <p className="text-[9px] text-zinc-400 uppercase">Transport Stage</p>
                            <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-150 mt-0.5">
                              Stage {selectedStudentStage}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {studentFeeDetails ? (
                    <>
                      {/* Fee Summary Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-3.5 text-center">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Total Degree Fee</p>
                          <p className="text-xl font-black text-zinc-800 mt-1">₹{studentFeeDetails.totalFees.toLocaleString()}</p>
                          <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Full Course</p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-3.5 text-center">
                          <p className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider">Paid So Far</p>
                          <p className="text-xl font-black text-emerald-600 mt-1">₹{studentFeeDetails.totalPaid.toLocaleString()}</p>
                          <p className="text-[10px] text-emerald-600/70 font-semibold mt-0.5">Verified</p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border-2 border-red-300 bg-red-50/20 p-3.5 text-center">
                          <p className="text-[10px] text-red-600 uppercase font-bold tracking-wider">Current Due (AY {studentFeeDetails.activeAy})</p>
                          <p className="text-xl font-black text-red-600 mt-1">₹{studentFeeDetails.currentOutstanding.toLocaleString()}</p>
                          <p className="text-[10px] text-red-500 font-semibold mt-0.5">Active Term Due</p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-3.5 text-center">
                          <p className="text-[10px] text-amber-500 uppercase font-bold tracking-wider">Overall Balance</p>
                          <p className="text-xl font-black text-amber-600 mt-1">₹{studentFeeDetails.totalOutstanding.toLocaleString()}</p>
                          <p className="text-[10px] text-amber-600/70 font-semibold mt-0.5">All Years Total</p>
                        </div>
                      </div>

                      {/* Pending Online Payment Detected Banner */}
                      {studentFeeDetails.pendingStudentPayments && studentFeeDetails.pendingStudentPayments.length > 0 && (
                        <div className="space-y-3">
                          {studentFeeDetails.pendingStudentPayments.map((p, idx) => (
                            <div key={p.id || p.orderId || idx} className="p-4 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                                  <Clock size={20} className="animate-spin" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-black text-amber-950 text-sm">
                                      Unconfirmed / Pending Gateway Payment: ₹{Number(p.amount || p.chargedAmount || 0).toLocaleString()}
                                    </h4>
                                    <span className="text-[10px] font-mono font-bold bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                                      {p.orderId || p.id}
                                    </span>
                                    <span className="text-[11px] font-bold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                                      {p.feeHead || "No Due Fee"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
                                    A payment attempt was recorded for this student via HDFC SmartGateway. If money was debited from bank or payment was successful, click verify or confirm below to instantly apply this payment, clear the due, and generate the official receipt.
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                                <button
                                  type="button"
                                  onClick={() => handleVerifyPendingOrder(p.orderId || p.id)}
                                  disabled={verifyingOrderId === (p.orderId || p.id)}
                                  className="px-3.5 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <RefreshCw size={13} className={verifyingOrderId === (p.orderId || p.id) ? "animate-spin" : ""} />
                                  <span>Check HDFC Status</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmPendingPayment(p)}
                                  disabled={verifyingOrderId === (p.orderId || p.id)}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                                >
                                  <CheckCircle2 size={14} />
                                  <span>Confirm Payment & Issue Receipt</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fee Head Breakdown */}
                      {groupedStudentFees.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                          <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-bold text-xs text-zinc-600 uppercase tracking-wider">Fee Head Breakdown</h4>
                            {selectedHeads.length > 0 && (
                              <button
                                type="button"
                                onClick={handlePrintDueDemandBill}
                                className="px-3 py-1 bg-white border border-[#120c7a] text-[#120c7a] hover:bg-blue-50 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                title="Print single sheet official demand bill for selected fee heads"
                              >
                                <Printer size={13} />
                                <span>Print Due Bill ({selectedHeads.length} Selected)</span>
                              </button>
                            )}
                          </div>
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-200 bg-zinc-55/60 text-slate-400">
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Academic Year</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Sem</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Fee Head</th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Amount</th>
                                <th className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200 w-16">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupedStudentFees.flatMap((yearGroup) => {
                                const totalYearRows = yearGroup.semGroups.reduce((s, sg) => s + sg.rows.length + (sg.rows.length > 1 ? 1 : 0), 0);
                                let yearRowIdx = 0;
                                return yearGroup.semGroups.flatMap((semGroup) => {
                                  const isFirstYearRow = yearRowIdx === 0;

                                  // Calculate semester totals & payments
                                  let semTotal = 0;
                                  let semPaid = 0;
                                  semGroup.rows.forEach(r => {
                                    const headAmt = Number(r.amount) || 0;
                                    semTotal += headAmt;
                                    const headItem = studentFeeDetails.headBreakdown.find(h => h.id === r.id);
                                    semPaid += headItem ? Math.min(headAmt, headItem.paid) : 0;
                                  });
                                  const semRemaining = Math.max(0, semTotal - semPaid);

                                  const rows = semGroup.rows.map((cfg, idx) => {
                                    const headItem = studentFeeDetails.headBreakdown.find(h => h.id === cfg.id);
                                    const paidForThisHead = headItem ? headItem.paid : 0;
                                    const remainingForThisHead = headItem ? headItem.due : Math.max(0, Number(cfg.amount) - paidForThisHead);
                                    const isFullyPaid = remainingForThisHead === 0;
                                    const isPartiallyPaid = paidForThisHead > 0 && remainingForThisHead > 0;

                                    const showYear = isFirstYearRow && idx === 0;
                                    const showSem = idx === 0;

                                    const tr = (
                                      <tr key={cfg.id || idx} className="hover:bg-slate-50 transition-colors">
                                        {showYear ? (
                                          <td className="px-4 py-3 text-xs font-bold text-zinc-600 align-top border border-zinc-200" rowSpan={totalYearRows}>
                                            <div className="flex flex-col gap-1 items-start">
                                              <span>{yearGroup.academicYear}</span>
                                              {semGroup.rows.some(r => r.isOpeningDue) && (
                                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[9px] font-extrabold rounded border border-amber-200">
                                                  Previous Dues
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        ) : null}
                                        {showSem ? (
                                          <td className="px-4 py-3 text-xs font-bold text-zinc-600 align-top border border-zinc-200" rowSpan={semGroup.rows.length}>{semGroup.semester}</td>
                                        ) : null}
                                        <td className="px-4 py-3 text-sm font-bold border border-zinc-200 text-zinc-700">
                                          <div className="flex items-center gap-2">
                                            <span>{cfg.head || 'Fee'}</span>
                                            {cfg.isOpeningDue && (
                                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-extrabold rounded border border-amber-300">
                                                Arrear
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-black border border-zinc-200 text-zinc-700">
                                          {isFullyPaid ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="font-black text-[#120c7a]">₹{(Number(cfg.amount) || 0).toLocaleString()}</span>
                                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">Paid</span>
                                            </div>
                                          ) : isPartiallyPaid ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="font-black text-amber-600">₹{remainingForThisHead.toLocaleString()} <span className="text-[9px] font-bold text-amber-600 uppercase">Due</span></span>
                                              <span className="text-[9px] text-zinc-400 font-semibold">Total: ₹{(Number(cfg.amount) || 0).toLocaleString()} (Paid: ₹{paidForThisHead.toLocaleString()})</span>
                                            </div>
                                          ) : (
                                            <span>₹{(Number(cfg.amount) || 0).toLocaleString()}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-3 text-center border border-zinc-200">
                                          {isFullyPaid ? null : (
                                            <input
                                              type="checkbox"
                                              checked={selectedHeads.some(s => s.id === cfg.id)}
                                              onChange={(e) => handleToggleHead(cfg, remainingForThisHead, yearGroup.academicYear, semGroup.semester, e.target.checked)}
                                              className="w-4 h-4 text-[#120c7a] rounded border-zinc-300 focus:ring-2 focus:ring-blue-500 cursor-pointer accent-[#120c7a]"
                                              title={`Select ${cfg.head} (Due: ₹${remainingForThisHead.toLocaleString()})`}
                                            />
                                          )}
                                        </td>
                                      </tr>
                                    );
                                    return tr;
                                  });

                                  yearRowIdx += semGroup.rows.length;

                                  if (semGroup.rows.length > 1) {
                                    yearRowIdx += 1;
                                    const isSemFullyPaid = semRemaining === 0;
                                    const isSemPartiallyPaid = semPaid > 0 && semRemaining > 0;
                                    rows.push(
                                      <tr key={`sem-total-${yearGroup.key}-${semGroup.key}`} className="bg-blue-50/20">
                                        <td className="px-4 py-3 text-[10px] font-bold text-blue-600 text-right border border-zinc-200">Sem Total</td>
                                        <td className="px-4 py-3 border border-zinc-200" />
                                        <td className="px-4 py-3 text-right text-xs font-black text-blue-700 border border-zinc-200">
                                          {isSemFullyPaid ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="font-black text-emerald-700">₹{semTotal.toLocaleString()}</span>
                                              <span className="text-emerald-600 text-[10px] font-bold">Paid</span>
                                            </div>
                                          ) : isSemPartiallyPaid ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="font-black text-blue-700">₹{semRemaining.toLocaleString()} <span className="text-[9px] font-bold text-blue-600 uppercase">Due</span></span>
                                              <span className="text-[9px] text-blue-400 font-semibold">Total: ₹{semTotal.toLocaleString()} (Paid: ₹{semPaid.toLocaleString()})</span>
                                            </div>
                                          ) : (
                                            <span>₹{semTotal.toLocaleString()}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-3 border border-zinc-200" />
                                      </tr>
                                    );
                                  }

                                  return rows;
                                });
                              })}

                              {/* Outstanding Total Row */}
                              <tr className="bg-zinc-50 font-bold border-t-2 border-zinc-300">
                                <td colSpan={3} className="px-4 py-3 text-left text-sm font-extrabold text-zinc-800 border border-zinc-200">
                                  <div>Outstanding Summary</div>
                                  <div className="text-[10px] text-zinc-400 font-normal">Active Term (AY {studentFeeDetails.activeAy}) & Overall Course Balance</div>
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-black text-[#120c7a] border border-zinc-200">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] text-zinc-500 font-semibold">Active Due:</span>
                                      <span className="text-sm font-black text-red-600">₹{studentFeeDetails.currentOutstanding.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                                      <span>Full Course Balance:</span>
                                      <span className="font-bold text-amber-600">₹{studentFeeDetails.totalOutstanding.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="border border-zinc-200" />
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Record Payment */}
                      {studentFeeDetails.outstanding > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                          <h4 className="font-bold text-sm text-zinc-700 mb-4 flex items-center gap-2"><IndianRupee size={16} /> Record Payment</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Academic Year</label>
                              <select value={paymentForm.academicYear} onChange={e => setPaymentForm({ ...paymentForm, academicYear: e.target.value, feeHead: "", amount: "" })}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                                <option value="">Auto (oldest due first)</option>
                                {[...new Set(studentFeeDetails.headBreakdown.filter(h => h.due > 0).map(h => h.academicYear))].sort().map(y => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Fee Head *</label>
                              <select value={paymentForm.feeHead} onChange={e => {
                                const head = e.target.value;
                                const headItem = studentFeeDetails.headBreakdown.find(h => h.head === head && (!paymentForm.academicYear || h.academicYear === paymentForm.academicYear));
                                const autoAmount = headItem ? headItem.due : "";
                                setPaymentForm({ ...paymentForm, feeHead: head, amount: autoAmount ? String(autoAmount) : paymentForm.amount });
                              }}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                                <option value="">Select Fee Head</option>
                                {studentFeeDetails.headBreakdown.filter(h => h.due > 0 && (!paymentForm.academicYear || h.academicYear === paymentForm.academicYear)).map(h => (
                                  <option key={`${h.academicYear}_${h.semester}_${h.head}`} value={h.head}>{h.head} — {h.academicYear} — ₹{h.due.toLocaleString()} due</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount *</label>
                              <div className="relative"><IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                  value={paymentForm.amount}
                                  onChange={e => {
                                    let val = e.target.value;
                                    if (val !== "") {
                                      const num = Number(val);
                                      if (maxPayableAmount > 0 && num > maxPayableAmount) {
                                        val = String(maxPayableAmount);
                                        setToast({ show: true, message: `Amount cannot exceed total due of ₹${maxPayableAmount.toLocaleString()}`, type: "error" });
                                      }
                                    }
                                    setPaymentForm({ ...paymentForm, amount: val });
                                  }}
                                  type="number"
                                  min="1"
                                  max={maxPayableAmount > 0 ? maxPayableAmount : undefined}
                                  className="w-full pl-8 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"
                                  placeholder="0"
                                />
                              </div>
                              {maxPayableAmount > 0 && (
                                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">
                                  Total Due: <span className="font-bold text-[#120c7a]">₹{maxPayableAmount.toLocaleString()}</span> (Cannot exceed this amount)
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Payment Mode *</label>
                              <select value={paymentForm.mode} onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value })}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                              </select>
                            </div>
                            {paymentForm.mode !== "gateway" && (
                              <>
                                <div>
                                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Payment Date</label>
                                  <input value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} type="date"
                                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Ref No / Remarks</label>
                                  <input value={paymentForm.remarks} onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value, refNo: e.target.value })}
                                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Cheque no, UPI ref, DD no..." />
                                </div>
                              </>
                            )}
                            {computedAllocations.length > 1 && (
                              <div className="col-span-2 bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 text-xs space-y-2">
                                <div className="flex items-center justify-between font-bold text-blue-900 border-b border-blue-200/60 pb-2">
                                  <span className="flex items-center gap-1.5">
                                    <BadgeCheck size={15} className="text-blue-700" />
                                    <span>Payment Allocation Breakdown ({computedAllocations.length} Selected Heads):</span>
                                  </span>
                                  <span className="text-emerald-700 font-extrabold font-mono text-sm">Total: ₹{computedAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0).toLocaleString()}</span>
                                </div>
                                <div className="space-y-1.5 pt-0.5">
                                  {computedAllocations.map((alloc, idx) => (
                                    <div key={alloc.id || idx} className="flex items-center justify-between text-zinc-700 bg-white/60 px-2.5 py-1.5 rounded-lg border border-blue-100">
                                      <span className="font-semibold">{idx + 1}. {alloc.head} (Due: ₹{alloc.due.toLocaleString()}):</span>
                                      <span className="font-mono text-right">
                                        <span className="text-emerald-700 font-bold">₹{alloc.allocatedAmount.toLocaleString()}</span>
                                        {alloc.balanceDueAfter > 0 ? (
                                          <span className="text-amber-600 font-bold ml-2 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px]">
                                            ₹{alloc.balanceDueAfter.toLocaleString()} will remain Due
                                          </span>
                                        ) : (
                                          <span className="text-emerald-600 font-bold ml-2 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                                            Fully Settled ✓
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {paymentForm.mode === "gateway" ? (
                            <button onClick={handleSmartGatewayPay} disabled={saving || !paymentForm.amount || Number(paymentForm.amount) <= 0 || (maxPayableAmount > 0 && Number(paymentForm.amount) > maxPayableAmount) || !paymentForm.feeHead}
                              className="w-full mt-4 py-3 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#120c7a]/20">
                              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <ExternalLink size={18} />}
                              Pay {paymentForm.amount ? `₹${Number(paymentForm.amount).toLocaleString()}` : ""} via HDFC SmartGateway
                            </button>
                          ) : (
                            <button onClick={handleRecordPayment} disabled={saving || !paymentForm.amount || Number(paymentForm.amount) <= 0 || (maxPayableAmount > 0 && Number(paymentForm.amount) > maxPayableAmount) || !paymentForm.feeHead}
                              className="w-full mt-4 py-3 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#120c7a]/20">
                              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle2 size={18} />}
                              Record Payment & Generate Receipt
                            </button>
                          )}
                        </div>
                      )}

                      {/* Payment History */}
                      {(studentFeeDetails.allStudentPayments || studentFeeDetails.studentPayments).length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                          <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-bold text-xs text-zinc-600 uppercase tracking-wider">Payment History ({(studentFeeDetails.allStudentPayments || studentFeeDetails.studentPayments).length})</h4>
                            {selectedHistoryPayments.length > 0 && (
                              <button
                                type="button"
                                onClick={handlePrintConsolidatedHistory}
                                className="px-3.5 py-1.5 bg-[#120c7a] text-white hover:bg-blue-900 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                                title="Print consolidated receipt for selected payments on single sheet"
                              >
                                <Printer size={13} />
                                <span>Print Consolidated Receipt ({selectedHistoryPayments.length} Selected)</span>
                              </button>
                            )}
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-zinc-100">
                                <th className="px-3 py-2.5 text-center w-10">
                                  <input
                                    type="checkbox"
                                    checked={
                                      (studentFeeDetails.allStudentPayments || studentFeeDetails.studentPayments).filter(isSuccessfulPayment).length > 0 &&
                                      selectedHistoryPayments.length === (studentFeeDetails.allStudentPayments || studentFeeDetails.studentPayments).filter(isSuccessfulPayment).length
                                    }
                                    onChange={(e) => handleSelectAllHistoryPayments(e.target.checked)}
                                    className="w-4 h-4 text-[#120c7a] rounded border-zinc-300 focus:ring-2 focus:ring-blue-500 cursor-pointer accent-[#120c7a]"
                                    title="Select All Paid Receipts"
                                  />
                                </th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase">Date</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase">Receipt</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase">Fee Head</th>
                                <th className="px-5 py-2.5 text-center text-[10px] font-bold text-zinc-400 uppercase">Mode</th>
                                <th className="px-5 py-2.5 text-right text-[10px] font-bold text-zinc-400 uppercase">Amount</th>
                                <th className="px-5 py-2.5 text-center text-[10px] font-bold text-zinc-400 uppercase">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(studentFeeDetails.allStudentPayments || studentFeeDetails.studentPayments).map((p, i) => {
                                const pKey = p.id || p.orderId || p.receiptNo;
                                const isPaid = isSuccessfulPayment(p);
                                const isNetkampus = Boolean(
                                  p.isLegacySettlement ||
                                  p.settlementSource === "Netkampus" ||
                                  (p.mode || "").toLowerCase().includes("netkampus") ||
                                  (p.remarks || "").toLowerCase().includes("netkampus")
                                );
                                return (
                                <tr key={p.id || i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                                  <td className="px-3 py-2.5 text-center">
                                    {isPaid && !isNetkampus ? (
                                      <input
                                        type="checkbox"
                                        checked={selectedHistoryPayments.includes(pKey)}
                                        onChange={() => handleToggleSelectHistoryPayment(pKey)}
                                        className="w-4 h-4 text-[#120c7a] rounded border-zinc-300 focus:ring-2 focus:ring-blue-500 cursor-pointer accent-[#120c7a]"
                                        title="Select for Consolidated Print"
                                      />
                                    ) : null}
                                  </td>
                                  <td className="px-5 py-2.5 text-xs text-zinc-500 font-medium">
                                    <span className="block">{
                                      (() => {
                                        const ts = p.paymentDate || p.createdAt || p.verifiedAt;
                                        if (!ts) return "—";
                                        const d = ts.toDate ? ts.toDate() : new Date(ts);
                                        return isNaN(d.getTime()) ? "—" : d.toLocaleDateString('en-IN');
                                      })()
                                    }</span>
                                    {(() => {
                                      const ts = p.createdAt || p.paymentDate || p.verifiedAt;
                                      if (!ts) return null;
                                      const d = ts.toDate ? ts.toDate() : new Date(ts);
                                      if (isNaN(d.getTime())) return null;
                                      return (
                                        <span className="text-[10px] text-zinc-400 font-normal">
                                          {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-5 py-2.5 text-xs">
                                    {isNetkampus ? (
                                      <div>
                                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-[10px] font-black inline-block">
                                          Settled by Netkampus
                                        </span>
                                        {(p.refNo || p.transactionId) && (
                                          <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                                            Txn: {p.refNo || p.transactionId}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setReceiptModal({ open: true, payment: p })}
                                          className="font-mono font-bold text-[#120c7a] hover:underline text-left block"
                                          title="View / Print Receipt"
                                        >
                                          {p.receiptNo || p.orderId || "—"}
                                        </button>
                                        {p.gatewayResponse?.rrn && (
                                          <span className="text-[10px] text-zinc-400 font-mono">RRN: {p.gatewayResponse.rrn}</span>
                                        )}
                                        {p.refNo && (p.mode || "").toLowerCase() !== "gateway" && (
                                          <span className="text-[10px] text-zinc-500 font-mono block">Ref: {p.refNo}</span>
                                        )}
                                        {p._source === "Application" && (
                                          <span className="text-[9px] font-bold text-blue-500 block">Application</span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-bold">{p.feeHead}</span></td>
                                  <td className="px-5 py-2.5 text-center text-xs">
                                    {isNetkampus ? (
                                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-[10px] font-bold">
                                        Settled by Netkampus
                                      </span>
                                    ) : (
                                      <span className="capitalize text-zinc-500">{p.mode ? p.mode : (p.status ? "Online" : "—")}</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5 text-right font-bold text-xs text-emerald-600">₹{(p.chargedAmount || p.amount || 0).toLocaleString()}</td>
                                  <td className="px-5 py-2.5 text-center">
                                    {isNetkampus ? (
                                      <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200" title="Prior settlement imported from Netkampus — no ERP bill generated">
                                        Prior Record
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setReceiptModal({ open: true, payment: p })}
                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#120c7a] font-bold rounded-lg text-[10px] transition-all inline-flex items-center gap-1 shadow-2xs border border-blue-200"
                                        title="View & Print Official Receipt"
                                      >
                                        <Download size={11} /> Receipt
                                      </button>
                                    )}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {studentFeeDetails.outstanding === 0 && studentFeeDetails.totalFees > 0 && (
                        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 text-center">
                          <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                          <p className="text-sm font-bold text-emerald-700">All fees paid for this student</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 text-center">
                      <p className="text-sm text-zinc-400">No fee structure configured for this student's programme/batch.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Receipts */}
        {tab === "receipts" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)}
                  placeholder="Search by receipt#, student, or amount..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase">From</label>
                <input type="date" value={receiptDateFrom} onChange={e => setReceiptDateFrom(e.target.value)}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase">To</label>
                <input type="date" value={receiptDateTo} onChange={e => setReceiptDateTo(e.target.value)}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              {(receiptDateFrom || receiptDateTo || receiptSearch) && (
                <button onClick={() => { setReceiptSearch(""); setReceiptDateFrom(""); setReceiptDateTo(""); }}
                  className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 px-2 py-1">
                  ✕ Clear
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] font-bold text-zinc-400">{filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? 's' : ''}</span>
                <button onClick={() => {
                  const rows = filteredReceipts.map(r => ({
                    'Receipt No': r.receiptNo || '',
                    'Student Name': getCleanStudentName(r) || r.studentName || '',
                    'Exam Number': r.examNumber || '',
                    'Fee Head': r.feeHead || '',
                    'Amount': r.amount || 0,
                    'Mode': r.mode || '',
                    'Date': r.paymentDate?.toDate?.()?.toLocaleDateString('en-IN') || '',
                    'Status': r.status || 'active',
                    'Semester': r.semester || '',
                    'Remarks': r.remarks || '',
                  }));
                  const ws = XLSX.utils.json_to_sheet(rows);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Receipts");
                  ws['!cols'] = [
                    { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
                    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
                    { wch: 10 }, { wch: 25 }
                  ];
                  const dateLabel = receiptDateFrom && receiptDateTo
                    ? `${receiptDateFrom}_to_${receiptDateTo}`
                    : receiptDateFrom
                      ? `from_${receiptDateFrom}`
                      : receiptDateTo
                        ? `to_${receiptDateTo}`
                        : 'all';
                  XLSX.writeFile(wb, `Fee_Receipts_${dateLabel}.xlsx`);
                  showToast(`Exported ${filteredReceipts.length} receipts`);
                }}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm">
                  <Download size={14} /> Export Excel
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Receipt #</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Head</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Mode</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredReceipts.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400 text-sm">No receipts found</td></tr>
                    ) : filteredReceipts.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3"><span className="text-xs font-mono font-bold text-[#120c7a]">{r.receiptNo || "—"}</span></td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold text-zinc-700">{getCleanStudentName(r) || r.studentName}</p>
                          <p className="text-[9px] text-zinc-400 font-mono">{r.examNumber}</p>
                        </td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-bold">{r.feeHead}</span></td>
                        <td className="px-4 py-3 text-center text-xs capitalize text-zinc-500">{r.mode}</td>
                        <td className="px-4 py-3 text-right font-black text-sm text-zinc-800">₹{r.amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${r.status === 'cancelled' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                            {r.status || 'active'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => setReceiptModal({ open: true, payment: r })}
                              className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-[#120c7a]"
                              title="Print Receipt"
                            >
                              <Printer size={14} />
                            </button>
                            {!r.isOnline && r.status !== 'cancelled' && (
                              <button
                                onClick={() => { const reason = prompt("Reason for cancellation:"); if (reason) cancelReceipt(r.id, reason); }}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"
                                title="Cancel Receipt"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Concessions */}
        {tab === "concessions" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-zinc-500">{concessions.length} concessions • ₹{concessions.filter(c => c.status === "approved").reduce((s, c) => s + (c.amount || 0), 0).toLocaleString()} approved</p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowScholarshipSettlementModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Landmark size={14} className="text-amber-300" />
                  <span>Direct Scholarship Settlement (FG / PMSS)</span>
                </button>
                <button onClick={() => { setConcessionForm({ studentId: "", studentName: "", examNumber: "", type: "Merit", amount: "", percentage: "", validTill: "", status: "pending", remarks: "" }); setShowConcessionModal(true); }}
                  className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
                  <Plus size={14} /> Apply Concession
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Type</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Valid Till</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {concessions.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-400 text-sm">No concessions applied</td></tr>
                    ) : concessions.map((c, i) => (
                      <tr key={c.id || i} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3"><p className="text-sm font-medium text-zinc-700">{c.studentName}</p><p className="text-[9px] text-zinc-400">{c.examNumber}</p></td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-lg text-[9px] font-bold">{c.type}</span></td>
                        <td className="px-4 py-3 text-right font-black text-sm text-zinc-800">₹{(c.amount || 0).toLocaleString()}{c.percentage ? ` (${c.percentage}%)` : ''}</td>
                        <td className="px-4 py-3 text-center text-xs text-zinc-500">{c.validTill?.toDate?.()?.toLocaleDateString('en-IN') || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${c.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : c.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{c.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Reports */}
        {tab === "reports" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                  <BarChart3 size={18} className="text-[#120c7a]" /> Fee Collection Reports
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Comprehensive audit journal and collection summaries • Total: ₹{reportTotalAmount.toLocaleString()} ({filteredReportsData.length} entries)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportReportsExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Download size={14} /> Export Excel
                </button>
              </div>
            </div>

            {/* Account Split Switcher Tabs */}
            <div className="flex flex-wrap items-center gap-2 bg-zinc-100/80 p-1.5 rounded-2xl border border-zinc-200/80 w-fit">
              <button
                type="button"
                onClick={() => setReportAccountFilter("ALL")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${reportAccountFilter === "ALL"
                    ? "bg-[#120c7a] text-white shadow-md shadow-[#120c7a]/20"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60"
                  }`}
              >
                <span>🏢 All Accounts (Consolidated)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${reportAccountFilter === "ALL" ? "bg-white/20 text-white" : "bg-zinc-200 text-zinc-700"}`}>
                  ₹{accountReportStats.grandTotal.toLocaleString()}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportAccountFilter("76980")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${reportAccountFilter === "76980"
                    ? "bg-indigo-700 text-white shadow-md shadow-indigo-700/20"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60"
                  }`}
              >
                <span>🏛️ College Account (#76980)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${reportAccountFilter === "76980" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-800"}`}>
                  ₹{accountReportStats.collegeTotal.toLocaleString()}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportAccountFilter("76983")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${reportAccountFilter === "76983"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60"
                  }`}
              >
                <span>🎓 Exam Cell Account (#76983)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${reportAccountFilter === "76983" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"}`}>
                  ₹{accountReportStats.coeTotal.toLocaleString()}
                </span>
              </button>
            </div>

            {/* Quick KPI Cards Ribbon with Account-wise Split */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    {reportAccountFilter === "76980" ? "College Collection (#76980)" : reportAccountFilter === "76983" ? "COE Collection (#76983)" : "Total Collection"}
                  </p>
                  <p className="text-xl font-black text-[#120c7a] mt-1">₹{reportTotalAmount.toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                  <span className="text-indigo-700 font-extrabold">🏛️ #76980: ₹{accountReportStats.collegeTotal.toLocaleString()}</span>
                  <span className="text-zinc-300">•</span>
                  <span className="text-amber-700 font-extrabold">🎓 #76983: ₹{accountReportStats.coeTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Transactions</p>
                  <p className="text-xl font-black text-zinc-800 mt-1">{filteredReportsData.length}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                  <span className="text-indigo-700 font-bold">🏛️ College: {accountReportStats.collegeCount}</span>
                  <span className="text-zinc-300">•</span>
                  <span className="text-amber-700 font-bold">🎓 COE: {accountReportStats.coeCount}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">HDFC SmartGateway</p>
                  <p className="text-xl font-black text-blue-600 mt-1">
                    ₹{filteredReportsData.filter(r => (r.rawMode === "gateway" || (r.mode || "").toLowerCase().includes("smartgateway"))).reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                  <span className="text-indigo-700 font-bold">#76980: ₹{accountReportStats.collegeGateway.toLocaleString()}</span>
                  <span className="text-zinc-300">•</span>
                  <span className="text-amber-700 font-bold">#76983: ₹{accountReportStats.coeGateway.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Counter (DD / Cash / UPI)</p>
                  <p className="text-xl font-black text-emerald-600 mt-1">
                    ₹{filteredReportsData.filter(r => (r.rawMode !== "gateway" && !(r.mode || "").toLowerCase().includes("smartgateway"))).reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                  <span className="text-emerald-700 font-extrabold">🏛️ Institutional Counter Only (#76980)</span>
                </div>
              </div>
            </div>

            {/* Multi-Filters Toolbar */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                <div className="relative md:col-span-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search by student, reg no, receipt no..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#120c7a]"
                  />
                </div>
                <div>
                  <select
                    value={reportAccountFilter}
                    onChange={(e) => setReportAccountFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ALL">All Accounts (#76980 & #76983)</option>
                    <option value="76980">College Fees (#76980)</option>
                    <option value="76983">Exam Cell COE (#76983)</option>
                  </select>
                </div>
                <div>
                  <select
                    value={reportAyFilter}
                    onChange={(e) => setReportAyFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ALL">All Academic Years</option>
                    {reportAcademicYears.map(ay => (
                      <option key={ay} value={ay}>AY {ay}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={reportHeadFilter}
                    onChange={(e) => setReportHeadFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All Fee Heads</option>
                    {reportHeadOptions.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={reportModeFilter}
                    onChange={(e) => setReportModeFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All Payment Modes</option>
                    <option value="gateway">HDFC SmartGateway</option>
                    <option value="dd">Demand Draft (DD)</option>
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                    <option value="online">Online / Netbanking</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={(e) => setReportDateFrom(e.target.value)}
                    className="w-1/2 px-2 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] font-semibold outline-none"
                    title="From Date"
                  />
                  <span className="text-zinc-300">→</span>
                  <input
                    type="date"
                    value={reportDateTo}
                    onChange={(e) => setReportDateTo(e.target.value)}
                    className="w-1/2 px-2 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] font-semibold outline-none"
                    title="To Date"
                  />
                </div>
              </div>
            </div>

            {/* Reports Tabular Data */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">S.No</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Receipt No</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Account</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student Candidate</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Department / Batch</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Fee Head</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Mode</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredReportsData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-zinc-400 text-sm">
                          No collection records matching the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredReportsData.map((r, i) => {
                        const pDate = r.paymentDate?.toDate?.() || new Date(r.paymentDate || 0);
                        const dateFormatted = !isNaN(pDate.getTime())
                          ? pDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—";
                        return (
                          <tr key={r.id || i} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-zinc-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-bold text-[#120c7a] bg-blue-50 px-2 py-0.5 rounded">
                                {r.receiptNo || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.isCoe || r.accountNo === "76983" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-900 border border-amber-200" title="Account #76983 - Autonomous Exam Cell">
                                  🎓 #76983 COE
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200" title="Account #76980 - Institutional / College">
                                  🏛️ #76980 College
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600 font-medium whitespace-nowrap">
                              {dateFormatted}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold text-zinc-800">{r.studentName || "—"}</p>
                              <p className="text-[10px] text-zinc-400 font-mono">{r.examNumber || "—"}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600">
                              <span>{r.department || "—"}</span>
                              {r.batch && <span className="block text-[10px] text-zinc-400">{r.batch}</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
                                {r.feeHead || "Semester Fee"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(() => {
                                const m = (r.rawMode || getPaymentMode(r.rawRecord || r)).toLowerCase();
                                if (m === "gateway" || (r.mode || "").toLowerCase().includes("smartgateway")) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      🌐 SmartGateway
                                    </span>
                                  );
                                }
                                if (m === "dd" || (r.mode || "").toLowerCase().includes("dd") || (r.mode || "").toLowerCase().includes("draft")) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      🏦 DD
                                    </span>
                                  );
                                }
                                if (m === "upi" || (r.mode || "").toLowerCase() === "upi") {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                      📱 UPI
                                    </span>
                                  );
                                }
                                if (m === "cash" || (r.mode || "").toLowerCase() === "cash") {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      💵 Cash
                                    </span>
                                  );
                                }
                                if (m === "cheque" || (r.mode || "").toLowerCase().includes("cheque")) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      📝 Cheque
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                                    💳 Online
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-xs text-emerald-700">
                              ₹{(Number(r.amount) || 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => setReceiptModal({ open: true, payment: r.rawRecord || r })}
                                className="p-1 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Receipt"
                              >
                                <Printer size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredReportsData.length > 0 && (
                    <tfoot>
                      <tr className="bg-zinc-50 border-t border-zinc-200 font-black text-xs text-zinc-800">
                        <td colSpan={7} className="px-4 py-3 text-right uppercase tracking-wider text-zinc-500">
                          Total Collection:
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700 text-sm">
                          ₹{reportTotalAmount.toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Transport Configuration */}
        {tab === "transport" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-zinc-800 flex items-center gap-2"><Bus size={18} className="text-[#120c7a]" /> Transport Configuration</h3>
                <p className="text-xs text-zinc-500 mt-1">{transportStages.length} transport stage{transportStages.length !== 1 ? 's' : ''} configured • Total fee per month: ₹{transportStages.reduce((s, t) => s + (Number(t.fee) || 0), 0).toLocaleString()}</p>
              </div>
              <button onClick={() => { setEditTransportId(null); setTransportForm({ stageNo: "", location: "", fee: "" }); setShowTransportModal(true); }}
                className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
                <Plus size={14} /> Add Transport Stage
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Stage No</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Stage Location</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Fee (₹)</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {transportStages.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-400 text-sm">No transport stages configured. Add your first stage.</td></tr>
                    ) : [...transportStages].sort((a, b) => {
                      const na = Number(String(a.stageNo).replace(/\D/g, ''));
                      const nb = Number(String(b.stageNo).replace(/\D/g, ''));
                      return (isNaN(na) ? 0 : na) - (isNaN(nb) ? 0 : nb);
                    }).map(t => (
                      <tr key={t.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3"><span className="inline-flex items-center justify-center min-w-8 h-8 px-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-black">{t.stageNo}</span></td>
                        <td className="px-4 py-3 text-sm font-semibold text-zinc-700">{t.location}</td>
                        <td className="px-4 py-3 text-right font-black text-sm text-zinc-800">₹{(Number(t.fee) || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => { setEditTransportId(t.id); setTransportForm({ stageNo: String(t.stageNo || ""), location: t.location || "", fee: String(t.fee ?? "") }); setShowTransportModal(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Edit3 size={14} /></button>
                            <button onClick={async () => { try { await deleteDoc(doc(db, "transport_stages", t.id)); showToast("Deleted"); } catch (e) { showToast("Error", "error"); } }} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Fee Structure Modal */}
        {showFeeModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowFeeModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-zinc-800">{editFeeId ? "Edit Fee Entry" : "Add Fee Entry"}</h3>
                <button onClick={() => setShowFeeModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Fee Head</label>
                    <select value={feeForm.head} onChange={e => {
                      const h = e.target.value;
                      const st = headSplitTypes[h] || "student";
                      const upd = { ...feeForm, head: h };
                      if (st === "academic-year") { upd.academicYear = ""; upd.semester = ""; }
                      else if (st === "semester") { upd.semester = ""; }
                      setFeeForm(upd);
                    }}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">Select head</option>
                      {(feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS).map(h => <option key={h.name || h} value={h.name || h}>{h.name || h}</option>)}
                    </select>
                    {feeForm.head && (
                      <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                        Type: {headSplitTypes[feeForm.head] || "student"}
                        {headSplitTypes[feeForm.head] === "academic-year" && " — Per academic year; check 'Same for all years' to bulk-add"}
                        {headSplitTypes[feeForm.head] === "semester" && " — Per semester, set amount individually"}
                      </span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Programme</label>
                    <select value={feeForm.programme} onChange={e => setFeeForm({ ...feeForm, programme: e.target.value, department: "" })}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">Select Programme</option>
                      {Object.keys(PROGRAMME_DEPARTMENTS || {}).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Batch</label>
                    <select value={feeForm.batch} onChange={e => setFeeForm({ ...feeForm, batch: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">Select Batch</option>
                      {(() => {
                        if (!feeForm.programme) return null;
                        const progKey = formatProgrammeKey(feeForm.programme);
                        const batches = getActiveBatches(progKey);
                        return batches.map(b => <option key={b} value={b}>{b}</option>);
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Academic Year</label>
                    {headSplitTypes[feeForm.head] === "academic-year" && !editFeeId ? (
                      <>
                        <select value={feeForm.sameForAllYears ? "" : (feeForm.academicYear || "")} onChange={e => setFeeForm({ ...feeForm, academicYear: e.target.value })}
                          disabled={feeForm.sameForAllYears}
                          className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium disabled:opacity-40">
                          <option value="">{feeForm.sameForAllYears ? "All years (same amount)" : "Select Academic Year"}</option>
                          {(() => {
                            if (!feeForm.batch) return null;
                            const [start] = feeForm.batch.split("-").map(Number);
                            const progKey = feeForm.programme.replace(/[^a-zA-Z0-9]/g, '_');
                            const duration = durations[progKey] || 4;
                            const years = [];
                            for (let i = 0; i < duration; i++) {
                              years.push(`${start + i}-${start + i + 1}`);
                            }
                            return years.map(y => <option key={y} value={y}>{y}</option>);
                          })()}
                        </select>
                        <label className="mt-1.5 flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={feeForm.sameForAllYears}
                            onChange={e => setFeeForm({ ...feeForm, sameForAllYears: e.target.checked, academicYear: "" })}
                            className="rounded border-zinc-300 text-[#120c7a] focus:ring-[#120c7a] accent-[#120c7a]" />
                          <span className="text-[11px] font-bold text-zinc-500">Same amount for all academic years</span>
                        </label>
                      </>
                    ) : (
                      <select value={feeForm.academicYear || ""} onChange={e => setFeeForm({ ...feeForm, academicYear: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                        <option value="Select Academic Year">Select Academic Year</option>
                        {(() => {
                          if (!feeForm.batch) return null;
                          const [start] = feeForm.batch.split("-").map(Number);
                          const progKey = feeForm.programme.replace(/[^a-zA-Z0-9]/g, '_');
                          const duration = durations[progKey] || 4;
                          const years = [];
                          for (let i = 0; i < duration; i++) {
                            years.push(`${start + i}-${start + i + 1}`);
                          }
                          return years.map(y => <option key={y} value={y}>{y}</option>);
                        })()}
                      </select>
                    )}
                  </div>
                  {(headSplitTypes[feeForm.head] || "student") !== "academic-year" && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Semester</label>
                      <select value={feeForm.semester} onChange={e => setFeeForm({ ...feeForm, semester: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                        <option value="">Select Semester</option>
                        {(() => {
                          if (!feeForm.batch || !feeForm.academicYear) return null;
                          const [batchStart] = feeForm.batch.split("-").map(Number);
                          const [yearStart] = feeForm.academicYear.split("-").map(Number);
                          const yearIndex = yearStart - batchStart;
                          const sem1 = (yearIndex * 2) + 1;
                          const sem2 = (yearIndex * 2) + 2;
                          return [sem1, sem2].map(s => <option key={s} value={`Sem ${s}`}>Sem {s}</option>);
                        })()}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Department</label>
                    <select value={feeForm.department} onChange={e => setFeeForm({ ...feeForm, department: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Departments</option>
                      {(feeForm.programme ? (PROGRAMME_DEPARTMENTS[feeForm.programme] || []) : []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Quota</label>
                    <select value={feeForm.quota} onChange={e => setFeeForm({ ...feeForm, quota: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Quotas</option>
                      {(quotaOptions.length ? quotaOptions : ["All"]).map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Student Category</label>
                    <select value={feeForm.studentCategory} onChange={e => setFeeForm({ ...feeForm, studentCategory: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Categories</option>
                      {STUDENT_CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount (₹)</label>
                    <input value={feeForm.amount} onChange={e => setFeeForm({ ...feeForm, amount: e.target.value })} type="number"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
                <button onClick={() => setShowFeeModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Cancel</button>
                <button onClick={handleSaveFee} disabled={saving || !feeForm.programme || !feeForm.amount}
                  className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle2 size={16} />}
                  {editFeeId ? "Update" : "Add Entry"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Concession Modal */}
        {showConcessionModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowConcessionModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-zinc-800">Apply Concession</h3>
                <button onClick={() => setShowConcessionModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Student</label>
                  <input value={concessionForm.studentName} onChange={e => {
                    setConcessionForm({ ...concessionForm, studentName: e.target.value });
                    const found = students.find(s => s.studentName?.toLowerCase() === e.target.value.toLowerCase());
                    if (found) setConcessionForm(prev => ({ ...prev, studentName: found.studentName, examNumber: found.examNumber, studentId: found.id }));
                  }} list="studentList"
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Type student name" />
                  <datalist id="studentList">{students.map(s => <option key={s.id} value={s.studentName} />)}</datalist>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Concession Type</label>
                    <select value={concessionForm.type} onChange={e => setConcessionForm({ ...concessionForm, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="Merit">Merit</option>
                      <option value="SC/ST">SC/ST</option>
                      <option value="OBC">OBC</option>
                      <option value="EWS">EWS</option>
                      <option value="Staff">Staff</option>
                      <option value="Sibling">Sibling</option>
                      <option value="Sports">Sports</option>
                      <option value="Income">Income Based</option>
                      <option value="Alumni">Alumni</option>
                      <option value="Scholarship">Government Scholarship</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount (₹)</label>
                    <input value={concessionForm.amount} onChange={e => setConcessionForm({ ...concessionForm, amount: e.target.value })} type="number"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Or Percentage (%)</label>
                    <input value={concessionForm.percentage} onChange={e => setConcessionForm({ ...concessionForm, percentage: e.target.value })} type="number"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Valid Till</label>
                    <input value={concessionForm.validTill} onChange={e => setConcessionForm({ ...concessionForm, validTill: e.target.value })} type="date"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Remarks</label>
                  <textarea value={concessionForm.remarks} onChange={e => setConcessionForm({ ...concessionForm, remarks: e.target.value })} rows={2}
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
                <button onClick={() => setShowConcessionModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Cancel</button>
                <button onClick={handleSaveConcession} disabled={saving || !concessionForm.studentName}
                  className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <BadgeCheck size={16} />}
                  Apply Concession
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transport Stage Modal */}
        {showTransportModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowTransportModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-zinc-800 flex items-center gap-2"><Bus size={18} className="text-[#120c7a]" /> {editTransportId ? "Edit Transport Stage" : "Add Transport Stage"}</h3>
                <button onClick={() => setShowTransportModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Stage Number</label>
                  <input value={transportForm.stageNo} onChange={e => setTransportForm({ ...transportForm, stageNo: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. 1, 2, 3..." />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Stage Location</label>
                  <input value={transportForm.location} onChange={e => setTransportForm({ ...transportForm, location: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Anna Nagar, Tambaram..." />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Fee (₹)</label>
                  <input value={transportForm.fee} onChange={e => setTransportForm({ ...transportForm, fee: e.target.value })} type="number"
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="0" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
                <button onClick={() => setShowTransportModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Cancel</button>
                <button onClick={handleSaveTransportStage} disabled={saving || !transportForm.stageNo || !transportForm.location || !transportForm.fee}
                  className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle2 size={16} />}
                  {editTransportId ? "Update" : "Add Stage"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fee Head Management Modal */}
      {showHeadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowHeadModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#120c7a] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="text-white" size={20} />
                <h3 className="text-lg font-bold text-white">Manage Fee Heads</h3>
              </div>
              <button onClick={() => setShowHeadModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-72px)]">
              {feeHeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-200 rounded-2xl">
                  <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 mb-3">
                    <Layers size={24} />
                  </div>
                  <p className="text-zinc-500 text-sm font-bold">No fee heads yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {feeHeads.map((head, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 group hover:border-[#120c7a]/20 transition-all">
                      {headEditIdx === idx ? (
                        <>
                          <input value={headEditVal} onChange={e => setHeadEditVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const next = [...feeHeads];
                                next[idx] = { ...next[idx], name: headEditVal };
                                setFeeHeads(next);
                                setHeadEditIdx(null);
                              }
                            }}
                            className="flex-1 bg-white border border-[#120c7a] rounded-lg px-2 py-1 text-sm font-bold outline-none" autoFocus />
                          <button onClick={() => { const next = [...feeHeads]; next[idx] = { ...next[idx], name: headEditVal }; setFeeHeads(next); setHeadEditIdx(null); }}
                            className="text-green-600 hover:text-green-700 p-1"><CheckCircle2 size={16} /></button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-bold text-zinc-700">{head.name || head}</span>
                          <select value={head.splitType || "student"} onChange={e => {
                            const next = [...feeHeads];
                            next[idx] = { ...next[idx], splitType: e.target.value };
                            setFeeHeads(next);
                          }}
                            className="text-[9px] px-2 py-1 bg-white border border-zinc-200 rounded-lg font-bold outline-none focus:ring-2 focus:ring-blue-200"
                            onClick={e => e.stopPropagation()}>
                            <option value="semester">Semester-wise</option>
                            <option value="academic-year">Academic Year-wise</option>
                            <option value="student">Student-wise</option>
                          </select>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => { setHeadEditIdx(idx); setHeadEditVal(head.name || head); }}
                              className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={14} /></button>
                            <button onClick={() => setFeeHeads(feeHeads.filter((_, i) => i !== idx))}
                              className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => {
                  let newName = "New Fee Head";
                  let c = 1;
                  while (feeHeads.some(h => (h.name || h) === newName)) { newName = `New Fee Head ${c}`; c++; }
                  const newIdx = feeHeads.length;
                  setFeeHeads([...feeHeads, { name: newName, splitType: "student" }]);
                  setHeadEditIdx(newIdx);
                  setHeadEditVal(newName);
                }}
                  className="flex items-center gap-1.5 text-sm font-bold text-[#120c7a] hover:underline px-3 py-2">
                  <Plus size={16} /> Add Fee Head
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50">
              <button onClick={() => setShowHeadModal(false)}
                className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl transition-all">
                Cancel
              </button>
              <button onClick={async () => {
                const cleaned = feeHeads.filter(h => (h.name || h || "").toString().trim() !== "");
                if (cleaned.length === 0) return;
                try {
                  await setDoc(doc(db, "fee_categories", "global"), { categories: cleaned, updatedAt: new Date().toISOString() });
                  setFeeHeads(cleaned);
                  showToast("Fee heads saved");
                  setShowHeadModal(false);
                } catch { showToast("Failed to save", "error"); }
              }}
                className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2 shadow-lg">
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opening Dues / Arrears Modal */}
      {showOpeningDuesModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 lg:p-8" onClick={() => setShowOpeningDuesModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-hidden flex flex-col transform animate-in zoom-in-95 duration-200 border border-zinc-100" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <FileSpreadsheet size={20} className="text-amber-200" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Previous Academic Year Dues (Opening Balance)</h3>
                  <p className="text-xs text-amber-100">
                    Batch-wise Excel template download with active fee heads & bulk upload
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOpeningDuesModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs inside Modal */}
            <div className="px-6 pt-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setOpeningDuesTab("template")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  openingDuesTab === "template"
                    ? "border-amber-600 text-amber-800 bg-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Download size={14} />
                <span>1. Download Excel Template</span>
              </button>

              <button
                type="button"
                onClick={() => setOpeningDuesTab("upload")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  openingDuesTab === "upload" || openingDuesTab === "preview"
                    ? "border-amber-600 text-amber-800 bg-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Upload size={14} />
                <span>2. Upload Filled Excel</span>
                {uploadedDuesData.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[10px] font-extrabold">
                    {uploadedDuesData.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setOpeningDuesTab("view")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  openingDuesTab === "view"
                    ? "border-amber-600 text-amber-800 bg-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <FileText size={14} />
                <span>3. View Uploaded Arrears</span>
                <span className="px-1.5 py-0.2 bg-zinc-200 text-zinc-700 rounded-full text-[10px] font-extrabold">
                  {openingDues.length}
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* TAB 1: DOWNLOAD TEMPLATE */}
              {openingDuesTab === "template" && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
                    <p className="font-bold flex items-center gap-2 text-amber-950">
                      <HelpCircle size={15} /> How Opening Dues Template Works:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-amber-800">
                      <li>Choose a senior student batch (e.g. <b>2024-2028</b> or <b>2025-2029</b>) and previous academic year.</li>
                      <li>The template automatically includes columns for all <b>{activeHeadsList.length} configured Fee Heads</b>: <i>{activeHeadsList.slice(0, 5).join(", ")}{activeHeadsList.length > 5 ? `, and ${activeHeadsList.length - 5} more` : ""}</i>.</li>
                      <li>All registered students in this batch will be pre-filled so you only need to enter the due amounts for students with arrears.</li>
                      <li>Leave <b>0</b> or blank for students who have already settled past dues.</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 border border-zinc-200 p-5 rounded-2xl">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1.5">
                        Select Student Batch
                      </label>
                      <select
                        value={selectedBatchForTemplate}
                        onChange={e => setSelectedBatchForTemplate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-200"
                      >
                        {allAvailableBatches.map(b => (
                          <option key={b} value={b}>Batch: {b}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-zinc-400 mt-1">
                        {new Set(students.filter(s => isBatchMatch(s.batch || s._profile_data?.batch, selectedBatchForTemplate)).map(s => (s.regNo || s.examNumber || s.rollNo || "").trim().toUpperCase()).filter(Boolean)).size} unique students enrolled in this batch
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1.5">
                        Previous Academic Year
                      </label>
                      <input
                        type="text"
                        value={selectedYearForTemplate}
                        onChange={e => setSelectedYearForTemplate(e.target.value)}
                        placeholder="e.g. 2024-2025"
                        className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-200"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">
                        Academic year for which pending arrears are being imported
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleDownloadOpeningDuesTemplate}
                      className="px-6 py-3 bg-[#120c7a] hover:bg-blue-900 text-white text-xs font-bold rounded-xl shadow-lg shadow-[#120c7a]/20 flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <Download size={16} />
                      Download Excel Template for Batch {selectedBatchForTemplate}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: UPLOAD & PREVIEW */}
              {(openingDuesTab === "upload" || openingDuesTab === "preview") && (
                <div className="space-y-4">
                  {uploadedDuesData.length === 0 ? (
                    <div className="border-2 border-dashed border-zinc-300 hover:border-amber-500 rounded-3xl p-8 text-center transition-all bg-zinc-50/50">
                      <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <FileUp size={28} />
                      </div>
                      <h4 className="font-bold text-zinc-800 text-sm">Upload Filled Arrears Excel File</h4>
                      <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                        Upload the filled template (.xlsx or .xls). The system will automatically detect the Register Numbers and mapped Fee Heads.
                      </p>
                      <label className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-amber-600/20 transition-all">
                        <Upload size={15} />
                        <span>Select Excel File</span>
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={handleUploadOpeningDuesExcel}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Summary Ribbon */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                          <p className="text-[10px] font-bold text-amber-700 uppercase">Arrear Entries</p>
                          <p className="text-xl font-black text-amber-950 mt-1">{uploadedDuesData.length}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                          <p className="text-[10px] font-bold text-blue-700 uppercase">Students with Dues</p>
                          <p className="text-xl font-black text-blue-950 mt-1">
                            {new Set(uploadedDuesData.map(e => e.regNo)).size}
                          </p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                          <p className="text-[10px] font-bold text-emerald-700 uppercase">Total Arrears Amount</p>
                          <p className="text-xl font-black text-emerald-950 mt-1">
                            ₹{uploadedDuesData.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Preview Table */}
                      <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                          <h5 className="font-bold text-xs text-zinc-700">Preview Parsed Arrears Records</h5>
                          <span className="text-[10px] text-zinc-400 font-semibold">Showing first 50 records</span>
                        </div>
                        <div className="overflow-x-auto max-h-[45vh]">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-100 text-zinc-500 uppercase text-[9px] font-bold sticky top-0">
                              <tr>
                                <th className="px-3.5 py-2.5">Reg No</th>
                                <th className="px-3.5 py-2.5">Student Name</th>
                                <th className="px-3.5 py-2.5">Dept</th>
                                <th className="px-3.5 py-2.5">Batch</th>
                                <th className="px-3.5 py-2.5">AY</th>
                                <th className="px-3.5 py-2.5">Fee Head</th>
                                <th className="px-3.5 py-2.5 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {uploadedDuesData.slice(0, 50).map((row, i) => (
                                <tr key={i} className="hover:bg-zinc-50">
                                  <td className="px-3.5 py-2.5 font-mono font-bold text-[#120c7a] whitespace-nowrap">{row.regNo}</td>
                                  <td className="px-3.5 py-2.5 font-bold text-zinc-800 whitespace-nowrap">{row.studentName}</td>
                                  <td className="px-3.5 py-2.5 text-zinc-600 font-medium whitespace-nowrap">{row.department}</td>
                                  <td className="px-3.5 py-2.5 whitespace-nowrap">{row.batch}</td>
                                  <td className="px-3.5 py-2.5 whitespace-nowrap">{row.academicYear}</td>
                                  <td className="px-3.5 py-2.5 font-bold text-amber-800 whitespace-nowrap">{row.head}</td>
                                  <td className="px-3.5 py-2.5 text-right font-black text-zinc-900 whitespace-nowrap text-sm">₹{Number(row.amount).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => setUploadedDuesData([])}
                          className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
                        >
                          ✕ Clear & Upload Another
                        </button>

                        <button
                          type="button"
                          disabled={duesUploading}
                          onClick={handleConfirmSaveOpeningDues}
                          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
                        >
                          {duesUploading ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          ) : (
                            <Save size={16} />
                          )}
                          <span>Confirm & Save {uploadedDuesData.length} Dues to System</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VIEW & MANAGE UPLOADED ARREARS */}
              {openingDuesTab === "view" && (
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search by student, reg no, or fee head..."
                        value={openingDuesSearch}
                        onChange={e => setOpeningDuesSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-200"
                      />
                    </div>

                    <select
                      value={openingDuesBatchFilter}
                      onChange={e => setOpeningDuesBatchFilter(e.target.value)}
                      className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="ALL">All Batches</option>
                      {allAvailableBatches.map(b => (
                        <option key={b} value={b}>Batch: {b}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setOpeningDuesTab("template")}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={14} /> Add / Import More
                    </button>
                  </div>

                  {/* Arrears List Table */}
                  {(() => {
                    const filtered = openingDues.filter(od => {
                      if (openingDuesBatchFilter !== "ALL" && (od.batch || "").trim().toLowerCase() !== openingDuesBatchFilter.trim().toLowerCase()) {
                        return false;
                      }
                      if (openingDuesSearch) {
                        const q = openingDuesSearch.toLowerCase();
                        const matches = (od.studentName || "").toLowerCase().includes(q) ||
                          (od.regNo || "").toLowerCase().includes(q) ||
                          (od.head || "").toLowerCase().includes(q) ||
                          (od.academicYear || "").toLowerCase().includes(q);
                        if (!matches) return false;
                      }
                      return true;
                    });

                    const totalArrearAmt = filtered.reduce((s, od) => s + (Number(od.amount) || 0), 0);

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                          <span>Showing {filtered.length} opening due record{filtered.length !== 1 ? 's' : ''}</span>
                          <span className="text-amber-800 font-extrabold">Total: ₹{totalArrearAmt.toLocaleString()}</span>
                        </div>

                        <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                          <div className="overflow-x-auto max-h-[52vh]">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-zinc-50 text-zinc-500 uppercase text-[9px] font-bold sticky top-0 border-b border-zinc-200">
                                <tr>
                                  <th className="px-3.5 py-2.5">S.No</th>
                                  <th className="px-3.5 py-2.5">Reg No</th>
                                  <th className="px-3.5 py-2.5">Student Name</th>
                                  <th className="px-3.5 py-2.5">Dept</th>
                                  <th className="px-3.5 py-2.5">Batch</th>
                                  <th className="px-3.5 py-2.5">Academic Year</th>
                                  <th className="px-3.5 py-2.5">Fee Head</th>
                                  <th className="px-3.5 py-2.5 text-right">Due Amount</th>
                                  <th className="px-3.5 py-2.5 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {filtered.length === 0 ? (
                                  <tr>
                                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-400 text-xs">
                                      No opening dues found. Use "Download Template" and "Upload Excel" to import.
                                    </td>
                                  </tr>
                                ) : (
                                  filtered.map((od, idx) => (
                                    <tr key={od.id || idx} className="hover:bg-zinc-50">
                                      <td className="px-3.5 py-2.5 text-zinc-400">{idx + 1}</td>
                                      <td className="px-3.5 py-2.5 font-mono font-bold text-[#120c7a] whitespace-nowrap">{od.regNo}</td>
                                      <td className="px-3.5 py-2.5 font-bold text-zinc-800 whitespace-nowrap">{od.studentName}</td>
                                      <td className="px-3.5 py-2.5 text-zinc-600 font-medium whitespace-nowrap">{od.department}</td>
                                      <td className="px-3.5 py-2.5 whitespace-nowrap">{od.batch}</td>
                                      <td className="px-3.5 py-2.5 font-semibold text-zinc-600 whitespace-nowrap">{od.academicYear}</td>
                                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg font-bold text-[10px] border border-amber-200">
                                          {od.head}
                                        </span>
                                      </td>
                                      <td className="px-3.5 py-2.5 text-right font-black text-zinc-900 whitespace-nowrap text-sm">₹{(Number(od.amount) || 0).toLocaleString()}</td>
                                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteOpeningDue(od.id)}
                                          className="p-1.5 hover:bg-red-50 text-zinc-400 hover:text-red-600 rounded-lg transition-all cursor-pointer"
                                          title="Delete Opening Due"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Opening dues integrate directly with student accounts & online fees portal.
              </span>
              <button
                type="button"
                onClick={() => setShowOpeningDuesModal(false)}
                className="px-5 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200 rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Fee Upload (Netkampus / Prior ERP Settlement) Modal */}
      {showNetkampusModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 lg:p-8" onClick={() => setShowNetkampusModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-hidden flex flex-col transform animate-in zoom-in-95 duration-200 border border-zinc-100" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-purple-800 via-indigo-800 to-[#120c7a] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <UploadCloud size={20} className="text-purple-200" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Bulk Fee Upload (Settled by Netkampus / Prior Payments)</h3>
                  <p className="text-xs text-purple-200">
                    Import historical payments made before ERP rollout — credits fee heads, updates remaining dues, and marks as "Settled by Netkampus"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNetkampusModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs inside Modal */}
            <div className="px-6 pt-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setNetkampusTab("template")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  netkampusTab === "template"
                    ? "border-purple-700 text-purple-900 bg-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Download size={14} />
                <span>1. Download Excel Template</span>
              </button>

              <button
                type="button"
                onClick={() => setNetkampusTab("upload")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  netkampusTab === "upload" || netkampusTab === "preview"
                    ? "border-purple-700 text-purple-900 bg-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Upload size={14} />
                <span>2. Upload Filled Excel</span>
                {uploadedNetkampusData.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full text-[10px] font-extrabold">
                    {uploadedNetkampusData.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setNetkampusTab("view")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  netkampusTab === "view"
                    ? "border-purple-700 text-purple-900 bg-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <FileText size={14} />
                <span>3. View Netkampus Settlements</span>
                <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full text-[10px] font-extrabold">
                  {netkampusSettlements.length}
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* TAB 1: DOWNLOAD TEMPLATE */}
              {netkampusTab === "template" && (
                <div className="space-y-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs text-purple-900 space-y-2">
                    <p className="font-bold flex items-center gap-2 text-purple-950">
                      <HelpCircle size={15} /> How Bulk Fee Upload (Netkampus) Works:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-purple-800">
                      <li>Choose <b>Programme</b> (UG / PG) ➔ <b>Batch</b> (e.g. 2024-2028) ➔ <b>Academic Year</b> (e.g. 2024-2025).</li>
                      <li>The template automatically includes columns for all <b>{netkampusTemplateHeads.length} active Fee Heads</b> ({netkampusTemplateHeads.slice(0, 4).join(", ")}{netkampusTemplateHeads.length > 4 ? ` + ${netkampusTemplateHeads.length - 4} more` : ""}).</li>
                      <li>All enrolled students in this batch are pre-filled so accounts staff only enter the amounts paid, transaction date, and transaction ID.</li>
                      <li>When uploaded, the student's fee structure will automatically deduct this amount, and <b>only the remaining due will be shown</b>.</li>
                      <li>In student portal & collect payment, this is recorded as <b>"Settled by Netkampus"</b>, and official ERP receipts will not be generated.</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-zinc-50 border border-zinc-200 p-5 rounded-2xl">
                    {/* 1. Programme Selection */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1.5">
                        1. Select Programme
                      </label>
                      <select
                        value={netkampusProg}
                        onChange={e => {
                          const p = e.target.value;
                          setNetkampusProg(p);
                          setNetkampusBatch("");
                          setNetkampusYear("");
                        }}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-600"
                      >
                        {netkampusAvailableProgs.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Batch Selection (Cascades from Programme) */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1.5">
                        2. Select Student Batch
                      </label>
                      <select
                        value={netkampusBatch}
                        onChange={e => setNetkampusBatch(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-600"
                      >
                        {netkampusBatches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Academic Year Selection (Cascades from Batch) */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1.5">
                        3. Select Academic Year
                      </label>
                      <select
                        value={netkampusYear}
                        onChange={e => setNetkampusYear(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-600"
                      >
                        {netkampusYears.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Summary & Download Button */}
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-zinc-700">
                        Targeting: <span className="text-purple-700 font-black">{netkampusProg} • Batch {netkampusBatch || "—"} • {netkampusYear || "—"}</span>
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {netkampusEnrolledStudents.length} registered students ready to be pre-filled with {netkampusTemplateHeads.length} fee heads.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadNetkampusTemplate}
                      className="w-full sm:w-auto px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-purple-700/20 transition-all cursor-pointer"
                    >
                      <Download size={15} />
                      Download Pre-filled Excel Template
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: UPLOAD & PREVIEW */}
              {(netkampusTab === "upload" || netkampusTab === "preview") && (
                <div className="space-y-4">
                  {/* Upload Box */}
                  <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/30 rounded-2xl p-6 text-center transition-all">
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleUploadNetkampusExcel}
                      id="netkampus-excel-upload"
                      className="hidden"
                    />
                    <label htmlFor="netkampus-excel-upload" className="cursor-pointer block space-y-2">
                      <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto">
                        <FileUp size={24} />
                      </div>
                      <p className="text-sm font-bold text-zinc-800">
                        Click to upload filled Excel file (.xlsx / .xls)
                      </p>
                      <p className="text-xs text-zinc-400">
                        Amounts greater than 0 will be credited against student fee heads and deducted from current dues
                      </p>
                    </label>
                  </div>

                  {/* Preview Section */}
                  {uploadedNetkampusData.length > 0 && (
                    <div className="space-y-4">
                      {/* Summary Banner */}
                      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 size={20} className="text-purple-600" />
                          <div>
                            <p className="font-bold text-purple-950">
                              Parsed {uploadedNetkampusData.length} Fee Payments across {new Set(uploadedNetkampusData.map(e => e.regNo)).size} Students
                            </p>
                            <p className="text-purple-700 text-[11px]">
                              Total Amount Settled via Netkampus: <span className="font-black text-sm text-purple-900">₹{uploadedNetkampusData.reduce((s, e) => s + e.amount, 0).toLocaleString()}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setUploadedNetkampusData([])}
                            className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={netkampusUploading}
                            onClick={handleConfirmSaveNetkampus}
                            className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-700/25 transition-all cursor-pointer"
                          >
                            {netkampusUploading ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" />
                                Saving Payments...
                              </>
                            ) : (
                              <>
                                <Check size={14} />
                                Confirm & Save Netkampus Settlements
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Preview Table */}
                      <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                        <div className="overflow-x-auto max-h-[45vh]">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 text-zinc-500 uppercase text-[9px] font-bold sticky top-0 border-b border-zinc-200">
                              <tr>
                                <th className="px-3.5 py-2.5">S.No</th>
                                <th className="px-3.5 py-2.5">Reg No</th>
                                <th className="px-3.5 py-2.5">Student Name</th>
                                <th className="px-3.5 py-2.5">Dept</th>
                                <th className="px-3.5 py-2.5">Batch</th>
                                <th className="px-3.5 py-2.5">Academic Year</th>
                                <th className="px-3.5 py-2.5">Fee Head</th>
                                <th className="px-3.5 py-2.5 text-right">Amount</th>
                                <th className="px-3.5 py-2.5">Date</th>
                                <th className="px-3.5 py-2.5">Txn ID / Ref</th>
                                <th className="px-3.5 py-2.5 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 font-medium">
                              {uploadedNetkampusData.slice(0, 100).map((row, idx) => (
                                <tr key={idx} className="hover:bg-zinc-50/80">
                                  <td className="px-3.5 py-2 text-zinc-400 text-[11px]">{idx + 1}</td>
                                  <td className="px-3.5 py-2 font-mono font-bold text-zinc-800">{row.regNo}</td>
                                  <td className="px-3.5 py-2 font-bold text-zinc-700">{row.studentName}</td>
                                  <td className="px-3.5 py-2 text-zinc-500 text-[11px]">{row.department}</td>
                                  <td className="px-3.5 py-2 text-zinc-500 text-[11px]">{row.batch}</td>
                                  <td className="px-3.5 py-2 text-zinc-500 text-[11px]">{row.academicYear}</td>
                                  <td className="px-3.5 py-2">
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold">
                                      {row.head}
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2 text-right font-black text-purple-700">
                                    ₹{row.amount.toLocaleString()}
                                  </td>
                                  <td className="px-3.5 py-2 text-zinc-500 text-[11px]">
                                    {row.dateOfTransaction instanceof Date ? row.dateOfTransaction.toLocaleDateString('en-IN') : String(row.dateOfTransaction)}
                                  </td>
                                  <td className="px-3.5 py-2 font-mono text-[10px] text-zinc-500">
                                    {row.transactionId}
                                  </td>
                                  <td className="px-3.5 py-2 text-center">
                                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[9px] font-bold border border-purple-200">
                                      Settled by Netkampus
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {uploadedNetkampusData.length > 100 && (
                          <div className="p-2.5 bg-zinc-50 border-t border-zinc-200 text-center text-xs text-zinc-400 font-bold">
                            Showing first 100 of {uploadedNetkampusData.length} records in preview
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VIEW NETKAMPUS SETTLEMENTS */}
              {netkampusTab === "view" && (
                <div className="space-y-4">
                  {/* Filters Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl">
                    <div className="relative w-full sm:w-72">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search by student, reg no, or head..."
                        value={netkampusSearch}
                        onChange={e => setNetkampusSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-purple-100"
                      />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select
                        value={netkampusBatchFilter}
                        onChange={e => setNetkampusBatchFilter(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold outline-none"
                      >
                        <option value="ALL">All Batches</option>
                        {Array.from(new Set(netkampusSettlements.map(p => p.batch).filter(Boolean))).sort().map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setNetkampusTab("upload")}
                        className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap ml-auto"
                      >
                        <Plus size={14} /> Upload More
                      </button>
                    </div>
                  </div>

                  {/* Netkampus Payments Table */}
                  {(() => {
                    const filtered = netkampusSettlements.filter(p => {
                      if (netkampusBatchFilter !== "ALL" && (p.batch || "").trim().toLowerCase() !== netkampusBatchFilter.trim().toLowerCase()) {
                        return false;
                      }
                      if (netkampusSearch) {
                        const q = netkampusSearch.toLowerCase();
                        const matches = (p.studentName || "").toLowerCase().includes(q) ||
                          (p.examNumber || p.regNo || "").toLowerCase().includes(q) ||
                          (p.feeHead || "").toLowerCase().includes(q) ||
                          (p.academicYear || "").toLowerCase().includes(q) ||
                          (p.refNo || p.transactionId || "").toLowerCase().includes(q);
                        if (!matches) return false;
                      }
                      return true;
                    });

                    const totalSettledAmt = filtered.reduce((s, p) => s + (Number(p.amount) || 0), 0);

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                          <span>Showing {filtered.length} Netkampus settlement record{filtered.length !== 1 ? 's' : ''}</span>
                          <span className="text-purple-900 font-extrabold text-sm">Total Settled: ₹{totalSettledAmt.toLocaleString()}</span>
                        </div>

                        <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                          <div className="overflow-x-auto max-h-[52vh]">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-zinc-50 text-zinc-500 uppercase text-[9px] font-bold sticky top-0 border-b border-zinc-200">
                                <tr>
                                  <th className="px-3.5 py-2.5">S.No</th>
                                  <th className="px-3.5 py-2.5">Reg No</th>
                                  <th className="px-3.5 py-2.5">Student Name</th>
                                  <th className="px-3.5 py-2.5">Dept</th>
                                  <th className="px-3.5 py-2.5">Batch</th>
                                  <th className="px-3.5 py-2.5">Academic Year</th>
                                  <th className="px-3.5 py-2.5">Fee Head</th>
                                  <th className="px-3.5 py-2.5 text-right">Amount</th>
                                  <th className="px-3.5 py-2.5">Txn ID / Ref</th>
                                  <th className="px-3.5 py-2.5">Payment Date</th>
                                  <th className="px-3.5 py-2.5 text-center">Status</th>
                                  <th className="px-3.5 py-2.5 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 font-medium">
                                {filtered.length === 0 ? (
                                  <tr>
                                    <td colSpan={12} className="px-4 py-12 text-center text-zinc-400 text-xs">
                                      {netkampusSettlements.length === 0
                                        ? "No Netkampus fee payments imported yet. Use Tab 1 & 2 to download template and upload filled payments."
                                        : "No settlements match the selected filter / search."}
                                    </td>
                                  </tr>
                                ) : (
                                  filtered.map((p, idx) => (
                                    <tr key={p.id || idx} className="hover:bg-zinc-50/80">
                                      <td className="px-3.5 py-2 text-zinc-400 text-[11px]">{idx + 1}</td>
                                      <td className="px-3.5 py-2 font-mono font-bold text-zinc-800">{p.examNumber || p.regNo || "—"}</td>
                                      <td className="px-3.5 py-2 font-bold text-zinc-700">{p.studentName || "—"}</td>
                                      <td className="px-3.5 py-2 text-zinc-500 text-[11px]">{displayDept(p.department || "")}</td>
                                      <td className="px-3.5 py-2 text-zinc-500 text-[11px]">{p.batch || "—"}</td>
                                      <td className="px-3.5 py-2 text-zinc-500 text-[11px]">{p.academicYear || "—"}</td>
                                      <td className="px-3.5 py-2">
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold">
                                          {p.feeHead || "Fee"}
                                        </span>
                                      </td>
                                      <td className="px-3.5 py-2 text-right font-black text-purple-700">
                                        ₹{(Number(p.amount) || 0).toLocaleString()}
                                      </td>
                                      <td className="px-3.5 py-2 font-mono text-[10px] text-zinc-500">
                                        {p.refNo || p.transactionId || p.orderId || "—"}
                                      </td>
                                      <td className="px-3.5 py-2 text-zinc-500 text-[11px]">
                                        {(() => {
                                          const ts = p.paymentDate || p.createdAt;
                                          if (!ts) return "—";
                                          const d = ts.toDate ? ts.toDate() : new Date(ts);
                                          return isNaN(d.getTime()) ? "—" : d.toLocaleDateString('en-IN');
                                        })()}
                                      </td>
                                      <td className="px-3.5 py-2 text-center">
                                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-[10px] font-black">
                                          Settled by Netkampus
                                        </span>
                                      </td>
                                      <td className="px-3.5 py-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteNetkampusSettlement(p.id)}
                                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                          title="Delete / Revert this Netkampus settlement record"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Netkampus settlements automatically reduce student fee dues in both cashier operations and student portal.
              </span>
              <button
                type="button"
                onClick={() => setShowNetkampusModal(false)}
                className="px-5 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200 rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <DirectScholarshipSettlementModal
        isOpen={showScholarshipSettlementModal}
        onClose={() => setShowScholarshipSettlementModal(false)}
        students={students}
        allAvailableBatches={allAvailableBatches}
        feeConfigs={feeConfigs}
        semesterConfigs={semesterConfigs}
        openingDues={openingDues}
        payments={payments}
        feeHeads={feeHeads}
        showToast={showToast}
        db={db}
      />

      {/* Official Voucher Receipt Modal */}
      <OfficialFeeReceiptModal
        open={receiptModal.open}
        onClose={() => setReceiptModal({ open: false, payment: null })}
        payment={receiptModal.payment}
        studentData={(() => {
          const p = receiptModal.payment || {};
          return (selectedStudent && matchesStudentRecord(selectedStudent, p))
            ? selectedStudent
            : (students.find(s =>
                (p.examNumber && (s.regNo === p.examNumber || s.examNumber === p.examNumber || s.rollNo === p.examNumber)) ||
                (p.regNo && (s.regNo === p.regNo || s.examNumber === p.regNo)) ||
                (p.studentId && (s.id === p.studentId || s.uid === p.studentId)) ||
                (p.uid && (s.id === p.uid || s.uid === p.uid)) ||
                (p.studentEmail && s.email && s.email.toLowerCase() === p.studentEmail.toLowerCase())
              ) || selectedStudent || studentFeeDetails?.student);
        })()}
      />

      {/* Admin Payment Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRecoveryModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-[#120c7a] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-blue-300" />
                </div>
                <div>
                  <h3 className="text-base font-black">Verify / Recover Payment</h3>
                  <p className="text-[11px] text-blue-200">Independent HDFC SmartGateway server-side inquiry & fulfillment</p>
                </div>
              </div>
              <button onClick={() => setShowRecoveryModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdminVerifyAndRecover} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-zinc-700 block mb-1.5">
                  Merchant Order ID / Transaction Reference
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={recoveryOrderId}
                    onChange={(e) => setRecoveryOrderId(e.target.value)}
                    placeholder="e.g. EXAMMUL31Z5F7942711D or FEEM..."
                    className="w-full pl-4 pr-10 py-3 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono font-bold focus:bg-white focus:border-[#120c7a] focus:ring-4 focus:ring-blue-100 outline-none transition-all uppercase"
                  />
                  {recoveryOrderId && (
                    <button
                      type="button"
                      onClick={() => setRecoveryOrderId("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Accepts Order IDs from College Fee Account (<span className="font-mono font-bold text-blue-700">#76980</span>) or COE / Exam Cell Account (<span className="font-mono font-bold text-purple-700">#76983</span>).
                </p>
              </div>

              {recoveryResult && (
                <div className={`p-4 rounded-2xl border ${recoveryResult.status === "CHARGED" || recoveryResult.status === "SUCCESS" || recoveryResult.recovered ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"} space-y-2.5 text-xs`}>
                  <div className="flex items-center justify-between border-b pb-2 border-zinc-200/60">
                    <span className="font-bold text-zinc-600">Merchant Account:</span>
                    <span className="font-mono font-black text-zinc-900">{recoveryResult.merchantId || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 border-zinc-200/60">
                    <span className="font-bold text-zinc-600">Gateway Status:</span>
                    <span className={`font-mono font-black px-2 py-0.5 rounded ${recoveryResult.status === "CHARGED" || recoveryResult.status === "SUCCESS" ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"}`}>
                      {recoveryResult.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 border-zinc-200/60">
                    <span className="font-bold text-zinc-600">Verified Amount:</span>
                    <span className="font-mono font-black text-zinc-900">₹{Number(recoveryResult.amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 border-zinc-200/60">
                    <span className="font-bold text-zinc-600">Bank UPI RRN:</span>
                    <span className="font-mono font-bold text-zinc-800">{recoveryResult.rrn || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 border-zinc-200/60">
                    <span className="font-bold text-zinc-600">Gateway Txn ID:</span>
                    <span className="font-mono text-zinc-800">{recoveryResult.txnId || "N/A"}</span>
                  </div>
                  {recoveryResult.receiptNo && (
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-800">Generated Receipt:</span>
                      <span className="font-mono font-black text-emerald-900">#{recoveryResult.receiptNo}</span>
                    </div>
                  )}
                  {recoveryResult.recovered && (
                    <div className="p-2 bg-emerald-100 text-emerald-900 rounded-lg text-center font-bold">
                      ✓ Successfully recovered and applied to student records!
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="px-5 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={recoveringPayment || !recoveryOrderId.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {recoveringPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                      <span>Verifying with HDFC...</span>
                    </>
                  ) : (
                    <>
                      <Search size={14} />
                      <span>Verify & Recover Now</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
