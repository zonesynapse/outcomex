import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarCheck2, AlertCircle, Loader2, Check, X } from "lucide-react";
import { getAttendanceRecords } from "../../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const extractSubjectCode = (docId) => {
  const parts = docId.split('_');
  const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
  if (batchIdx >= 0 && batchIdx + 3 < parts.length) {
    return parts.slice(batchIdx + 3).join('_').replace(/_(Sec-\w+)$/, '');
  }
  return parts.slice(4).join('_');
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getPercentColor = (p) => {
  if (p >= 85) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (p >= 75) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-red-600 bg-red-50 border-red-200";
};

const getPercentBarColor = (p) => {
  if (p >= 85) return "bg-emerald-500";
  if (p >= 75) return "bg-yellow-500";
  return "bg-red-500";
};

export default function Attendance() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subjectWise, setSubjectWise] = useState([]);
  const [dateWiseRows, setDateWiseRows] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [overallPercentage, setOverallPercentage] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalPresent, setTotalPresent] = useState(0);
  const [totalOd, setTotalOd] = useState(0);

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
    const { regNo, programme, department, batch } = studentData;
    if (!regNo || !programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchAttendance = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);

        const [attSnapshot, batchRegSnap, assignSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "attendance")),
          getDoc(doc(db, "batch_regulations", progKey)).catch(() => null),
          getDocs(collection(db, "subject_assignments")),
          getDocs(collection(db, "users")),
        ]);

        let regulation = "";
        if (batchRegSnap?.exists()) {
          const regData = batchRegSnap.data();
          regulation = regData[batch] || regData[Object.keys(regData)[0]] || "";
        }

        let subjectNames = {};
        if (regulation) {
          const syllabusSnap = await getDoc(doc(db, "syllabus_data", `${progKey}_${deptKey}_${sanitizeKey(regulation)}`)).catch(() => null);
          if (syllabusSnap?.exists()) {
            const syllabus = syllabusSnap.data();
            Object.values(syllabus.semesters || {}).forEach(semList => {
              if (Array.isArray(semList)) semList.forEach(s => { if (s?.code) subjectNames[s.code] = s.name; });
            });
          }
        }

        const facultyUidMap = {};
        assignSnap.forEach(d => {
          if (!d.id.startsWith(`${progKey}_${deptKey}_${batchKey}`)) return;
          const data = d.data();
          Object.entries(data).forEach(([uid, codes]) => {
            if (uid.startsWith('_') || !Array.isArray(codes)) return;
            codes.forEach(code => { if (!facultyUidMap[code]) facultyUidMap[code] = uid; });
          });
        });

        const facultyNames = {};
        usersSnap.forEach(d => {
          const u = d.data();
          facultyNames[d.id] = u.facultyName || u.displayName || u.email || '';
        });

        // Collect raw entries where this student was explicitly included in rec.students
        const rawEntries = [];
        const subjectDocMap = {};

        attSnapshot.forEach((docSnap) => {
          const id = docSnap.id;
          if (!id.startsWith(`${progKey}_${deptKey}_${batchKey}`)) return;
          const data = docSnap.data();
          const records = getAttendanceRecords(data);
          if (!Object.keys(records).length) return;

          const subjectCode = extractSubjectCode(id);
          subjectDocMap[id] = subjectCode;

          Object.entries(records).forEach(([key, rec]) => {
            const dateMatch = key.match(/^(\d{4}-\d{2}-\d{2})_P(\d+)$/);
            if (!dateMatch) return;

            const rawH = rec?.students?.[regNo];
            if (rawH === undefined) return; // Student was not in this record

            const hours = typeof rawH === 'object' && rawH !== null ? (rawH.hours ?? 0) : rawH;
            const storedStatus = typeof rawH === 'object' && rawH !== null ? rawH.status : undefined;
            let status = 'A';
            if (storedStatus) {
              status = storedStatus;
            } else {
              if (hours > 0) status = 'P';
              else if (hours === -1 || rawH === 'OD' || (typeof rawH === 'object' && rawH?.hours === -1)) status = 'OD';
            }

            const [, dateStr, periodStr] = dateMatch;
            rawEntries.push({
              docId: id,
              subjectCode,
              dateStr,
              period: parseInt(periodStr),
              recordKey: key,
              status,
              markedBy: rec?.markedBy || '',
              isEvent: rec?.isEvent || false,
              eventName: rec?.eventName || ''
            });
          });
        });

        // Filter by course enrollment: only count subjects the student is actually enrolled in
        const uniqueEnrolKeys = new Set();
        const enrolKeyMap = {}; // docId → enrolKey
        rawEntries.forEach(e => {
          const parts = e.docId.split('_');
          const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
          if (batchIdx < 0 || batchIdx + 3 >= parts.length) return;
          const batchKey = parts[batchIdx];
          const ayKey = parts[batchIdx + 1];
          const semNum = parts[batchIdx + 2];
          const enrolKey = `${progKey}_${deptKey}_${sanitizeKey(batchKey)}_${sanitizeKey(ayKey)}_${semNum}_${sanitizeKey(e.subjectCode)}`;
          enrolKeyMap[e.docId] = enrolKey;
          uniqueEnrolKeys.add(enrolKey);
        });
        const enrolMap = {};
        await Promise.all([...uniqueEnrolKeys].map(async (ek) => {
          try {
            const eSnap = await getDoc(doc(db, 'course_enrolments', ek));
            if (eSnap.exists()) {
              const eData = eSnap.data();
              enrolMap[ek] = new Set(Object.keys(eData).filter(k => eData[k]));
            }
          } catch (e) { /* enrollment doc may not exist */ }
        }));
        const filteredEntries = rawEntries.filter(e => {
          // 1. Course enrollment doc (precise — for data saved after enrollment tracking)
          const ek = enrolKeyMap[e.docId];
          if (ek && enrolMap[ek]) return enrolMap[ek].has(regNo);
          // 2. Fallback: subject must be assigned to this batch (handles old data without enrollment docs)
          return !!facultyUidMap[e.subjectCode];
        });

        // Dedup by recordKey: when no enrollment docs exist, a student may appear in multiple subjects
        // for the same period (old data). Dedup ensures each period is counted at most once.
        const entriesByRecordKey = {};
        filteredEntries.forEach(e => {
          if (!entriesByRecordKey[e.recordKey]) entriesByRecordKey[e.recordKey] = [];
          entriesByRecordKey[e.recordKey].push(e);
        });
        const resolvedEntries = [];
        Object.values(entriesByRecordKey).forEach(group => {
          if (group.length === 1) {
            resolvedEntries.push(group[0]);
          } else {
            // Multiple subjects for same period — try to keep only enrolled subjects
            const enrolledInGroup = group.filter(e => {
              const ek = enrolKeyMap[e.docId];
              const enrolledSet = enrolMap[ek];
              return enrolledSet && enrolledSet.has(regNo);
            });
            if (enrolledInGroup.length > 0) {
              enrolledInGroup.forEach(e => resolvedEntries.push(e));
            } else {
              // Can't determine enrollment — pick present/OD if any, else first
              const present = group.filter(e => e.status === 'P' || e.status === 'OD');
              if (present.length > 0) resolvedEntries.push(present[0]);
              else resolvedEntries.push(group[0]);
            }
          }
        });

        // Aggregate resolved entries into subject-wise summary and date-wise rows
        const subjectStats = {};
        const dateMap = {};

        resolvedEntries.forEach(entry => {
          const isAttended = (entry.status === 'P');

          if (entry.isEvent) {
            if (!dateMap[entry.dateStr]) dateMap[entry.dateStr] = [];
            dateMap[entry.dateStr].push({
              subject: '-',
              period: entry.period,
              present: isAttended,
              isEvent: true,
              subjectName: entry.eventName || '',
              facultyName: entry.markedBy ? (facultyNames[entry.markedBy] || '') : entry.markedBy
            });
            return;
          }

          if (!subjectStats[entry.subjectCode]) {
            subjectStats[entry.subjectCode] = {
              docId: entry.docId,
              subjectCode: entry.subjectCode,
              totalClasses: 0,
              attended: 0,
              odCount: 0
            };
          }
          subjectStats[entry.subjectCode].totalClasses += 1;
          if (isAttended) subjectStats[entry.subjectCode].attended += 1;
          if (entry.status === 'OD') subjectStats[entry.subjectCode].odCount += 1;

          if (!dateMap[entry.dateStr]) dateMap[entry.dateStr] = [];
          dateMap[entry.dateStr].push({
            subject: entry.subjectCode,
            period: entry.period,
            present: isAttended
          });
        });

        const subjects = [];
        Object.values(subjectStats).forEach(s => {
          const nonOdClasses = s.totalClasses - s.odCount;
          const pct = nonOdClasses > 0 ? (s.attended / nonOdClasses) * 100 : 0;
          const odPct = s.totalClasses > 0 ? (s.odCount / s.totalClasses) * 100 : 0;
          const facultyUid = facultyUidMap[s.subjectCode] || '';
          subjects.push({
            docId: s.docId,
            subjectCode: s.subjectCode,
            subjectName: subjectNames[s.subjectCode] || '',
            facultyName: facultyUid ? (facultyNames[facultyUid] || '') : '',
            totalClasses: s.totalClasses,
            attended: s.attended,
            odCount: s.odCount,
            percentage: pct,
            odPercentage: odPct,
          });
        });

        subjects.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
        setSubjectWise(subjects);

        const codeNameMap = {};
        const codeFacultyMap = {};
        subjects.forEach(s => { codeNameMap[s.subjectCode] = s.subjectName; codeFacultyMap[s.subjectCode] = s.facultyName; });

        const allRows = [];
        Object.entries(dateMap).forEach(([date, entries]) => {
          entries.sort((a, b) => a.period - b.period || a.subject.localeCompare(b.subject));
          entries.forEach(e => {
            if (e.isEvent) {
              allRows.push({ date, ...e });
            } else {
              allRows.push({
                date, ...e,
                subjectName: codeNameMap[e.subject] || subjectNames[e.subject] || '',
                facultyName: codeFacultyMap[e.subject] || ''
              });
            }
          });
        });
        allRows.sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
        setDateWiseRows(allRows);

        const total = subjects.reduce((s, r) => s + r.totalClasses, 0);
        const present = subjects.reduce((s, r) => s + r.attended, 0);
        const nonOdTotal = subjects.reduce((s, r) => s + (r.totalClasses - r.odCount), 0);
        const totalOd = subjects.reduce((s, r) => s + r.odCount, 0);
        setTotalClasses(total);
        setTotalPresent(present);
        setTotalOd(totalOd);
        setOverallPercentage(nonOdTotal > 0 ? (present / nonOdTotal) * 100 : 0);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchAttendance();
  }, [studentData]);

  const dates = [...new Set(dateWiseRows.map(r => r.date))].sort((a, b) => b.localeCompare(a));

  const getDateStats = (date) => {
    const rows = dateWiseRows.filter(r => r.date === date);
    const present = rows.filter(r => r.present).length;
    return { total: rows.length, present, pct: rows.length > 0 ? (present / rows.length) * 100 : 0 };
  };

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Subjects</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">{subjectWise.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Overall Attendance</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">
            {subjectWise.length > 0 ? overallPercentage.toFixed(1) : 'N/A'}%
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Classes</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">{totalClasses}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Attended</p>
          <p className="text-3xl font-black text-emerald-600 mt-2">{totalPresent}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">OD</p>
          <p className="text-3xl font-black text-blue-600 mt-2">{totalOd || 0}</p>
        </div>
      </div>

      {/* Subject-wise Summary */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-[#120c7a] px-4 md:px-8 py-5">
          <h2 className="text-white font-bold text-xl">Subject-wise Attendance</h2>
        </div>
        {subjectWise.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <CalendarCheck2 size={48} className="text-slate-200" />
            <p className="text-slate-400 font-medium italic">No attendance records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 md:px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
                  <th className="px-4 md:px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Faculty</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Attended</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-blue-500 uppercase tracking-widest">OD</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">%</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-blue-400 uppercase tracking-widest">OD%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectWise.map((rec, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 md:px-8 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700 font-mono">{rec.subjectCode}</span>
                        {rec.subjectName && <span className="text-[11px] text-slate-400 font-medium mt-0.5 truncate max-w-[200px]" title={rec.subjectName}>{rec.subjectName}</span>}
                      </div>
                    </td>
                    <td className="px-4 md:px-8 py-4">
                      <span className="text-xs font-semibold text-slate-500">{rec.facultyName || '—'}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-slate-600">{rec.totalClasses}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-slate-600">{rec.attended}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-blue-600">{rec.odCount}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                          <div
                            className={`h-full transition-all duration-1000 ${getPercentBarColor(rec.percentage)}`}
                            style={{ width: `${Math.min(rec.percentage, 100)}%` }}
                          />
                        </div>
                        <span className={`text-sm font-black min-w-[60px] px-3 py-1 rounded-full border ${getPercentColor(rec.percentage)}`}>
                          {rec.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-blue-500">{rec.odPercentage.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Date-wise Attendance */}
      {dateWiseRows.length > 0 && (
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-4 md:px-8 py-5">
            <h2 className="text-white font-bold text-xl">Date-wise Attendance</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {dates.map((date) => {
              const stats = getDateStats(date);
              const isExpanded = expandedDate === date;
              const dayRows = dateWiseRows.filter(r => r.date === date);
              return (
                <div key={date}>
                  <button
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                    className="w-full flex items-center justify-between px-4 md:px-8 py-4 hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2 md:gap-4">
                      <span className="text-sm font-bold text-slate-700">{formatDate(date)}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getPercentColor(stats.pct)}`}>
                        {stats.present}/{stats.total} periods &middot; {stats.pct.toFixed(0)}%
                      </span>
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="px-4 md:px-8 pb-4">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50/80">
                              <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
                              <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Faculty</th>
                              <th className="px-4 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Period</th>
                              <th className="px-4 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {dayRows.map((row, i) => (
                              <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-4 py-2">
                                  <div className="flex flex-col">
                                    {row.isEvent ? (
                                      <>
                                        <span className="text-sm font-bold text-slate-700 font-mono">-</span>
                                        <span className="text-[10px] text-amber-600 font-medium truncate max-w-[180px]">{row.subjectName || 'Event'}</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm font-bold text-slate-700 font-mono">{row.subject}</span>
                                        {row.subjectName && <span className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">{row.subjectName}</span>}
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2">
                                  <span className="text-xs font-semibold text-slate-500">{row.facultyName || '—'}</span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span className="text-sm font-bold text-slate-600">P{row.period}</span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {row.present ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                                      <Check size={12} /> Present
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                                      <X size={12} /> Absent
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
