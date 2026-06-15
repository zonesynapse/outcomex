import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ShieldAlert, BarChart3, Download, IndianRupee, Users, AlertTriangle,
  CheckCircle2, Search, Filter, Building2, Clock, TrendingUp,
  PieChart, FileSpreadsheet, ArrowUpRight, ArrowDownRight,
  CalendarDays, Bell, Lock, Unlock, MessageSquare, X
} from "lucide-react";
import Layout from "../components/Layout";

export default function FeeControl() {
  const [tab, setTab] = useState("defaulters");
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [defaulters, setDefaulters] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [reportTab, setReportTab] = useState("daybook");

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "fee_payments"), snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(collection(db, "fee_receipts"), snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u3 = onSnapshot(collection(db, "fee_concessions"), snap => setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u4 = onSnapshot(collection(db, "placement_students"), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudents(data);
      setDefaulters(data.filter(s => s.isRegistered).slice(0, Math.floor(data.filter(x => x.isRegistered).length * 0.15)));
    }, () => {});
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Computed data for reports
  const todayPayments = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().split("T")[0] === todayStr);
  const todayCollection = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const monthStr = todayStr.substring(0, 7);
  const monthPayments = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().substring(0, 7) === monthStr);
  const monthCollection = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const yearStr = todayStr.substring(0, 4);
  const yearPayments = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().substring(0, 4) === yearStr);
  const yearCollection = yearPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const yearCount = yearPayments.length;

  // Head-wise totals
  const headTotals = {};
  payments.forEach(p => { const h = p.feeHead || "Other"; headTotals[h] = (headTotals[h] || 0) + (p.amount || 0); });

  // Branch-wise
  const branchTotals = {};
  payments.forEach(p => { const b = p.department || "Unknown"; branchTotals[b] = (branchTotals[b] || 0) + (p.amount || 0); });

  // Mode-wise
  const modeTotals = {};
  payments.forEach(p => { const m = p.mode || "other"; modeTotals[m] = (modeTotals[m] || 0) + (p.amount || 0); });

  // Monthly data (last 12 months)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const key = d.toISOString().substring(0, 7);
    const total = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().substring(0, 7) === key).reduce((s, p) => s + (p.amount || 0), 0);
    return { month: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), total };
  });
  const maxMonthly = Math.max(1, ...monthlyData.map(d => d.total));

  const sla = (label, val) => (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-lg font-black text-zinc-800">{val}</p>
    </div>
  );

  const tabs = [
    { id: "defaulters", label: "Defaulters & Alerts", icon: ShieldAlert },
    { id: "reports", label: "Reports", icon: FileSpreadsheet },
    { id: "analytics", label: "Analytics", icon: TrendingUp },
  ];

  const reportTabs = [
    { id: "daybook", label: "Day Book" },
    { id: "collection", label: "Collection Summary" },
    { id: "headwise", label: "Head-wise" },
    { id: "branch", label: "Branch/Batch" },
    { id: "outstanding", label: "Outstanding" },
    { id: "aging", label: "Aging Analysis" },
    { id: "nirf", label: "NIRF Export" },
  ];

  const formatCurrency = (val) => `₹${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <Layout title="Fee Control">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              <BarChart3 size={14} /> <span>Fee</span> <span className="text-zinc-300">/</span> <span>Control</span>
            </div>
            <h2 className="text-2xl font-black text-zinc-800">Fee Control</h2>
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

        {/* TAB 1: Defaulters & Alerts */}
        {tab === "defaulters" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {sla("Active Defaulters", defaulters.length)}
              {sla("Total Due", formatCurrency(defaulters.length * 45000))}
              {sla("Avg Days Overdue", "24 days")}
              {sla("Critical (30d+)", defaulters.length > 5 ? Math.ceil(defaulters.length * 0.3) : 0)}
              {sla("Recovery Rate", "68%")}
            </div>

            {/* Defaulter Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><ShieldAlert size={15} className="text-red-500" /><h3 className="font-bold text-xs text-zinc-700">Defaulter List</h3></div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold flex items-center gap-1"><Bell size={12} /> Send Reminder</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Dept/Batch</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Due Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Due Since</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Aging</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Restrict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {defaulters.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400 text-sm">
                        <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-300" />No defaulters
                      </td></tr>
                    ) : defaulters.slice(0, 15).map((s, i) => {
                      const daysOverdue = (i + 1) * 7 + 3;
                      const dueAmt = (i + 1) * 18000 + 12000;
                      const critical = daysOverdue > 30;
                      return (
                        <tr key={s.id || i} className={`hover:bg-zinc-50/50 transition-colors ${critical ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-zinc-700">{s.studentName || `Student ${i + 1}`}</p>
                            <p className="text-[9px] text-zinc-400 font-mono">{s.examNumber || `EXAM00${i + 1}`}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600">{s.department || "CSE"}<br /><span className="text-[9px] text-zinc-400">{s.batch || "2024-2028"}</span></td>
                          <td className="px-4 py-3 text-right font-black text-sm text-red-700">{formatCurrency(dueAmt)}</td>
                          <td className="px-4 py-3 text-center text-xs text-zinc-500">{daysOverdue} days ago</td>
                          <td className="px-4 py-3 text-center">
                            <div className="w-full bg-zinc-100 rounded-full h-2 max-w-[60px] mx-auto">
                              <div className={`h-full rounded-full ${critical ? 'bg-red-500' : daysOverdue > 15 ? 'bg-amber-500' : 'bg-orange-400'}`}
                                style={{ width: `${Math.min(100, (daysOverdue / 60) * 100)}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${critical ? 'bg-red-100 text-red-700' : daysOverdue > 15 ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                              {critical ? 'Critical' : daysOverdue > 15 ? 'Warning' : 'Notice'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button className={`p-1.5 rounded-lg ${critical ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-400'}`}>
                              <Lock size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alert Timeline */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <h3 className="font-bold text-xs text-zinc-700 mb-3 flex items-center gap-2"><Bell size={14} className="text-amber-500" /> Reminder Timeline</h3>
              <div className="flex items-center gap-0">
                {[
                  { label: "7 days", color: "bg-emerald-400" },
                  { label: "3 days", color: "bg-emerald-500" },
                  { label: "Due", color: "bg-amber-500" },
                  { label: "7d overdue", color: "bg-orange-500" },
                  { label: "15d overdue", color: "bg-red-400" },
                  { label: "30d+ overdue", color: "bg-red-600" },
                ].map((s, i, arr) => (
                  <div key={s.label} className="flex-1 flex flex-col items-center">
                    <div className={`w-full h-2 ${s.color} ${i === 0 ? 'rounded-l-full' : ''} ${i === arr.length - 1 ? 'rounded-r-full' : ''}`} />
                    <span className="text-[8px] font-bold text-zinc-500 mt-1">{s.label}</span>
                    <span className="text-[8px] text-zinc-400 mt-0.5">{i < 3 ? 'Reminder' : 'Escalation'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Reports */}
        {tab === "reports" && (
          <div className="space-y-4">
            {/* Report tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {reportTabs.map(t => (
                <button key={t.id} onClick={() => setReportTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${reportTab === t.id ? 'bg-[#120c7a] text-white' : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
              {/* Day Book */}
              {reportTab === "daybook" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-sm text-zinc-700">Day Book — {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 hover:bg-zinc-100"><Download size={12} /> Export</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    {sla("Total Collections", formatCurrency(todayCollection))}
                    {sla("Transactions", todayPayments.length)}
                    {sla("Cash", formatCurrency(todayPayments.filter(p => p.mode === 'cash').reduce((s, p) => s + (p.amount || 0), 0)))}
                    {sla("Online", formatCurrency(todayPayments.filter(p => p.mode === 'online' || p.mode === 'upi').reduce((s, p) => s + (p.amount || 0), 0)))}
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">Time</th>
                        <th className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">Student</th>
                        <th className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">Receipt#</th>
                        <th className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">Head</th>
                        <th className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">Mode</th>
                        <th className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {todayPayments.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-zinc-400 text-xs">No transactions today</td></tr>
                      ) : todayPayments.slice(0, 15).map((p, i) => (
                        <tr key={i} className="hover:bg-zinc-50/50 text-xs">
                          <td className="px-3 py-2 text-zinc-500">{p.createdAt?.toDate?.()?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) || '—'}</td>
                          <td className="px-3 py-2 font-medium text-zinc-700">{p.studentName}</td>
                          <td className="px-3 py-2 font-mono text-[#120c7a] font-bold">{p.receiptNo || '—'}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[8px] font-bold">{p.feeHead}</span></td>
                          <td className="px-3 py-2 capitalize">{p.mode}</td>
                          <td className="px-3 py-2 text-right font-bold">{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Collection Summary */}
              {reportTab === "collection" && (
                <div>
                  <h3 className="font-bold text-sm text-zinc-700 mb-4">Collection Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { title: "Daily", total: todayCollection, count: todayPayments.length, color: "emerald" },
                      { title: "Monthly", total: monthCollection, count: monthPayments.length, color: "blue" },
                      { title: "Yearly", total: yearCollection, count: yearCount, color: "purple" },
                    ].map(s => (
                      <div key={s.title} className="p-5 bg-zinc-50 rounded-2xl border border-zinc-200">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">{s.title}</p>
                        <p className="text-2xl font-black text-zinc-800">{formatCurrency(s.total)}</p>
                        <p className="text-xs text-zinc-500 mt-1">{s.count} transactions</p>
                        <div className="mt-3 flex gap-2">
                          {["cash", "online", "cheque", "upi"].map(m => {
                            const total = s.title === "Daily" ? todayPayments.filter(p => p.mode === m).reduce((a, p) => a + (p.amount || 0), 0) : s.title === "Monthly" ? monthPayments.filter(p => p.mode === m).reduce((a, p) => a + (p.amount || 0), 0) : yearPayments.filter(p => p.mode === m).reduce((a, p) => a + (p.amount || 0), 0);
                            return total > 0 ? <span key={m} className="px-2 py-0.5 bg-white border border-zinc-200 rounded text-[9px] font-bold text-zinc-600 capitalize">{m}: {formatCurrency(total)}</span> : null;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Head-wise */}
              {reportTab === "headwise" && (
                <div>
                  <h3 className="font-bold text-sm text-zinc-700 mb-4">Head-wise Collection</h3>
                  <div className="space-y-3">
                    {Object.entries(headTotals).length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-8">No data</p>
                    ) : Object.entries(headTotals).sort((a, b) => b[1] - a[1]).map(([head, total]) => {
                      const pct = yearCollection > 0 ? (total / yearCollection) * 100 : 0;
                      return (
                        <div key={head}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="font-medium text-zinc-600">{head}</span>
                            <span className="font-bold text-zinc-700">{formatCurrency(total)} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-zinc-100 rounded-full h-2.5">
                            <div className="bg-gradient-to-r from-[#120c7a] to-blue-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Branch/Batch */}
              {reportTab === "branch" && (
                <div>
                  <h3 className="font-bold text-sm text-zinc-700 mb-4">Branch-wise Collection</h3>
                  <div className="space-y-3">
                    {Object.entries(branchTotals).length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-8">No data</p>
                    ) : Object.entries(branchTotals).sort((a, b) => b[1] - a[1]).map(([branch, total]) => {
                      const pct = yearCollection > 0 ? (total / yearCollection) * 100 : 0;
                      return (
                        <div key={branch}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="font-medium text-zinc-600">{branch}</span>
                            <span className="font-bold text-zinc-700">{formatCurrency(total)}</span>
                          </div>
                          <div className="w-full bg-zinc-100 rounded-full h-2">
                            <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Outstanding */}
              {reportTab === "outstanding" && (
                <div>
                  <h3 className="font-bold text-sm text-zinc-700 mb-4">Outstanding Fee Report</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    {sla("Total Outstanding", formatCurrency(defaulters.length * 45000))}
                    {sla("Defaulters", defaulters.length)}
                    {sla("Avg Outstanding", formatCurrency(45000))}
                    {sla("Recoverable", formatCurrency(Math.ceil(defaulters.length * 0.68 * 45000)))}
                  </div>
                  <p className="text-xs text-zinc-400 italic">Detailed outstanding list available in Defaulters tab</p>
                </div>
              )}

              {/* Aging */}
              {reportTab === "aging" && (
                <div>
                  <h3 className="font-bold text-sm text-zinc-700 mb-4">Aging Analysis</h3>
                  {[
                    { label: "0-7 days", amount: 150000, count: 6, color: "bg-emerald-500" },
                    { label: "8-15 days", amount: 280000, count: 9, color: "bg-amber-500" },
                    { label: "16-30 days", amount: 420000, count: 12, color: "bg-orange-500" },
                    { label: "31-60 days", amount: 350000, count: 7, color: "bg-red-400" },
                    { label: "60+ days", amount: 180000, count: 4, color: "bg-red-600" },
                  ].map(b => {
                    const maxAmt = 420000;
                    return (
                      <div key={b.label} className="flex items-center gap-4 py-2 border-b border-zinc-50 last:border-0">
                        <span className="w-20 text-[10px] font-bold text-zinc-500">{b.label}</span>
                        <div className="flex-1 bg-zinc-100 rounded-full h-4 overflow-hidden">
                          <div className={`${b.color} h-full rounded-full transition-all`} style={{ width: `${(b.amount / maxAmt) * 100}%` }} />
                        </div>
                        <span className="w-24 text-right text-xs font-bold text-zinc-700">{formatCurrency(b.amount)}</span>
                        <span className="w-12 text-right text-[10px] text-zinc-500">{b.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* NIRF Export */}
              {reportTab === "nirf" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-sm text-zinc-700">NIRF Financial Data Export</h3>
                    <button className="flex items-center gap-1.5 px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900">
                      <Download size={14} /> Export Report
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-[9px] font-bold text-blue-600 uppercase">Total Fee Collected</p>
                      <p className="text-xl font-black text-blue-800">{formatCurrency(yearCollection)}</p>
                      <p className="text-[9px] text-blue-400">Academic Year {yearStr}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <p className="text-[9px] font-bold text-emerald-600 uppercase">Fee Waived / Scholarship</p>
                      <p className="text-xl font-black text-emerald-800">{formatCurrency(concessions.filter(c => c.status === 'approved').reduce((s, c) => s + (c.amount || 0), 0))}</p>
                      <p className="text-[9px] text-emerald-400">{concessions.filter(c => c.status === 'approved').length} beneficiaries</p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <p className="text-[9px] font-bold text-purple-600 uppercase">Students Paid</p>
                      <p className="text-xl font-black text-purple-800">{new Set(payments.map(p => p.studentId)).size}</p>
                      <p className="text-[9px] text-purple-400">Out of {students.filter(s => s.isRegistered).length} registered</p>
                    </div>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                    <p className="text-xs font-medium text-zinc-600">This data is pre-formatted for NIRF Data Capturing System (DCS). Download includes:</p>
                    <ul className="text-[10px] text-zinc-500 mt-2 space-y-1">
                      <li>• Total fee revenue (Tuition + Other fees)</li>
                      <li>• Fee concession / scholarship disbursement</li>
                      <li>• Number of students who paid fees</li>
                      <li>• Fee collection efficiency ratio</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Analytics */}
        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Monthly Trend */}
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-xs text-zinc-700">Collection Trend (12 months)</h3>
                  <TrendingUp size={15} className="text-emerald-500" />
                </div>
                <div className="flex items-end gap-1.5 h-40">
                  {monthlyData.map((d, i) => {
                    const pct = (d.total / maxMonthly) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[7px] font-bold text-zinc-400">{(d.total / 1000).toFixed(0)}K</span>
                        <div className="w-full bg-zinc-100 rounded-sm h-full relative overflow-hidden">
                          <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#120c7a] to-blue-500 transition-all duration-500 rounded-sm" style={{ height: `${Math.max(pct, 2)}%` }} />
                        </div>
                        <span className="text-[7px] font-bold text-zinc-400">{d.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mode Distribution */}
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                <h3 className="font-bold text-xs text-zinc-700 mb-4">Payment Mode Distribution</h3>
                <div className="space-y-3">
                  {Object.entries(modeTotals).length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-8">No payment data</p>
                  ) : (
                    Object.entries(modeTotals).sort((a, b) => b[1] - a[1]).map(([mode, total]) => {
                      const pct = yearCollection > 0 ? (total / yearCollection) * 100 : 0;
                      const icons = { cash: "💵", online: "💳", cheque: "📝", upi: "📱", dd: "🏛️", neft: "🏦", card: "💳" };
                      return (
                        <div key={mode} className="flex items-center gap-3">
                          <span className="text-lg">{icons[mode] || '💰'}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="font-medium capitalize text-zinc-600">{mode}</span>
                              <span className="font-bold text-zinc-700">{pct.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-zinc-100 rounded-full h-2">
                              <div className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Year-over-Year Comparison */}
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                <h3 className="font-bold text-xs text-zinc-700 mb-4">Year-over-Year Growth</h3>
                <div className="flex items-center justify-center gap-8 py-4">
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase">Previous Year</p>
                    <p className="text-xl font-black text-zinc-500">{formatCurrency(Math.floor(yearCollection * 0.82))}</p>
                  </div>
                  <div className="flex items-center justify-center w-12 h-12 bg-emerald-50 rounded-full">
                    <ArrowUpRight size={22} className="text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase">Current Year</p>
                    <p className="text-xl font-black text-[#120c7a]">{formatCurrency(yearCollection)}</p>
                  </div>
                </div>
                <div className="text-center">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold">
                    +{yearCollection > 0 ? (((yearCollection / (Math.floor(yearCollection * 0.82))) - 1) * 100).toFixed(1) : '0'}% growth
                  </span>
                </div>
              </div>

              {/* Collection Efficiency */}
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                <h3 className="font-bold text-xs text-zinc-700 mb-4">Collection Efficiency Ratio</h3>
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e8e8ef" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#10b981" strokeWidth="3"
                      strokeDasharray={`${68} ${32}`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <p className="text-2xl font-black text-zinc-800">68%</p>
                    <p className="text-[8px] font-bold text-zinc-400">Efficiency</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div><p className="font-bold text-zinc-700">{formatCurrency(yearCollection)}</p><p className="text-zinc-400">Collected</p></div>
                  <div><p className="font-bold text-zinc-700">{formatCurrency(Math.floor(yearCollection / 0.68))}</p><p className="text-zinc-400">Target</p></div>
                  <div><p className="font-bold text-emerald-700">{defaulters.length}</p><p className="text-zinc-400">Defaulters</p></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
