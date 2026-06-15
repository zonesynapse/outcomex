import { useState, useEffect } from "react";
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
import Layout from "../components/Layout";

const DEFAULT_FEE_HEADS = [
  "Tuition Fee", "Development Fee", "Library Fee", "Lab Fee",
  "Exam Fee", "Sports Fee", "Transport Fee", "Hostel Fee",
  "Caution Deposit", "Placement Fee", "Alumni Fee", "Other"
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

const QUOTA_OPTIONS = ["Govt Quota", "Mgmt Quota", "NRI Quota", "Lateral Entry"];
const BRANCHES = ["CSE", "ECE", "EEE", "ME", "CE", "CSBS", "AIML", "DS", "IT", "AIDS"];

export default function FeeOperations() {
  const location = useLocation();
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
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [headEditIdx, setHeadEditIdx] = useState(null);
  const [headEditVal, setHeadEditVal] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Fee Structure state
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [editFeeId, setEditFeeId] = useState(null);
  const [feeForm, setFeeForm] = useState({ programme: "", batch: "", semester: "", department: "", quota: "", head: "", amount: "" });

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
    getDoc(doc(db, "fee_categories", "global")).then(snap => {
      if (snap.exists() && snap.data().categories) setFeeHeads(snap.data().categories);
    }).catch(() => {});
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleSaveFee = async () => {
    if (!feeForm.programme || !feeForm.batch || !feeForm.amount) return;
    setSaving(true);
    try {
      if (editFeeId) await updateDoc(doc(db, "fee_configurations", editFeeId), { ...feeForm, amount: Number(feeForm.amount), updatedAt: Timestamp.now() });
      else await addDoc(collection(db, "fee_configurations"), { ...feeForm, amount: Number(feeForm.amount), createdAt: Timestamp.now() });
      showToast(editFeeId ? "Fee updated" : "Fee added");
      setShowFeeModal(false);
      setEditFeeId(null);
      setFeeForm({ programme: "", batch: "", semester: "", department: "", quota: "", head: "", amount: "" });
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

      {/* Page Header */}
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              <IndianRupee size={14} /> <span>Fee</span> <span className="text-zinc-300">/</span> <span>Operations</span>
            </div>
            <h2 className="text-2xl font-black text-zinc-800">Fee Operations</h2>
          </div>
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: Fee Structure */}
        {tab === "structure" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-xs font-bold text-zinc-500">{feeConfigs.length} fee entries configured</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowHeadModal(true)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-zinc-200">
                  <Tags size={14} /> Manage Fee Heads
                </button>
                <button onClick={() => { setEditFeeId(null); setFeeForm({ programme: "", batch: "", semester: "", department: "", quota: "", head: "", amount: "" }); setShowFeeModal(true); }}
                  className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
                  <Plus size={14} /> Add Fee Entry
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Programme</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Batch</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Sem</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Dept</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Quota</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Fee Head</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {feeConfigs.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-zinc-400 text-sm">No fee structures configured. Add your first fee entry.</td></tr>
                    ) : feeConfigs.map((f, i) => (
                      <tr key={f.id || i} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-zinc-700">{f.programme}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{f.batch}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{f.semester || "—"}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{f.department || "All"}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{f.quota || "All"}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold">{f.head}</span></td>
                        <td className="px-4 py-3 text-right text-sm font-black text-zinc-800">₹{(f.amount || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => { setEditFeeId(f.id); setFeeForm(f); setShowFeeModal(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Edit3 size={14} /></button>
                            <button onClick={async () => { try { await deleteDoc(doc(db, "fee_configurations", f.id)); showToast("Deleted"); } catch (e) { showToast("Error", "error"); } }} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14} /></button>
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
                        {(feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS).map(h => <option key={h} value={h}>{h}</option>)}
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
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Programme</label>
                    <input value={feeForm.programme} onChange={e => setFeeForm({...feeForm, programme: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. B.E / B.Tech" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Batch</label>
                    <input value={feeForm.batch} onChange={e => setFeeForm({...feeForm, batch: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. 2024-2028" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Semester</label>
                    <input value={feeForm.semester} onChange={e => setFeeForm({...feeForm, semester: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Sem 1" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Department</label>
                    <select value={feeForm.department} onChange={e => setFeeForm({...feeForm, department: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Departments</option>
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Quota</label>
                    <select value={feeForm.quota} onChange={e => setFeeForm({...feeForm, quota: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">All Quotas</option>
                      {QUOTA_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Fee Head</label>
                    <select value={feeForm.head} onChange={e => setFeeForm({...feeForm, head: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                      <option value="">Select head</option>
                      {(feeHeads.length ? feeHeads : DEFAULT_FEE_HEADS).map(h => <option key={h} value={h}>{h}</option>)}
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
                                next[idx] = headEditVal;
                                setFeeHeads(next);
                                setHeadEditIdx(null);
                              }
                            }}
                            className="flex-1 bg-white border border-[#120c7a] rounded-lg px-2 py-1 text-sm font-bold outline-none" autoFocus />
                          <button onClick={() => { const next = [...feeHeads]; next[idx] = headEditVal; setFeeHeads(next); setHeadEditIdx(null); }}
                            className="text-green-600 hover:text-green-700 p-1"><CheckCircle2 size={16} /></button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-bold text-zinc-700">{head}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => { setHeadEditIdx(idx); setHeadEditVal(head); }}
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
                  while (feeHeads.includes(newName)) { newName = `New Fee Head ${c}`; c++; }
                  setFeeHeads([...feeHeads, newName]);
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
                const cleaned = feeHeads.filter(h => h.trim() !== "");
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
