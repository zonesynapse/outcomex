import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc, getDocs, collection, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useLocation } from "react-router-dom";
import {
  Calendar, Clock, AlertCircle, Loader2, BookOpen, Coffee, UtensilsCrossed,
  ShieldCheck, CheckCircle2, FileText, Filter, Sparkles, Check
} from "lucide-react";
import { getAcademicYears, formatBatchDisplay, formatProgrammeKey, sanitizeKey } from "../../lib/utils";

const normKey = (key) => {
  if (!key) return '';
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function to12h(timeStr) {
  if (!timeStr) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDeptDisplay(dept) {
  if (!dept) return '';
  const parts = dept.split(' ');
  if (parts.length > 0) parts[0] = parts[0].replace(/_/g, '.');
  return parts.join(' ');
}

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return new Date(1970, 0, 1, h, m, 0);
}

function formatDateDisplay(value) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

export default function Timetable() {
  const location = useLocation();
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timetable, setTimetable] = useState(null);

  // Tab View Switcher: "class" | "ia"
  const [activeTab, setActiveTab] = useState("class");

  // Approved IA Exam Timetable state
  const [iaSchedules, setIaSchedules] = useState([]);
  const [iaExamFilter, setIaExamFilter] = useState("ALL");

  // Resolve the student's current Academic Year + Semester from their batch (shares class timetable logic)
  const currentContext = useMemo(() => {
    if (!studentData?.batch) return { academicYear: "", semester: "" };
    const years = getAcademicYears(studentData.batch);
    if (years.length === 0) return { academicYear: "", semester: "" };
    const currentYear = new Date().getFullYear();
    const month = new Date().getMonth();
    const isOddSem = month >= 6;
    const activeAy = years.find((y) => {
      const [start] = y.split('-').map(Number);
      if (isOddSem) return start === currentYear;
      return start + 1 === currentYear;
    }) || years[0];
    const ayIndex = years.indexOf(activeAy);
    const semNum = String(ayIndex * 2 + (isOddSem ? 1 : 2));
    return { academicYear: activeAy, semester: semNum };
  }, [studentData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (tabParam === "ia") {
      setActiveTab("ia");
    }
  }, [location]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setStudentData(snap.data());
          document.title = "Student Portal - Timetable";
        }
      } catch (err) { console.error(err); }
    });
    return () => unsub();
  }, []);

  // 1. Fetch regular class timetable
  useEffect(() => {
    if (!studentData) return;
    const { programme, department, batch } = studentData;
    if (!batch) { setLoading(false); return; }

    const fetchTimetable = async () => {
      try {
        const batchNorm = normKey(batch);
        const progKey = formatProgrammeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);
        const legacyDeptKey = (department||'').replace(/[.#$[\]/ ]/g, '_');
        const legacyBatchKey = (batch||'').replace(/[.#$[\]/ ]/g, '_');
        const years = getAcademicYears(batch);

        const currentYear = new Date().getFullYear();
        const month = new Date().getMonth();
        const isOddSem = month >= 6;

        let foundTimetable = null;

        // Try exact composite key lookup if we have all fields
        if (programme && department && years.length > 0) {
          const activeAy = years.find((y) => {
            const [start] = y.split('-').map(Number);
            if (month >= 6) return start === currentYear;
            return start + 1 === currentYear;
          }) || years[0];
          const ayKey = sanitizeKey(activeAy);
          const ayIndex = years.indexOf(activeAy);
          const semNum = String(ayIndex * 2 + (isOddSem ? 1 : 2));
          const otherSem = String(ayIndex * 2 + (isOddSem ? 2 : 1));

          // Build ALL dept format variants: sanitized, legacy, raw (for students whose
          // users doc has department stored as display format vs key format)
          const deptVariants = [deptKey, legacyDeptKey];
          // Also try raw department value as-is (e.g. "CSE" or "Computer_Science_and_Engineering")
          if (department && !deptVariants.includes(sanitizeKey(department))) {
            deptVariants.push(sanitizeKey(department));
          }

          const keys = [];
          for (const dv of deptVariants) {
            for (const bv of [batchKey, legacyBatchKey]) {
              for (const sem of [semNum, otherSem]) {
                keys.push(`${progKey}_${dv}_${bv}_${ayKey}_${sem}`);
              }
            }
          }
          for (const k of keys) {
            if (foundTimetable) break;
            try {
              const snap = await getDoc(doc(db, "timetable_allocations", k));
              if (snap.exists()) {
                const data = snap.data();
                // Prefer docs with subjectAllocation (actual subject assignments)
                if (!foundTimetable || (data.subjectAllocation && Object.keys(data.subjectAllocation).length > 0)) {
                  foundTimetable = data;
                }
              }
            } catch {}
          }
        }

        // Broad fallback: scan timetable_allocations for matching batch
        if (!foundTimetable) {
          const allSnap = await getDocs(collection(db, "timetable_allocations"));
          const candidates = [];
          allSnap.forEach((d) => {
            const data = d.data();
            const docBatch = normKey(data.batch || "");
            const docBatchId = normKey(d.id);
            if (!docBatch.includes(batchNorm) && !docBatchId.includes(batchNorm)) return;
            candidates.push({ id: d.id, data });
          });
          if (candidates.length === 1) {
            foundTimetable = candidates[0].data;
          } else if (candidates.length > 1) {
            const progNorm = normKey(programme || "");
            const deptNorm = normKey(department || "");
            // Score each candidate: prefer programme/dept match + has subjectAllocation
            const scored = candidates.map((c) => {
              const cProg = normKey(c.data.progKey || c.data.programme || "");
              const cDept = normKey(c.data.deptKey || c.data.department || "");
              const cId = c.id;
              const progOk = progNorm && (cProg.includes(progNorm) || progNorm.includes(cProg));
              const deptOk = deptNorm && (cDept.includes(deptNorm) || deptNorm.includes(cDept));
              const hasSubjects = c.data.subjectAllocation && Object.keys(c.data.subjectAllocation).length > 0;
              let score = 0;
              if (progOk) score += 10;
              if (deptOk) score += 10;
              if (hasSubjects) score += 50; // Strongly prefer docs with actual subject data
              // Also check if dept appears in doc ID
              if (deptNorm && cId.includes(deptNorm)) score += 5;
              return { ...c, score };
            });
            scored.sort((a, b) => b.score - a.score);
            foundTimetable = scored[0].data;
          }
        }

        if (foundTimetable) {
          const saKeys = Object.keys(foundTimetable.subjectAllocation || {});
          const saCount = saKeys.reduce((sum, day) => {
            const periods = foundTimetable.subjectAllocation[day] || {};
            return sum + Object.keys(periods).length;
          }, 0);
          console.log("[StudentTimetable] Found timetable:", foundTimetable.timetableName, "| subjectAllocation days:", saKeys.length, "| total period entries:", saCount);
          if (saCount === 0) console.warn("[StudentTimetable] subjectAllocation is EMPTY — the doc has no subject data. Teacher may not have saved subjects yet.");
        } else {
          console.log("[StudentTimetable] No timetable doc found for batch:", batch);
        }

        setTimetable(foundTimetable);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchTimetable();
  }, [studentData]);

  // 2. Real-time fetch for Principal Approved IA Schedules matching student batch
  useEffect(() => {
    if (!studentData?.batch) return;
    const studentBatch = String(studentData.batch).trim();
    const sanitizedStudentBatch = sanitizeKey(studentBatch);
    const studentProg = studentData.programme ? String(studentData.programme) : "";
    const studentDept = studentData.department ? String(studentData.department) : "";
    const studentProgNorm = studentProg ? normKey(studentProg) : "";
    const studentAyNorm = currentContext.academicYear ? normKey(currentContext.academicYear) : "";
    const studentDeptNorm = studentDept ? normKey(studentDept) : "";
    const studentSemNorm = currentContext.semester ? normKey(currentContext.semester) : "";

    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      const items = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d || !d.assignments) return;

        const docBatch = String(d.batch || "").trim();
        const docBatchSanitized = sanitizeKey(docBatch);

        // Check if doc matches student batch
        if (
          docBatch === studentBatch ||
          docBatchSanitized === sanitizedStudentBatch ||
          docSnap.id.startsWith(sanitizedStudentBatch) ||
          docSnap.id.includes(sanitizedStudentBatch)
        ) {
          const docAy = String(d.academicYear || "").trim();
          const docAyNorm = docAy ? normKey(docAy) : "";
          // Restrict to the student's own academic year (skip docs for other years)
          if (studentAyNorm && docAyNorm && docAyNorm !== studentAyNorm) return;

          const docSem = String(d.semester || "").trim();
          const docSemNorm = docSem ? normKey(docSem) : "";
          // Restrict to the student's current semester (skip docs for other semesters)
          if (studentSemNorm && docSemNorm && docSemNorm !== studentSemNorm) return;

          Object.values(d.assignments).forEach((as) => {
            if (!as || !as.examDate) return;
            // CRITICAL CHECK: ONLY DISPLAY SCHEDULES APPROVED BY PRINCIPAL!
            if (as.approved === true || as.principalApprovedBy || d.principalApproved === true || d.status === "Approved") {
              // Restrict to entries that belong to the student's own department
              const asDepts = Array.isArray(as.departments) && as.departments.length > 0 ? as.departments : null;
              if (asDepts && studentDeptNorm) {
                const deptMatch = asDepts.some((dd) => {
                  const ddDept = normKey(dd?.dept || dd?.deptKey || dd?.department || "");
                  const ddProg = normKey(dd?.progKey || dd?.programmeKey || dd?.prog || "");
                  const deptOk = ddDept === studentDeptNorm || ddDept.includes(studentDeptNorm) || studentDeptNorm.includes(ddDept);
                  const progOk = !studentProgNorm || !ddProg || ddProg === studentProgNorm || ddProg.includes(studentProgNorm) || studentProgNorm.includes(ddProg);
                  return deptOk && progOk;
                });
                if (!deptMatch) return;
              }
              items.push({
                docId: docSnap.id,
                batch: d.batch || studentBatch,
                academicYear: d.academicYear || "",
                semester: d.semester || "",
                examName: d.examName || "Internal Assessment",
                code: as.code || "",
                name: as.name || "",
                examDate: as.examDate,
                submissionWindow: as.submissionWindow || (as.fromDate && as.toDate ? `${as.fromDate} to ${as.toDate}` : ""),
                numSets: as.numSets || 1,
                approved: true,
                principalApprovedAt: as.principalApprovedAt || d.updatedAt || "",
              });
            }
          });
        }
      });

      // Sort chronologically by exam date, then subject code
      items.sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)) || a.code.localeCompare(b.code));
      setIaSchedules(items);
    }, (err) => {
      console.error("[StudentTimetable] Error reading approved IA schedules:", err);
      setIaSchedules([]);
    });

    return () => unsub();
  }, [studentData, currentContext]);

  const periodTimings = useMemo(() => {
    if (!timetable) return [];
    const periodsPerDay = parseInt(timetable.periodsPerDay, 10) || 0;
    const timings = [];
    for (let i = 1; i <= periodsPerDay; i++) {
      const start = parseTimeToDate(timetable.startTime);
      if (!start) { timings.push(null); continue; }
      const t = new Date(start);
      for (let j = 1; j < i; j++) {
        const pd = parseInt(timetable.periodDurations?.[j] || 0, 10) || 0;
        t.setMinutes(t.getMinutes() + pd);
        (timetable.breaks || []).forEach((br) => {
          const after = parseInt(br.after || 0, 10) || 0;
          const dur = parseInt(br.duration || 0, 10) || 0;
          if (after === j) t.setMinutes(t.getMinutes() + dur);
        });
        if (parseInt(timetable.lunchAfterPeriod || 0, 10) === j) {
          t.setMinutes(t.getMinutes() + (parseInt(timetable.lunchDuration || 0, 10) || 0));
        }
      }
      const pd = parseInt(timetable.periodDurations?.[i] || 0, 10) || 0;
      if (pd > 0) {
        const end = new Date(t);
        end.setMinutes(end.getMinutes() + pd);
        timings.push(`${formatTime(t)} - ${formatTime(end)}`);
      } else {
        timings.push(`Period ${i}`);
      }
    }
    return timings;
  }, [timetable]);

  const workingDaysCount = timetable ? (parseInt(timetable.workingDays, 10) || 5) : 5;
  const periodsPerDay = timetable ? (parseInt(timetable.periodsPerDay, 10) || 0) : 0;
  const todayIndex = new Date().getDay() - 1;

  const slotSubjectMap = useMemo(() => {
    if (!timetable?.subjectAllocation) return { map: {}, covered: {} };
    const map = {};
    const covered = {};
    for (const [day, periods] of Object.entries(timetable.subjectAllocation)) {
      map[day] = {};
      covered[day] = {};
      for (const [periodStr, raw] of Object.entries(periods)) {
        const p = parseInt(periodStr, 10);
        const entries = !raw ? [] : Array.isArray(raw) ? raw : [raw];
        for (const entry of entries) {
          const parts = entry ? entry.split('|') : [];
          const code = parts[0] || '';
          const span = parseInt(parts[1], 10) || 1;
          if (!code) continue;
          map[day][p] = code;
          for (let s = 1; s < span; s++) {
            map[day][p + s] = code;
            covered[day][p + s] = true;
          }
        }
      }
    }
    return { map, covered };
  }, [timetable]);

  const slots = useMemo(() => {
    if (!timetable || !periodsPerDay) return [];
    const result = [];
    for (let i = 1; i <= periodsPerDay; i++) {
      result.push({ type: 'period', num: i });
      const br = (timetable.breaks || []).find(b => parseInt(b.after, 10) === i);
      if (br) result.push({ type: 'break', after: i, duration: parseInt(br.duration, 10) || 0 });
      if (parseInt(timetable.lunchAfterPeriod || 0, 10) === i) {
        result.push({ type: 'lunch', after: i, duration: parseInt(timetable.lunchDuration, 10) || 0 });
      }
    }
    return result;
  }, [timetable, periodsPerDay]);

  // Unique exam names for filter
  const uniqueIaExams = useMemo(() => {
    const set = new Set();
    iaSchedules.forEach(item => { if (item.examName) set.add(item.examName); });
    return Array.from(set);
  }, [iaSchedules]);

  const filteredIaSchedules = useMemo(() => {
    if (iaExamFilter === "ALL") return iaSchedules;
    return iaSchedules.filter(item => item.examName === iaExamFilter);
  }, [iaSchedules, iaExamFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-6">
      {/* Student Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-4">
        <p className="text-sm font-semibold text-slate-700">
          <span className="font-extrabold text-[#120c7a]">{studentData.studentName}</span>
          <span className="text-slate-300 mx-2">&middot;</span>
          {formatBatchDisplay(studentData.batch)}
          <span className="text-slate-300 mx-2">&middot;</span>
          {formatDeptDisplay(studentData.department)}
        </p>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Calendar size={14} className="text-blue-600" />
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* View Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("class")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === "class"
                ? "bg-[#120c7a] text-white shadow-md"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Clock size={16} /> Class Timetable
          </button>
          <button
            onClick={() => setActiveTab("ia")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === "ia"
                ? "bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Calendar size={16} /> IA Exam Timetable
            {iaSchedules.length > 0 && (
              <span className="ml-1 bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-black">
                {iaSchedules.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === "ia" && (
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Principal Approved & Finalized
            </span>
          </div>
        )}
      </div>

      {/* TAB 1: CLASS TIMETABLE */}
      {activeTab === "class" && (
        <>
          {!timetable ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl p-12 md:p-24 text-center border border-slate-200">
              <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-5">
                <Calendar size={40} className="text-slate-300" />
              </div>
              <p className="text-lg font-bold text-slate-400">No timetable allocated yet.</p>
              <p className="text-sm text-slate-300 mt-1">Your class timetable will appear here once assigned.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg p-5 text-white">
                  <BookOpen size={18} className="opacity-80 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Template</p>
                  <p className="text-xl font-black mt-0.5">{timetable.timetableName}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl shadow-lg p-5 text-white">
                  <Calendar size={18} className="opacity-80 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Working Days</p>
                  <p className="text-xl font-black mt-0.5">{timetable.workingDays}</p>
                </div>
                <div className="bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl shadow-lg p-5 text-white">
                  <Clock size={18} className="opacity-80 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Periods / Day</p>
                  <p className="text-xl font-black mt-0.5">{timetable.periodsPerDay}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl shadow-lg p-5 text-white">
                  <Calendar size={18} className="opacity-80 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Timing</p>
                  <p className="text-lg font-black mt-0.5">{to12h(timetable.startTime)} - {to12h(timetable.closeTime)}</p>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-200">
                <div className="bg-[#120c7a] px-4 md:px-8 py-3 flex items-center gap-3">
                  <Clock size={18} className="text-white" />
                  <h2 className="text-white font-bold text-base">Weekly Class Schedule</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Day</th>
                        {slots.map((slot, idx) => {
                          if (slot.type === 'period') {
                            const ti = periodTimings[slot.num - 1];
                            return (
                              <th key={idx} className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[100px]">
                                <div>P{slot.num}</div>
                                {ti && <div className="text-[8px] font-normal text-slate-400 mt-0.5">{ti}</div>}
                              </th>
                            );
                          } else if (slot.type === 'break') {
                            return (
                              <th key={idx} className="px-2 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[70px] bg-amber-50 border-x border-amber-200">
                                <div className="flex items-center justify-center gap-1 text-amber-700">
                                  <Coffee size={12} /> Break
                                </div>
                                <div className="text-[8px] font-normal text-amber-500 mt-0.5">{slot.duration} min</div>
                              </th>
                            );
                          } else {
                            return (
                              <th key={idx} className="px-2 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[70px] bg-green-50 border-x border-green-200">
                                <div className="flex items-center justify-center gap-1 text-green-700">
                                  <UtensilsCrossed size={12} /> Lunch
                                </div>
                                <div className="text-[8px] font-normal text-green-500 mt-0.5">{slot.duration} min</div>
                              </th>
                            );
                          }
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Array.from({ length: workingDaysCount }).map((_, dayIdx) => {
                        const day = DAYS[dayIdx] || `Day ${dayIdx + 1}`;
                        const isToday = todayIndex >= 0 && dayIdx === todayIndex;
                        return (
                          <tr key={dayIdx} className={`transition-colors ${isToday ? 'bg-blue-50/80 shadow-inner' : 'hover:bg-blue-50/30'}`}>
                            <td className={`px-4 py-4 text-sm font-bold ${isToday ? 'text-blue-700' : 'text-slate-600'}`}>
                              {day}{isToday && <span className="ml-1.5 text-[9px] font-bold text-blue-500 uppercase tracking-wider">Today</span>}
                            </td>
                            {slots.map((slot, idx) => {
                              if (slot.type === 'period') {
                                const code = slotSubjectMap.map[day]?.[slot.num];
                                const isCovered = slotSubjectMap.covered[day]?.[slot.num];
                                return (
                                  <td key={idx} className={`px-3 py-3 text-center border border-slate-50 ${isCovered ? 'bg-blue-50/40' : ''}`}>
                                    {code ? (
                                      <span className={`text-xs font-bold ${isCovered ? 'text-blue-400' : 'text-[#120c7a]'} bg-blue-50 px-3 py-1.5 rounded-lg inline-block`}>
                                        {code}{isCovered && <span className="ml-1 text-[8px] text-blue-300 font-normal">span</span>}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-300 italic">Free</span>
                                    )}
                                  </td>
                                );
                              } else if (slot.type === 'break') {
                                return (
                                  <td key={idx} className="px-2 py-3 text-center bg-amber-50/50 border-x border-amber-200">
                                    <div className="flex flex-col items-center gap-1">
                                      <Coffee size={16} className="text-amber-400" />
                                      <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Break</span>
                                    </div>
                                  </td>
                                );
                              } else {
                                return (
                                  <td key={idx} className="px-2 py-3 text-center bg-green-50/50 border-x border-green-200">
                                    <div className="flex flex-col items-center gap-1">
                                      <UtensilsCrossed size={16} className="text-green-400" />
                                      <span className="text-[9px] font-bold text-green-600 uppercase tracking-wider">Lunch</span>
                                    </div>
                                  </td>
                                );
                              }
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 2: PRINCIPAL APPROVED IA EXAM TIMETABLE */}
      {activeTab === "ia" && (
        <div className="space-y-6">
          {/* Header & Filter Controls */}
          {iaSchedules.length > 0 && uniqueIaExams.length > 1 && (
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Filter size={16} className="text-blue-600" /> Filter Exam:
              </div>
              <select
                value={iaExamFilter}
                onChange={(e) => setIaExamFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs font-bold text-[#120c7a] outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              >
                <option value="ALL">All Internal Assessment Exams</option>
                {uniqueIaExams.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {filteredIaSchedules.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl p-12 text-center border border-slate-200 space-y-4">
              <div className="w-16 h-16 mx-auto bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-200">
                <ShieldCheck size={36} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">No Approved IA Timetable Available Yet</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  The IA exam schedule is currently being configured or reviewed by the Principal. Once approved by the Principal, your exam timetable will appear here automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-200">
              <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <Calendar size={20} />
                  <div>
                    <h2 className="font-black text-base">Internal Assessment (IA) Exam Schedule</h2>
                    <p className="text-[11px] opacity-80 font-medium">Official Principal Approved Exam Dates</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full border border-white/30">
                  {filteredIaSchedules.length} Subjects Scheduled
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Exam Event</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Subject Code & Name</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Scheduled Exam Date</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Submission Window</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredIaSchedules.map((item, idx) => (
                      <tr key={`${item.docId}_${item.code}_${idx}`} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="px-6 py-4 font-extrabold text-[#120c7a]">
                          <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black uppercase tracking-wider border border-blue-100">
                            {item.examName}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-black text-slate-800 text-sm">{item.code}</div>
                          <div className="text-xs text-slate-500 font-medium">{item.name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-800 font-extrabold">
                            <Calendar size={15} className="text-emerald-600" />
                            {formatDateDisplay(item.examDate)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                          {item.submissionWindow || "-"}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={14} className="text-emerald-600" /> Approved
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
