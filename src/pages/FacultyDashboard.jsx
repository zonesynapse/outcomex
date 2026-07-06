import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc } from "firebase/firestore";
import {
  BookOpen, Clock, Eye, Loader2, AlertCircle, Edit2, CheckCircle2,
  FileText, School, GraduationCap, Calendar,
  Search, X, Sparkles, Plus
} from "lucide-react";

import Layout from "../components/Layout";
import { auth, db } from "../firebase";
import { formatProgDisplay } from "../lib/utils";

const statusConfig = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", icon: Clock },
  forwarded: { label: "Pending HOD Review", bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
  approved_by_hod: { label: "Approved by HOD", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  recorrected: { label: "Recorrect", bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle },
};

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [facultyName, setFacultyName] = useState("");
  const [facultyDept, setFacultyDept] = useState("");

  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignedGroups, setAssignedGroups] = useState([]);

  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingQps, setPendingQps] = useState([]);
  const [statusTab, setStatusTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [timetableData, setTimetableData] = useState({});
  const [loadingTimetable, setLoadingTimetable] = useState(false);

  const sanitizeKey = (key) => {
    if (!key) return '';
    return String(key).replace(/[.#$[\]]/g, '_');
  };

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    if (!assignedGroups.length) {
      setTimetableData({});
      return;
    }
    setLoadingTimetable(true);
    const fetchTimetables = async () => {
      const results = {};
      await Promise.all(assignedGroups.map(async (g) => {
        const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;
        const compositeKey = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`;
        try {
          const snap = await getDoc(doc(db, 'timetable_allocations', compositeKey));
          if (snap.exists()) {
            const data = snap.data();
            const filterByFacultySubjects = {};
            const subAlloc = data.subjectAllocation || {};
            const facultyCodes = (g.codes || []).map(c => c.trim().toLowerCase());
            Object.entries(subAlloc).forEach(([day, periods]) => {
              Object.entries(periods || {}).forEach(([period, entries]) => {
                const arr = Array.isArray(entries) ? entries : [entries];
                arr.forEach(entry => {
                  const code = String(entry || '').split('|')[0].trim().toLowerCase();
                  if (code && facultyCodes.includes(code)) {
                    if (!filterByFacultySubjects[day]) filterByFacultySubjects[day] = {};
                    if (!filterByFacultySubjects[day][period]) filterByFacultySubjects[day][period] = [];
                    filterByFacultySubjects[day][period].push(entry);
                  }
                });
              });
            });
            results[compositeKey] = {
              template: data,
              subjectAllocation: data.subjectAllocation || {},
              facultyEntries: filterByFacultySubjects,
              periodsPerDay: parseInt(data.periodsPerDay, 10) || 0,
              workingDays: parseInt(data.workingDays, 10) || 0
            };
          }
        } catch (err) {
          console.error(`Failed to fetch timetable for ${compositeKey}:`, err);
        }
      }));
      setTimetableData(results);
      setLoadingTimetable(false);
    };
    fetchTimetables();
  }, [assignedGroups]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setFacultyName(d.facultyName || d.displayName || d.email || "Faculty");
            setFacultyDept(d.department || "");
          }
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setAssignedGroups([]);
      setAssignmentsLoading(false);
      return;
    }

    setAssignmentsLoading(true);
    const assignmentsRef = collection(db, "subject_assignments");
    const unsub = onSnapshot(
      assignmentsRef,
      (snapshot) => {
        const data = {}; snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        const groups = {};

        Object.entries(data).forEach(([progKey, depts]) => {
          Object.entries(depts || {}).forEach(([deptKey, batches]) => {
            Object.entries(batches || {}).forEach(([batchKey, ays]) => {
              Object.entries(ays || {}).forEach(([ayKey, sems]) => {
                Object.entries(sems || {}).forEach(([semKey, facultyAssignments]) => {
                  const codes = facultyAssignments?.[currentUid];
                  if (!Array.isArray(codes) || codes.length === 0) return;

                  const groupKey = `${progKey}|||${deptKey}|||${batchKey}|||${ayKey}|||${semKey}`;
                  if (!groups[groupKey]) {
                    groups[groupKey] = {
                      progKey,
                      department: deptKey,
                      batch: batchKey,
                      academicYear: ayKey,
                      semester: semKey,
                      codes: []
                    };
                  }

                  codes.forEach((code) => {
                    if (!groups[groupKey].codes.includes(code)) groups[groupKey].codes.push(code);
                  });
                });
              });
            });
          });
        });

        const grouped = Object.values(groups)
          .map((g) => ({
            ...g,
            codes: (g.codes || []).slice().sort((a, b) => String(a).localeCompare(String(b)))
          }))
          .sort((a, b) => {
            const ap = String(a.progKey || "");
            const bp = String(b.progKey || "");
            if (ap !== bp) return ap.localeCompare(bp);
            const ad = String(a.department || "");
            const bd = String(b.department || "");
            if (ad !== bd) return ad.localeCompare(bd);
            const aa = String(a.academicYear || "");
            const ba = String(b.academicYear || "");
            if (aa !== ba) return aa.localeCompare(ba);
            const as = parseInt(a.semester, 10) || 0;
            const bs = parseInt(b.semester, 10) || 0;
            return as - bs;
          });

        setAssignedGroups(grouped);
        setAssignmentsLoading(false);
      },
      () => {
        setAssignedGroups([]);
        setAssignmentsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) {
      setPendingQps([]);
      setPendingLoading(false);
      return;
    }

    setPendingLoading(true);
    const qpRef = collection(db, "generated_qps");
    const unsub = onSnapshot(
      qpRef,
      (snapshot) => {
        const data = {}; snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });

        const norm = (v) => String(v || "").trim().toLowerCase();
        const semNum = (v) => {
          const m = String(v || "").match(/(\d+)/);
          return m ? m[1] : "";
        };

        const isInAssignedContext = (qp) => {
          return (assignedGroups || []).some((g) => {
            const sameProgramme =
              norm(g.progKey) === norm(qp.programme) ||
              norm(formatProgDisplay(g.progKey)) === norm(formatProgDisplay(qp.programme));
            const sameDepartment = norm(g.department) === norm(qp.department);
            const sameBatch = norm(g.batch) === norm(qp.batch);
            const sameAcademicYear = norm(g.academicYear) === norm(qp.academic_year);
            const sameSemester = semNum(g.semester) === semNum(qp.semester);
            const sameSubject = (g.codes || []).map(norm).includes(norm(qp.subject));

            return sameProgramme && sameDepartment && sameBatch && sameAcademicYear && sameSemester && sameSubject;
          });
        };

        const pending = all
          .filter((qp) => {
            const status = String(qp?.status || "draft").toLowerCase();
            const isOwnedByMe = qp?.created_by === currentUid;

            const isMyDraft = status === "draft" && isOwnedByMe;
            const isMyDraftLegacy = status === "draft" && !qp?.created_by && isInAssignedContext(qp);

            const isAwaitingHODReview = status === "forwarded" && qp?.forwarded_by === currentUid;
            const isSentBackForRecorrection = status === "recorrected" && qp?.forwarded_to === currentUid;
            const isApprovedByHOD = status === "approved_by_hod" && isOwnedByMe;

            return isMyDraft || isMyDraftLegacy || isAwaitingHODReview || isSentBackForRecorrection || isApprovedByHOD;
          })
          .sort((a, b) => {
            const at = new Date(a.updated_at || a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.updated_at || b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });

        setPendingQps(pending);
        setPendingLoading(false);
      },
      () => {
        setPendingQps([]);
        setPendingLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid, assignedGroups]);

  const assignedCount = useMemo(() => {
    return (assignedGroups || []).reduce((sum, g) => sum + (g.codes?.length || 0), 0);
  }, [assignedGroups]);

  const draftCount = useMemo(() => pendingQps.filter(q => q.status === 'draft').length, [pendingQps]);
  const forwardedCount = useMemo(() => pendingQps.filter(q => q.status === 'forwarded').length, [pendingQps]);
  const approvedCount = useMemo(() => pendingQps.filter(q => q.status === 'approved_by_hod').length, [pendingQps]);
  const recorrectCount = useMemo(() => pendingQps.filter(q => q.status === 'recorrected').length, [pendingQps]);

  const filteredQps = useMemo(() => {
    let result = pendingQps;
    if (statusTab !== 'all') result = result.filter(q => q.status === statusTab);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(t =>
        (t.subject || "").toLowerCase().includes(q) ||
        (t.subject_name || "").toLowerCase().includes(q) ||
        (t.exam_name || t.qpaper_name || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [pendingQps, statusTab, searchTerm]);

  const statsCards = [
    { label: "Assigned Subjects", value: assignedCount, icon: BookOpen, color: "indigo" },
    { label: "Drafts", value: draftCount, icon: FileText, color: "slate" },
    { label: "Pending Review", value: forwardedCount, icon: Clock, color: "blue" },
    { label: "Approved", value: approvedCount, icon: CheckCircle2, color: "emerald" },
    { label: "Recorrection", value: recorrectCount, icon: AlertCircle, color: "amber" },
  ];

  const colorMap = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", gradient: "from-indigo-500" },
    slate: { bg: "bg-slate-50", text: "text-slate-600", iconBg: "bg-slate-100", gradient: "from-slate-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", gradient: "from-blue-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", gradient: "from-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", gradient: "from-amber-500" },
  };

  const tabs = [
    { key: "all", label: "All Papers", count: pendingQps.length },
    { key: "draft", label: "Drafts", count: draftCount },
    { key: "forwarded", label: "Pending Review", count: forwardedCount },
    { key: "approved_by_hod", label: "Approved", count: approvedCount },
    { key: "recorrected", label: "Recorrection", count: recorrectCount },
  ];

  return (
    <Layout title="Faculty Dashboard">
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
                    Welcome, {facultyName.split(" ")[0] || "Faculty"}
                  </h1>
                  <p className="text-blue-200 text-sm">{facultyDept || "Faculty Dashboard"}</p>
                </div>
              </div>
              <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                {assignedCount > 0
                  ? `You have <strong>${assignedCount}</strong> subject${assignedCount > 1 ? "s" : ""} assigned across ${assignedGroups.length} batch${assignedGroups.length > 1 ? "es" : ""}.`
                  : "No subjects assigned yet. Contact your HOD for assignments."}
              </p>
            </div>
            <button
              onClick={() => navigate("/question-paper-generator")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10 shrink-0"
            >
              <Plus size={16} />
              New Question Paper
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {statsCards.map((s) => {
            const c = colorMap[s.color];
            const Icon = s.icon;
            return (
              <div key={s.label}
                className={`relative bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                    <Icon size={20} className={c.text} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-zinc-900 tracking-tight">{s.value}</p>
                <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{s.label}</p>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
              </div>
            );
          })}
        </div>

        {/* Assigned Subjects */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-8 overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <BookOpen size={20} className="text-[#120c7a]" />
              Assigned Subjects
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{assignedCount}</span>
            </h2>
          </div>
          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm font-semibold">Loading assignments...</span>
            </div>
          ) : assignedGroups.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                <BookOpen size={28} />
              </div>
              <p className="text-lg font-bold text-zinc-700">No subjects assigned yet</p>
              <p className="text-sm text-zinc-400 mt-1">Contact your HOD to get subject assignments.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {assignedGroups.map((g) => (
                <div key={`${g.progKey}-${g.department}-${g.batch}-${g.academicYear}-${g.semester}`}
                  className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-sm font-bold text-zinc-800">{formatProgDisplay(g.progKey)}</span>
                        <span className="text-[10px] text-zinc-300">|</span>
                        <span className="text-sm font-semibold text-zinc-600">{g.department}</span>
                        <span className="text-[10px] text-zinc-300">|</span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                          <GraduationCap size={10} /> {g.batch}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                          Sem {g.semester}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                          {g.academicYear}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(g.codes || []).map((code) => (
                          <span key={code}
                            className="inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold border border-indigo-100">
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/question-paper-generator?batch=${g.batch}&dept=${g.department}&prog=${g.progKey}&ay=${g.academicYear}&sem=${g.semester}`)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#120c7a]/5 text-[#120c7a] text-xs font-bold hover:bg-[#120c7a]/10 transition-all"
                    >
                      <FileText size={14} />
                      Create QP
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Timetable */}
        {assignedGroups.length > 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-8 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Calendar size={20} className="text-[#120c7a]" />
                My Timetable
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{Object.keys(timetableData).length}</span>
              </h2>
            </div>
            {loadingTimetable ? (
              <div className="flex items-center justify-center py-12 text-zinc-400 gap-3">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-semibold">Loading timetable...</span>
              </div>
            ) : Object.keys(timetableData).length === 0 ? (
              <div className="py-12 text-center">
                <Calendar size={32} className="mx-auto text-zinc-300 mb-3" />
                <p className="text-base font-bold text-zinc-500">No timetable allocated yet</p>
                <p className="text-sm text-zinc-400 mt-1">Your timetable will appear here once allocated.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {assignedGroups.map((g) => {
                  const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;
                  const compositeKey = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`;
                  const tt = timetableData[compositeKey];
                  if (!tt || !tt.periodsPerDay) return null;

                  return (
                    <div key={`tt-${compositeKey}`} className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        <span className="text-sm font-bold text-zinc-800">{formatProgDisplay(g.progKey)}</span>
                        <span className="text-[10px] text-zinc-300">|</span>
                        <span className="text-sm font-semibold text-zinc-600">{g.department}</span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                          <GraduationCap size={10} /> {g.batch}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                          Sem {g.semester}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                          {g.academicYear}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 uppercase border border-slate-200 w-24">Day</th>
                              {Array.from({ length: tt.periodsPerDay }).map((_, i) => (
                                <th key={i} className="px-2 py-1.5 text-center text-[10px] font-bold text-slate-500 uppercase border border-slate-200">P{i + 1}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DAYS.slice(0, tt.workingDays).map((day) => (
                              <tr key={day} className="hover:bg-blue-50/20">
                                <td className="px-2 py-1.5 font-bold text-slate-600 border border-slate-200">{day.slice(0, 3)}</td>
                                {Array.from({ length: tt.periodsPerDay }).map((_, pi) => {
                                  const pNum = String(pi + 1);
                                  const facultyEntries = tt.facultyEntries?.[day]?.[pNum] || [];
                                  const hasSubject = facultyEntries.length > 0;
                                  return (
                                    <td key={pi} className={`px-1.5 py-1.5 text-center border border-slate-200 ${hasSubject ? 'bg-indigo-50' : ''}`}>
                                      {hasSubject ? (
                                        <div className="flex flex-col gap-0.5">
                                          {facultyEntries.map((entry, ei) => {
                                            const parts = String(entry).split('|');
                                            const code = parts[0] || '';
                                            return (
                                              <span key={ei} className="inline-block text-[10px] font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                                                {code}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Question Papers */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <FileText size={20} className="text-[#120c7a]" />
                My Question Papers
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">{pendingQps.length}</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-48 pl-8 pr-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-semibold outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all placeholder:text-zinc-400"
                    placeholder="Search papers..." />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                      <X size={12} className="text-zinc-400" />
                    </button>
                  )}
                </div>
                <button onClick={() => navigate("/question-paper-generator")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm">
                  <Plus size={14} /> New Paper
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-4 overflow-x-auto">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setStatusTab(tab.key)}
                  className={`relative px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    statusTab === tab.key
                      ? "bg-[#120c7a] text-white shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                  }`}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                      statusTab === tab.key ? "bg-white/20 text-white" : "bg-zinc-200 text-zinc-600"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {pendingLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm font-semibold">Loading question papers...</span>
            </div>
          ) : pendingQps.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={28} />
              </div>
              <p className="text-lg font-bold text-zinc-700">No question papers yet</p>
              <p className="text-sm text-zinc-400 mt-1 max-w-sm mx-auto">
                Create your first question paper using the QP Generator.
              </p>
              <button onClick={() => navigate("/question-paper-generator")}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f0a66] transition-all shadow-sm">
                <Plus size={16} /> Create Question Paper
              </button>
            </div>
          ) : filteredQps.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-lg font-bold text-zinc-500">No matching papers</p>
              <p className="text-sm text-zinc-400 mt-1">Try a different search or filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredQps.map((qp) => {
                const stat = statusConfig[qp.status] || statusConfig.draft;
                const StatusIcon = stat.icon;
                return (
                  <div key={`${qp.compositeKey}-${qp.id}`}
                    className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-bold text-zinc-800">{qp.subject}</span>
                          {qp.subject_name && (
                            <>
                              <span className="text-[10px] text-zinc-300">•</span>
                              <span className="text-xs text-zinc-500 truncate">{qp.subject_name}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 rounded-lg ${stat.bg} ${stat.text} px-2 py-0.5 text-[10px] font-bold border border-transparent`}>
                            <StatusIcon size={10} /> {stat.label}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                            <FileText size={10} /> {qp.exam_name || qp.qpaper_name}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            <GraduationCap size={10} /> {qp.batch || "-"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            Sem {qp.semester || "-"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            {qp.academic_year || "-"}
                          </span>
                        </div>
                        {qp.status === 'recorrected' && qp.hod_comments && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">{qp.hod_comments}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}`)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm active:scale-95"
                      >
                        {qp.status === 'recorrected' ? <Edit2 size={14} /> : <Eye size={14} />}
                        {qp.status === 'recorrected' ? 'Edit' : 'Open'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
