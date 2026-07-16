import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Calendar, Clock, AlertCircle, Loader2, BookOpen, Coffee, UtensilsCrossed } from "lucide-react";
import { getAcademicYears, formatBatchDisplay, formatProgrammeKey } from "../../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
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

export default function Timetable() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timetable, setTimetable] = useState(null);

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

  useEffect(() => {
    if (!studentData) return;
    const { programme, department, batch } = studentData;
    if (!programme || !department || !batch) { setLoading(false); return; }

    const fetchTimetable = async () => {
      try {
        const progKey = formatProgrammeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);
        const years = getAcademicYears(batch);
        if (years.length === 0) { setLoading(false); return; }

        const currentYear = new Date().getFullYear();
        const month = new Date().getMonth();
        const activeAy = years.find((y) => {
          const [start] = y.split('-').map(Number);
          if (month >= 6) return start === currentYear;
          return start + 1 === currentYear;
        }) || years[0];

        const ayKey = sanitizeKey(activeAy);
        const ayIndex = years.indexOf(activeAy);
        const isOddSem = month >= 6;
        const semNum = String(ayIndex * 2 + (isOddSem ? 1 : 2));
        const otherSem = String(ayIndex * 2 + (isOddSem ? 2 : 1));
        const compositeKey = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}`;

        const allocationSnap = await getDoc(doc(db, "timetable_allocations", compositeKey));
        if (allocationSnap.exists()) {
          setTimetable(allocationSnap.data());
        } else {
          const compositeKey2 = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${otherSem}`;
          const allocationSnap2 = await getDoc(doc(db, "timetable_allocations", compositeKey2));
          if (allocationSnap2.exists()) setTimetable(allocationSnap2.data());
          else setTimetable(null);
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchTimetable();
  }, [studentData]);

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
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-6 py-4">
        <p className="text-sm text-slate-500">
          {studentData.studentName} <span className="text-slate-300 mx-1.5">&middot;</span> {formatBatchDisplay(studentData.batch)} <span className="text-slate-300 mx-1.5">&middot;</span>           {formatDeptDisplay(studentData.department)}
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Calendar size={14} />
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {!timetable ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-12 md:p-24 text-center border border-slate-100">
          <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-5">
            <Calendar size={40} className="text-slate-300" />
          </div>
          <p className="text-lg font-bold text-slate-400">No timetable allocated yet.</p>
          <p className="text-sm text-slate-300 mt-1">Your timetable will appear here once assigned.</p>
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

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-4 md:px-8 py-3 flex items-center gap-3">
              <Clock size={18} className="text-white" />
              <h2 className="text-white font-bold text-base">Weekly Schedule</h2>
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

          {timetable.subjects?.length > 0 && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-4 md:px-8 py-3 flex items-center gap-3">
                <BookOpen size={16} className="text-white" />
                <h2 className="text-white font-bold text-base">Subjects</h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {timetable.subjects.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm ${['bg-blue-600','bg-emerald-600','bg-violet-600','bg-rose-600','bg-amber-600','bg-cyan-600'][i % 6]}`}>
                        {s.code?.slice(0, 2) || 'S' + (i + 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{s.code || s.name}</p>
                        {s.name && <p className="text-xs text-slate-400 truncate">{s.name}</p>}
                        {s.periods > 0 && <p className="text-[10px] font-bold text-blue-600 mt-0.5">{s.periods}p/week</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
