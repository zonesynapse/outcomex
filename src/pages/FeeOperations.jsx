import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import {
  IndianRupee, Plus, Search, Edit3, Trash2, X, CheckCircle2, AlertCircle,
  CreditCard, Building2, Users, GraduationCap, Download, Printer,
  ChevronDown, ChevronRight, FileText, Wallet, Percent, BadgeCheck,
  CalendarDays, Banknote, QrCode, ShieldCheck, Filter, Copy,
  Tags, Pencil, Layers, Save
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { getSeatConfigurationsRealtime } from "../services/seatService";
import { formatProgrammeKey } from "../lib/utils";
import Layout from "../components/Layout";

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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "cash", feeHead: "Tuition Fee", semester: "", remarks: "", refNo: "", paymentDate: new Date().toISOString().split("T")[0] });

  // Receipt state
  const [receiptSearch, setReceiptSearch] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Concession state
  const [showConcessionModal, setShowConcessionModal] = useState(false);
  const [concessionForm, setConcessionForm] = useState({ studentId: "", studentName: "", examNumber: "", type: "Merit", amount: "", percentage: "", validTill: "", status: "pending", remarks: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "fee_payments"), snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(collection(db, "fee_receipts"), snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u3 = onSnapshot(collection(db, "fee_concessions"), snap => setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u4 = onSnapshot(collection(db, "placement_students"), snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
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
    if (!selectedStudent || !paymentForm.amount) return;
    setSaving(true);
    try {
      const receiptNo = `FEE${new Date().getFullYear()}-${String(receipts.length + 1).padStart(5, "0")}`;
      const payData = { studentId: selectedStudent.id, examNumber: selectedStudent.examNumber, studentName: selectedStudent.studentName, department: selectedStudent.department, batch: selectedStudent.batch, amount: Number(paymentForm.amount), mode: paymentForm.mode, feeHead: paymentForm.feeHead, semester: paymentForm.semester, remarks: paymentForm.remarks, refNo: paymentForm.refNo, receiptNo, paymentDate: Timestamp.fromDate(new Date(paymentForm.paymentDate)), createdAt: Timestamp.now() };
      await addDoc(collection(db, "fee_payments"), payData);
      await addDoc(collection(db, "fee_receipts"), { ...payData, status: "active", cancelledAt: null, reason: null, reprintCount: 0 });
      showToast(`Payment recorded — Receipt #${receiptNo}`);
      setShowPaymentModal(false);
      setPaymentForm({ amount: "", mode: "cash", feeHead: "Tuition Fee", semester: "", remarks: "", refNo: "", paymentDate: new Date().toISOString().split("T")[0] });
    } catch (err) { showToast("Error recording payment", "error"); }
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
    return s.studentName?.toLowerCase().includes(q) || s.examNumber?.toLowerCase().includes(q);
  }).slice(0, 10);

  const totalStudentDue = selectedStudent ? selectedStudent.cgpa * 10000 + 25000 : 0;

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

      <div className="p-6 max-w-7xl mx-auto space-y-5">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Student Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <h3 className="font-bold text-sm text-zinc-700 mb-4 flex items-center gap-2"><Search size={16} /> Search Student</h3>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search by name or exam number..."
                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {filteredStudents.map(s => (
                  <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentSearch(s.studentName); }}
                    className={`w-full text-left p-3 rounded-xl transition-all text-sm flex items-center gap-3 ${selectedStudent?.id === s.id ? 'bg-[#120c7a]/5 border border-[#120c7a]/20' : 'hover:bg-zinc-50 border border-transparent'}`}>
                    <div className="w-8 h-8 bg-[#120c7a]/5 rounded-lg flex items-center justify-center"><GraduationCap size={16} className="text-[#120c7a]" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-700 truncate">{s.studentName}</p>
                      <p className="text-[10px] text-zinc-400">{s.examNumber} • {s.department}</p>
                    </div>
                  </button>
                ))}
                {studentSearch && filteredStudents.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">No students found</p>}
                {!studentSearch && <p className="text-xs text-zinc-400 text-center py-4">Type to search for a student</p>}
              </div>
            </div>

            {/* Payment Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <h3 className="font-bold text-sm text-zinc-700 mb-4 flex items-center gap-2"><IndianRupee size={16} /> Record Payment</h3>
              {!selectedStudent ? (
                <div className="p-8 text-center text-zinc-400">
                  <Users size={40} className="mx-auto mb-3 text-zinc-200" />
                  <p className="text-sm font-medium">Select a student first</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-50 rounded-xl flex items-center gap-3">
                    <GraduationCap size={18} className="text-[#120c7a]" />
                    <div>
                      <p className="text-sm font-bold text-zinc-700">{selectedStudent.studentName}</p>
                      <p className="text-[10px] text-zinc-400">{selectedStudent.examNumber} • {selectedStudent.department}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-[10px] text-zinc-400">Estimated Due</p>
                      <p className="text-sm font-black text-amber-700">₹{(totalStudentDue).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount *</label>
                      <div className="relative"><IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} type="number"
                          className="w-full pl-8 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Fee Head</label>
                      <select value={paymentForm.feeHead} onChange={e => setPaymentForm({...paymentForm, feeHead: e.target.value})}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                        {(feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS).map(h => <option key={h.name || h} value={h.name || h}>{h.name || h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Mode *</label>
                      <select value={paymentForm.mode} onChange={e => setPaymentForm({...paymentForm, mode: e.target.value})}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                        {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Semester</label>
                      <input value={paymentForm.semester} onChange={e => setPaymentForm({...paymentForm, semester: e.target.value})}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Sem 1" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Ref No / Remarks</label>
                      <input value={paymentForm.remarks} onChange={e => setPaymentForm({...paymentForm, remarks: e.target.value})}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Cheque no, UPI ref, or notes" />
                    </div>
                  </div>
                  <button onClick={handleRecordPayment} disabled={saving || !paymentForm.amount}
                    className="w-full py-3 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#120c7a]/20">
                    {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle2 size={18} />}
                    Record Payment & Print Receipt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Receipts */}
        {tab === "receipts" && (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)}
                placeholder="Search by receipt#, student, or amount..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
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
                    {receipts.filter(r => !receiptSearch || r.receiptNo?.toLowerCase().includes(receiptSearch.toLowerCase()) || r.studentName?.toLowerCase().includes(receiptSearch.toLowerCase())).length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400 text-sm">No receipts found</td></tr>
                    ) : receipts.filter(r => !receiptSearch || r.receiptNo?.toLowerCase().includes(receiptSearch.toLowerCase()) || r.studentName?.toLowerCase().includes(receiptSearch.toLowerCase())).map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3"><span className="text-xs font-mono font-bold text-[#120c7a]">{r.receiptNo || "—"}</span></td>
                        <td className="px-4 py-3"><p className="text-sm font-medium text-zinc-700">{r.studentName}</p><p className="text-[9px] text-zinc-400">{r.examNumber}</p></td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-bold">{r.feeHead}</span></td>
                        <td className="px-4 py-3 text-center text-xs capitalize">{r.mode}</td>
                        <td className="px-4 py-3 text-right font-black text-sm text-zinc-800">₹{(r.amount || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${r.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.status || 'active'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Printer size={14} /></button>
                            {r.status !== 'cancelled' && <button onClick={() => { const reason = prompt("Reason for cancellation:"); if (reason) cancelReceipt(r.id, reason); }} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><X size={14} /></button>}
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
    </Layout>
  );
}
