import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import {
  Building2, Users, Briefcase, IndianRupee, TrendingUp, CalendarDays,
  CheckCircle2, Clock, AlertCircle, ArrowUpRight, Target, BarChart3,
  GraduationCap, ArrowRight, Sparkles, ClipboardList, PieChart, FileText
} from "lucide-react";
import Layout from "../components/Layout";

export default function PlacementDashboard() {
  const [tab, setTab] = useState("overview");
  const [drives, setDrives] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "placement_drives"), snap => setDrives(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, "placement_companies"), snap => setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(collection(db, "placement_students"), snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u4 = onSnapshot(collection(db, "placement_offers"), snap => setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    setTimeout(() => setLoading(false), 300);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const placed = offers.filter(o => o.status === "accepted").length;
  const registered = students.filter(s => s.isRegistered).length;
  const totalOffers = offers.length;
  const acceptedOffers = offers.filter(o => o.status === "accepted");
  const avgCtc = placed > 0 ? acceptedOffers.reduce((a, o) => a + (o.ctc || 0), 0) / placed : 0;
  const highestCtc = placed > 0 ? Math.max(...acceptedOffers.map(o => o.ctc || 0)) : 0;
  const medianCtc = (() => { if (acceptedOffers.length === 0) return 0; const sorted = acceptedOffers.map(o => o.ctc || 0).sort((a, b) => a - b); const m = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2; })();
  const upcomingDrives = drives.filter(d => d.status === "upcoming").length;
  const ongoingDrives = drives.filter(d => d.status === "ongoing").length;
  const placementPct = registered > 0 ? ((placed / registered) * 100).toFixed(1) : "0.0";

  const now = new Date();
  const nextDrives = drives.filter(d => d.driveDate?.toDate?.() && d.driveDate.toDate() > now).sort((a, b) => a.driveDate.toDate() - b.driveDate.toDate()).slice(0, 5);
  const recentOffers = [...offers].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);

  const formatCtc = (val) => val >= 100000 ? `₹${(val / 100000).toFixed(2)} LPA` : `₹${(val || 0).toFixed(2)}`;
  const formatDate = (ts) => { if (!ts?.toDate) return "—"; return ts.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

  const branches = [...new Set(students.map(s => s.department).filter(Boolean))];
  const branchData = branches.map(dept => { const total = students.filter(s => s.department === dept && s.isRegistered).length; const placedCount = students.filter(s => s.department === dept && s.isPlaced).length; const deptOffers = offers.filter(o => o.department === dept && o.status === "accepted"); const avg = deptOffers.length > 0 ? deptOffers.reduce((a, o) => a + (o.ctc || 0), 0) / deptOffers.length : 0; return { dept, total, placed: placedCount, pct: total > 0 ? ((placedCount / total) * 100).toFixed(1) : "0", avgCtc: avg }; });
  const maxBranchPct = Math.max(1, ...branchData.map(b => Number(b.pct)));

  const slabs = [
    { label: "< 3 LPA", range: [0, 300000], color: "bg-red-100 text-red-700" },
    { label: "3-5 LPA", range: [300000, 500000], color: "bg-amber-100 text-amber-700" },
    { label: "5-10 LPA", range: [500000, 1000000], color: "bg-blue-100 text-blue-700" },
    { label: "10-20 LPA", range: [1000000, 2000000], color: "bg-purple-100 text-purple-700" },
    { label: "20 LPA+", range: [2000000, Infinity], color: "bg-emerald-100 text-emerald-700" },
  ];
  const slabData = slabs.map(s => ({ ...s, count: acceptedOffers.filter(o => o.ctc >= s.range[0] && o.ctc < s.range[1]).length }));
  const maxSlabCount = Math.max(1, ...slabData.map(s => s.count));

  const nirfData = { totalStudents: registered, placedStudents: placed, higherStudies: students.filter(s => s.isRegistered && !s.isPlaced).length, medianSalary: medianCtc, year: new Date().getFullYear() };

  const tabs = [
    { id: "overview", icon: BarChart3, label: "Overview" },
    { id: "reports", icon: PieChart, label: "Reports" },
  ];

  if (loading) {
    return <Layout title="Placement Dashboard"><div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div></div></Layout>;
  }

  return (
    <Layout title="Placement Dashboard">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"><Sparkles size={14}/> <span>Placement</span> <span className="text-zinc-300">/</span> <span>Dashboard</span></div>
            <h2 className="text-2xl font-black text-zinc-800">Placement Dashboard</h2>
          </div>
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                <t.icon size={15}/> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <>
            <div className="bg-gradient-to-br from-[#120c7a] to-blue-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2"><Sparkles size={18} className="text-yellow-300" /><span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Training & Placement Cell</span></div>
                  <h1 className="text-3xl md:text-4xl font-black mb-1">Placement Overview</h1>
                  <p className="text-blue-200 text-sm">Track drives, companies, and student placements in real-time</p>
                </div>
                <div className="flex items-center gap-6 bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10">
                  <div className="text-center"><p className="text-3xl font-black">{placementPct}%</p><p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Placed</p></div>
                  <div className="w-px h-10 bg-white/20" />
                  <div className="text-center"><p className="text-3xl font-black">{placed}</p><p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Students</p></div>
                  <div className="w-px h-10 bg-white/20" />
                  <div className="text-center"><p className="text-3xl font-black">{companies.length}</p><p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Companies</p></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <StatCard icon={<Users size={20}/>} iconBg="bg-emerald-50" iconColor="text-emerald-600" value={registered} label="Registered Students" trend iconEl={<TrendingUp size={16} className="text-emerald-500"/>}/>
              <StatCard icon={<Briefcase size={20}/>} iconBg="bg-blue-50" iconColor="text-blue-600" value={drives.length} label="Total Drives"/>
              <StatCard icon={<Building2 size={20}/>} iconBg="bg-purple-50" iconColor="text-purple-600" value={companies.length} label="Companies Visited"/>
              <StatCard icon={<IndianRupee size={20}/>} iconBg="bg-amber-50" iconColor="text-amber-600" value={avgCtc >= 100000 ? `₹${(avgCtc/100000).toFixed(1)}L` : avgCtc.toFixed(1)} label="Avg Package"/>
              <StatCard icon={<ArrowUpRight size={20}/>} iconBg="bg-red-50" iconColor="text-red-600" value={highestCtc >= 100000 ? `₹${(highestCtc/100000).toFixed(1)}L` : highestCtc.toFixed(1)} label="Highest Package"/>
              <StatCard icon={<Target size={20}/>} iconBg="bg-cyan-50" iconColor="text-cyan-600" value={totalOffers} label="Total Offers"/>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><BarChart3 size={16} className="text-[#120c7a]"/><h3 className="font-bold text-sm text-zinc-700">Placement Status</h3></div></div>
                <div className="p-6">
                  <div className="flex items-center justify-center gap-8">
                    <div className="relative w-36 h-36">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#e8e8ef" strokeWidth="3"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray={`${placementPct} ${100 - placementPct}`} strokeLinecap="round"/></svg>
                      <div className="absolute inset-0 flex items-center justify-center flex-col"><p className="text-3xl font-black text-zinc-800">{placementPct}%</p><p className="text-[10px] font-bold text-zinc-400">Placed</p></div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"/><span className="text-xs font-medium text-zinc-600">Placed: {placed}</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-zinc-200"/><span className="text-xs font-medium text-zinc-600">Unplaced: {registered - placed}</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"/><span className="text-xs font-medium text-zinc-600">Registered: {registered}</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays size={16} className="text-[#120c7a]"/><h3 className="font-bold text-sm text-zinc-700">Drive Status</h3></div></div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 bg-emerald-50 rounded-2xl"><p className="text-2xl font-black text-emerald-700">{upcomingDrives}</p><p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Upcoming</p></div>
                    <div className="text-center p-4 bg-blue-50 rounded-2xl"><p className="text-2xl font-black text-blue-700">{ongoingDrives}</p><p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ongoing</p></div>
                    <div className="text-center p-4 bg-zinc-50 rounded-2xl"><p className="text-2xl font-black text-zinc-700">{drives.length - upcomingDrives - ongoingDrives}</p><p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Completed</p></div>
                  </div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Monthly Drives</p>
                  {[...Array(6)].map((_, i) => { const monthDrives = drives.filter(d => { const dt = d.driveDate?.toDate?.(); if (!dt) return false; const md = (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth()); return md === 5 - i; }).length; const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; const mi = (now.getMonth() - (5 - i) + 12) % 12; const maxD = Math.max(1, ...Array.from({length:6}, (_, j) => drives.filter(d => { const dt = d.driveDate?.toDate?.(); if (!dt) return false; const md = (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth()); return md === 5 - j; }).length)); return (<div key={i} className="flex items-center gap-3"><span className="text-[10px] font-bold text-zinc-400 w-8">{monthNames[mi]}</span><div className="flex-1 bg-zinc-100 rounded-full h-3 overflow-hidden"><div className="bg-gradient-to-r from-[#120c7a] to-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${(monthDrives / maxD) * 100}%` }}/></div><span className="text-[10px] font-bold text-zinc-500 w-5 text-right">{monthDrives}</span></div>); })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays size={16} className="text-[#120c7a]"/><h3 className="font-bold text-sm text-zinc-700">Upcoming Drives</h3></div><span className="text-[10px] font-bold text-zinc-400">{nextDrives.length} scheduled</span></div>
                {nextDrives.length === 0 ? <div className="p-10 text-center"><CalendarDays size={32} className="mx-auto mb-2 text-zinc-300"/><p className="text-sm text-zinc-400 font-medium">No upcoming drives</p></div> :
                <div className="divide-y divide-zinc-50">{nextDrives.map(drive => <div key={drive.id} className="px-6 py-4 flex items-center gap-4 hover:bg-zinc-50/50 transition-colors"><div className="w-12 h-12 bg-[#120c7a]/5 rounded-xl flex items-center justify-center shrink-0"><Briefcase size={20} className="text-[#120c7a]"/></div><div className="flex-1 min-w-0"><p className="font-bold text-sm text-zinc-800 truncate">{drive.companyName}</p><p className="text-[10px] text-zinc-400 font-medium">{drive.jobTitle}</p></div><div className="text-right"><p className="text-xs font-bold text-zinc-700">{drive.driveDate?.toDate?.()?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) || "TBD"}</p><p className="text-[10px] text-zinc-400">{drive.mode === 'online' ? '🖥️ Online' : '📍 Offline'}</p></div><ArrowRight size={16} className="text-zinc-300 shrink-0"/></div>)}</div>}
              </div>
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500"/><h3 className="font-bold text-sm text-zinc-700">Recent Offers</h3></div><span className="text-[10px] font-bold text-zinc-400">{recentOffers.length} latest</span></div>
                {recentOffers.length === 0 ? <div className="p-10 text-center"><ClipboardList size={32} className="mx-auto mb-2 text-zinc-300"/><p className="text-sm text-zinc-400 font-medium">No offers yet</p></div> :
                <div className="divide-y divide-zinc-50">{recentOffers.map(offer => <div key={offer.id} className="px-6 py-4 flex items-center gap-4 hover:bg-zinc-50/50 transition-colors"><div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${offer.status === 'accepted' ? 'bg-emerald-50' : offer.status === 'pending' ? 'bg-amber-50' : 'bg-red-50'}`}><GraduationCap size={20} className={offer.status === 'accepted' ? 'text-emerald-600' : offer.status === 'pending' ? 'text-amber-600' : 'text-red-600'}/></div><div className="flex-1 min-w-0"><p className="font-bold text-sm text-zinc-800 truncate">{offer.studentName}</p><p className="text-[10px] text-zinc-400">{offer.companyName} — {offer.jobTitle}</p></div><div className="text-right"><p className="text-xs font-black text-emerald-700">₹{offer.ctc >= 100000 ? `${(offer.ctc/100000).toFixed(1)}L` : `${offer.ctc?.toFixed(0) || ""}`}</p><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${offer.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : offer.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{offer.status}</span></div></div>)}</div>}
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100"><h3 className="font-bold text-sm text-zinc-700">Quick Actions</h3></div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Building2, label: "Add Company", color: "bg-blue-50 text-blue-600", href: "/placement/drives" },
                  { icon: Briefcase, label: "New Drive", color: "bg-purple-50 text-purple-600", href: "/placement/drives" },
                  { icon: Users, label: "Register Students", color: "bg-emerald-50 text-emerald-600", href: "/placement/students" },
                  { icon: BarChart3, label: "View Reports", color: "bg-amber-50 text-amber-600", href: "#" },
                ].map((action, i) => (
                  <a key={i} onClick={() => { if (action.href === "#") setTab("reports"); }} href={action.href !== "#" ? action.href : undefined}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl border border-zinc-100 hover:border-zinc-200 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className={`p-3 rounded-xl ${action.color} group-hover:scale-110 transition-transform`}><action.icon size={24}/></div>
                    <p className="text-xs font-bold text-zinc-600">{action.label}</p>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── REPORTS TAB ── */}
        {tab === "reports" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-[#120c7a] to-blue-900 rounded-2xl p-5 text-white shadow-lg"><p className="text-3xl font-black">{placementPct}%</p><p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mt-1">Placement %</p></div>
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4"><p className="text-2xl font-black text-zinc-800">{placed}/{registered}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Students Placed</p></div>
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4"><p className="text-2xl font-black text-emerald-700">{formatCtc(avgCtc)}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Avg Package</p></div>
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4"><p className="text-2xl font-black text-amber-700">{formatCtc(medianCtc)}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Median Package</p></div>
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4"><p className="text-2xl font-black text-purple-700">{formatCtc(highestCtc)}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Highest Package</p></div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-6">
              <h3 className="font-bold text-zinc-700 mb-6">Placement Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-2xl"><p className="text-2xl font-black text-blue-700">{drives.length}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Drives Conducted</p></div>
                <div className="text-center p-4 bg-purple-50 rounded-2xl"><p className="text-2xl font-black text-purple-700">{companies.length}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Companies Visited</p></div>
                <div className="text-center p-4 bg-amber-50 rounded-2xl"><p className="text-2xl font-black text-amber-700">{offers.length}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Total Offers</p></div>
                <div className="text-center p-4 bg-emerald-50 rounded-2xl"><p className="text-2xl font-black text-emerald-700">{acceptedOffers.length}</p><p className="text-[10px] font-bold text-zinc-400 uppercase">Offers Accepted</p></div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-6">
              <h3 className="font-bold text-zinc-700 mb-6">Branch-wise Placement Analysis</h3>
              {branchData.length === 0 ? <div className="text-center p-8 text-zinc-400"><Users size={48} className="mx-auto mb-3 text-zinc-200"/><p>No branch data available</p></div> :
              <div className="space-y-5">{branchData.map(b => (<div key={b.dept}><div className="flex items-center justify-between mb-1"><p className="font-bold text-sm text-zinc-700">{b.dept}</p><div className="text-right"><span className="text-sm font-black text-zinc-800">{b.placed}/{b.total}</span><span className="text-[10px] text-zinc-400 ml-2">({b.pct}%)</span><span className="text-[10px] text-zinc-400 ml-2">Avg: {formatCtc(b.avgCtc)}</span></div></div><div className="w-full bg-zinc-100 rounded-full h-4 overflow-hidden"><div className="bg-gradient-to-r from-[#120c7a] to-blue-600 h-full rounded-full transition-all" style={{ width: `${(Number(b.pct) / maxBranchPct) * 100}%` }}/></div></div>))}</div>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-6">
                <h3 className="font-bold text-zinc-700 mb-6">CTC Slab Distribution</h3>
                {acceptedOffers.length === 0 ? <div className="text-center p-8 text-zinc-400"><IndianRupee size={48} className="mx-auto mb-3 text-zinc-200"/><p>No offer data</p></div> :
                <div className="space-y-5">{slabData.map(s => (<div key={s.label}><div className="flex items-center justify-between mb-1"><span className={`px-3 py-1 rounded-lg text-[11px] font-bold ${s.color}`}>{s.label}</span><span className="text-sm font-bold text-zinc-700">{s.count} offers</span></div><div className="w-full bg-zinc-100 rounded-full h-5 overflow-hidden"><div className={`h-full rounded-full transition-all ${s.color.split(' ')[0]}`} style={{ width: `${(s.count / maxSlabCount) * 100}%` }}/></div></div>))}</div>}
              </div>

              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-6">
                <div className="flex items-center justify-between mb-6"><div><h3 className="font-bold text-zinc-700">NIRF Data</h3><p className="text-xs text-zinc-400">Placement data for NIRF ranking</p></div><span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold">AY {nirfData.year}</span></div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-zinc-50 rounded-2xl"><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Total Students</p><p className="text-2xl font-black text-zinc-800">{nirfData.totalStudents}</p></div>
                  <div className="p-4 bg-emerald-50 rounded-2xl"><p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Placed</p><p className="text-2xl font-black text-emerald-700">{nirfData.placedStudents}</p></div>
                  <div className="p-4 bg-blue-50 rounded-2xl"><p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Higher Studies</p><p className="text-2xl font-black text-blue-700">{nirfData.higherStudies}</p></div>
                  <div className="p-4 bg-amber-50 rounded-2xl"><p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Median Salary</p><p className="text-2xl font-black text-amber-700">{formatCtc(nirfData.medianSalary)}</p></div>
                </div>
                <div className="p-4 bg-gradient-to-br from-[#120c7a]/5 to-blue-50 rounded-2xl border border-blue-100"><p className="text-xs font-medium text-zinc-600"><strong>Placement %:</strong> {placementPct}% | <strong>Total Offers:</strong> {acceptedOffers.length}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ icon, iconBg, iconColor, value, label, trend, iconEl }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 ${iconBg} rounded-xl ${iconColor}`}>{icon}</div>
        {trend && iconEl}
      </div>
      <p className="text-2xl font-black text-zinc-800">{value}</p>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}
