import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, onSnapshot, collection } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, getAcademicYears, sanitizeKey } from "../lib/utils";
import {
  listenMentorAllocation,
  listenMentorMeetings, listenMentorObservations, listenParentInteractions,
  saveStudentRiskIndex, listenStudentRiskIndex,
  saveStudentGrowthIndex, listenStudentGrowthIndex
} from "../services/mentorService";
import {
  BarChart3, Users, AlertTriangle, TrendingUp, Download, ChevronDown, ChevronUp,
  Award, Activity, Target, BrainCircuit, Briefcase, GraduationCap, Star, Shield
} from "lucide-react";

const SGI_WEIGHTS = {
  academicPerformance: { label: "Academic Performance", weight: 20, icon: GraduationCap },
  attendance: { label: "Attendance", weight: 15, icon: Users },
  feeRegularity: { label: "Fee Regularity", weight: 10, icon: Target },
  cocurricular: { label: "Co-curricular Activities", weight: 15, icon: Activity },
  extracurricular: { label: "Extra-curricular Activities", weight: 10, icon: Award },
  placementReadiness: { label: "Placement Readiness", weight: 15, icon: Briefcase },
  mentorAssessment: { label: "Mentor Assessment", weight: 5, icon: Star },
  certifications: { label: "Certifications & Internships", weight: 10, icon: BrainCircuit },
};

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "mentor", label: "Mentor Report", icon: Users },
  { id: "student", label: "Student SGI & Risk", icon: TrendingUp },
];

export default function MentorReports() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("overview");
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});

  const [allocation, setAllocation] = useState({ mentors: {}, students: {} });
  const [students, setStudents] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [observations, setObservations] = useState([]);
  const [parentInteractions, setParentInteractions] = useState([]);
  const [riskIndices, setRiskIndices] = useState([]);
  const [sgiData, setSgiData] = useState([]);

  const [selectedStudent, setSelectedStudent] = useState("");
  const [showSGIForm, setShowSGIForm] = useState(false);
  const [sgiForm, setSgiForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  }, []);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setUserData(snap.data());
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredProgrammes = useMemo(() => {
    if (!PROGRAMME_DEPARTMENTS) return [];
    if (userData?.role === "Faculty") return PROGRAMME_DEPARTMENTS[userData.programme] ? [userData.programme] : [];
    return Object.keys(PROGRAMME_DEPARTMENTS);
  }, [PROGRAMME_DEPARTMENTS, userData]);

  const filteredDepartments = useMemo(() => {
    if (!programme || !PROGRAMME_DEPARTMENTS) return [];
    if (userData?.role === "Faculty") return [userData.department];
    return PROGRAMME_DEPARTMENTS[programme] || [];
  }, [programme, PROGRAMME_DEPARTMENTS, userData]);

  const activeBatches = useMemo(() => {
    if (!programme) return [];
    return getActiveBatches(programme);
  }, [programme, getActiveBatches]);

  const academicYears = useMemo(() => {
    if (!batch) return [];
    return getAcademicYears(batch);
  }, [batch]);

  const semesters = useMemo(() => {
    if (!batch || !academicYear) return [];
    const batchStart = parseInt(batch.split('-')[0], 10);
    const ayStart = parseInt(academicYear.split('-')[0], 10);
    const yearOffset = ayStart - batchStart;
    const dur = durations?.[programme] || 4;
    if (yearOffset < 0 || yearOffset >= dur) return [];
    return [String(yearOffset * 2 + 1), String(yearOffset * 2 + 2)];
  }, [batch, academicYear, durations, programme]);

  // Section Configs Listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    }, (err) => console.error("Section configs fetch error:", err));
    return () => unsub();
  }, []);

  const availableSections = useMemo(() => {
    if (!batch || !department || !programme) return [];
    const deptLower = department.toLowerCase();
    const batchSanitized = sanitizeKey(batch);
    const cfg = Object.values(sectionConfigs).find(c => {
      if (!c.batch || sanitizeKey(c.batch) !== batchSanitized) return false;
      const docDept = (c.department || '').toLowerCase();
      return deptLower.includes(docDept) || docDept.includes(deptLower);
    });
    if (!cfg || !cfg.numSections) return [];
    const count = cfg.numSections;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: count }, (_, i) => `Sec-${letters[i]}`);
  }, [batch, department, programme, sectionConfigs]);

  // Students
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) { setStudents([]); return; }
    const progKey = programme.replace(/\./g, '_');
    const deptKey = department.replace(/\./g, '_');
    const secSuffix = section ? `_${section}` : '';
    const docId = `${batch}_${progKey}_${deptKey}_${academicYear}_${semester}${secSuffix}`;

    const unsub = onSnapshot(doc(db, "students", docId), (snap) => {
      if (!snap.exists()) { setStudents([]); return; }
      const data = snap.data();
      const order = data._order || [];
      const list = Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([reg, val]) => ({ reg, name: typeof val === 'object' ? (val.name || '') : String(val || '') }))
        .sort((a, b) => {
          const ai = order.indexOf(a.reg);
          const bi = order.indexOf(b.reg);
          return (ai !== -1 ? ai : 9999) - (bi !== -1 ? bi : 9999);
        });
      setStudents(list);
    });
    return () => unsub();
  }, [programme, department, batch, academicYear, semester, section]);

  // Allocation
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) { setAllocation({ mentors: {}, students: {} }); return; }
    const unsub = listenMentorAllocation(programme, department, batch, academicYear, semester, section, setAllocation);
    return () => unsub();
  }, [programme, department, batch, academicYear, semester, section]);

  // Meetings
  useEffect(() => {
    if (!programme || !batch) { setMeetings([]); return; }
    const filters = { programme, batch };
    if (department) filters.department = department;
    const unsub = listenMentorMeetings(filters, setMeetings);
    return () => unsub();
  }, [programme, department, batch]);

  // Observations
  useEffect(() => {
    if (!programme || !batch) { setObservations([]); return; }
    const filters = { programme, batch };
    if (department) filters.department = department;
    const unsub = listenMentorObservations(filters, setObservations);
    return () => unsub();
  }, [programme, department, batch]);

  // Parent Interactions
  useEffect(() => {
    if (!programme || !batch) { setParentInteractions([]); return; }
    const filters = { programme, batch };
    if (department) filters.department = department;
    const unsub = listenParentInteractions(filters, setParentInteractions);
    return () => unsub();
  }, [programme, department, batch]);

  // Risk Indices
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) { setRiskIndices([]); return; }
    const unsub = listenStudentRiskIndex(programme, department, batch, academicYear, semester, setRiskIndices);
    return () => unsub();
  }, [programme, department, batch, academicYear, semester]);

  // SGI Data
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) { setSgiData([]); return; }
    const unsub = listenStudentGrowthIndex(programme, department, batch, academicYear, semester, setSgiData);
    return () => unsub();
  }, [programme, department, batch, academicYear, semester]);

  // Auto-select for Faculty
  useEffect(() => {
    if (userData?.role === "Faculty" && userData?.programme && !programme) {
      setProgramme(userData.programme);
      setDepartment(userData.department);
    }
  }, [userData, programme]);

  // Overview stats
  const overviewStats = useMemo(() => {
    const totalStudents = students.length;
    const assignedStudents = Object.keys(allocation.students || {}).length;
    const totalMentors = Object.keys(allocation.mentors || {}).length;
    const totalMeetings = meetings.length;
    const completedMeetings = meetings.filter(m => m.status === 'completed').length;
    const totalObservations = observations.length;
    const redFlags = observations.filter(o => o.severity === 'red').length;
    const yellowFlags = observations.filter(o => o.severity === 'yellow').length;
    const totalParentInteractions = parentInteractions.length;
    const riskCounts = { green: 0, yellow: 0, red: 0 };
    riskIndices.forEach(r => { if (riskCounts[r.riskLevel] !== undefined) riskCounts[r.riskLevel]++; });
    const avgSGI = sgiData.length > 0 ? (sgiData.reduce((sum, s) => sum + (s.totalSGI || 0), 0) / sgiData.length).toFixed(1) : 0;
    return { totalStudents, assignedStudents, unassignedStudents: totalStudents - assignedStudents, totalMentors, totalMeetings, completedMeetings, totalObservations, redFlags, yellowFlags, totalParentInteractions, riskCounts, avgSGI };
  }, [students, allocation, meetings, observations, parentInteractions, riskIndices, sgiData]);

  // Mentor report data
  const mentorReport = useMemo(() => {
    return Object.entries(allocation.mentors || {}).map(([uid, mentor]) => {
      const regs = mentor.students || [];
      const mentorMeetings = meetings.filter(m => m.mentorUid === uid);
      const mentorObs = observations.filter(o => o.mentorUid === uid);
      const mentorParentInt = parentInteractions.filter(p => p.mentorUid === uid);
      const riskCount = { green: 0, yellow: 0, red: 0 };
      regs.forEach(reg => {
        const r = riskIndices.find(ri => ri.id?.endsWith(`_${reg}`));
        if (r && riskCount[r.riskLevel] !== undefined) riskCount[r.riskLevel]++;
      });
      const sgiAvg = regs.length > 0 ? (() => {
        const sgiScores = regs.map(reg => sgiData.find(s => s.id?.endsWith(`_${reg}`))).filter(Boolean);
        return sgiScores.length > 0 ? (sgiScores.reduce((sum, s) => sum + (s.totalSGI || 0), 0) / sgiScores.length).toFixed(1) : '—';
      })() : '—';
      return { uid, name: mentor.name, studentCount: regs.length, meetings: mentorMeetings.length, completedMeetings: mentorMeetings.filter(m => m.status === 'completed').length, observations: mentorObs.length, redFlags: mentorObs.filter(o => o.severity === 'red').length, parentInteractions: mentorParentInt.length, riskCount, sgiAvg };
    });
  }, [allocation, meetings, observations, parentInteractions, riskIndices, sgiData]);

  const handleOpenSGIForm = (reg) => {
    setSelectedStudent(reg);
    const existing = sgiData.find(s => s.id?.endsWith(`_${reg}`));
    setSgiForm(existing ? { ...existing } : {
      academicPerformance: '', attendance: '', feeRegularity: '', cocurricular: '',
      extracurricular: '', placementReadiness: '', mentorAssessment: '', certifications: ''
    });
    setShowSGIForm(true);
  };

  const handleSaveSGI = async () => {
    if (!selectedStudent || !programme || !department || !batch || !academicYear || !semester) return;
    setSaving(true);
    try {
      const totalSGI = Object.entries(SGI_WEIGHTS).reduce((sum, [key, cfg]) => {
        const val = parseFloat(sgiForm[key]) || 0;
        return sum + (val * cfg.weight / 100);
      }, 0);
      await saveStudentGrowthIndex(programme, department, batch, academicYear, semester, selectedStudent, {
        ...sgiForm, totalSGI: parseFloat(totalSGI.toFixed(2)),
        mentorUid: user.uid, mentorName: userData.facultyName || userData.name || ''
      });
      showToast("SGI saved successfully");
      setShowSGIForm(false);
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    }
    setSaving(false);
  };

  const getRiskColor = (level) => {
    if (level === 'red') return 'bg-red-100 text-red-700 border-red-200';
    if (level === 'yellow') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  if (loading) {
    return (
      <Layout title="Mentor Reports & Analytics">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#120c7a]/30 border-t-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mentor Reports & Analytics">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit mb-6">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white text-[#120c7a] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl shadow-xl p-6 mb-8 border border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Programme</label>
            <div className="relative mt-1">
              <select value={programme} onChange={e => { setProgramme(e.target.value); setDepartment(""); setBatch(""); setAcademicYear(""); setSemester(""); setSection(""); }}
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">Select Programme</option>
                {filteredProgrammes.map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
            <div className="relative mt-1">
              <select value={department} onChange={e => { setDepartment(e.target.value); setBatch(""); setAcademicYear(""); setSemester(""); setSection(""); }}
                disabled={!programme} className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">Select Department</option>
                {filteredDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
            <div className="relative mt-1">
              <select value={batch} onChange={e => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); setSection(""); }}
                disabled={!department} className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">Select Batch</option>
                {activeBatches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
            <div className="relative mt-1">
              <select value={academicYear} onChange={e => { setAcademicYear(e.target.value); setSemester(""); setSection(""); }}
                disabled={!batch} className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">Select AY</option>
                {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Semester</label>
            <div className="relative mt-1">
              <select value={semester} onChange={e => { setSemester(e.target.value); setSection(""); }}
                disabled={!academicYear} className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">Select Sem</option>
                {semesters.map(s => <option key={s} value={s}>Sem {s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Section</label>
            <div className="relative mt-1">
              <select value={section} onChange={e => setSection(e.target.value)}
                disabled={!semester || availableSections.length === 0} className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">All Sections</option>
                {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
        </div>
      </div>

      {!programme || !department || !batch || !academicYear || !semester ? (
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-12 text-center">
          <BarChart3 className="h-12 w-12 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 font-medium">Select all filters to view reports</p>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{overviewStats.totalStudents}</p>
                      <p className="text-xs text-zinc-500">Total Students</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg"><Users className="h-5 w-5 text-emerald-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{overviewStats.totalMentors}</p>
                      <p className="text-xs text-zinc-500">Active Mentors</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg"><Activity className="h-5 w-5 text-purple-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{overviewStats.totalMeetings}</p>
                      <p className="text-xs text-zinc-500">Meetings ({overviewStats.completedMeetings} done)</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{overviewStats.redFlags}</p>
                      <p className="text-xs text-zinc-500">Red Flags ({overviewStats.yellowFlags} yellow)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk & SGI */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
                  <h3 className="font-bold text-sm mb-4">Risk Distribution</h3>
                  <div className="space-y-3">
                    {Object.entries(overviewStats.riskCounts).map(([level, count]) => (
                      <div key={level} className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRiskColor(level)}`}>{level.toUpperCase()}</span>
                        <div className="flex-1 bg-zinc-100 rounded-full h-6 overflow-hidden">
                          <div className={`h-full rounded-full flex items-center px-3 text-xs font-bold text-white ${level === 'red' ? 'bg-red-500' : level === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${overviewStats.totalStudents > 0 ? (count / overviewStats.totalStudents * 100) : 0}%` }}>
                            {count}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
                  <h3 className="font-bold text-sm mb-4">Student Growth Index</h3>
                  <div className="text-center py-4">
                    <p className="text-5xl font-bold text-[#120c7a]">{overviewStats.avgSGI}</p>
                    <p className="text-xs text-zinc-500 mt-1">Average SGI Score</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {Object.entries(SGI_WEIGHTS).map(([key, cfg]) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <cfg.icon className="h-3 w-3 text-zinc-400" />
                        <span className="text-zinc-500">{cfg.label}</span>
                        <span className="font-bold ml-auto">{cfg.weight}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mentor Report Tab */}
          {activeTab === "mentor" && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-zinc-600">Mentor</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Students</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Meetings</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Observations</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Red Flags</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Parent Int.</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Avg SGI</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentorReport.map(m => (
                      <tr key={m.uid} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                        <td className="px-4 py-3 font-semibold">{m.name}</td>
                        <td className="px-4 py-3 text-center">{m.studentCount}</td>
                        <td className="px-4 py-3 text-center">{m.meetings} <span className="text-zinc-400 text-xs">({m.completedMeetings} done)</span></td>
                        <td className="px-4 py-3 text-center">{m.observations}</td>
                        <td className="px-4 py-3 text-center">
                          {m.redFlags > 0 ? <span className="text-red-600 font-bold">{m.redFlags}</span> : <span className="text-zinc-400">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center">{m.parentInteractions}</td>
                        <td className="px-4 py-3 text-center font-bold">{m.sgiAvg}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            {m.riskCount.red > 0 && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-bold">{m.riskCount.red}</span>}
                            {m.riskCount.yellow > 0 && <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs font-bold">{m.riskCount.yellow}</span>}
                            {m.riskCount.green > 0 && <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-bold">{m.riskCount.green}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {mentorReport.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-400">No mentors allocated</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Student SGI & Risk Tab */}
          {activeTab === "student" && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-zinc-600">Reg No</th>
                      <th className="text-left px-4 py-3 font-semibold text-zinc-600">Name</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Mentor</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">SGI Score</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Risk Level</th>
                      <th className="text-center px-4 py-3 font-semibold text-zinc-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const mentor = allocation.students?.[s.reg];
                      const mentorName = mentor ? (allocation.mentors?.[mentor.mentorUid]?.name || '—') : '—';
                      const sgi = sgiData.find(d => d.id?.endsWith(`_${s.reg}`));
                      const risk = riskIndices.find(d => d.id?.endsWith(`_${s.reg}`));
                      return (
                        <tr key={s.reg} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold">{s.reg}</td>
                          <td className="px-4 py-2.5">{s.name}</td>
                          <td className="px-4 py-2.5 text-center text-xs">{mentorName}</td>
                          <td className="px-4 py-2.5 text-center">
                            {sgi ? (
                              <span className={`font-bold ${sgi.totalSGI >= 70 ? 'text-green-600' : sgi.totalSGI >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {sgi.totalSGI}
                              </span>
                            ) : <span className="text-zinc-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {risk ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getRiskColor(risk.riskLevel)}`}>
                                {risk.riskLevel?.toUpperCase()}
                              </span>
                            ) : <span className="text-zinc-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => handleOpenSGIForm(s.reg)}
                              className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-medium hover:bg-blue-100">
                              {sgi ? 'Edit SGI' : 'Set SGI'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {students.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-400">No students found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* SGI Form Modal */}
      {showSGIForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-zinc-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-bold text-lg">Student Growth Index — {selectedStudent}</h3>
              <button onClick={() => setShowSGIForm(false)} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {Object.entries(SGI_WEIGHTS).map(([key, cfg]) => (
                <div key={key}>
                  <label className="flex items-center justify-between text-xs font-semibold text-zinc-500 mb-1">
                    <span className="flex items-center gap-1.5"><cfg.icon className="h-3.5 w-3.5" /> {cfg.label}</span>
                    <span className="text-zinc-400">{cfg.weight}%</span>
                  </label>
                  <input type="number" min="0" max="100" step="0.1"
                    value={sgiForm[key] || ''}
                    onChange={e => setSgiForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder="Score (0–100)"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div className="pt-2 border-t border-zinc-100">
                <div className="flex justify-between text-sm font-bold">
                  <span>Weighted SGI Total</span>
                  <span className="text-[#120c7a]">
                    {Object.entries(SGI_WEIGHTS).reduce((sum, [key, cfg]) => {
                      return sum + ((parseFloat(sgiForm[key]) || 0) * cfg.weight / 100);
                    }, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setShowSGIForm(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveSGI} disabled={saving}
                className="px-4 py-2 text-sm font-bold bg-[#120c7a] text-white rounded-lg hover:bg-[#0e0960] disabled:opacity-50">
                {saving ? 'Saving...' : 'Save SGI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
