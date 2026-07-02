import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { db, auth } from "../firebase";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, formatProgrammeKey, formatProgDisplay, getOrdinal, getAcademicYears } from "../lib/utils";
import {
  Calendar,
  Clock,
  ChevronDown,
  Save,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Loader2,
  User
} from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toArray = (val) => {
  if (!val) return []
  if (Array.isArray(val)) return val
  return [val]
}

function sanitizeKey(key) {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
}

function formatTime(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return new Date(1970, 0, 1, h, m, 0);
}

export default function TimetableCreation() {
  const { departments: PROGRAMME_DEPARTMENTS, durations: progDurations } = useDepartments();
  const { getActiveBatches } = useBatches(progDurations);

  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allocatedTemplate, setAllocatedTemplate] = useState(null);
  const [subjectAllocation, setSubjectAllocation] = useState({});
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [allocatedSubjects, setAllocatedSubjects] = useState([]);
  const [courseNames, setCourseNames] = useState({});
  const [userProgramme, setUserProgramme] = useState("");
  const [userDepartment, setUserDepartment] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const batchesList = useMemo(() => {
    if (!programme) return [];
    return getActiveBatches(formatProgrammeKey(programme));
  }, [programme, getActiveBatches]);

  const ayOptions = useMemo(() => {
    return batch ? getAcademicYears(batch) : [];
  }, [batch]);

  const semOptions = useMemo(() => {
    if (!batch || !academicYear) return [];
    const years = getAcademicYears(batch);
    const idx = years.indexOf(academicYear);
    if (idx < 0) return [];
    const s1 = idx * 2 + 1, s2 = idx * 2 + 2;
    return [`${getOrdinal(s1)} Semester`, `${getOrdinal(s2)} Semester`];
  }, [batch, academicYear]);

  const periodsPerDay = allocatedTemplate ? parseInt(allocatedTemplate.periodsPerDay, 10) || 0 : 0;
  const workingDaysCount = allocatedTemplate ? parseInt(allocatedTemplate.workingDays, 10) || 5 : 0;

  const periodTimings = useMemo(() => {
    if (!allocatedTemplate) return [];
    const timings = [];
    for (let i = 1; i <= periodsPerDay; i++) {
      const start = parseTimeToDate(allocatedTemplate.startTime);
      if (!start) { timings.push(null); continue; }
      const t = new Date(start);
      for (let j = 1; j < i; j++) {
        const pd = parseInt(allocatedTemplate.periodDurations?.[j] || 0, 10) || 0;
        t.setMinutes(t.getMinutes() + pd);
        (allocatedTemplate.breaks || []).forEach((br) => {
          const after = parseInt(br.after || 0, 10) || 0;
          const dur = parseInt(br.duration || 0, 10) || 0;
          if (after === j) t.setMinutes(t.getMinutes() + dur);
        });
        if (parseInt(allocatedTemplate.lunchAfterPeriod || 0, 10) === j) {
          t.setMinutes(t.getMinutes() + (parseInt(allocatedTemplate.lunchDuration || 0, 10) || 0));
        }
      }
      const pd = parseInt(allocatedTemplate.periodDurations?.[i] || 0, 10) || 0;
      if (pd > 0) {
        const end = new Date(t);
        end.setMinutes(end.getMinutes() + pd);
        timings.push(`${formatTime(t)} - ${formatTime(end)}`);
      } else {
        timings.push(`Period ${i}`);
      }
    }
    return timings;
  }, [allocatedTemplate, periodsPerDay]);

  // Fetch course names once
  useEffect(() => {
    const fetchCourseNames = async () => {
      try {
        const snap = await getDocs(collection(db, 'courses'));
        const names = {};
        snap.forEach(d => {
          const docData = d.data();
          if (docData.code && docData.name) {
            names[docData.code] = docData.name;
          } else if (docData.name && d.id.includes('_')) {
            names[d.id.split('_').pop()] = docData.name;
          } else {
            Object.values(docData).forEach(deptCourses => {
              if (deptCourses && typeof deptCourses === 'object') {
                Object.values(deptCourses).forEach(regCourses => {
                  if (regCourses && typeof regCourses === 'object') {
                    Object.entries(regCourses).forEach(([courseCode, courseData]) => {
                      if (courseData && courseData.name) {
                        names[courseCode] = courseData.name;
                      }
                    });
                  }
                });
              }
            });
          }
        });
        setCourseNames(names);
      } catch (err) {
        console.error("Failed to fetch course names:", err);
      }
    };
    fetchCourseNames();
  }, []);

  // Fetch current user's programme and department
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const userData = snap.data();
          setUserProgramme(userData.programme || "");
          setUserDepartment(userData.department || "");
          setProgramme(userData.programme || "");
          setDepartment(userData.department || "");
        }
      }
    });
    return unsub;
  }, []);

  const handleLoad = async () => {
    if (!programme || !department || !batch || !academicYear || !semester) {
      showToast("Please fill all fields.", "error");
      return;
    }
    setLoading(true);
    try {
      const progKey = formatProgrammeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const ayKey = sanitizeKey(academicYear);
      const semNum = String(semester).match(/\d+/)?.[0] || "1";
      const compositeKey = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}`;

      const snap = await getDoc(doc(db, 'timetable_allocations', compositeKey));
      if (!snap.exists()) {
        showToast("No allocated timetable found for this combination.", "error");
        setAllocatedTemplate(null);
        setSubjectAllocation({});
        setAllocatedSubjects([]);
        return;
      }
      const data = snap.data();
      setAllocatedTemplate(data);
      setSubjectAllocation(data.subjectAllocation || {});

      // Fetch subject assignments — match by prefix (may have section suffix like _Sec-A)
      const allAssignSnap = await getDocs(collection(db, 'subject_assignments'));
      const subjects = [];
      const fMap = {};

      // Filter docs whose ID starts with compositeKey (exact or with section suffix)
      const matchingDocs = allAssignSnap.docs.filter(d => d.id === compositeKey || d.id.startsWith(compositeKey + '_'));

      // Merge all matching docs (e.g. multiple sections)
      const mergedAssignmentData = {};
      matchingDocs.forEach(d => {
        const data = d.data();
        Object.entries(data).forEach(([uid, codes]) => {
          if (codes && Array.isArray(codes)) {
            if (!mergedAssignmentData[uid]) mergedAssignmentData[uid] = [];
            codes.forEach(c => {
              if (!mergedAssignmentData[uid].includes(c)) mergedAssignmentData[uid].push(c);
            });
          }
        });
      });

      const facultyUids = Object.keys(mergedAssignmentData);

      if (facultyUids.length > 0) {
        // Fetch faculty details
        const facultyPromises = facultyUids.map(async (uid) => {
          try {
            const userSnap = await getDoc(doc(db, 'users', uid));
            if (userSnap.exists()) {
              const userData = userSnap.data();
              fMap[uid] = {
                facultyName: userData.facultyName || userData.displayName || uid,
                facultyId: userData.facultyId || ''
              };
            }
          } catch (err) {
            console.error(`Error fetching faculty ${uid}:`, err);
          }
        });
        await Promise.all(facultyPromises);

        // Build subject list
        facultyUids.forEach(uid => {
          const subjectCodes = mergedAssignmentData[uid] || [];
          subjectCodes.forEach(code => {
            if (!code) return;
            subjects.push({
              code,
              name: courseNames[code] || code,
              facultyUid: uid,
              facultyName: fMap[uid]?.facultyName || uid,
              facultyId: fMap[uid]?.facultyId || ''
            });
          });
        });
      }

      setAllocatedSubjects(subjects);
      showToast(`Loaded: ${data.timetableName} (${subjects.length} subjects)`);
    } catch (err) {
      console.error(err);
      showToast("Error loading timetable.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectChange = (day, period, index, newCode) => {
    setSubjectAllocation(prev => {
      const updated = { ...prev }
      if (!updated[day]) updated[day] = {}
      const arr = [...toArray(updated[day][period])]
      if (newCode) {
        const existing = arr[index]
        const currentSpan = existing ? (existing.split('|')[1] || '1') : '1'
        arr[index] = `${newCode}|${currentSpan}`
      } else {
        arr.splice(index, 1)
      }
      if (arr.length === 0) {
        delete updated[day][period]
      } else {
        updated[day] = { ...updated[day], [period]: arr }
      }
      return updated
    })
  }

  const handleSpanChange = (day, period, index, newSpan) => {
    setSubjectAllocation(prev => {
      const updated = { ...prev }
      if (!updated[day]) updated[day] = {}
      const arr = [...toArray(updated[day][period])]
      if (arr[index]) {
        const code = arr[index].split('|')[0]
        arr[index] = `${code}|${newSpan}`
      }
      updated[day] = { ...updated[day], [period]: arr }
      return updated
    })
  }

  const handleAddSubject = (day, period) => {
    setSubjectAllocation(prev => {
      const updated = { ...prev }
      if (!updated[day]) updated[day] = {}
      const arr = [...toArray(updated[day][period])]
      arr.push('')
      updated[day] = { ...updated[day], [period]: arr }
      return updated
    })
  }

  const handleRemoveSubject = (day, period, index) => {
    setSubjectAllocation(prev => {
      const updated = { ...prev }
      if (!updated[day]) updated[day] = {}
      const arr = [...toArray(updated[day][period])]
      arr.splice(index, 1)
      if (arr.length === 0) {
        delete updated[day][period]
      } else {
        updated[day] = { ...updated[day], [period]: arr }
      }
      return updated
    })
  }

  const getCellSubjects = (day, period) => {
    const arr = toArray(subjectAllocation?.[day]?.[period])
    return arr.map(item => {
      const [code, span] = item.split('|')
      return { code, span: parseInt(span, 10) || 1 }
    }).filter(s => s.code)
  }

  const getSpanningEntries = (day, period) => {
    const entries = []
    for (let p = 1; p < period; p++) {
      const subjects = getCellSubjects(day, p)
      subjects.forEach(s => {
        if (p + s.span > period) entries.push(s)
      })
    }
    return entries
  }

  const isCellCovered = (day, period) => getSpanningEntries(day, period).length > 0

  const handleSave = async () => {
    if (!allocatedTemplate) return;
    setSaving(true);
    try {
      const progKey = formatProgrammeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const ayKey = sanitizeKey(academicYear);
      const semNum = String(semester).match(/\d+/)?.[0] || "1";
      const compositeKey = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}`;

      await setDoc(doc(db, 'timetable_allocations', compositeKey), {
        ...allocatedTemplate,
        subjectAllocation
      }, { merge: true });
      showToast("Timetable saved successfully!");
    } catch (err) {
      console.error(err);
      showToast("Error saving timetable.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Time Table Creation">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[1000] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      <div className="p-6 md:p-10 max-w-7xl mx-auto">

        {/* Selection Panel */}
        <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock size={16} className="text-emerald-500" />
            Select Allocation
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Programme</label>
              <div className="relative">
                <select value={programme} onChange={e => { setProgramme(e.target.value); setDepartment(""); setBatch(""); setAcademicYear(""); setSemester(""); setAllocatedTemplate(null); setSubjectAllocation({}); setAllocatedSubjects([]); }}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 pr-8 text-sm font-bold text-[#120c7a] outline-none cursor-pointer">
                  <option value="">Programme</option>
                  {userProgramme
                    ? <option key={userProgramme} value={userProgramme}>{formatProgDisplay(userProgramme)}</option>
                    : Object.keys(PROGRAMME_DEPARTMENTS).map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)
                  }
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
              <div className="relative">
                <select value={department} onChange={e => { setDepartment(e.target.value); setBatch(""); setAcademicYear(""); setSemester(""); setAllocatedTemplate(null); setSubjectAllocation({}); setAllocatedSubjects([]); }}
                  disabled={!programme}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 pr-8 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50 cursor-pointer">
                  <option value="">Department</option>
                  {userDepartment
                    ? <option key={userDepartment} value={userDepartment}>{userDepartment}</option>
                    : (programme && PROGRAMME_DEPARTMENTS[programme]?.map(d => <option key={d} value={d}>{d}</option>))
                  }
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Batch</label>
              <div className="relative">
                <select value={batch} onChange={e => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); setAllocatedTemplate(null); setSubjectAllocation({}); setAllocatedSubjects([]); }}
                  disabled={!department}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 pr-8 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50 cursor-pointer">
                  <option value="">Batch</option>
                  {batchesList.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Academic Year</label>
              <div className="relative">
                <select value={academicYear} onChange={e => { setAcademicYear(e.target.value); setSemester(""); setAllocatedTemplate(null); setSubjectAllocation({}); setAllocatedSubjects([]); }}
                  disabled={!batch}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 pr-8 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50 cursor-pointer">
                  <option value="">A.Y.</option>
                  {ayOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Semester</label>
              <div className="relative">
                <select value={semester} onChange={e => { setSemester(e.target.value); setAllocatedTemplate(null); setSubjectAllocation({}); setAllocatedSubjects([]); }}
                  disabled={!academicYear}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 pr-8 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50 cursor-pointer">
                  <option value="">Semester</option>
                  {semOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={handleLoad} disabled={loading || !programme || !department || !batch || !academicYear || !semester}
                className="w-full flex items-center justify-center gap-2 bg-[#120c7a] hover:bg-[#0e0960] disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                {loading ? "Loading..." : "Load"}
              </button>
            </div>
          </div>
        </div>

        {/* Timetable Matrix */}
        {allocatedTemplate && (
          <div className="space-y-6">
            {/* Info Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Template</p>
                <p className="text-base font-black text-[#120c7a] mt-1">{allocatedTemplate.timetableName}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Days</p>
                <p className="text-base font-black text-[#120c7a] mt-1">{allocatedTemplate.workingDays}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Periods/Day</p>
                <p className="text-base font-black text-[#120c7a] mt-1">{allocatedTemplate.periodsPerDay}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Allocated Subjects</p>
                <p className="text-base font-black text-[#120c7a] mt-1">{allocatedSubjects.length}</p>
              </div>
            </div>

            {/* Allocated Subjects Legend */}
            {allocatedSubjects.length > 0 && (
              <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 overflow-hidden">
                <div className="bg-emerald-600 px-6 py-3 flex items-center gap-2">
                  <BookOpen size={16} className="text-white" />
                  <h4 className="text-white font-bold text-sm">Allocated Subjects ({allocatedSubjects.length})</h4>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {allocatedSubjects.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-black text-xs shrink-0">
                          {s.code?.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-blue-800 truncate">{s.code} - {s.name}</p>
                          <p className="text-[9px] text-blue-500 flex items-center gap-1">
                            <User size={10} />
                            {s.facultyName} {s.facultyId ? `(${s.facultyId})` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Matrix Grid */}
            <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 overflow-hidden">
              <div className="bg-[#120c7a] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-white" />
                  <h3 className="text-white font-bold text-base">Weekly Schedule Matrix</h3>
                </div>
                <span className="text-[9px] font-bold text-white/80 bg-white/15 px-2.5 py-1 rounded-full">
                  {workingDaysCount} days &times; {periodsPerDay} periods
                </span>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 border-b border-slate-200">Day</th>
                      {Array.from({ length: periodsPerDay }).map((_, i) => (
                        <th key={i} className="px-2 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                          <div className="text-sm">P{i + 1}</div>
                          {periodTimings[i] && <div className="text-[8px] font-normal text-slate-400 mt-0.5 hidden lg:block">{periodTimings[i]}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: workingDaysCount }).map((_, dayIdx) => (
                      <tr key={dayIdx} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-3 py-2 text-sm font-bold text-slate-600 border-r border-slate-100">
                          {DAYS[dayIdx] || `Day ${dayIdx + 1}`}
                        </td>
                        {Array.from({ length: periodsPerDay }).map((_, periodIdx) => {
                          const pNum = periodIdx + 1;
                          const covered = isCellCovered(DAYS[dayIdx], pNum);

                          // Use allocated subjects from subject_assignments, fallback to template subjects
                          const dropdownSubjects = allocatedSubjects.length > 0
                            ? allocatedSubjects
                            : (allocatedTemplate.subjects || []).map(s => ({
                                code: s.code || s.acronym || '',
                                name: s.name || s.code || '',
                                facultyName: s.faculty || '—',
                                facultyId: s.faculty_acronym || ''
                              }));
                          const seenCodes = new Set();
                          const uniqueSubjects = dropdownSubjects.filter(s => {
                            if (seenCodes.has(s.code)) return false;
                            seenCodes.add(s.code);
                            return true;
                          });

                          return (
                              <td key={periodIdx} className="px-2 py-1.5 text-center border-r border-slate-50">
                              {covered ? (
                                <div className="h-full min-h-[50px] bg-blue-50 rounded-lg border border-blue-200 p-1.5 flex flex-col gap-0.5 items-center justify-center">
                                  {getSpanningEntries(DAYS[dayIdx], pNum).map((s, si) => (
                                    <span key={si} className="text-[11px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-100">
                                      {s.code}
                                    </span>
                                  ))}
                                  <span className="text-[7px] text-blue-400">spanned</span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1 min-w-[120px]">
                                  {(() => {
                                    const rawEntries = toArray(subjectAllocation?.[DAYS[dayIdx]]?.[pNum])
                                    if (rawEntries.length === 0) {
                                      return (
                                        <>
                                          <select value="" onChange={e => handleSubjectChange(DAYS[dayIdx], pNum, 0, e.target.value)}
                                            className="w-full text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                          >
                                            <option value="">— Free —</option>
                                    {uniqueSubjects.map((s, si) => (
                                      <option key={si} value={s.code}>
                                        {s.code} - {s.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button onClick={() => handleAddSubject(DAYS[dayIdx], pNum)}
                                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded px-1.5 py-0.5 transition-colors">
                                    + Add
                                  </button>
                                        </>
                                      )
                                    }
                                    return (
                                      <>
                                        {rawEntries.map((entry, si) => {
                                          const parts = entry ? entry.split('|') : []
                                          const entryCode = parts[0] || ''
                                          const entrySpan = parseInt(parts[1], 10) || 1
                                          return (
                                            <div key={si} className="flex items-center gap-1">
                                              <select value={entryCode} onChange={e => handleSubjectChange(DAYS[dayIdx], pNum, si, e.target.value)}
                                                className="flex-1 text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-0"
                                              >
                                                <option value="">— Free —</option>
                                              {uniqueSubjects.map((s, si) => (
                                                <option key={si} value={s.code}>
                                                  {s.code}
                                                </option>
                                              ))}
                                            </select>
                                            {entryCode && (
                                              <>
                                                <select value={entrySpan} onChange={e => handleSpanChange(DAYS[dayIdx], pNum, si, parseInt(e.target.value, 10))}
                                                  className="w-14 text-[10px] font-bold bg-blue-50 border border-blue-200 rounded-lg px-1.5 py-2 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                                >
                                                  {[1, 2, 3].map(sp => (
                                                    <option key={sp} value={sp} disabled={pNum + sp - 1 > periodsPerDay}>
                                                      {sp}
                                                    </option>
                                                  ))}
                                                </select>
                                                <button onClick={() => handleRemoveSubject(DAYS[dayIdx], pNum, si)}
                                                  className="shrink-0 w-5 h-5 flex items-center justify-center text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                >
                                                  ×
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          )
                                        })}
                                        <button onClick={() => handleAddSubject(DAYS[dayIdx], pNum)}
                                          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded px-1.5 py-0.5 transition-colors">
                                          + Add
                                        </button>
                                      </>
                                    )
                                  })()}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-900/20">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Saving..." : "Save Timetable"}
              </button>
            </div>
          </div>
        )}

        {!allocatedTemplate && !loading && (
          <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 p-16 text-center">
            <Calendar size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-black text-slate-400 mb-1">No Timetable Loaded</h3>
            <p className="text-sm text-slate-400">Select programme, department, batch, academic year and semester, then click Load.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
