import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, Timestamp, query, where } from "firebase/firestore";
import {
  IndianRupee, Plus, Search, Edit3, Trash2, X, CheckCircle2, AlertCircle,
  CreditCard, Building2, Users, Download, Printer,
  ChevronDown, ChevronRight, FileText, Wallet, Percent, BadgeCheck,
  CalendarDays, Banknote, QrCode, ShieldCheck, Filter, Copy,
  Tags, Pencil, Layers, Save
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { getSeatConfigurationsRealtime } from "../services/seatService";
import { formatProgrammeKey, formatProgDisplay, sanitizeKey } from "../lib/utils";
import Layout from "../components/Layout";
import * as XLSX from "xlsx";

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
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "cheque", label: "Cheque", icon: "📝" },
  { value: "upi", label: "UPI", icon: "📱" },
  { value: "online", label: "Online Transfer", icon: "💳" },
  { value: "dd", label: "Demand Draft", icon: "🏛️" },
  { value: "neft", label: "NEFT/RTGS", icon: "🏦" },
  { value: "card", label: "Card", icon: "💳" },
];

// QUOTA_OPTIONS now derived dynamically from seat configurations
const BRANCHES = ["CSE", "ECE", "EEE", "ME", "CE", "CSBS", "AIML", "DS", "IT", "AIDS"];

const displayDept = (v) => {
  if (typeof v !== 'string') return v || '--';
  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
  ];
  let result = v;
  for (const { key, display } of progPrefixMap) {
    const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
    if (regex.test(result)) {
      result = result.replace(regex, display + ' ');
      break;
    }
  }
  return result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

export default function FeeOperations() {
  const location = useLocation();
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);
  const [tab, setTab] = useState(() => {
    if (location.pathname.includes("/fee/operations")) return "collect";
    return "structure";
  });
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [students, setStudents] = useState([]);
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
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [headEditIdx, setHeadEditIdx] = useState(null);
  const [headEditVal, setHeadEditVal] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Fee Structure state
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [editFeeId, setEditFeeId] = useState(null);
  const [feeForm, setFeeForm] = useState({ programme: "", batch: "", academicYear: "", semester: "", department: "", quota: "", head: "", amount: "", sameForAllYears: false });

  // Payment state
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentQuota, setSelectedStudentQuota] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "cash", feeHead: "", semester: "", remarks: "", refNo: "", paymentDate: new Date().toISOString().split("T")[0] });

  // Receipt state
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptDateFrom, setReceiptDateFrom] = useState("");
  const [receiptDateTo, setReceiptDateTo] = useState("");
  const [receiptModal, setReceiptModal] = useState({ open: false, payment: null });

  // Concession state
  const [showConcessionModal, setShowConcessionModal] = useState(false);
  const [concessionForm, setConcessionForm] = useState({ studentId: "", studentName: "", examNumber: "", type: "Merit", amount: "", percentage: "", validTill: "", status: "pending", remarks: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "fee_payments"), snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(collection(db, "fee_receipts"), snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u3 = onSnapshot(collection(db, "fee_concessions"), snap => setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u4 = onSnapshot(query(collection(db, "users"), where("role", "==", "Student")), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const u5 = onSnapshot(collection(db, "fee_configurations"), snap => setFeeConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u6 = getSeatConfigurationsRealtime(data => setSeatConfigs(data || {}), () => {});
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
    }).catch(() => {});
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setSelectedStudentQuota("");
      return;
    }
    const reg = selectedStudent.regNo;
    if (!reg) {
      setSelectedStudentQuota(selectedStudent._profile_data?.quotaAskedFor || "");
      return;
    }

    (async () => {
      try {
        const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
        if (idxSnap.exists()) {
          const sDocId = idxSnap.data().studentDocId;
          if (sDocId) {
            const sSnap = await getDoc(doc(db, 'students', sDocId));
            if (sSnap.exists()) {
              const extra = sSnap.data()._student_data?.[reg] || {};
              setSelectedStudentQuota(extra.quotaAskedFor || "");
              return;
            }
          }
        }
      } catch (_) {}
      setSelectedStudentQuota(selectedStudent._profile_data?.quotaAskedFor || "");
    })();
  }, [selectedStudent]);

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
      setFeeForm({ programme: "", batch: "", academicYear: "", semester: "", department: "", quota: "", head: "", amount: "", sameForAllYears: false });
    } catch (err) { showToast("Error saving fee", "error"); }
    finally { setSaving(false); }
  };

  const handleRecordPayment = async () => {
    if (!selectedStudent || !paymentForm.amount || !paymentForm.feeHead) return;
    setSaving(true);
    try {
      const receiptNo = `FEE${new Date().getFullYear()}-${String(receipts.length + 1).padStart(5, "0")}`;
      const examNo = selectedStudent.regNo || selectedStudent.examNumber || selectedStudent.id;
      const payData = {
        studentId: selectedStudent.id,
        examNumber: examNo,
        studentName: selectedStudent.displayName || selectedStudent.studentName,
        programme: selectedStudent.programme || "",
        department: selectedStudent.department || "",
        batch: selectedStudent.batch || "",
        amount: Number(paymentForm.amount),
        mode: paymentForm.mode,
        feeHead: paymentForm.feeHead,
        semester: paymentForm.semester,
        remarks: paymentForm.remarks,
        refNo: paymentForm.refNo,
        receiptNo,
        paymentDate: Timestamp.fromDate(new Date(paymentForm.paymentDate)),
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db, "fee_payments"), payData);
      await addDoc(collection(db, "fee_receipts"), { ...payData, status: "active", cancelledAt: null, reason: null, reprintCount: 0 });
      showToast(`Payment recorded — Receipt #${receiptNo}`);
      setPaymentForm({ amount: "", mode: "cash", feeHead: "", semester: "", remarks: "", refNo: "", paymentDate: new Date().toISOString().split("T")[0] });
    } catch (err) { showToast("Error recording payment: " + err.message, "error"); }
    finally { setSaving(false); }
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

  const filteredStudents = students.filter(s => {
    if (!studentSearch) return false;
    const q = studentSearch.toLowerCase();
    return (s.displayName || s.studentName || "").toLowerCase().includes(q) ||
           (s.regNo || "").toLowerCase().includes(q) ||
           (s.email || "").toLowerCase().includes(q) ||
           (s.examNumber || "").toLowerCase().includes(q);
  }).slice(0, 10);

  const studentFeeDetails = useMemo(() => {
    if (!selectedStudent) return null;
    const prog = selectedStudent.programme || '';
    const dept = selectedStudent.department || '';
    const batch = selectedStudent.batch || '';

    const normStudentProg = formatProgrammeKey(prog);
    const normStudentDept = (dept || "").replace(/[_.\s]/g, '').toLowerCase();
    const normStudentBatch = (batch || "").trim().toLowerCase();

    // 1. Filter configs based on programme, department, batch AND quota/seatCategory
    const fees = feeConfigs.filter(f => {
      const normDataProg = formatProgrammeKey(f.programme);
      const normDataDept = (f.department || "").replace(/[_.\s]/g, '').toLowerCase();
      const normDataBatch = (f.batch || "").trim().toLowerCase();

      const isProgMatch = normDataProg && normDataProg === normStudentProg;
      const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
      const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;
      const isQuotaMatch = !selectedStudentQuota || !f.quota || f.quota === selectedStudentQuota;

      return isProgMatch && isDeptMatch && isBatchMatch && isQuotaMatch;
    });

    // 2. Filter payments matching the selected student & valid payment statuses only (filter out pending/failed online payments!)
    const studentPayments = payments.filter(p => {
      const matchesStudent = 
        (selectedStudent.id && (p.studentId === selectedStudent.id || p.uid === selectedStudent.id)) ||
        (selectedStudent.regNo && p.examNumber === selectedStudent.regNo) ||
        (selectedStudent.examNumber && p.examNumber === selectedStudent.examNumber);
      if (!matchesStudent) return false;

      // Online payment check: must be SUCCESS
      if (p.status !== undefined) {
        return p.status === "SUCCESS";
      }
      return true; // Manual payment (has no status field), count it
    });

    const totalFees = fees.reduce((s, f) => s + (f.amount || 0), 0);
    const totalPaid = studentPayments.reduce((s, p) => s + (p.chargedAmount || p.amount || 0), 0);
    const outstanding = Math.max(0, totalFees - totalPaid);

    // Calculate individual paid amount head-wise
    const headBreakdown = fees.map(f => {
      const paidForHead = studentPayments
        .filter(p => p.feeHead === f.head)
        .reduce((s, p) => s + (p.chargedAmount || p.amount || 0), 0);
      return { 
        id: f.id,
        head: f.head, 
        academicYear: f.academicYear || '—',
        semester: f.semester || 'All',
        amount: f.amount || 0, 
        paid: paidForHead, 
        due: Math.max(0, (f.amount || 0) - paidForHead) 
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
      totalFees, 
      totalPaid, 
      outstanding, 
      headBreakdown: sortedBreakdown
    };
  }, [selectedStudent, selectedStudentQuota, feeConfigs, payments]);

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

  const combinedReceiptList = useMemo(() => {
    // 1. Manual receipts
    const manual = receipts.map(r => ({
      id: r.id,
      receiptNo: r.receiptNo,
      studentId: r.studentId,
      studentName: r.studentName,
      examNumber: r.examNumber || "—",
      feeHead: r.feeHead,
      mode: r.mode,
      amount: r.amount || 0,
      status: r.status || "active",
      paymentDate: r.paymentDate,
      isOnline: false,
      rawRecord: r
    }));

    // 2. Online successful payments
    const online = payments.filter(p => p.status === "SUCCESS").map(p => ({
      id: p.id,
      receiptNo: p.orderId,
      studentId: p.uid || p.studentId,
      studentName: p.studentName || "Student",
      examNumber: p.examNumber || p.studentId || "—",
      feeHead: p.feeHead,
      mode: "Online",
      amount: p.chargedAmount || p.amount || 0,
      status: "active", // Treat successful online payment as active receipt
      paymentDate: p.verifiedAt || p.createdAt,
      isOnline: true,
      rawRecord: p
    }));

    // Combine and sort by date descending
    return [...manual, ...online].sort((a, b) => {
      const getTS = (x) => x.paymentDate || 0;
      const da = getTS(a).toDate ? getTS(a).toDate() : new Date(getTS(a));
      const db = getTS(b).toDate ? getTS(b).toDate() : new Date(getTS(b));
      return db - da;
    });
  }, [receipts, payments]);

  const filteredReceipts = useMemo(() => {
    return combinedReceiptList.filter(r => {
      if (receiptSearch) {
        const q = receiptSearch.toLowerCase();
        const matchesSearch = (r.receiptNo || "").toLowerCase().includes(q) ||
               (r.studentName || "").toLowerCase().includes(q) ||
               (r.examNumber || "").toLowerCase().includes(q) ||
               String(r.amount).includes(q) ||
               (r.feeHead || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
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
  }, [combinedReceiptList, receiptSearch, receiptDateFrom, receiptDateTo]);

  const tabs = [
    { id: "structure", label: "Fee Structure", icon: Building2 },
    { id: "collect", label: "Collect Payment", icon: IndianRupee },
    { id: "receipts", label: "Receipts", icon: FileText },
    { id: "concessions", label: "Concessions", icon: Percent },
  ];

  return (
    <Layout title="Fee Operations">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      <div className="no-print p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
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
                <button onClick={() => setShowHeadModal(true)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-zinc-200">
                  <Tags size={14} /> Manage Fee Heads
                </button>
                <button onClick={() => { setEditFeeId(null); setFeeForm({ programme: "", batch: "", academicYear: "", semester: "", department: "", quota: "", head: "", amount: "" }); setShowFeeModal(true); }}
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
            <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
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
            <div className="lg:col-span-8 space-y-5">
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
                      </div>
                    </div>
                  </div>

                  {studentFeeDetails ? (
                    <>
                      {/* Fee Summary Cards */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 text-center">
                          <p className="text-[9px] text-zinc-400 uppercase font-bold">Total Fees</p>
                          <p className="text-xl font-black text-zinc-800 mt-1">₹{studentFeeDetails.totalFees.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-4 text-center">
                          <p className="text-[9px] text-emerald-500 uppercase font-bold">Paid</p>
                          <p className="text-xl font-black text-emerald-600 mt-1">₹{studentFeeDetails.totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4 text-center">
                          <p className="text-[9px] text-amber-500 uppercase font-bold">Outstanding</p>
                          <p className="text-xl font-black text-amber-600 mt-1">₹{studentFeeDetails.outstanding.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Fee Head Breakdown */}
                      {groupedStudentFees.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                          <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                            <h4 className="font-bold text-xs text-zinc-600 uppercase tracking-wider">Fee Head Breakdown</h4>
                          </div>
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-200 bg-zinc-55/60 text-slate-400">
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Academic Year</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Sem</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Fee Head</th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border border-zinc-200">Amount</th>
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
                                    semTotal += (Number(r.amount) || 0);
                                    const paidForThisHead = studentFeeDetails.studentPayments
                                      .filter((p) => p.feeHead === r.head)
                                      .reduce((s, p) => s + (Number(p.chargedAmount || p.amount) || 0), 0);
                                    semPaid += paidForThisHead;
                                  });
                                  const semRemaining = Math.max(0, semTotal - semPaid);

                                  const rows = semGroup.rows.map((cfg, idx) => {
                                    const paidForThisHead = studentFeeDetails.studentPayments
                                      .filter((p) => p.feeHead === cfg.head)
                                      .reduce((s, p) => s + (Number(p.chargedAmount || p.amount) || 0), 0);
                                    const remainingForThisHead = Math.max(0, Number(cfg.amount) - paidForThisHead);
                                    const isFullyPaid = remainingForThisHead === 0;
                                    const isPartiallyPaid = paidForThisHead > 0 && remainingForThisHead > 0;
                                    
                                    const showYear = isFirstYearRow && idx === 0;
                                    const showSem = idx === 0;

                                    const tr = (
                                      <tr key={cfg.id || idx} className="hover:bg-slate-50 transition-colors">
                                        {showYear ? (
                                          <td className="px-4 py-3 text-xs font-bold text-zinc-600 align-top border border-zinc-200" rowSpan={totalYearRows}>{yearGroup.academicYear}</td>
                                        ) : null}
                                        {showSem ? (
                                          <td className="px-4 py-3 text-xs font-bold text-zinc-600 align-top border border-zinc-200" rowSpan={semGroup.rows.length}>{semGroup.semester}</td>
                                        ) : null}
                                        <td className="px-4 py-3 text-sm font-bold border border-zinc-200 text-zinc-700">{cfg.head || 'Fee'}</td>
                                        <td className="px-4 py-3 text-right text-sm font-black border border-zinc-200 text-zinc-700">
                                          {isFullyPaid ? (
                                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">Paid</span>
                                          ) : isPartiallyPaid ? (
                                            <div className="flex flex-col items-end">
                                              <span className="text-[#120c7a]">₹{remainingForThisHead.toLocaleString()}</span>
                                              <span className="text-[9px] text-zinc-400 font-semibold">Total: ₹{cfg.amount.toLocaleString()}</span>
                                            </div>
                                          ) : (
                                            <span>₹{remainingForThisHead.toLocaleString()}</span>
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
                                            <span className="text-emerald-600">Paid</span>
                                          ) : isSemPartiallyPaid ? (
                                            <div className="flex flex-col items-end">
                                              <span>₹{semRemaining.toLocaleString()}</span>
                                              <span className="text-[9px] text-blue-400 font-semibold">Total: ₹{semTotal.toLocaleString()}</span>
                                            </div>
                                          ) : (
                                            <span>₹{semRemaining.toLocaleString()}</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return rows;
                                });
                              })}

                              {/* Outstanding Total Row */}
                              <tr className="bg-zinc-50 font-bold border-t border-zinc-200">
                                <td colSpan={3} className="px-4 py-3 text-left text-sm font-extrabold text-zinc-800 border border-zinc-200">Outstanding Total</td>
                                <td className="px-4 py-3 text-right text-sm font-black text-[#120c7a] border border-zinc-200">
                                  {studentFeeDetails.outstanding === 0 ? (
                                    <span className="text-emerald-600">Paid</span>
                                  ) : studentFeeDetails.totalPaid > 0 ? (
                                    <div className="flex flex-col items-end">
                                      <span>₹{studentFeeDetails.outstanding.toLocaleString()}</span>
                                      <span className="text-[9px] text-zinc-400 font-semibold">Total Config: ₹{studentFeeDetails.totalFees.toLocaleString()}</span>
                                    </div>
                                  ) : (
                                    <span>₹{studentFeeDetails.outstanding.toLocaleString()}</span>
                                  )}
                                </td>
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
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Fee Head *</label>
                              <select value={paymentForm.feeHead} onChange={e => {
                                const head = e.target.value;
                                const headItem = studentFeeDetails.headBreakdown.find(h => h.head === head);
                                const autoAmount = headItem ? headItem.due : "";
                                setPaymentForm({...paymentForm, feeHead: head, amount: autoAmount ? String(autoAmount) : paymentForm.amount});
                              }}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                                <option value="">Select Fee Head</option>
                                {studentFeeDetails.headBreakdown.filter(h => h.due > 0).map(h => (
                                  <option key={h.head} value={h.head}>{h.head} — ₹{h.due.toLocaleString()} due</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount *</label>
                              <div className="relative"><IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} type="number"
                                  className="w-full pl-8 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="0" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Payment Mode *</label>
                              <select value={paymentForm.mode} onChange={e => setPaymentForm({...paymentForm, mode: e.target.value})}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Payment Date</label>
                              <input value={paymentForm.paymentDate} onChange={e => setPaymentForm({...paymentForm, paymentDate: e.target.value})} type="date"
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Semester</label>
                              <input value={paymentForm.semester} onChange={e => setPaymentForm({...paymentForm, semester: e.target.value})}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Sem 3" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Ref No / Remarks</label>
                              <input value={paymentForm.remarks} onChange={e => setPaymentForm({...paymentForm, remarks: e.target.value})}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Cheque no, UPI ref, or notes" />
                            </div>
                          </div>
                          <button onClick={handleRecordPayment} disabled={saving || !paymentForm.amount || !paymentForm.feeHead}
                            className="w-full mt-4 py-3 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#120c7a]/20">
                            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle2 size={18} />}
                            Record Payment & Generate Receipt
                          </button>
                        </div>
                      )}

                      {/* Payment History */}
                      {studentFeeDetails.studentPayments.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                          <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                            <h4 className="font-bold text-xs text-zinc-600 uppercase tracking-wider">Payment History ({studentFeeDetails.studentPayments.length})</h4>
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-zinc-100">
                                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase">Date</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase">Receipt</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase">Fee Head</th>
                                <th className="px-5 py-2.5 text-center text-[10px] font-bold text-zinc-400 uppercase">Mode</th>
                                <th className="px-5 py-2.5 text-right text-[10px] font-bold text-zinc-400 uppercase">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentFeeDetails.studentPayments.sort((a, b) => {
                                const getTS = (p) => p.paymentDate || p.createdAt || p.verifiedAt || 0;
                                const da = getTS(a).toDate ? getTS(a).toDate() : new Date(getTS(a));
                                const db = getTS(b).toDate ? getTS(b).toDate() : new Date(getTS(b));
                                return db - da;
                              }).slice(0, 10).map((p, i) => (
                                <tr key={p.id || i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
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
                                    <span className="font-mono font-bold text-[#120c7a] block">{p.receiptNo || p.orderId || "—"}</span>
                                    {p.gatewayResponse?.rrn && (
                                      <span className="text-[10px] text-zinc-400 font-mono">RRN: {p.gatewayResponse.rrn}</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-bold">{p.feeHead}</span></td>
                                  <td className="px-5 py-2.5 text-center text-xs capitalize text-zinc-500">
                                    {p.mode ? p.mode : (p.status ? "Online" : "—")}
                                  </td>
                                  <td className="px-5 py-2.5 text-right font-bold text-xs text-emerald-600">₹{(p.chargedAmount || p.amount || 0).toLocaleString()}</td>
                                </tr>
                              ))}
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
                    'Student Name': r.studentName || '',
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
                          <p className="text-sm font-bold text-zinc-700">{r.studentName}</p>
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
            <div className="flex justify-between items-center">
              <p className="text-xs font-bold text-zinc-500">{concessions.length} concessions • ₹{concessions.filter(c => c.status === "approved").reduce((s, c) => s + (c.amount || 0), 0).toLocaleString()} approved</p>
              <button onClick={() => { setConcessionForm({ studentId: "", studentName: "", examNumber: "", type: "Merit", amount: "", percentage: "", validTill: "", status: "pending", remarks: "" }); setShowConcessionModal(true); }}
                className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
                <Plus size={14} /> Apply Concession
              </button>
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
                    <select value={feeForm.programme} onChange={e => setFeeForm({...feeForm, programme: e.target.value, department: ""})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">Select Programme</option>
                      {Object.keys(PROGRAMME_DEPARTMENTS || {}).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Batch</label>
                    <select value={feeForm.batch} onChange={e => setFeeForm({...feeForm, batch: e.target.value})}
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
                        <select value={feeForm.sameForAllYears ? "" : (feeForm.academicYear || "")} onChange={e => setFeeForm({...feeForm, academicYear: e.target.value})}
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
                            onChange={e => setFeeForm({...feeForm, sameForAllYears: e.target.checked, academicYear: ""})}
                            className="rounded border-zinc-300 text-[#120c7a] focus:ring-[#120c7a] accent-[#120c7a]" />
                          <span className="text-[11px] font-bold text-zinc-500">Same amount for all academic years</span>
                        </label>
                      </>
                    ) : (
                      <select value={feeForm.academicYear || ""} onChange={e => setFeeForm({...feeForm, academicYear: e.target.value})}
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
                      <select value={feeForm.semester} onChange={e => setFeeForm({...feeForm, semester: e.target.value})}
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
                    <select value={feeForm.department} onChange={e => setFeeForm({...feeForm, department: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Departments</option>
                      {(feeForm.programme ? (PROGRAMME_DEPARTMENTS[feeForm.programme] || []) : []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Quota</label>
                    <select value={feeForm.quota} onChange={e => setFeeForm({...feeForm, quota: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Quotas</option>
                      {(quotaOptions.length ? quotaOptions : ["All"]).map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount (₹)</label>
                    <input value={feeForm.amount} onChange={e => setFeeForm({...feeForm, amount: e.target.value})} type="number"
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
                    setConcessionForm({...concessionForm, studentName: e.target.value});
                    const found = students.find(s => s.studentName?.toLowerCase() === e.target.value.toLowerCase());
                    if (found) setConcessionForm(prev => ({ ...prev, studentName: found.studentName, examNumber: found.examNumber, studentId: found.id }));
                  }} list="studentList"
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Type student name" />
                  <datalist id="studentList">{students.map(s => <option key={s.id} value={s.studentName} />)}</datalist>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Concession Type</label>
                    <select value={concessionForm.type} onChange={e => setConcessionForm({...concessionForm, type: e.target.value})}
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
                    <input value={concessionForm.amount} onChange={e => setConcessionForm({...concessionForm, amount: e.target.value})} type="number"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Or Percentage (%)</label>
                    <input value={concessionForm.percentage} onChange={e => setConcessionForm({...concessionForm, percentage: e.target.value})} type="number"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Valid Till</label>
                    <input value={concessionForm.validTill} onChange={e => setConcessionForm({...concessionForm, validTill: e.target.value})} type="date"
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Remarks</label>
                  <textarea value={concessionForm.remarks} onChange={e => setConcessionForm({...concessionForm, remarks: e.target.value})} rows={2}
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

      {/* Receipt Modal */}
      {receiptModal.open && receiptModal.payment && (() => {
        const p = receiptModal.payment;
        // Resolve student metadata by searching the users/students list
        const sData = students.find(s => s.id === p.studentId || s.regNo === p.examNumber);
        
        const resolvedName = p.studentName || sData?.displayName || sData?.studentName || "Student";
        const resolvedEmail = sData?.email || "";
        const resolvedReg = p.examNumber || sData?.regNo || sData?.admissionNo || "—";
        const resolvedProg = p.programme || sData?.programme || "";
        const resolvedDept = p.department || sData?.department || "";
        
        // HDFC fields
        const txId = p.rawRecord?.gatewayResponse?.txnId || p.rawRecord?.gatewayResponse?.epgTxnId || p.rawRecord?.refNo || "—";
        const rrn = p.rawRecord?.gatewayResponse?.rrn || "—";
        const authCode = p.rawRecord?.gatewayResponse?.authCode || "—";
        
        // Formatter helpers
        const formatDate = (ts) => {
          if (!ts) return "-";
          const d = ts.toDate ? ts.toDate() : new Date(ts);
          return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        };
        const formatTime = (ts) => {
          if (!ts) return "";
          const d = ts.toDate ? ts.toDate() : new Date(ts);
          return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        };
        
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200" id="receipt-modal-backdrop" onClick={() => setReceiptModal({ open: false, payment: null })}>
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-receipt, #printable-receipt * {
                  visibility: visible !important;
                }
                #printable-receipt {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  margin: 0;
                  padding: 20px;
                  box-shadow: none !important;
                  border: none !important;
                }
                #receipt-modal-backdrop {
                  background: none !important;
                  backdrop-filter: none !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transform animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between no-print">
                <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                  <FileText className="text-[#120c7a]" size={20} />
                  <span>Payment Receipt</span>
                </h3>
                <button
                  onClick={() => setReceiptModal({ open: false, payment: null })}
                  className="p-2 hover:bg-zinc-100 rounded-xl"
                ><X size={18} /></button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 space-y-8">
                <div id="printable-receipt" className="bg-white p-4 md:p-6 border border-slate-200 rounded-2xl shadow-sm space-y-5 md:space-y-6 relative overflow-hidden">
                  {/* Centered Watermark Stamp */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                    <span className="text-emerald-500/[0.04] font-black text-6xl md:text-8xl uppercase tracking-[0.25em] -rotate-12 border-8 border-emerald-500/[0.04] rounded-3xl px-8 py-4">
                      PAID
                    </span>
                  </div>

                  {/* Receipt Header */}
                  <div className="flex flex-col items-center text-center border-b border-slate-100 pb-5 md:pb-6 relative z-10">
                    <img src="/logo.png" className="h-14 md:h-16 w-auto object-contain mb-2 md:mb-3" alt="Logo" />
                    <div>
                      <h4 className="font-black text-slate-800 text-base md:text-lg uppercase tracking-wide">Fee Receipt</h4>
                      <p className="text-xs md:text-sm text-slate-400">
                        {p.isOnline ? "Official Fee Receipt | HDFC SmartGateway secure payment" : "Official Fee Receipt | Campus Cashier Payment Office"}
                      </p>
                      <p className="text-[10px] md:text-xs text-slate-400 mt-1 font-semibold">
                        Receipt Date: {formatDate(p.paymentDate)} {formatTime(p.paymentDate)}
                      </p>
                    </div>
                  </div>

                  {/* Student & Transaction Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 md:gap-y-0 md:gap-x-8 text-xs md:text-sm relative z-10">
                     <div className="space-y-0.5">
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] md:text-xs">Student Details</p>
                      <p className="font-bold text-slate-800 mt-1">{resolvedName}</p>
                      <p className="text-slate-500 break-all">{resolvedEmail || "—"}</p>
                      <p className="text-slate-500">Reg/Adm No: {resolvedReg}</p>
                      <p className="text-slate-500">Programme: {resolvedProg ? formatProgDisplay(resolvedProg) : "—"}</p>
                      <p className="text-slate-500">Department: {resolvedDept || "—"}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] md:text-xs">Receipt Information</p>
                      <p className="font-bold text-slate-800 mt-1 break-all">Receipt No: <span className="font-mono">{p.receiptNo || "—"}</span></p>
                      <p className="text-slate-500">Gateway/Method: {p.isOnline ? "HDFC SmartGateway" : `Manual (${p.mode})`}</p>
                      <p className="text-slate-500 break-all">Txn ID / Ref: <span className="font-mono">{txId}</span></p>
                      {rrn && rrn !== "—" && <p className="text-slate-500 break-all">Bank RRN: <span className="font-mono">{rrn}</span></p>}
                    </div>
                  </div>

                  {/* Fee Item Table */}
                  <div className="mt-4 md:mt-6 border border-slate-200 rounded-xl overflow-hidden relative z-10">
                    <table className="w-full text-xs md:text-sm table-fixed">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold text-[10px] md:text-xs">
                          <th className="px-3 py-2.5 md:px-4 md:py-3 text-left w-1/2">Fee Item</th>
                          <th className="px-3 py-2.5 md:px-4 md:py-3 text-left w-1/3">Mode</th>
                          <th className="px-3 py-2.5 md:px-4 md:py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 text-[11px] md:text-sm">
                        <tr>
                          <td className="px-3 py-3 md:px-4 md:py-4 font-bold break-words">{p.feeHead || "Semester Fee"}</td>
                          <td className="px-3 py-3 md:px-4 md:py-4 font-semibold text-slate-400 break-words">
                            {p.isOnline ? "Online (SmartGateway)" : `Offline (${p.mode})`}
                          </td>
                          <td className="px-3 py-3 md:px-4 md:py-4 text-right font-black text-slate-800">
                            ₹{p.amount.toLocaleString()}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/50 font-black text-slate-800 text-xs md:text-base">
                          <td colSpan={2} className="px-3 py-2.5 md:px-4 md:py-3 text-right">Total Paid</td>
                          <td className="px-3 py-2.5 md:px-4 md:py-3 text-right text-[#120c7a] font-black">
                            ₹{p.amount.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Verification footer */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col md:flex-row md:items-center justify-between gap-2 relative z-10">
                    <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-400">
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span>Computer generated receipt. No signature required.</span>
                    </div>
                    {authCode && authCode !== "—" && (
                      <span className="text-[10px] md:text-xs font-mono text-slate-400 font-bold break-all">AUTH CODE: {authCode}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50 no-print">
                <button
                  onClick={() => setReceiptModal({ open: false, payment: null })}
                  className="px-5 py-2.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl"
                >Close</button>
                <button
                  onClick={() => window.print()}
                  className="px-6 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20 transition-all"
                >
                  Print Receipt
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
