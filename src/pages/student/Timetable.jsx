import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Calendar, Clock, AlertCircle, Loader2, BookOpen } from "lucide-react";
import { getAcademicYears, formatBatchDisplay } from "../../lib/utils";

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
        if (snap.exists()) setStudentData(snap.data());
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
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);
        const years = getAcademicYears(batch);
        if (years.length === 0) { setLoading(false); return; }

        const currentYear = new Date().getFullYear();
        const activeAy = years.find((y) => {
          const [start] = y.split('-').map(Number);
          return currentYear >= start && currentYear <= start + 1;
        }) || years[0];

        const ayKey = sanitizeKey(activeAy);
        const semNum = '1';
        const compositeKey = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}`;

        const allocationSnap = await getDoc(doc(db, "timetable_allocations", compositeKey));
        if (allocationSnap.exists()) {
          setTimetable(allocationSnap.data());
        } else {
          const compositeKey2 = `${progKey}_${deptKey}_${batchKey}_${ayKey}_2`;
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <Calendar size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Timetable</h1>
          <p className="text-sm text-slate-500">
            {studentData.studentName} &middot; {formatBatchDisplay(studentData.batch)} &middot; {studentData.department}
          </p>
        </div>
      </div>

      {!timetable ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <Calendar size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No timetable allocated yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Template</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{timetable.timetableName}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Working Days</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{timetable.workingDays}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periods / Day</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{timetable.periodsPerDay}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timing</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{timetable.startTime} - {timetable.closeTime}</p>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-8 py-5 flex items-center gap-3">
              <Clock size={20} className="text-white" />
              <h2 className="text-white font-bold text-xl">Weekly Schedule</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Day</th>
                    {Array.from({ length: periodsPerDay }).map((_, i) => (
                      <th key={i} className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[100px]">
                        <div>P{i + 1}</div>
                        {periodTimings[i] && <div className="text-[8px] font-normal text-slate-400 mt-0.5">{periodTimings[i]}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: workingDaysCount }).map((_, dayIdx) => (
                    <tr key={dayIdx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-4 text-sm font-bold text-slate-600">{DAYS[dayIdx] || `Day ${dayIdx + 1}`}</td>
                      {Array.from({ length: periodsPerDay }).map((_, periodIdx) => {
                        const subjectCode = timetable.subjectAllocation?.[DAYS[dayIdx]]?.[periodIdx + 1];
                        return (
                          <td key={periodIdx} className="px-3 py-3 text-center border border-slate-50">
                            {subjectCode ? (
                              <span className="text-xs font-bold text-[#120c7a] bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                                {subjectCode}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 italic">Free</span>
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

          {timetable.subjects?.length > 0 && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-emerald-600 px-8 py-5 flex items-center gap-3">
                <BookOpen size={20} className="text-white" />
                <h2 className="text-white font-bold text-xl">Subjects</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {timetable.subjects.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="w-10 h-10 rounded-xl bg-[#120c7a]/10 flex items-center justify-center text-[#120c7a] font-black text-sm">
                        {s.code?.slice(0, 2) || 'S' + (i + 1)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{s.code || s.name}</p>
                        {s.name && <p className="text-xs text-slate-400">{s.name}</p>}
                        {s.periods > 0 && <p className="text-[10px] font-bold text-emerald-600">{s.periods}p/week</p>}
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
