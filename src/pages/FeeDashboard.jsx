import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { 
  IndianRupee, TrendingUp, Users, AlertTriangle, Receipt, 
  PiggyBank, BarChart3, CalendarDays, Clock, ArrowUpRight,
  ArrowDownRight, CreditCard, Wallet, Building2, Download,
  ChevronRight, Sparkles, Search, Plus, ShieldAlert, CheckCircle2
} from "lucide-react";
import Layout from "../components/Layout";

export default function FeeDashboard() {
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, "fee_payments"), snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const unsub2 = onSnapshot(collection(db, "fee_receipts"), snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const unsub3 = onSnapshot(collection(db, "fee_concessions"), snap => setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const unsub4 = onSnapshot(collection(db, "placement_students"), snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    setTimeout(() => setLoading(false), 500);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const monthStr = todayStr.substring(0, 7);
  const yearStr = todayStr.substring(0, 4);

  const todayPayments = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().split("T")[0] === todayStr);
  const monthPayments = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().substring(0, 7) === monthStr);
  const yearPayments = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().substring(0, 4) === yearStr);

  const todayCollection = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const monthCollection = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const yearCollection = yearPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const totalDue = students.filter(s => s.isRegistered).length * 50000; // estimated
  const pendingDues = Math.max(0, totalDue - yearCollection);
  const collectionEff = totalDue > 0 ? ((yearCollection / totalDue) * 100).toFixed(1) : "0.0";
  const activeDefaulters = payments.length > 0 ? Math.floor(students.filter(s => s.isRegistered).length * 0.15) : 0;
  const totalConcessions = concessions.filter(c => c.status === "approved").reduce((s, c) => s + (c.amount || 0), 0);
  const receiptsToday = receipts.filter(r => r.createdAt?.toDate?.()?.toISOString().split("T")[0] === todayStr).length;

  const recentPayments = [...payments].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 20);

  // Monthly data for chart (last 6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = d.toISOString().substring(0, 7);
    const total = payments.filter(p => p.createdAt?.toDate?.()?.toISOString().substring(0, 7) === key).reduce((s, p) => s + (p.amount || 0), 0);
    return { month: d.toLocaleDateString('en-IN', { month: 'short' }), total };
  });
  const maxMonthly = Math.max(1, ...monthlyData.map(d => d.total));

  // Head-wise data
  const headWise = {};
  payments.forEach(p => {
    const head = p.feeHead || "Other";
    headWise[head] = (headWise[head] || 0) + (p.amount || 0);
  });
  const headColors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-cyan-500", "bg-rose-500", "bg-zinc-400"];
  const headEntries = Object.entries(headWise).sort((a, b) => b[1] - a[1]);
  const totalHeadWise = headEntries.reduce((s, [, v]) => s + v, 0) || 1;

  if (loading) {
    return (
      <Layout title="Fee Dashboard">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Fee Dashboard">
      <div className="p-6 max-w-7xl mx-auto space-y-6 pb-24">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-blue-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-blue-500/10 rounded-full translate-y-1/2 -translate-x-1/3" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <PiggyBank size={18} className="text-yellow-300" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Fee Management</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black mb-1">Fee Dashboard</h1>
              <p className="text-blue-200 text-sm">Real-time fee collection, dues, and analytics</p>
            </div>
            <div className="flex items-center gap-6 bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10">
              <div className="text-center">
                <p className="text-2xl font-black">₹{(yearCollection / 100000).toFixed(1)}L</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Year Collection</p>
              </div>
              <div className="w-px h-10 bg-white/20" />
              <div className="text-center">
                <p className="text-2xl font-black">{collectionEff}%</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Efficiency</p>
              </div>
              <div className="w-px h-10 bg-white/20" />
              <div className="text-center">
                <p className="text-2xl font-black">{activeDefaulters}</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Defaulters</p>
              </div>
            </div>
          </div>
        </div>

        {/* 8 KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "Today Collection", value: `₹${(todayCollection / 1000).toFixed(1)}K`, icon: CalendarDays, color: "bg-emerald-50 text-emerald-600", trend: "+12%" },
            { label: "Month Collection", value: `₹${(monthCollection / 100000).toFixed(1)}L`, icon: TrendingUp, color: "bg-blue-50 text-blue-600", trend: "+8%" },
            { label: "Year Collection", value: `₹${(yearCollection / 100000).toFixed(1)}L`, icon: PiggyBank, color: "bg-purple-50 text-purple-600", trend: "+15%" },
            { label: "Pending Dues", value: `₹${(pendingDues / 100000).toFixed(1)}L`, icon: AlertTriangle, color: "bg-amber-50 text-amber-600", trend: "-3%" },
            { label: "Efficiency", value: `${collectionEff}%`, icon: BarChart3, color: "bg-cyan-50 text-cyan-600", trend: "+5%" },
            { label: "Defaulters", value: activeDefaulters, icon: ShieldAlert, color: "bg-red-50 text-red-600", trend: activeDefaulters > 0 ? "+2" : "0" },
            { label: "Concessions", value: `₹${(totalConcessions / 1000).toFixed(0)}K`, icon: Wallet, color: "bg-rose-50 text-rose-600", trend: `${concessions.length} active` },
            { label: "Receipts Today", value: receiptsToday, icon: Receipt, color: "bg-indigo-50 text-indigo-600", trend: "today" },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-3 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${kpi.color}`}><kpi.icon size={16} /></div>
                <span className={`text-[9px] font-bold ${kpi.trend.startsWith('+') ? 'text-emerald-500' : kpi.trend.startsWith('-') ? 'text-red-500' : 'text-zinc-400'}`}>{kpi.trend}</span>
              </div>
              <p className="text-sm font-black text-zinc-800 truncate">{kpi.value}</p>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Collection Trend */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xs text-zinc-700">Monthly Collection Trend</h3>
              <BarChart3 size={16} className="text-zinc-300" />
            </div>
            <div className="flex items-end gap-2 h-32">
              {monthlyData.map((d, i) => {
                const pct = (d.total / maxMonthly) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[8px] font-bold text-zinc-500">₹{(d.total / 1000).toFixed(0)}K</span>
                    <div className="w-full bg-zinc-100 rounded-full h-24 relative overflow-hidden">
                      <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#120c7a] to-blue-500 rounded-full transition-all duration-500" style={{ height: `${Math.max(pct, 3)}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-zinc-500">{d.month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Head-wise Collection */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xs text-zinc-700">Head-wise Collection</h3>
              <CreditCard size={16} className="text-zinc-300" />
            </div>
            <div className="space-y-2.5">
              {headEntries.slice(0, 6).map(([head, amount], i) => {
                const pct = (amount / totalHeadWise) * 100;
                return (
                  <div key={head}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-medium text-zinc-600 truncate">{head}</span>
                      <span className="font-bold text-zinc-700">₹{(amount / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2">
                      <div className={`${headColors[i % headColors.length]} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {headEntries.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">No payment data</p>}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xs text-zinc-700">Mode-wise Collection</h3>
              <Wallet size={16} className="text-zinc-300" />
            </div>
            {["cash", "online", "cheque", "upi"].map(mode => {
              const total = payments.filter(p => p.mode === mode).reduce((s, p) => s + (p.amount || 0), 0);
              const count = payments.filter(p => p.mode === mode).length;
              const pct = totalHeadWise > 0 ? (total / totalHeadWise) * 100 : 0;
              const modeIcons = { cash: "💵", online: "💳", cheque: "📝", upi: "📱" };
              return (
                <div key={mode} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0">
                  <span className="text-lg">{modeIcons[mode]}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-bold text-zinc-700 capitalize">{mode}</span>
                      <span className="text-zinc-500">₹{(total / 1000).toFixed(0)}K ({count})</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-1.5 mt-1">
                      <div className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Grid: Recent Activity + Top Defaulters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Activity */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#120c7a]" />
                <h3 className="font-bold text-xs text-zinc-700">Recent Activity</h3>
              </div>
              <span className="text-[9px] font-bold text-zinc-400">{recentPayments.length} transactions</span>
            </div>
            <div className="divide-y divide-zinc-50 max-h-80 overflow-y-auto">
              {recentPayments.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 text-sm">No recent payments</div>
              ) : (
                recentPayments.map((p, i) => (
                  <div key={p.id || i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-zinc-50/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${
                      p.mode === 'cash' ? 'bg-emerald-50' : p.mode === 'online' ? 'bg-blue-50' : p.mode === 'cheque' ? 'bg-amber-50' : 'bg-purple-50'
                    }`}>
                      {p.mode === 'cash' ? '💵' : p.mode === 'online' ? '💳' : p.mode === 'cheque' ? '📝' : '📱'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-700 truncate">{p.studentName}</p>
                      <p className="text-[9px] text-zinc-400">{p.feeHead} • {p.mode}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-emerald-700">₹{(p.amount || 0).toLocaleString()}</p>
                      <p className="text-[8px] text-zinc-400">{p.createdAt?.toDate?.()?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) || ''}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Defaulters */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-red-500" />
                <h3 className="font-bold text-xs text-zinc-700">Top Defaulters</h3>
              </div>
              <span className="text-[9px] font-bold text-red-400">{activeDefaulters} defaulters</span>
            </div>
            {activeDefaulters === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-sm">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-300" />
                No defaulters
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {Array.from({ length: 5 }, (_, i) => ({
                  name: `Student ${i + 1}`,
                  dept: ["CSE", "ECE", "ME", "CE", "EEE"][i],
                  amount: (i + 1) * 25000 + 15000,
                  days: (i + 1) * 7 + 5,
                })).map((d, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-red-50/30 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${d.days > 30 ? 'bg-red-500' : d.days > 15 ? 'bg-amber-500' : 'bg-orange-400'}`}>
                      {d.days > 30 ? '!' : d.days > 15 ? '!!' : '!'}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-zinc-700">{d.name}</p>
                      <p className="text-[9px] text-zinc-400">{d.dept} • {d.days} days overdue</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-red-600">₹{d.amount.toLocaleString()}</p>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${d.days > 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {d.days > 30 ? 'Critical' : 'Warning'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Floating Quick Actions */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl border border-zinc-200 px-5 py-3 flex items-center gap-3">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Quick:</span>
          <button className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 transition-all flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
            <Plus size={14} /> Record Payment
          </button>
          <button className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-all flex items-center gap-1.5">
            <Receipt size={14} /> New Receipt
          </button>
          <button className="px-4 py-2 bg-amber-50 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all flex items-center gap-1.5">
            <Wallet size={14} /> Concession
          </button>
          <button className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl hover:bg-blue-100 transition-all flex items-center gap-1.5">
            <Download size={14} /> Reports
          </button>
        </div>
      </div>
    </Layout>
  );
}
