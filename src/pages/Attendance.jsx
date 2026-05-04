import { useState, useEffect, useMemo, useCallback } from "react";
import { rtdb, auth } from "../firebase";
import { ref, onValue, get, set } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { 
  CalendarCheck2, 
  ChevronDown, 
  Search, 
  Download,
  Users,
  AlertCircle,
  FileX,
  Save
} from "lucide-react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { useSemesterType } from "../hooks/useSemesterType";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay, sanitizeKey } from "../lib/utils";

// Helper functions (adapted from TimetableSetup.jsx)
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

export default function Attendance() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  const semesterType = useSemesterType();

  const [currentUid, setCurrentUid] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Filter States
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [subjectContexts, setSubjectContexts] = useState([]); // Stores mapping contexts for subjects

  const [semesters, setSemesters] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState("");
  const [totalConducted, setTotalConducted] = useState("");

  const [timetableConfig, setTimetableConfig] = useState(null);
  const [availablePeriodsWithTiming, setAvailablePeriodsWithTiming] = useState([]);

  // Get current user identity
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUid(user.uid);
        const snap = await get(ref(rtdb, `users/${user.uid}`));
        if (snap.exists()) setUserRole(snap.val().role);
      }
    });
    return unsub;
  }, []);

  // Data States
  const [attendanceData, setAttendanceData] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const batches = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    const suffix = (s[(v - 20) % 10] || s[v] || s[0]);
    return n + suffix;
  };

  const aYears = useMemo(() => batch ? getAcademicYears(batch) : [], [batch]);

  useEffect(() => {
    if (batch && academicYear) {
      const years = getAcademicYears(batch);
      const index = years.indexOf(academicYear);
      if (index >= 0) {
        const sem1 = (index * 2) + 1;
        const sem2 = (index * 2) + 2;
        const allSems = [sem1, sem2];
        const filteredSems = allSems.filter(num => {
          if (semesterType === "Odd") return num % 2 !== 0;
          return num % 2 === 0;
        });
        setSemesters(filteredSems.map(num => `${getOrdinal(num)} Semester`));
      } else setSemesters([]);
    } else setSemesters([]);
  }, [batch, academicYear, semesterType]);

  // New Logic: Fetch subjects based on Programme and Department assignments
  useEffect(() => {
    if (!programme || !department || !currentUid || !userRole) return;

    const progKey = formatProgrammeKey(programme);
    const deptKey = sanitizeKey(department);
    const assignmentsRef = ref(rtdb, `subject_assignments/${progKey}/${deptKey}`);

    const unsubscribe = onValue(assignmentsRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const contexts = [];
      const batchesToFetchSyllabus = new Set();

      Object.entries(data).forEach(([b, ays]) => {
        Object.entries(ays).forEach(([ay, sems]) => {
          Object.entries(sems).forEach(([sem, uids]) => {
            Object.entries(uids).forEach(([uid, codes]) => {
              if (userRole === 'Faculty' && uid !== currentUid) return;
              if (Array.isArray(codes)) {
                codes.forEach(code => {
                  contexts.push({ code, batch: b, ay, sem, uid });
                  batchesToFetchSyllabus.add(b);
                });
              }
            });
          });
        });
      });

      const namesMap = {};
      for (const b of Array.from(batchesToFetchSyllabus)) {
        const reg = getRegulationForBatch(progKey, b);
        // Fetch syllabus for all regulations associated with the batches found.
        // This is a simplification; ideally, we'd fetch syllabus per batch-regulation pair.
        // For now, assuming one regulation per batch for simplicity here, or fetching all.
        if (reg) {
          const syllabusKey = `${progKey}_${deptKey}_${sanitizeKey(reg)}`;
          const syllabusSnap = await get(ref(rtdb, `syllabus_data/${syllabusKey}`));
          if (syllabusSnap.exists()) {
            const syllabus = syllabusSnap.val();
            Object.values(syllabus.semesters || {}).forEach(semList => {
              if (Array.isArray(semList)) {
                semList.forEach(s => { if (s && s.code) namesMap[s.code] = s.name; });
              }
            });
          }
        }
      }

      setSubjectContexts(contexts);
      
      // Instead of just unique subject codes, we need unique subject assignments (code + batch + ay + sem)
      const uniqueSubjectAssignments = [];
      const seenAssignments = new Set(); // To track unique combinations of code, batch, ay, sem

      contexts.forEach(ctx => {
        const assignmentIdentifier = `${ctx.code}-${ctx.batch}-${ctx.ay}-${ctx.sem}`;
        if (!seenAssignments.has(assignmentIdentifier)) {
          uniqueSubjectAssignments.push({
            value: JSON.stringify({ code: ctx.code, batch: ctx.batch, ay: ctx.ay, sem: ctx.sem }),
            text: `${ctx.code} - ${namesMap[ctx.code] || ""}` // Removed batch, sem, ay from display text
          });
          seenAssignments.add(assignmentIdentifier);
        }
      });
      setSubjects(uniqueSubjectAssignments);
    });

    return () => unsubscribe();
  }, [programme, department, currentUid, userRole, getRegulationForBatch, getOrdinal, formatBatchDisplay]);

  const handleSubjectChange = (val) => {
    if (!val) {
      setSubject("");
      setBatch("");
      setAcademicYear("");
      setSemester("");
      return;
    }
    setSubject(val); // Set subject state to the full stringified value
    const selectedCtx = JSON.parse(val); // Parse the stringified context for other states
    setBatch(selectedCtx.batch);
    setAcademicYear(selectedCtx.ay);
    setSemester(`${getOrdinal(parseInt(selectedCtx.sem))} Semester`);
  };

  const computePeriodStart = useCallback((i, config) => {
    if (!config || !config.startTime) return null;
    const start = parseTimeToDate(config.startTime);
    if (!start) return null;
    const t = new Date(start);
    for (let j = 1; j < i; j++) {
      const pd = parseInt(config.periodDurations[j] || 0, 10) || 0;
      t.setMinutes(t.getMinutes() + pd);
      (config.breaks || []).forEach(br => {
        const after = parseInt(br.after || 0, 10) || 0;
        const dur = parseInt(br.duration || 0, 10) || 0;
        if (after === j) t.setMinutes(t.getMinutes() + dur);
      });
      if (parseInt(config.lunchAfterPeriod || 0, 10) === j) t.setMinutes(t.getMinutes() + (parseInt(config.lunchDuration || 0, 10) || 0));
    }
    return t;
  }, []);

  useEffect(() => {
    const fetchTimetableConfig = async () => {
      if (!programme || !batch) {
        setTimetableConfig(null);
        setAvailablePeriodsWithTiming([]);
        return;
      }

      const progKey = formatProgrammeKey(programme);
      const allocatedPath = `timetables/${progKey}/${sanitizeKey(batch)}/data`;

      try {
        const allocatedSnap = await get(ref(rtdb, allocatedPath));
        if (allocatedSnap.exists()) {
          const allocatedData = allocatedSnap.val();
          const templateName = allocatedData.timetableName;
          if (templateName) {
            const templatePath = `timetable_templates/${sanitizeKey(templateName)}`;
            const templateSnap = await get(ref(rtdb, templatePath));
            if (templateSnap.exists()) {
              const templateConfig = templateSnap.val();
              setTimetableConfig(templateConfig);

              const periods = [];
              const periodsPerDay = parseInt(templateConfig.periodsPerDay, 10) || 0;
              for (let i = 1; i <= periodsPerDay; i++) {
                const start = computePeriodStart(i, templateConfig);
                const dur = parseInt(templateConfig.periodDurations[i] || 0, 10) || 0;
                if (start && dur > 0) {
                  const end = new Date(start);
                  end.setMinutes(end.getMinutes() + dur);
                  periods.push({
                    value: String(i),
                    label: `Period ${i} (${formatTime(start)} - ${formatTime(end)})`
                  });
                } else {
                  periods.push({
                    value: String(i),
                    label: `Period ${i} (Duration not set)`
                  });
                }
              }
              setAvailablePeriodsWithTiming(periods);
            } else {
              setTimetableConfig(null);
              setAvailablePeriodsWithTiming([]);
              console.warn(`Timetable template '${templateName}' not found.`);
            }
          } else {
            setTimetableConfig(null);
            setAvailablePeriodsWithTiming([]);
            console.warn(`No timetable allocated for ${programme} / ${batch}.`);
          }
        } else {
          setTimetableConfig(null);
          setAvailablePeriodsWithTiming([]);
          console.warn(`No timetable allocated for ${programme} / ${batch}.`);
        }
      } catch (err) {
        console.error("Error fetching timetable config:", err);
        setTimetableConfig(null);
        setAvailablePeriodsWithTiming([]);
      }
    };
    fetchTimetableConfig();
  }, [programme, batch, computePeriodStart]);

  // Fetch Attendance Records & Students
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) {
      setAttendanceData(null);
      setStudents([]);
      return;
    }

    setLoading(true);
    const selectedSubjectObj = JSON.parse(subject); // Parse the subject state to get the code
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const attendancePath = `attendance/${progKey}/${sanitizeKey(department)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semNum}/${subject}`;
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
    const studentListPath = `students/${compositeKey}`;
    
    const fetchData = async () => {
      try {
        const [attendanceSnap, studentSnap] = await Promise.all([
          get(ref(rtdb, attendancePath)),
          get(ref(rtdb, studentListPath))
        ]);

        const attData = attendanceSnap.val();
        const masterList = studentSnap.val() || {};
        setAttendanceData(attData);
        const tHours = attData?._meta?.totalHours || "1"; // Default to "1"
        setTotalConducted(tHours);
        if (attData?._meta?.date) setAttendanceDate(attData._meta.date);
        if (attData?._meta?.period) setPeriod(attData._meta.period);
        
        const studentArray = Object.entries(masterList)
          .filter(([key]) => !key.startsWith('_'))
          .map(([reg, name]) => { // Default to Present if no existing record
            const hours = attData?.students?.[reg] !== undefined ? attData.students[reg] : (parseInt(tHours, 10) || 1);
            const totalHours = parseInt(tHours, 10) || 1;
            return {
              reg,
              name,
              hours,
              status: attData?.students?.[reg] !== undefined ? (hours > 0 ? 'P' : 'A') : 'P', // Default to 'P'
              percentage: totalHours > 0 ? ((hours / totalHours) * 100).toFixed(2) : "0.00"
            };
          });

        // Sort by order or reg no
        const order = masterList._order;
        if (order) studentArray.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
        else studentArray.sort((a, b) => a.reg.localeCompare(b.reg));

        setStudents(studentArray);
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    fetchData();
  }, [programme, department, batch, academicYear, semester, subject]);

  const handleStatusChange = (reg, status) => {
    const total = parseInt(totalConducted, 10) || 0;
    let val = 0;
    if (status === 'P' || status === 'OD') {
      val = total;
    }

    setStudents(prev => prev.map(s => {
      if (s.reg === reg) {
        return {
          ...s,
          status: status,
          hours: val,
          percentage: total > 0 ? ((val / total) * 100).toFixed(2) : "0.00"
        };
      }
      return s;
    }));
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.reg.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveAttendance = async () => {
    if (!programme || !department || !batch || !subject || !totalConducted || !attendanceDate) {
      alert("Please ensure all filters and Total Conducted hours are provided.");
      return;
    }
    setSaving(true);
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject); // Parse the subject state to get the code
    const path = `attendance/${progKey}/${sanitizeKey(department)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semNum}/${selectedSubjectObj.code}`;
    
    const studentsMap = {};
    students.forEach(s => { studentsMap[s.reg] = s.hours; });

    try {
      await set(ref(rtdb, path), {
        _meta: { totalHours: parseInt(totalConducted), date: attendanceDate, period, updatedBy: "Manual", updatedAt: new Date().toISOString() },
        students: studentsMap
      });
      alert("Attendance records saved successfully!");
      
      // Increment totalConducted and date for the next entry
      setTotalConducted(prev => String(parseInt(prev, 10) + 1));
      const nextDay = new Date(attendanceDate);
      nextDay.setDate(nextDay.getDate() + 1);
      setAttendanceDate(nextDay.toISOString().split('T')[0]);
      setPeriod(""); // Reset period
    } catch (err) { console.error(err); alert("Failed to save records."); }
    setSaving(false);
  };

  const handleExport = () => {
    if (!students.length) return;
    const ws = XLSX.utils.json_to_sheet(students);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${subject}_${batch}.xlsx`);
  };

  return (
    <Layout title="Attendance Records">
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        
        {/* Modern Filter Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Programme</label>
              <select value={programme} onChange={e => { setProgramme(e.target.value); setDepartment(""); setSubject(""); }} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium">
                <option value="">Select</option>
                {Object.keys(PROGRAMME_DEPARTMENTS).map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
              <select value={department} onChange={e => { setDepartment(e.target.value); setSubject(""); }} disabled={!programme} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50">
                <option value="">Select</option>
                {programme && PROGRAMME_DEPARTMENTS[programme].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject</label>
              <select value={subject} onChange={e => handleSubjectChange(e.target.value)} disabled={!department} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50 text-[#120c7a] font-bold">
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.value} value={s.value}>{s.text}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
              <select value={batch} onChange={e => setBatch(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed" disabled>
                <option value="">Select</option>
                {batches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
              <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed" disabled>
                <option value="">Select</option>
                {aYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed" disabled>
                <option value="">Select</option>
                {semesters.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Date and Total Selection Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-100">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest ml-1">Date</label>
              <input 
                type="date"
                readOnly // Make date read-only
                value={attendanceDate} 
                onChange={e => setAttendanceDate(e.target.value)} 
                onClick={(e) => e.target.showPicker?.()}
                className="w-full bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a] cursor-pointer" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest ml-1">Period</label>
              <div className="relative">
                <select 
                  value={period} 
                  onChange={e => setPeriod(e.target.value)} 
                  className="w-full appearance-none bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!timetableConfig}
                >
                  <option value="">{timetableConfig ? "Select Period" : "No timetable allocated"}</option>
                  {availablePeriodsWithTiming.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest ml-1">Total Mark Attendance (Classes)</label>
              <input 
                type="number" 
                readOnly
                placeholder="e.g. 60" 
                value={totalConducted} 
                className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-2 outline-none transition-all font-black text-emerald-700 cursor-not-allowed" 
              />
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-8 py-6 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl text-white">
                <CalendarCheck2 size={24} />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl leading-tight">Student Attendance</h2>
                {totalConducted && (
                  <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Marking base: {totalConducted} Sessions {period ? `(Period ${period})` : ""}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 group-focus-within:text-[#120c7a] transition-colors" size={16} />
                <input 
                  type="text" 
                  placeholder="Search students..." 
                  className="bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/50 focus:bg-white focus:!text-[#120c7a] focus:placeholder:text-zinc-400 transition-all outline-none shadow-inner"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={handleSaveAttendance} 
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={18} />}
                Save Records
              </button>
              <button onClick={handleExport} className="p-2.5 bg-white text-[#120c7a] rounded-xl hover:bg-blue-50 transition-all shadow-lg">
                <Download size={20} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-20 text-center"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : !students.length ? (
              <div className="py-20 text-center flex flex-col items-center gap-4">
                <FileX size={48} className="text-slate-200" />
                <p className="text-slate-400 font-medium italic">No attendance records found for this selection.</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Register Number</th>
                    <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                    <th className="px-4 py-4 text-center text-[11px] font-black text-emerald-500 uppercase tracking-widest">P</th>
                    <th className="px-4 py-4 text-center text-[11px] font-black text-rose-500 uppercase tracking-widest">A</th>
                    <th className="px-4 py-4 text-center text-[11px] font-black text-blue-500 uppercase tracking-widest">OD</th>
                    <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Classes Attended</th>
                    <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s) => (
                    <tr key={s.reg} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-8 py-4 text-sm font-bold text-slate-600 font-mono">{s.reg}</td>
                      <td className="px-8 py-4 text-sm font-bold text-slate-800">{s.name}</td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="radio" 
                          name={`status-${s.reg}`} 
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          checked={s.status === 'P'}
                          onChange={() => handleStatusChange(s.reg, 'P')}
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="radio" 
                          name={`status-${s.reg}`} 
                          className="w-4 h-4 accent-rose-500 cursor-pointer"
                          checked={s.status === 'A'}
                          onChange={() => handleStatusChange(s.reg, 'A')}
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="radio" 
                          name={`status-${s.reg}`} 
                          className="w-4 h-4 accent-blue-500 cursor-pointer"
                          checked={s.status === 'OD'}
                          onChange={() => handleStatusChange(s.reg, 'OD')}
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="number"
                          readOnly
                          value={s.hours}
                          className="w-20 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-slate-400 outline-none cursor-not-allowed"
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                            <div 
                              className={`h-full transition-all duration-1000 ${parseFloat(s.percentage) < 75 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${s.percentage}%` }}
                            />
                          </div>
                          <span className={`text-sm font-black min-w-[50px] ${parseFloat(s.percentage) < 75 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {s.percentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}