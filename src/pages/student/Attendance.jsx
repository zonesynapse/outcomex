import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarCheck2, AlertCircle, Loader2 } from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function Attendance() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

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
        const records = [];

        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          if (!id.startsWith(`${progKey}_${deptKey}_${batchKey}`)) return;
          const data = docSnap.data();
          if (!data._meta || !data.students) return;

          const meta = data._meta;
          const totalHours = parseInt(meta.totalHours) || 0;
          const attended = data.students[regNo];
          const attendedHours = attended !== undefined ? (typeof attended === 'number' ? attended : 0) : 0;
          const percentage = totalHours > 0 ? ((attendedHours / totalHours) * 100) : 0;

          records.push({
            docId: id,
            totalClasses: totalHours,
            attended: attendedHours,
            percentage,
          });
        });

        records.sort((a, b) => a.docId.localeCompare(b.docId));
        setAttendanceRecords(records);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchAttendance();
  }, [studentData]);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Subjects</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">{attendanceRecords.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Overall Attendance</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">
            {attendanceRecords.length > 0
              ? (attendanceRecords.reduce((s, r) => s + r.percentage, 0) / attendanceRecords.length).toFixed(1)
              : 'N/A'}%
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Classes</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">
            {attendanceRecords.reduce((s, r) => s + r.totalClasses, 0)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-[#120c7a] px-8 py-5">
          <h2 className="text-white font-bold text-xl">Subject-wise Attendance</h2>
        </div>
        {attendanceRecords.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <CalendarCheck2 size={48} className="text-slate-200" />
            <p className="text-slate-400 font-medium italic">No attendance records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
                  <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Classes</th>
                  <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Attended</th>
                  <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendanceRecords.map((rec, idx) => {
                  const parts = rec.docId.split('_');
                  const subjectCode = parts.slice(4).join('_');
                  return (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-8 py-4">
                        <span className="text-sm font-bold text-slate-700 font-mono">{subjectCode}</span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="text-sm font-bold text-slate-600">{rec.totalClasses}</span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="text-sm font-bold text-slate-600">{rec.attended}</span>
                      </td>
                      <td className="px-8 py-4">
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
