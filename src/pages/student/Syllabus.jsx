import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, AlertCircle, Loader2, ChevronDown, GraduationCap, Layers } from "lucide-react";
import { formatBatchDisplay, formatProgDisplay } from "../../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const getOrdinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function Syllabus() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syllabus, setSyllabus] = useState(null);
  const [selectedSem, setSelectedSem] = useState("");

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

    const fetchSyllabus = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);

        const batchRegSnap = await getDoc(doc(db, "batch_regulations", progKey));
        let regulation = "";
        if (batchRegSnap.exists()) {
          const data = batchRegSnap.data();
          regulation = data[batch] || data[Object.keys(data)[0]] || "";
        }

        if (!regulation) { setLoading(false); return; }

        const regKey = sanitizeKey(regulation);
        const syllabusKey = `${progKey}_${deptKey}_${regKey}`;
        const syllSnap = await getDoc(doc(db, "syllabus_data", syllabusKey));

        if (syllSnap.exists()) {
          const data = syllSnap.data();
          setSyllabus(data);
          const semKeys = Object.keys(data.semesters || {}).sort((a, b) => Number(a) - Number(b));
          if (semKeys.length > 0) setSelectedSem(semKeys[0]);
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchSyllabus();
  }, [studentData]);

  const semesterKeys = useMemo(() => {
    if (!syllabus?.semesters) return [];
    return Object.keys(syllabus.semesters).sort((a, b) => Number(a) - Number(b));
  }, [syllabus]);

  const currentSubjects = useMemo(() => {
    if (!selectedSem || !syllabus?.semesters) return [];
    return syllabus.semesters[selectedSem] || [];
  }, [selectedSem, syllabus]);

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
          <GraduationCap size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Syllabus</h1>
          <p className="text-sm text-slate-500">
            {studentData.studentName} &middot; {formatProgDisplay(studentData.programme)} &middot; {formatBatchDisplay(studentData.batch)}
          </p>
        </div>
      </div>

      {!syllabus ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <BookOpen size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No syllabus data available.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Programme</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{formatProgDisplay(syllabus.programme) || studentData.programme}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{syllabus.department || studentData.department}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regulation</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{syllabus.regulation}</p>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-8 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Layers size={20} className="text-white" />
                  <h2 className="text-white font-bold text-xl">Semester Subjects</h2>
                </div>
                <div className="relative">
                  <select
                    value={selectedSem}
                    onChange={(e) => setSelectedSem(e.target.value)}
                    className="appearance-none bg-white/10 border border-white/20 text-white rounded-xl px-5 py-2.5 pr-10 font-bold text-sm outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
                  >
                    {semesterKeys.map((sem) => (
                      <option key={sem} value={sem} className="text-slate-800">
                        {getOrdinal(Number(sem))} Semester
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="p-6">
              {currentSubjects.length === 0 ? (
                <div className="py-10 text-center">
                  <BookOpen size={36} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No subjects found for this semester.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Code</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Name</th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentSubjects.map((sub, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-300">{idx + 1}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-700 font-mono">{sub.code || '-'}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-700">{sub.name || '-'}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-black text-[#120c7a] bg-blue-50 px-3 py-1 rounded-lg">
                              {sub.credits || 0}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-[10px] font-bold px-3 py-1.5 rounded-full border bg-purple-50 text-purple-600 border-purple-200 uppercase">
                              {sub.type || 'Theory'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {semesterKeys.map((sem) => {
              const subjects = syllabus.semesters[sem] || [];
              const totalCredits = subjects.reduce((s, sub) => s + (Number(sub.credits) || 0), 0);
              return (
                <button
                  key={sem}
                  onClick={() => setSelectedSem(sem)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all ${
                    selectedSem === sem
                      ? 'border-[#120c7a] bg-[#120c7a]/5 shadow-lg'
                      : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <p className={`text-xs font-bold uppercase tracking-widest ${selectedSem === sem ? 'text-[#120c7a]' : 'text-slate-400'}`}>
                    {getOrdinal(Number(sem))} Semester
                  </p>
                  <p className={`text-lg font-black mt-1 ${selectedSem === sem ? 'text-[#120c7a]' : 'text-slate-600'}`}>
                    {subjects.length} Subjects
                  </p>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">{totalCredits} Credits</p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
