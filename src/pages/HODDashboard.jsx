import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, onSnapshot, updateDoc, getDocs, setDoc } from "firebase/firestore";
import {
  Eye, Loader2, ClipboardList, User, X, FileText, CheckCircle2, Edit2,
  Clock, BookOpen, TrendingUp, Search, Filter, School, ChevronRight,
  Sparkles, BarChart3, ArrowUpRight, Zap, Bell, AlertCircle, Calendar,
  Users, GraduationCap
} from "lucide-react";

import Layout from "../components/Layout";
import { auth, db } from "../firebase";
import { getQuestionPaperHTML } from '../utils/questionPaperUtils';
import { useRegulations } from "../hooks/useRegulations";
import { formatProgrammeKey } from "../lib/utils";

function bsKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]/]/g, '_');
}

const colorMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", border: "border-blue-200", gradient: "from-blue-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-200", gradient: "from-amber-500" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200", gradient: "from-emerald-500" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-200", gradient: "from-violet-500" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-200", gradient: "from-rose-500" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", border: "border-indigo-200", gradient: "from-indigo-500" },
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function HODDashboard() {
  const navigate = useNavigate();
  const { getRegulationForBatch } = useRegulations();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [hodName, setHodName] = useState("");
  const [hodLoading, setHodLoading] = useState(true);

  const [usersMap, setUsersMap] = useState({});
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasks, setTasks] = useState([]);

  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [currentHodSignature, setCurrentHodSignature] = useState('');
  const [facultySignatureForQP, setFacultySignatureForQP] = useState('');
  const [selectedQPHodSignature, setSelectedQPHodSignature] = useState('');
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState({});
  const [showRecorrectModal, setShowRecorrectModal] = useState(false);
  const [recorrectComments, setRecorrectComments] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [hodDepartment, setHodDepartment] = useState("");
  const [approvedStudentsList, setApprovedStudentsList] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [sectionAllotmentPopup, setSectionAllotmentPopup] = useState({ open: false });
  const [sectionConfigs, setSectionConfigs] = useState({});
  const [sectionAssignments, setSectionAssignments] = useState({});
  const [savingSection, setSavingSection] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  useEffect(() => {
    const ciaRef = collection(db, 'cia_configs');
    const unsubscribe = onSnapshot(ciaRef, (snapshot) => {
      if (snapshot.exists) {
        const data = {};
        snapshot.forEach(d => { data[d.id] = d.data(); });
        setCiaConfigs(data);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then(snap => {
          if (snap.exists()) {
            const ud = snap.data();
            setCurrentHodSignature(ud.signatureUrl || '');
            setHodName(ud.facultyName || ud.displayName || ud.email || "HOD");
            setHodDepartment(ud.department || ud.assignedDepartment || ud.departmentName || "");
          }
          setHodLoading(false);
        });
      } else {
        setCurrentHodSignature('');
        setHodName("");
        setHodLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsub = onSnapshot(
      usersRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        setUsersMap(data || {});
      },
      () => setUsersMap({})
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    const qpRef = collection(db, "generated_qps");
    const unsub = onSnapshot(
      qpRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });
        const forwarded = all
          .filter((qp) => qp?.status === "forwarded" && qp?.forwarded_to === currentUid)
          .sort((a, b) => {
            const at = new Date(a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });
        setTasks(forwarded);
        setTasksLoading(false);
      },
      () => { setTasks([]); setTasksLoading(false); }
    );
    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!hodDepartment) {
      setApprovedStudentsList([]);
      return;
    }
    setStudentsLoading(true);
    const deptKey = sanitizeKey(hodDepartment);
    const unsub = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        const all = [];
        snap.forEach(docSnap => {
          const docId = docSnap.id;
          if (!docId.endsWith(`_${deptKey}`)) return;
          const data = docSnap.data();
          Object.entries(data).forEach(([key, val]) => {
            if (key === '_order' || key.startsWith('_')) return;
            const parts = docId.split('_');
            const batch = parts[0] || "";
            all.push({ reg: key, name: val, batch, docId });
          });
        });
        all.sort((a, b) => a.reg.localeCompare(b.reg));
        setApprovedStudentsList(all);
        setStudentsLoading(false);
      },
      () => { setApprovedStudentsList([]); setStudentsLoading(false); }
    );
    return () => unsub();
  }, [hodDepartment]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  const taskCount = useMemo(() => tasks.length, [tasks]);

  const todayStr = useMemo(() => new Date().toDateString(), []);
  const reviewedToday = useMemo(() => tasks.filter(t => t.approved_at && new Date(t.approved_at).toDateString() === todayStr).length, [tasks, todayStr]);
  const weekAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; }, []);
  const reviewedThisWeek = useMemo(() => tasks.filter(t => t.approved_at && new Date(t.approved_at) >= weekAgo).length, [tasks, weekAgo]);

  const batchOptions = useMemo(() => {
    return [...new Set(tasks.map(t => t.batch).filter(Boolean))].sort();
  }, [tasks]);
  const semesterOptions = useMemo(() => {
    return [...new Set(tasks.map(t => t.semester).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        (t.subject || "").toLowerCase().includes(q) ||
        (t.subject_name || "").toLowerCase().includes(q) ||
        (resolveForwardedByName(t.forwarded_by) || "").toLowerCase().includes(q) ||
        (resolveExamDisplay(t) || "").toLowerCase().includes(q)
      );
    }
    if (filterBatch) result = result.filter(t => t.batch === filterBatch);
    if (filterSemester) result = result.filter(t => t.semester === filterSemester);
    return result;
  }, [tasks, searchQuery, filterBatch, filterSemester]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setSelectedQPHodSignature('');
        return;
      }
      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const coDocId = `${sanitizeKey(selectedQP.department)}_${sanitizeKey(regulation)}_${sanitizeKey(selectedQP.subject)}_${sanitizeKey(selectedQP.academic_year)}`;
        const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
        if (coSnap.exists()) {
          const data = coSnap.data();
          const loadedCOs = Object.entries(data)
            .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
            .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
          setModalCourseOutcomes(loadedCOs);
        }
      }
      if (selectedQP.forwarded_by) {
        const snap = await getDoc(doc(db, 'users', selectedQP.forwarded_by));
        if (snap.exists()) setFacultySignatureForQP(snap.data().signatureUrl || '');
      }
      setSelectedQPHodSignature(selectedQP.hod_signature_url || '');
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();
    const qpSet = (qp.qp_set || "").toString().trim();
    let display = examName;
    if (!display) {
      if (qpaperName && ciaConfigs && ciaConfigs[qpaperName] && ciaConfigs[qpaperName].examName) {
        display = ciaConfigs[qpaperName].examName;
      } else {
        display = qpaperName;
      }
    }
    if (qpSet && qpSet !== "Set 1") {
      display = `${display} (${qpSet})`;
    }
    return display || '-';
  };

  const resolveForwardedByName = (uid) => {
    if (!uid) return "-";
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || uid;
  };

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs);
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs]);

  const handleRecorrect = async () => {
    if (!selectedQP || !recorrectComments.trim()) {
      showToast("Please provide comments for recorrection.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey, 'versions', selectedQP.id);
      await updateDoc(qpRef, {
        status: 'recorrected',
        forwarded_to: selectedQP.forwarded_by,
        forwarded_by: null,
        hod_comments: recorrectComments.trim(),
        hod_signature_url: null,
        updated_at: new Date().toISOString()
      });
      showToast("Question paper sent back for recorrection.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
    } catch (error) {
      console.error("Error recorrecting paper:", error);
      showToast("Failed to send paper back for recorrection.", "error");
    }
  };

  const handleApproveByHOD = async () => {
    if (!selectedQP) return;
    if (!currentHodSignature) {
      showToast("Please upload your digital signature in your profile before approving.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey, 'versions', selectedQP.id);
      await updateDoc(qpRef, {
        status: 'approved_by_hod',
        hod_signature_url: currentHodSignature,
        approved_at: new Date().toISOString(),
        forwarded_to: null,
        hod_comments: null,
        updated_at: new Date().toISOString()
      });
      showToast("Question paper approved and forwarded to COE.", "success");
      setShowQPModal(false);
    } catch (error) {
      console.error("Error approving paper:", error);
      showToast("Failed to approve question paper.", "error");
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const statsCards = [
    { key: "pending", label: "Section Allotment", value: approvedStudentsList.length, icon: Users, color: "amber", onClick: () => setSectionAllotmentPopup({ open: true }) },
    { key: "today", label: "Reviewed Today", value: reviewedToday, icon: TrendingUp, color: "emerald" },
    { key: "week", label: "This Week", value: reviewedThisWeek, icon: BarChart3, color: "violet" },
    { key: "total", label: "Total QP Tasks", value: tasks.length + reviewedThisWeek, icon: BookOpen, color: "indigo" },
  ];

  const dateStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, []);

  return (
    <Layout title="HOD Dashboard">
      {toast.show && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-3 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-white/10">
                  <School size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                    {hodLoading ? (
                      <span className="inline-block w-48 h-7 rounded-lg bg-white/10 animate-pulse" />
                    ) : (
                      <>{greeting}, {hodName.split(" ")[0]}</>
                    )}
                  </h1>
                  <p className="text-blue-200 text-sm">{dateStr}</p>
                </div>
              </div>
              <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                {taskCount > 0
                  ? `You have <strong>${taskCount}</strong> question paper${taskCount > 1 ? "s" : ""} awaiting your review.`
                  : "All caught up! No question papers pending your review."}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate("/co_configuration")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <Zap size={16} />
                <span className="hidden sm:inline">CO Config</span>
              </button>
              <button onClick={() => navigate("/qp-generator")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <FileText size={16} />
                <span className="hidden sm:inline">QP Generator</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {statsCards.map((s) => {
            const c = colorMap[s.color];
            const Icon = s.icon;
            return (
              <div key={s.key}
                className={`relative bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${s.onClick ? 'cursor-pointer' : ''}`}
                onClick={s.onClick || undefined}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                    <Icon size={20} className={c.text} />
                  </div>
                  <ArrowUpRight size={16} className="text-zinc-300" />
                </div>
                <p className="text-2xl font-bold text-zinc-900 tracking-tight">{s.value}</p>
                <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{s.label}</p>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
              </div>
            );
          })}
        </div>

        {/* Search & Filter */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardList size={20} className="text-[#120c7a]" />
              Forwarded Question Papers
              {taskCount > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{taskCount}</span>
              )}
            </h2>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showFilters ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
              }`}>
              <Filter size={14} /> Filters
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10 transition-all">
                <Search size={18} className="text-zinc-400" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  placeholder="Search by subject, faculty, or exam..." />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                    <X size={14} className="text-zinc-400" />
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="px-4 pb-4 border-t border-zinc-100 pt-4">
                <div className="flex flex-wrap gap-3">
                  <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a]">
                    <option value="">All Batches</option>
                    {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a]">
                    <option value="">All Semesters</option>
                    {semesterOptions.map((s) => <option key={s} value={s}>Sem {s}</option>)}
                  </select>
                  {(filterBatch || filterSemester) && (
                    <button onClick={() => { setFilterBatch(""); setFilterSemester(""); }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-2">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Task Cards or Empty State */}
        {tasksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-zinc-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 rounded bg-zinc-200" />
                      <div className="h-3 w-32 rounded bg-zinc-100" />
                    </div>
                  </div>
                  <div className="h-8 w-20 rounded-xl bg-zinc-200" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={32} />
            </div>
            <h3 className="text-xl font-bold text-zinc-900">
              {searchQuery || filterBatch || filterSemester ? "No matching papers" : "All caught up!"}
            </h3>
            <p className="text-sm text-zinc-500 mt-1.5 max-w-sm mx-auto">
              {searchQuery || filterBatch || filterSemester
                ? "Try adjusting your search or filters."
                : "No question papers are currently forwarded to you for review. You'll see them here as they come in."}
            </p>
            {(searchQuery || filterBatch || filterSemester) && (
              <button onClick={() => { setSearchQuery(""); setFilterBatch(""); setFilterSemester(""); }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:border-[#120c7a] hover:text-[#120c7a] transition-all">
                <X size={16} /> Clear Filters
              </button>
            )}
            {!searchQuery && !filterBatch && !filterSemester && taskCount === 0 && (
              <button onClick={() => navigate("/qp-generator")}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f0a66] transition-all shadow-sm">
                <FileText size={16} /> Go to QP Generator
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((qp, idx) => {
              const name = resolveForwardedByName(qp.forwarded_by);
              const initial = (name || "?").charAt(0).toUpperCase();
              const examDisplay = resolveExamDisplay(qp);
              const sentTime = timeAgo(qp.forwarded_at || qp.saved_at);
              const colorIdx = Math.abs((qp.subject || "").length) % 6;
              const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
              const dotColor = dotColors[colorIdx];

              return (
                <div key={`${qp.compositeKey}-${qp.id}`}
                  className="group bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#120c7a]/10 text-[#120c7a] flex items-center justify-center text-sm font-bold shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-zinc-900 truncate">{name}</span>
                            <span className="text-[10px] text-zinc-400">•</span>
                            <span className="text-[11px] text-zinc-500">{sentTime}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-sm font-bold text-zinc-800 truncate">{qp.subject}</span>
                            {qp.subject_name && (
                              <>
                                <span className="text-[10px] text-zinc-400">•</span>
                                <span className="text-[11px] text-zinc-500 truncate">{qp.subject_name}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                              <BookOpen size={10} /> {examDisplay}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              <Calendar size={10} /> {qp.batch || "-"}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              Sem {qp.semester || "-"}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              {qp.academic_year || "-"}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                            <span className="text-[10px] text-amber-600 font-semibold">Pending review</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm hover:shadow-md active:scale-95">
                        <Eye size={15} /> Review
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400 font-medium">
          <ClipboardList size={14} />
          Papers forwarded to you by faculty appear here as tasks.
        </div>
      </div>

      {/* QP Review Modal */}
      {showQPModal && selectedQP && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-[#120c7a]/10 p-2.5 rounded-xl text-[#120c7a]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">{resolveExamDisplay(selectedQP)}</h3>
                  <p className="text-xs text-zinc-500">{selectedQP.subject} &middot; {selectedQP.subject_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleApproveByHOD}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <CheckCircle2 size={16} /> Forward to COE
                </button>
                <button onClick={() => setShowRecorrectModal(true)}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <Edit2 size={16} /> Recorrect
                </button>
                <button onClick={() => setShowQPModal(false)}
                  className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              <style>{`
                .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                .qp-print-wrapper .logo-img { max-width: 100%; height: 70px !important; }
                .qp-print-wrapper p { margin: 0 0 5px 0; }
              `}</style>
              <div className="bg-white shadow-xl mx-auto qp-print-wrapper rounded-xl"
                style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}>
                <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(selectedQP) }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Allotment Popup */}
      {sectionAllotmentPopup.open && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Section Allotment</h3>
                  <p className="text-xs text-zinc-500">
                    {hodDepartment ? `${hodDepartment} department` : ""} &middot; {approvedStudentsList.length} student{approvedStudentsList.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSectionAllotmentPopup({ open: false }); setSectionAssignments({}); }}
                className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {studentsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-14 bg-zinc-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : approvedStudentsList.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                    <Users size={28} />
                  </div>
                  <h4 className="text-lg font-bold text-zinc-700">No students yet</h4>
                  <p className="text-sm text-zinc-400 mt-1">
                    Students approved by the principal will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">#</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Student Name</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Register No</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Batch</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Section</th>
                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {approvedStudentsList.map((s, i) => {
                        const parts = s.docId.split('_');
                        const progKey = parts[1] || "";
                        const batchKey = parts[0] || "";
                        const configDocId = `${progKey}_${bsKey(hodDepartment)}_${batchKey}`;
                        const cfg = sectionConfigs[configDocId];
                        const numSections = cfg?.numSections || 0;
                        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                        const sections = Array.from({ length: numSections }, (_, si) => `Sec-${letters[si]}`);
                        const selected = sectionAssignments[`${s.docId}-${s.reg}`] || "";

                        return (
                          <tr key={`${s.docId}-${s.reg}`} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-zinc-500">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-zinc-900">{s.name}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.reg}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.batch}</td>
                            <td className="px-4 py-3">
                              {numSections > 0 ? (
                                <select
                                  value={selected}
                                  onChange={(e) => setSectionAssignments(prev => ({ ...prev, [`${s.docId}-${s.reg}`]: e.target.value }))}
                                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                                >
                                  <option value="">-- Select --</option>
                                  {sections.map(sec => (
                                    <option key={sec} value={sec}>{sec}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-zinc-400 italic">No sections configured</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={async () => {
                                  const sec = sectionAssignments[`${s.docId}-${s.reg}`];
                                  if (!sec) { showToast("Please select a section", "error"); return; }
                                  setSavingSection(true);
                                  try {
                                    const currentSnap = await getDoc(doc(db, 'students', s.docId));
                                    if (!currentSnap.exists()) { showToast("Student doc not found", "error"); setSavingSection(false); return; }
                                    const currentData = currentSnap.data();
                                    const { [s.reg]: studentVal, ...rest } = currentData;
                                    const newOrder = (currentData._order || []).filter(r => r !== s.reg);
                                    await setDoc(doc(db, 'students', s.docId), { ...rest, _order: newOrder });

                                    const secDocId = `${s.docId}_${sanitizeKey(sec)}`;
                                    const secSnap = await getDoc(doc(db, 'students', secDocId));
                                    const secData = secSnap.exists() ? secSnap.data() : {};
                                    const secOrder = secData._order || [];
                                    if (!secData[s.reg]) secOrder.push(s.reg);
                                    await setDoc(doc(db, 'students', secDocId), { ...secData, [s.reg]: studentVal, _order: secOrder });

                                    setSectionAssignments(prev => { const n = { ...prev }; delete n[`${s.docId}-${s.reg}`]; return n; });
                                    showToast(`${s.name} assigned to ${sec}`, "success");
                                  } catch (err) {
                                    console.error("Section assignment error:", err);
                                    showToast("Failed to assign section", "error");
                                  } finally {
                                    setSavingSection(false);
                                  }
                                }}
                                disabled={savingSection || !sectionAssignments[`${s.docId}-${s.reg}`]}
                                className="px-3 py-1.5 rounded-lg bg-[#120c7a] text-white text-[11px] font-bold hover:bg-[#0f0a66] transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="bg-zinc-50 px-6 py-3 border-t border-zinc-200 flex justify-between items-center">
              <span className="text-xs text-zinc-400">{approvedStudentsList.length} student{approvedStudentsList.length !== 1 ? "s" : ""} found</span>
              <button onClick={() => { setSectionAllotmentPopup({ open: false }); setSectionAssignments({}); }}
                className="px-4 py-2 rounded-xl bg-zinc-200 text-zinc-700 text-xs font-bold hover:bg-zinc-300 transition-all active:scale-95">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recorrect Modal */}
      {showRecorrectModal && (
        <div className="fixed inset-0 bg-black/60 z-[190] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Send for Recorrection</h3>
                  <p className="text-xs text-zinc-500">Provide feedback to the faculty</p>
                </div>
              </div>
              <button onClick={() => setShowRecorrectModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <textarea value={recorrectComments} onChange={(e) => setRecorrectComments(e.target.value)}
                className="w-full h-36 p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none text-sm"
                placeholder="Enter your suggestions/corrections for the faculty..." />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowRecorrectModal(false); setRecorrectComments(""); }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleRecorrect} disabled={!recorrectComments.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
                  Send for Recorrection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
