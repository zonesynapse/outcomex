import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarCheck2, AlertCircle, Loader2, Check, X } from "lucide-react";

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
        const snapshot = await getDocs(collection(db, "attendance"));
        const subjects = [];
        const dateMap = {};

        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          if (!id.startsWith(`${progKey}_${deptKey}_${batchKey}`)) return;
          const data = docSnap.data();
          const records = data?.records;
          if (!records) return;

          const subjectCode = extractSubjectCode(id);
          const recordKeys = Object.keys(records);
          const totalSubjClasses = recordKeys.length;
          let attended = 0;

          recordKeys.forEach(key => {
            const rec = records[key];
            const hours = rec?.students?.[regNo];
            const present = hours !== undefined && hours > 0;
            if (present) attended++;

            const dateMatch = key.match(/^(\d{4}-\d{2}-\d{2})_P(\d+)$/);
            if (dateMatch) {
              const [, dateStr, period] = dateMatch;
              if (!dateMap[dateStr]) dateMap[dateStr] = [];
              dateMap[dateStr].push({
                subject: subjectCode,
                period: parseInt(period),
                present,
              });
            }
          });

          const pct = totalSubjClasses > 0 ? (attended / totalSubjClasses) * 100 : 0;
          subjects.push({ docId: id, subjectCode, totalClasses: totalSubjClasses, attended, percentage: pct });
        });

        subjects.sort((a, b) => a.docId.localeCompare(b.docId));
        setSubjectWise(subjects);

        const allRows = [];
        Object.entries(dateMap).forEach(([date, entries]) => {
          entries.sort((a, b) => a.subject.localeCompare(b.subject) || a.period - b.period);
          entries.forEach(e => allRows.push({ date, ...e }));
        });
        allRows.sort((a, b) => b.date.localeCompare(a.date) || a.subject.localeCompare(b.subject) || a.period - b.period);
        setDateWiseRows(allRows);

        const total = subjects.reduce((s, r) => s + r.totalClasses, 0);
        const present = subjects.reduce((s, r) => s + r.attended, 0);
        setTotalClasses(total);
        setTotalPresent(present);
        setOverallPercentage(subjects.length > 0 ? subjects.reduce((s, r) => s + r.percentage, 0) / subjects.length : 0);
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
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <CalendarCheck2 size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Attendance</h1>
          <p className="text-sm text-slate-500">{studentData.studentName} &middot; {studentData.regNo}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Classes</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Attended</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectWise.map((rec, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 md:px-8 py-4">
                      <span className="text-sm font-bold text-slate-700 font-mono">{rec.subjectCode}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-slate-600">{rec.totalClasses}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-slate-600">{rec.attended}</span>
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
                            <th className="px-4 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Period</th>
                            <th className="px-4 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dayRows.map((row, i) => (
                            <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                              <td className="px-4 py-2">
                                <span className="text-sm font-bold text-slate-700 font-mono">{row.subject}</span>
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
