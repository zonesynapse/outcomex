import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, onSnapshot, collection, getDocs, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { useRegulations } from "../hooks/useRegulations";
import { formatProgDisplay, formatBatchDisplay, getAcademicYears, sanitizeKey } from "../lib/utils";
import { listenMentorAllocation, saveMentorAllocation } from "../services/mentorService";
import { Users, UserPlus, AlertTriangle, ChevronDown, ChevronUp, Search, X, RefreshCw } from "lucide-react";

export default function MentorAllocation() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);
  const { getRegulationForBatch } = useRegulations();

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");

  const [sectionConfigs, setSectionConfigs] = useState({});
  const [facultyList, setFacultyList] = useState([]);
  const [studentList, setStudentList] = useState([]);
  const [allocation, setAllocation] = useState({ mentors: {}, students: {} });
  const [globalMentors, setGlobalMentors] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMentor, setExpandedMentor] = useState(null);
  const [newMentorUid, setNewMentorUid] = useState("");
  const [showAddMentor, setShowAddMentor] = useState(false);
  const [studentPickerMentor, setStudentPickerMentor] = useState(null);
  const [studentPickerSearch, setStudentPickerSearch] = useState("");

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

const isDeptMatch = (docDept, targetDept) => {
  if (!targetDept) return true;
  if (!docDept) return true;

  const norm1 = String(docDept).toLowerCase().replace(/^(department of\s+|dept of\s+|be\s+|btech\s+|me\s+|mtech\s+|ug\s+|pg\s+)/gi, '').replace(/[^a-z0-9]/g, '');
  const norm2 = String(targetDept).toLowerCase().replace(/^(department of\s+|dept of\s+|be\s+|btech\s+|me\s+|mtech\s+|ug\s+|pg\s+)/gi, '').replace(/[^a-z0-9]/g, '');

  if (norm1 === norm2) return true;
  if (norm1 && norm2 && (norm1.includes(norm2) || norm2.includes(norm1))) return true;

  // Acronym vs full name checks
  if ((norm1 === 'cse' || norm1.includes('computerscience')) && (norm2 === 'cse' || norm2.includes('computerscience'))) return true;
  if ((norm1 === 'it' || norm1.includes('informationtechnology')) && (norm2 === 'it' || norm2.includes('informationtechnology'))) return true;
  if ((norm1 === 'aids' || norm1.includes('artificialintelligence')) && (norm2 === 'aids' || norm2.includes('artificialintelligence'))) return true;
  if ((norm1 === 'ece' || norm1.includes('electronicsandcommunication')) && (norm2 === 'ece' || norm2.includes('electronicsandcommunication'))) return true;
  if ((norm1 === 'eee' || norm1.includes('electricalandelectronics')) && (norm2 === 'eee' || norm2.includes('electricalandelectronics'))) return true;
  if ((norm1 === 'mech' || norm1.includes('mechanicalengineering')) && (norm2 === 'mech' || norm2.includes('mechanicalengineering'))) return true;
  if ((norm1 === 'civil' || norm1.includes('civilengineering')) && (norm2 === 'civil' || norm2.includes('civilengineering'))) return true;
  if ((norm1 === 'bme' || norm1.includes('biomedical')) && (norm2 === 'bme' || norm2.includes('biomedical'))) return true;
  if ((norm1 === 'robotics' || norm1.includes('roboticsandautomation')) && (norm2 === 'robotics' || norm2.includes('roboticsandautomation'))) return true;
  if ((norm1 === 'mba' || norm1.includes('businessadministration')) && (norm2 === 'mba' || norm2.includes('businessadministration'))) return true;

  return false;
};

  // Faculty list (from selected or logged-in user's department)
  useEffect(() => {
    if (!userData) { setFacultyList([]); return; }
    const targetDept = department || userData.department;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const faculty = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => {
          const isApp = u.status === "Approved" || u.isApproved === true || u.isApproved === "Approved" || u.approved === true;
          const isStaff = u.role !== "Student";
          const deptOk = isDeptMatch(u.department, targetDept);
          return isApp && isStaff && deptOk;
        });
      setFacultyList(faculty);
    });
    return () => unsub();
  }, [userData, department]);

  // Global mentors (read from users collection where isMentor === true)
  useEffect(() => {
    if (!userData) { setGlobalMentors({}); return; }
    const targetDept = department || userData.department;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const mentors = {};
      snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => u.isMentor && isDeptMatch(u.department, targetDept))
        .forEach(u => {
          mentors[u.uid] = { name: u.facultyName || u.name || 'Unknown', students: [] };
        });
      setGlobalMentors(mentors);
    });
    return () => unsub();
  }, [userData, department]);

  // Merge global mentors with per-batch student counts
  const mentorList = useMemo(() => {
    const result = {};
    Object.entries(globalMentors).forEach(([uid, m]) => {
      result[uid] = { ...m, students: [...(m.students || [])] };
    });
    Object.entries(allocation.students || {}).forEach(([reg, info]) => {
      const uid = info?.mentorUid;
      if (uid && result[uid] && !result[uid].students.includes(reg)) {
        result[uid].students.push(reg);
      }
    });
    return result;
  }, [globalMentors, allocation.students]);

  // Student list — listen to students collection and filter by batch/dept/section from doc IDs
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) {
      setStudentList([]);
      return;
    }
    const normDept = sanitizeKey(department).toLowerCase().replace(/[_ ]+/g, '');

    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const matchedStudents = [];
      snap.forEach(docSnap => {
        const docId = docSnap.id;
        const data = docSnap.data();

        // Check batch matches
        const batchMatch = docId.match(/(\d{4}-\d{4})/);
        if (!batchMatch || batchMatch[1] !== batch) return;

        // Check department matches — try _meta.department first, then doc ID
        let deptMatch = false;
        if (data._meta?.department) {
          const metaDept = sanitizeKey(data._meta.department).toLowerCase().replace(/[_ ]+/g, '');
          deptMatch = metaDept === normDept || metaDept.includes(normDept) || normDept.includes(metaDept);
        }
        if (!deptMatch) {
          const afterBatch = docId.slice(docId.indexOf(batchMatch[1]) + batchMatch[1].length + 1);
          const normComposite = afterBatch.toLowerCase().replace(/[_ ]+/g, '');
          deptMatch = normComposite.includes(normDept) || normDept.includes(normComposite);
        }
        if (!deptMatch) return;

        // Check section matches
        if (section) {
          const sectionNorm = sanitizeKey(section).toLowerCase();
          const docHasSection = docId.toLowerCase().includes(sectionNorm);
          if (!docHasSection) return;
        } else {
          // When no section selected, only include docs WITHOUT a section suffix
          const afterBatch2 = docId.slice(docId.indexOf(batchMatch[1]) + batchMatch[1].length + 1);
          // Remove the progKey_deptKey part to see if there's a section suffix
          // Section suffix looks like _Sec-A at the end
          if (/_Sec-/.test(afterBatch2)) return;
        }

        // Extract students from this doc
        const order = data._order || [];
        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : String(val || '');
          if (name) matchedStudents.push({ reg: key, name });
        });
      });

      // Sort by _order if available
      const allOrders = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data._order) allOrders.push(...data._order);
      });
      matchedStudents.sort((a, b) => {
        const ai = allOrders.indexOf(a.reg);
        const bi = allOrders.indexOf(b.reg);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.reg.localeCompare(b.reg);
      });

      setStudentList(matchedStudents);
    }, () => setStudentList([]));

    return () => unsub();
  }, [programme, department, batch, academicYear, semester, section]);

  // Allocation listener
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester) {
      setAllocation({ mentors: {}, students: {} });
      return;
    }
    const unsub = listenMentorAllocation(
      programme, department, batch, academicYear, semester, section,
      (data) => { setAllocation(data); }
    );
    return () => unsub();
  }, [programme, department, batch, academicYear, semester, section]);

  // Auto-select first programme for Faculty
  useEffect(() => {
    if (userData?.role === "Faculty" && userData?.programme && !programme) {
      setProgramme(userData.programme);
      setDepartment(userData.department);
    }
  }, [userData, programme]);

  const unassignedStudents = useMemo(() => {
    const assignedRegs = new Set(Object.keys(allocation.students || {}));
    return studentList.filter(s => !assignedRegs.has(s.reg));
  }, [studentList, allocation]);

  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return studentList;
    const term = searchTerm.toLowerCase();
    return studentList.filter(s =>
      s.reg.toLowerCase().includes(term) || s.name.toLowerCase().includes(term)
    );
  }, [studentList, searchTerm]);

  const handleAssignStudent = async (mentorUid, mentorName, reg) => {
    const newStudents = { ...allocation.students, [reg]: { mentorUid, mentorName } };
    setAllocation(prev => ({ ...prev, students: newStudents }));
    try {
      await saveMentorAllocation(programme, department, batch, academicYear, semester, section, { students: newStudents });
    } catch (err) {
      console.error("Auto-save assignment error:", err);
    }
  };

  const handleUnassignStudent = async (reg) => {
    const newStudents = { ...allocation.students };
    delete newStudents[reg];
    setAllocation(prev => ({ ...prev, students: newStudents }));
    try {
      await saveMentorAllocation(programme, department, batch, academicYear, semester, section, { students: newStudents });
    } catch (err) {
      console.error("Auto-save unassign error:", err);
    }
  };

  const handleBulkAssign = async (mentorUid, mentorName) => {
    const regs = unassignedStudents.map(s => s.reg);
    if (regs.length === 0) return;
    const newStudents = { ...allocation.students };
    regs.forEach(reg => { newStudents[reg] = { mentorUid, mentorName }; });
    setAllocation(prev => ({ ...prev, students: newStudents }));
    try {
      await saveMentorAllocation(programme, department, batch, academicYear, semester, section, { students: newStudents });
      showToast(`${regs.length} students assigned to ${mentorName}`);
    } catch (err) {
      console.error("Auto-save bulk assign error:", err);
    }
  };

  const handleAddMentor = async () => {
    const faculty = facultyList.find(f => f.uid === newMentorUid);
    if (!faculty) return;
    await handlePromoteMentor(newMentorUid, faculty.facultyName || faculty.name);
    setNewMentorUid("");
    setShowAddMentor(false);
  };

  const handlePromoteMentor = async (uid, name) => {
    if (globalMentors[uid]) {
      showToast("Already a mentor", "error");
      return;
    }
    try {
      await setDoc(doc(db, "users", uid), { isMentor: true }, { merge: true });
      showToast(`${name} promoted to mentor globally`);
    } catch (err) {
      showToast("Failed to promote mentor: " + err.message, "error");
    }
  };

  const handleRemoveMentor = async (uid) => {
    const mentorStudents = Object.values(allocation.students || {}).filter(s => s.mentorUid === uid).length;
    if (mentorStudents > 0) {
      showToast("Remove all assigned students before removing mentor", "error");
      return;
    }
    try {
      await setDoc(doc(db, "users", uid), { isMentor: false }, { merge: true });
      showToast("Mentor removed globally");
    } catch (err) {
      showToast("Failed to remove mentor: " + err.message, "error");
    }
  };

  const getRiskColor = (reg) => {
    const obs = allocation.observations?.[reg];
    if (!obs) return null;
    if (obs === 'red') return 'bg-red-100 border-red-300 text-red-800';
    if (obs === 'yellow') return 'bg-yellow-100 border-yellow-300 text-yellow-800';
    return 'bg-green-100 border-green-300 text-green-800';
  };

  if (loading) {
    return (
      <Layout title="Mentor Allocation">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#120c7a]/30 border-t-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mentor Allocation">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
          {toast.message}
        </div>
      )}

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
              <select value={department} onChange={e => { setDepartment(e.target.value); setBatch(""); setAcademicYear(""); setSemester(""); }}
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
              <select value={batch} onChange={e => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); }}
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
              <select value={academicYear} onChange={e => { setAcademicYear(e.target.value); setSemester(""); }}
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
              <select value={semester} onChange={e => setSemester(e.target.value)}
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
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-16 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-[#120c7a] to-[#1a12a8] shadow-lg mb-5">
            <Users className="h-10 w-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-2">Select Filters to Continue</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Choose Programme, Department, Batch, Academic Year, and Semester to view students and manage mentor allocation.
          </p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-5 shadow-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Total Students</p>
                <p className="text-white text-2xl font-black mt-1">{studentList.length}</p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 shadow-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Assigned</p>
                <p className="text-white text-2xl font-black mt-1">{Object.keys(allocation.students || {}).length}</p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-5 shadow-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Unassigned</p>
                <p className="text-white text-2xl font-black mt-1">{unassignedStudents.length}</p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 shadow-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Mentors</p>
                <p className="text-white text-2xl font-black mt-1">{Object.keys(mentorList).length}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Students */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search */}
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="text" placeholder="Search by Reg No or Name..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#120c7a] outline-none transition-all" />
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                <span>Total: {studentList.length}</span>
                <span className="text-green-600">Assigned: {Object.keys(allocation.students || {}).length}</span>
                <span className="text-orange-600">Unassigned: {unassignedStudents.length}</span>
              </div>
            </div>

            {/* Student List */}
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Reg No</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Name</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Assigned Mentor</th>
                      <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(s => {
                      const assigned = allocation.students?.[s.reg];
                      const mentorName = assigned ? (mentorList[assigned.mentorUid]?.name || assigned.mentorName || '—') : null;
                      return (
                        <tr key={s.reg} className={`border-t border-slate-100 ${!assigned ? 'bg-orange-50/50' : ''} hover:bg-blue-50/30 transition-colors`}>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold">{s.reg}</td>
                          <td className="px-4 py-2.5">{s.name}</td>
                          <td className="px-4 py-2.5">
                            {mentorName ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold">
                                {mentorName}
                              </span>
                            ) : (
                              <span className="text-orange-500 text-xs font-medium">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <select value={assigned ? assigned.mentorUid : ''} onChange={e => {
                              if (!e.target.value) {
                                if (assigned) handleUnassignStudent(s.reg);
                                return;
                              }
                              const f = facultyList.find(f => f.uid === e.target.value);
                              if (f) {
                                if (assigned && assigned.mentorUid === f.uid) return;
                                handleAssignStudent(f.uid, f.facultyName || f.name || '', s.reg);
                              }
                            }} className="text-xs border border-zinc-200 rounded px-2 py-1">
                              <option value="">{assigned ? 'Remove' : 'Assign to...'}</option>
                              {facultyList.filter(f => globalMentors[f.uid]).map(f => (
                                <option key={f.uid} value={f.uid}>{f.facultyName || f.name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">No students found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Mentors */}
          <div className="space-y-4">
            {/* Add Mentor */}
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Mentors ({Object.keys(mentorList).length})</h3>
                <button onClick={() => setShowAddMentor(!showAddMentor)}
                  className="text-[#120c7a] hover:bg-blue-50 p-1 rounded-lg">
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
              {showAddMentor && (
                <div className="flex gap-2 mb-3">
                  <select value={newMentorUid} onChange={e => setNewMentorUid(e.target.value)}
                    className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs">
                    <option value="">Select Faculty</option>
                    {facultyList.filter(f => !globalMentors[f.uid]).map(f => (
                      <option key={f.uid} value={f.uid}>{f.facultyName || f.name}</option>
                    ))}
                  </select>
                  <button onClick={handleAddMentor} disabled={!newMentorUid}
                    className="bg-[#120c7a] text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50">
                    Add
                  </button>
                </div>
              )}

              {/* Mentor Cards */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {Object.entries(mentorList).map(([uid, mentor]) => {
                  const isExpanded = expandedMentor === uid;
                  return (
                    <div key={uid} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => { setExpandedMentor(isExpanded ? null : uid); if (isExpanded) { setStudentPickerMentor(null); setStudentPickerSearch(''); } }}>
                        <div>
                          <p className="text-sm font-semibold">{mentor.name || 'Unknown'}</p>
                          <p className="text-xs text-zinc-500">{mentor.students?.length || 0} students</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={e => { e.stopPropagation(); handleRemoveMentor(uid); }}
                            className="text-red-400 hover:text-red-600 p-1">
                            <X className="h-3 w-3" />
                          </button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                        </div>
                      </div>
                       {isExpanded && (
                        <div className="p-3 border-t border-zinc-100">
                          {mentor.students?.length > 0 ? (
                            <div className="space-y-1">
                              {mentor.students.map(reg => {
                                const student = studentList.find(s => s.reg === reg);
                                return (
                                  <div key={reg} className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-zinc-100">
                                    <span><span className="font-mono font-semibold">{reg}</span> — {student?.name || '—'}</span>
                                    <button onClick={() => handleUnassignStudent(reg)} className="text-red-400 hover:text-red-600">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400 text-center py-2">No students assigned</p>
                          )}

                          {/* Individual student assign */}
                          <div className="mt-2">
                            <button onClick={() => setStudentPickerMentor(studentPickerMentor === uid ? null : uid)}
                              className="w-full flex items-center justify-center gap-1 text-xs bg-emerald-50 text-emerald-600 py-1.5 rounded-lg font-medium hover:bg-emerald-100">
                              <UserPlus className="h-3 w-3" />
                              {studentPickerMentor === uid ? 'Close Picker' : 'Assign Student'}
                            </button>
                            {studentPickerMentor === uid && (
                              <div className="mt-2 border border-emerald-200 rounded-lg p-2 bg-emerald-50/50">
                                <input type="text" placeholder="Search student..."
                                  value={studentPickerSearch} onChange={e => setStudentPickerSearch(e.target.value)}
                                  className="w-full text-xs px-2 py-1.5 border border-emerald-200 rounded bg-white mb-1.5 outline-none focus:ring-1 focus:ring-emerald-400" />
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {unassignedStudents
                                    .filter(s => {
                                      if (!studentPickerSearch.trim()) return true;
                                      const term = studentPickerSearch.toLowerCase();
                                      return s.reg.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
                                    })
                                    .map(s => (
                                      <div key={s.reg} className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-zinc-100 hover:bg-emerald-50 cursor-pointer"
                                        onClick={() => { handleAssignStudent(uid, mentor.name, s.reg); setStudentPickerSearch(''); }}>
                                        <span><span className="font-mono font-semibold">{s.reg}</span> — {s.name}</span>
                                        <UserPlus className="h-3 w-3 text-emerald-500" />
                                      </div>
                                    ))}
                                  {unassignedStudents.length === 0 && (
                                    <p className="text-[10px] text-zinc-400 text-center py-1">No unassigned students</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          <button onClick={() => handleBulkAssign(uid, mentor.name)}
                            disabled={unassignedStudents.length === 0}
                            className="mt-2 w-full text-xs bg-blue-50 text-blue-600 py-1.5 rounded-lg font-medium hover:bg-blue-100 disabled:opacity-50">
                            Assign all unassigned ({unassignedStudents.length})
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {Object.keys(mentorList).length === 0 && (
                  <div className="text-center py-6 text-zinc-400">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No mentors added yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Department Faculty */}
            {facultyList.length > 0 && (
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-5">
                <h3 className="font-semibold text-sm mb-3">Department Faculty ({facultyList.length})</h3>
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                  {facultyList.map(f => {
                    const isMentor = !!globalMentors[f.uid];
                    const mentorStudentCount = mentorList[f.uid]?.students?.length || 0;
                    return (
                      <div key={f.uid} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isMentor ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-slate-100'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isMentor ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                            {(f.facultyName || f.name || '?')[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-700 truncate">{f.facultyName || f.name || 'Unknown'}</span>
                        </div>
                        {isMentor ? (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">Mentor · {mentorStudentCount}</span>
                        ) : (
                          <button onClick={() => handlePromoteMentor(f.uid, f.facultyName || f.name)}
                            className="text-[10px] font-bold text-[#120c7a] hover:bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                            + Mentor
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-5">
              <h3 className="font-semibold text-sm mb-3">Allocation Summary</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total Students</span>
                  <span className="font-semibold">{studentList.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Assigned</span>
                  <span className="font-semibold text-green-600">{Object.keys(allocation.students || {}).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Unassigned</span>
                  <span className="font-semibold text-orange-600">{unassignedStudents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Mentors</span>
                  <span className="font-semibold">{Object.keys(mentorList).length}</span>
                </div>
                {Object.keys(mentorList).length > 0 && (
                  <div className="pt-2 border-t border-zinc-100">
                    <p className="text-zinc-500 mb-1">Per Mentor Range</p>
                    <p className="font-semibold">
                      {Math.min(...Object.values(mentorList).map(m => m.students?.length || 0))} — {Math.max(...Object.values(mentorList).map(m => m.students?.length || 0))}
                    </p>
                  </div>
                )}
                {unassignedStudents.length > 0 && (
                  <div className="p-2 bg-orange-50 rounded-lg mt-2">
                    <div className="flex items-center gap-1 text-orange-700">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="font-medium">{unassignedStudents.length} students not yet assigned</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </Layout>
  );
}
