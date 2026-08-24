import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onSnapshot, collection, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../../firebase";
import Layout from "../../components/Layout";
import {
  ShieldCheck, ScrollText, CalendarCheck2, ClipboardList, CheckCircle2,
  Clock3, RefreshCw, ArrowRight, Landmark, Sparkles, TrendingUp, Award, PenLine, Building2,
  Grid3X3, UserCheck, Printer, Activity
} from "lucide-react";
import { formatProgrammeKey, formatQPSetDisplay, parseSubjectField } from "../../lib/utils";

export default function ExamCellDashboard() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [currentUid, setCurrentUid] = useState(null);
  const [pendingQps, setPendingQps] = useState([]);
  const [publishedQps, setPublishedQps] = useState([]);
  const [examSchedules, setExamSchedules] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setCurrentUid(user.uid);
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setUsersMap(data);
    }, () => setUsersMap({}));
    return () => unsub();
  }, []);

  const flattenQps = (data) => {
    const all = [];
    Object.entries(data || {}).forEach(([compositeKey, docData]) => {
      const isFlat = !!(docData && typeof docData === 'object' && (docData.subject || docData.subject_code || docData.parts || docData.assignment_config || docData.qpaper_name));
      if (isFlat) {
        all.push({ ...docData, id: compositeKey, compositeKey });
      } else {
        Object.entries(docData || {}).forEach(([id, qp]) => {
          all.push({ ...(qp || {}), id, compositeKey });
        });
      }
    });
    return all;
  };

  useEffect(() => {
    const unsubQps = onSnapshot(collection(db, "generated_qps"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      const all = flattenQps(data);
      setPendingQps(all.filter(q => q?.status === "approved_by_hod"));
      setPublishedQps(all.filter(q => q?.status === "approved_by_coe"));
      setLoading(false);
    }, () => setLoading(false));
    const unsubSchedules = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      const all = [];
      snap.forEach(d => all.push({ id: d.id, ...d.data() }));
      setExamSchedules(all);
    }, () => setExamSchedules([]));
    return () => { unsubQps(); unsubSchedules(); };
  }, []);

  const pendingScheduleCount = useMemo(() =>
    examSchedules.filter(s => s.status !== "Approved").length, [examSchedules]);

  const approvedScheduleCount = useMemo(() =>
    examSchedules.filter(s => s.status === "Approved").length, [examSchedules]);

  const resolveName = (uid) => {
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || (uid ? uid.slice(0, 6) : "-");
  };

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();
    const setLabel = formatQPSetDisplay(qp);
    let display = examName || qpaperName || "-";
    return `${display} (${setLabel})`;
  };

  const stats = [
    { key: "pendingQps", label: "QP's Awaiting COE Review", value: pendingQps.length, icon: ScrollText, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", grad: "from-emerald-500 to-teal-600", onClick: () => navigate("/exam-cell/qp-review") },
    { key: "pendingSchedules", label: "Schedules Awaiting Approval", value: pendingScheduleCount, icon: CalendarCheck2, iconBg: "bg-amber-50", iconColor: "text-amber-600", grad: "from-amber-500 to-orange-600", onClick: () => navigate("/exam-cell/schedules") },
    { key: "published", label: "Published QP's", value: publishedQps.length, icon: CheckCircle2, iconBg: "bg-violet-50", iconColor: "text-violet-600", grad: "from-violet-500 to-purple-600", onClick: () => navigate("/exam-cell/qp-review?tab=published") },
    { key: "approvedSchedules", label: "Approved Schedules", value: approvedScheduleCount, icon: ShieldCheck, iconBg: "bg-sky-50", iconColor: "text-sky-600", grad: "from-sky-500 to-blue-600", onClick: () => navigate("/exam-cell/schedules?tab=approved") },
  ];

  const timeAgo = (val) => {
    if (!val) return "";
    const d = new Date(val);
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const userName = userData?.facultyName || userData?.displayName || userData?.email?.split("@")[0] || "";

  const pipelineSteps = [
    { label: "Faculty", sub: "Drafts & forwards", done: true, icon: ScrollText },
    { label: "Academic Coord.", sub: "Reviews & forwards to HOD", done: true, icon: ClipboardList },
    { label: "HOD", sub: "Reviews & forwards to COE", done: true, icon: ClipboardList },
    { label: "Exam Cell", sub: "Final review & publish", done: true, icon: Landmark, active: true },
  ];

  return (
    <Layout title="Exam Cell Dashboard">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Premium Navy Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute top-10 right-24 w-24 h-24 rounded-full bg-white/5 blur-xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Landmark size={28} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200/80">{dateStr}</p>
                <h1 className="text-2xl md:text-3xl font-black leading-tight">{greeting}, {userName || "Controller of Examinations"}.</h1>
                <div className="flex items-center gap-2 mt-2">
                  <Sparkles size={14} className="text-amber-300" />
                  <p className="text-sm text-blue-100/90 font-medium">Exam Cell — Controller of Examinations command center</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate("/exam-cell/qp-review")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#120c7a] text-xs font-extrabold hover:bg-blue-50 transition-all shadow-md cursor-pointer">
                <ScrollText size={14} /> Review Papers
              </button>
              <button onClick={() => navigate("/exam-cell/schedules")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-extrabold hover:bg-white/20 transition-all cursor-pointer">
                <CalendarCheck2 size={14} /> Schedules
              </button>
              <button onClick={() => navigate("/exam-cell/qp-assignment")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-extrabold hover:bg-white/20 transition-all cursor-pointer">
                <PenLine size={14} /> Setter Assign
              </button>
              <button onClick={() => navigate("/exam-cell/room-master")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-extrabold hover:bg-white/20 transition-all cursor-pointer">
                <Building2 size={14} /> Room Master
              </button>
              <button onClick={() => navigate("/exam-cell/seat-allocation")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-extrabold hover:bg-white/20 transition-all cursor-pointer">
                <Grid3X3 size={14} /> Seat Allocation
              </button>
              <button onClick={() => navigate("/exam-cell/exam-hall-suite")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-extrabold hover:bg-white/20 transition-all cursor-pointer">
                <ShieldCheck size={14} /> Exam Hall OS
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <button key={s.key} onClick={s.onClick}
              className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all text-left cursor-pointer group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{s.label}</p>
                  <p className={`text-4xl font-black mt-2 bg-gradient-to-r ${s.grad} bg-clip-text text-transparent`}>{s.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-2xl ${s.iconBg} ${s.iconColor} flex items-center justify-center`}>
                  <s.icon size={20} />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-[11px] font-bold text-[#120c7a] opacity-0 group-hover:opacity-100 transition-opacity">
                Open <ArrowRight size={12} />
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline Panel */}
          <div className="lg:col-span-1 bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5 border-b border-zinc-100 pb-4">
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <RefreshCw size={16} className="text-[#120c7a]" /> Approval Pipeline
              </h2>
              <span className="text-[10px] font-bold text-zinc-400">LIVE</span>
            </div>
            <div className="space-y-1">
              {pipelineSteps.map((step, idx) => (
                <div key={step.label}>
                  <div className={`relative flex items-center gap-3 p-2.5 rounded-2xl ${step.active ? "bg-gradient-to-r from-[#120c7a]/10 to-blue-100/40 border border-[#120c7a]/20" : "bg-zinc-50/50 border border-zinc-100"}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${step.active ? "bg-[#120c7a] text-white" : step.done ? "bg-emerald-100 text-emerald-600" : "bg-zinc-200 text-zinc-400"}`}>
                      {step.done ? (step.active ? <step.icon size={16} /> : <CheckCircle2 size={16} />) : <Clock3 size={16} />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-xs font-black ${step.active ? "text-[#120c7a]" : "text-zinc-800"}`}>{step.label}</p>
                      <p className="text-[10px] text-zinc-400 font-medium">{step.sub}</p>
                    </div>
                    {step.active && (
                      <span className="text-[9px] font-extrabold bg-[#120c7a] text-white px-2 py-0.5 rounded-full">YOU</span>
                    )}
                  </div>
                  {idx < pipelineSteps.length - 1 && (
                    <div className="ml-5 h-4 border-l-2 border-dashed border-zinc-200"></div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 bg-gradient-to-br from-[#120c7a] to-indigo-900 rounded-2xl p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Award size={16} className="text-amber-300" />
                <p className="text-xs font-extrabold uppercase tracking-wider">COE Authority</p>
              </div>
              <p className="text-[11px] text-blue-100/90 leading-relaxed">
                Final gatekeeper for all examination materials. Every question paper and schedule passes through the Controller of Examinations before release.
              </p>
            </div>
          </div>

          {/* Pending QPs Panel */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4">
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <ScrollText size={16} className="text-[#120c7a]" /> Papers Awaiting COE Final Review
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{pendingQps.length}</span>
              </h2>
              <button onClick={() => navigate("/exam-cell/qp-review")} className="text-[11px] font-extrabold text-[#120c7a] hover:text-[#0f0a66] flex items-center gap-1 cursor-pointer">
                View all <ArrowRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-50 rounded-2xl animate-pulse" />)}
              </div>
            ) : pendingQps.length === 0 ? (
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-xs font-bold text-zinc-800">All caught up!</h3>
                <p className="text-[11px] text-zinc-400 mt-1">No question papers awaiting your final review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingQps.slice(0, 5).map((qp) => {
                  const facName = resolveName(qp.forwarded_by);
                  const initial = (facName || "?").charAt(0).toUpperCase();
                  const colorIdx = Math.abs((qp.subject || "").length) % 6;
                  const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
                  const parsedSubj = parseSubjectField(qp.subject);
                  const subjCode = parsedSubj.code || qp.subject;
                  const subjName = parsedSubj.name || qp.subject_name;

                  return (
                    <div key={`${qp.compositeKey}-${qp.id}`}
                      className="flex items-start justify-between gap-3 bg-zinc-50/40 rounded-2xl border border-zinc-150 p-4 hover:shadow-md hover:bg-white transition-all">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-full ${dotColors[colorIdx]} text-white flex items-center justify-center text-xs font-black shrink-0`}>
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-zinc-800">{facName}</span>
                            <span className="text-[10px] text-zinc-300">•</span>
                            <span className="text-[10px] text-zinc-400">{timeAgo(qp.updated_at || qp.approved_at || qp.forwarded_at)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs font-black text-zinc-800 truncate">{subjCode}</span>
                            {subjName && <span className="text-[10px] text-zinc-600 truncate max-w-[180px] font-semibold">• {subjName}</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="inline-flex items-center rounded-md bg-blue-50/50 text-blue-700 px-1.5 py-0.5 text-[9px] font-extrabold">{resolveExamDisplay(qp)}</span>
                            <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold">{qp.batch || "-"}</span>
                            <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold">Sem {qp.semester || "-"}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => navigate("/exam-cell/qp-review")}
                        className="shrink-0 px-3 py-2 rounded-xl bg-[#120c7a] text-white text-[11px] font-extrabold hover:bg-[#0f0a66] transition-all cursor-pointer">
                        Review
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recently Published */}
            <div className="mt-6 border-t border-zinc-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-zinc-700 flex items-center gap-2">
                  <TrendingUp size={14} className="text-violet-500" /> Recently Published
                </h3>
                <span className="text-[10px] font-bold text-zinc-400">{publishedQps.length} total</span>
              </div>
              {publishedQps.length === 0 ? (
                <p className="text-[11px] text-zinc-400">No papers published yet by the Exam Cell.</p>
              ) : (
                <div className="space-y-2">
                  {publishedQps.slice(0, 4).map((qp) => {
                    const pSubj = parseSubjectField(qp.subject);
                    const pCode = pSubj.code || qp.subject;
                    const pName = pSubj.name || qp.subject_name;
                    return (
                      <div key={`${qp.compositeKey}-${qp.id}`} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-50 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-zinc-800 truncate">{pCode}{pName ? ` - ${pName}` : ""}</p>
                          <p className="text-[10px] text-zinc-400">{resolveExamDisplay(qp)} · {qp.batch || "-"} · Sem {qp.semester || "-"}</p>
                        </div>
                        <span className="shrink-0 text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">PUBLISHED</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}