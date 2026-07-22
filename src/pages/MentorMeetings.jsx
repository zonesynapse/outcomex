import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, onSnapshot, collection } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, getAcademicYears, sanitizeKey } from "../lib/utils";
import {
  listenMentorMeetings, addMentorMeeting, updateMentorMeeting, deleteMentorMeeting,
  listenMentorObservations, addMentorObservation, updateMentorObservation, deleteMentorObservation,
  listenParentInteractions, addParentInteraction, updateParentInteraction, deleteParentInteraction,
  listenMentorAllocation
} from "../services/mentorService";
import {
  Calendar, UserCheck, Phone, Plus, Trash2, Edit, Search, X,
  Users, AlertTriangle, CheckCircle2, Clock, ChevronDown, MessageSquare
} from "lucide-react";

const TABS = [
  { id: "meetings", label: "Meetings", icon: Calendar },
  { id: "observations", label: "Observations", icon: AlertTriangle },
  { id: "parent", label: "Parent Interactions", icon: Phone },
];

const MEETING_TYPES = [
  { value: "individual", label: "Individual Mentoring" },
  { value: "group", label: "Group Mentoring" },
  { value: "parent", label: "Parent Meeting" },
  { value: "career", label: "Career Counselling" },
  { value: "placement", label: "Placement Counselling" },
  { value: "wellness", label: "Wellness Counselling" },
];

const OBS_CATEGORIES = [
  { value: "academic", label: "Academic" },
  { value: "attendance", label: "Attendance" },
  { value: "behavior", label: "Behavior" },
  { value: "career", label: "Career" },
  { value: "wellness", label: "Wellness" },
];

const SEVERITY_OPTIONS = [
  { value: "green", label: "Green — Healthy", color: "bg-green-100 border-green-300 text-green-800" },
  { value: "yellow", label: "Yellow — Needs Attention", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
  { value: "red", label: "Red — Immediate Intervention", color: "bg-red-100 border-red-300 text-red-800" },
];

const INTERACTION_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

export default function MentorMeetings() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [activeTab, setActiveTab] = useState("meetings");
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});
 
  const [students, setStudents] = useState([]);
  const [allocation, setAllocation] = useState({ mentors: {}, students: {} });
  const [meetings, setMeetings] = useState([]);
  const [observations, setObservations] = useState([]);
  const [parentInteractions, setParentInteractions] = useState([]);
 
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterType, setFilterType] = useState("");
 
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
 
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

  // Student list
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

  // Allocation listener
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) { setAllocation({ mentors: {}, students: {} }); return; }
    const unsub = listenMentorAllocation(programme, department, batch, academicYear, semester, section, setAllocation);
    return () => unsub();
  }, [programme, department, batch, academicYear, semester, section]);

  // Meetings listener
  useEffect(() => {
    if (!programme || !batch) { setMeetings([]); return; }
    const filters = { programme, batch };
    if (department) filters.department = department;
    if (userData?.role === "Faculty") filters.mentorUid = user?.uid;
    if (filterType) filters.type = filterType;
    const unsub = listenMentorMeetings(filters, setMeetings);
    return () => unsub();
  }, [programme, department, batch, userData, user, filterType]);

  // Observations listener
  useEffect(() => {
    if (!programme || !batch) { setObservations([]); return; }
    const filters = { programme, batch };
    if (department) filters.department = department;
    if (userData?.role === "Faculty") filters.mentorUid = user?.uid;
    if (filterSeverity) filters.severity = filterSeverity;
    const unsub = listenMentorObservations(filters, setObservations);
    return () => unsub();
  }, [programme, department, batch, userData, user, filterSeverity]);

  // Parent interactions listener
  useEffect(() => {
    if (!programme || !batch) { setParentInteractions([]); return; }
    const filters = { programme, batch };
    if (department) filters.department = department;
    if (userData?.role === "Faculty") filters.mentorUid = user?.uid;
    const unsub = listenParentInteractions(filters, setParentInteractions);
    return () => unsub();
  }, [programme, department, batch, userData, user]);

  // Auto-select for Faculty
  useEffect(() => {
    if (userData?.role === "Faculty" && userData?.programme && !programme) {
      setProgramme(userData.programme);
      setDepartment(userData.department);
    }
  }, [userData, programme]);

  const getEmptyForm = () => {
    if (activeTab === "meetings") return { type: "individual", studentReg: "", date: new Date().toISOString().split('T')[0], topic: "", notes: "", actionItems: "", status: "planned" };
    if (activeTab === "observations") return { studentReg: "", category: "academic", severity: "green", date: new Date().toISOString().split('T')[0], notes: "" };
    return { studentReg: "", parentName: "", parentMobile: "", interactionType: "call", date: new Date().toISOString().split('T')[0], notes: "", followUp: "" };
  };

  const handleOpenForm = (item = null) => {
    if (item) {
      setEditItem(item);
      setFormData({ ...item });
    } else {
      setEditItem(null);
      setFormData(getEmptyForm());
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditItem(null);
    setFormData({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const student = students.find(s => s.reg === formData.studentReg);
      const baseData = {
        mentorUid: user.uid,
        mentorName: userData.facultyName || userData.name || '',
        programme, department, batch, academicYear, semester, section,
        studentReg: formData.studentReg,
        studentName: student?.name || '',
      };

      if (activeTab === "meetings") {
        const payload = { ...baseData, type: formData.type, date: formData.date, topic: formData.topic, notes: formData.notes, actionItems: formData.actionItems, status: formData.status };
        if (editItem) await updateMentorMeeting(editItem.id, payload);
        else await addMentorMeeting(payload);
      } else if (activeTab === "observations") {
        const payload = { ...baseData, category: formData.category, severity: formData.severity, date: formData.date, notes: formData.notes };
        if (editItem) await updateMentorObservation(editItem.id, payload);
        else await addMentorObservation(payload);
      } else {
        const payload = { ...baseData, parentName: formData.parentName, parentMobile: formData.parentMobile, interactionType: formData.interactionType, date: formData.date, notes: formData.notes, followUp: formData.followUp };
        if (editItem) await updateParentInteraction(editItem.id, payload);
        else await addParentInteraction(payload);
      }
      showToast(editItem ? "Updated successfully" : "Created successfully");
      handleCloseForm();
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      if (activeTab === "meetings") await deleteMentorMeeting(id);
      else if (activeTab === "observations") await deleteMentorObservation(id);
      else await deleteParentInteraction(id);
      showToast("Deleted successfully");
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    }
  };

  const filteredData = useMemo(() => {
    const data = activeTab === "meetings" ? meetings : activeTab === "observations" ? observations : parentInteractions;
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(d => (d.studentReg || '').toLowerCase().includes(term) || (d.studentName || '').toLowerCase().includes(term) || (d.topic || '').toLowerCase().includes(term) || (d.notes || '').toLowerCase().includes(term));
  }, [activeTab, meetings, observations, parentInteractions, searchTerm]);

  if (loading) {
    return (
      <Layout title="Mentor Activities">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#120c7a]/30 border-t-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mentor Activities">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
          {toast.message}
        </div>
      )}
      {/* Tabs & Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-white rounded-2xl border border-zinc-200 shadow-sm p-1.5 w-fit">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowForm(false); setSearchTerm(""); }}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-[#120c7a] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
              <tab.icon className="h-4 w-4" /> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all text-sm font-medium shadow-sm"
            />
          </div>
          <button onClick={() => handleOpenForm()}
            className="flex items-center gap-2 bg-[#120c7a] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0e0960] shadow-lg shadow-[#120c7a]/25 whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Entry
          </button>
        </div>
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
        {activeTab === "meetings" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pb-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-1">Type:</span>
            {MEETING_TYPES.map(t => (
              <button key={t.value} onClick={() => setFilterType(filterType === t.value ? "" : t.value)}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all ${filterType === t.value ? 'bg-[#120c7a] text-white border-[#120c7a] shadow-sm' : 'bg-white text-zinc-600 border-zinc-200 hover:border-[#120c7a] hover:text-[#120c7a]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {activeTab === "observations" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pb-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-1">Severity:</span>
            {SEVERITY_OPTIONS.map(s => (
              <button key={s.value} onClick={() => setFilterSeverity(filterSeverity === s.value ? "" : s.value)}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all ${filterSeverity === s.value ? s.color + ' border-current shadow-sm' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

      {/* Data List */}
      <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                {activeTab === "meetings" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Type</th>}
                {activeTab === "meetings" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Topic</th>}
                {activeTab === "observations" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Category</th>}
                {activeTab === "observations" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Severity</th>}
                {activeTab === "parent" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Parent</th>}
                {activeTab === "parent" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Mode</th>}
                <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Notes</th>
                <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(item => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{item.date}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-semibold">{item.studentReg}</span>
                    <span className="text-zinc-500 ml-1 text-xs">— {item.studentName}</span>
                  </td>
                  {activeTab === "meetings" && (
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-semibold">
                        {MEETING_TYPES.find(t => t.value === item.type)?.label || item.type}
                      </span>
                    </td>
                  )}
                  {activeTab === "meetings" && <td className="px-4 py-2.5 text-xs">{item.topic}</td>}
                  {activeTab === "observations" && (
                    <td className="px-4 py-2.5">
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 font-semibold">
                          {OBS_CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                      </span>
                    </td>
                  )}
                  {activeTab === "observations" && (
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${SEVERITY_OPTIONS.find(s => s.value === item.severity)?.color || ''}`}>
                        {item.severity?.toUpperCase()}
                      </span>
                    </td>
                  )}
                  {activeTab === "parent" && <td className="px-4 py-2.5 text-xs">{item.parentName}</td>}
                  {activeTab === "parent" && (
                    <td className="px-4 py-2.5">
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 font-semibold">
                          {INTERACTION_TYPES.find(t => t.value === item.interactionType)?.label || item.interactionType}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-xs max-w-[200px] truncate">{item.notes}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleOpenForm(item)} className="p-1 text-blue-500 hover:text-blue-700">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-1 text-red-500 hover:text-red-700">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-16 text-center">
                  <div className="inline-flex p-3 rounded-2xl bg-slate-50 mb-4">
                    <Calendar className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No entries found</p>
                  <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or create a new entry.</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-zinc-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-bold text-lg">{editItem ? 'Edit' : 'New'} {activeTab === 'meetings' ? 'Meeting' : activeTab === 'observations' ? 'Observation' : 'Parent Interaction'}</h3>
              <button onClick={handleCloseForm} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Student */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Student *</label>
                <select value={formData.studentReg || ''} onChange={e => setFormData(p => ({ ...p, studentReg: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Student</option>
                  {students.map(s => <option key={s.reg} value={s.reg}>{s.reg} — {s.name}</option>)}
                </select>
              </div>

              {/* Meeting fields */}
              {activeTab === "meetings" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Meeting Type *</label>
                      <select value={formData.type || 'individual'} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                        {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Date *</label>
                      <input type="date" value={formData.date || ''} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Topic *</label>
                    <input type="text" value={formData.topic || ''} onChange={e => setFormData(p => ({ ...p, topic: e.target.value }))}
                      placeholder="e.g. Academic performance review" className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes</label>
                    <textarea rows={3} value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Meeting notes..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Action Items</label>
                    <textarea rows={2} value={formData.actionItems || ''} onChange={e => setFormData(p => ({ ...p, actionItems: e.target.value }))}
                      placeholder="Follow-up tasks..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Status</label>
                    <select value={formData.status || 'planned'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                      <option value="planned">Planned</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </>
              )}

              {/* Observation fields */}
              {activeTab === "observations" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Category *</label>
                      <select value={formData.category || 'academic'} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                        {OBS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Date *</label>
                      <input type="date" value={formData.date || ''} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Severity *</label>
                    <div className="flex gap-2">
                      {SEVERITY_OPTIONS.map(s => (
                          <button key={s.value} type="button" onClick={() => setFormData(p => ({ ...p, severity: s.value }))}
                              className={`flex-1 text-xs px-3 py-2.5 rounded-xl font-semibold border-2 transition-all ${(formData.severity || 'green') === s.value ? s.color + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes *</label>
                    <textarea rows={4} value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Describe your observation..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                </>
              )}

              {/* Parent interaction fields */}
              {activeTab === "parent" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Parent Name *</label>
                      <input type="text" value={formData.parentName || ''} onChange={e => setFormData(p => ({ ...p, parentName: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Parent Mobile *</label>
                      <input type="text" value={formData.parentMobile || ''} onChange={e => setFormData(p => ({ ...p, parentMobile: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Interaction Type *</label>
                      <select value={formData.interactionType || 'call'} onChange={e => setFormData(p => ({ ...p, interactionType: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                        {INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Date *</label>
                      <input type="date" value={formData.date || ''} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes</label>
                    <textarea rows={3} value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Discussion notes..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Follow-up Required</label>
                    <input type="text" value={formData.followUp || ''} onChange={e => setFormData(p => ({ ...p, followUp: e.target.value }))}
                      placeholder="Follow-up details..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={handleCloseForm} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={!formData.studentReg || saving}
                className="px-4 py-2 text-sm font-bold bg-[#120c7a] text-white rounded-lg hover:bg-[#0e0960] disabled:opacity-50">
                {saving ? 'Saving...' : editItem ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
