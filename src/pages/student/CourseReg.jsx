import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ClipboardList, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { formatProgDisplay, getAcademicYears, sanitizeKey } from "../../lib/utils";

const getOrdinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function CourseReg() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [currentSem, setCurrentSem] = useState("");
  const [registered, setRegistered] = useState({});

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

    const fetchCourses = async () => {
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
          const semesters = data.semesters || {};

          const years = getAcademicYears(batch);
          const currentYear = new Date().getFullYear();
          const activeAy = years.find((y) => {
            const [start] = y.split("-").map(Number);
            return currentYear >= start && currentYear <= start + 1;
          }) || years[0];

          const ayStart = parseInt(activeAy.split("-")[0]);
          const batchStart = parseInt(batch.split("-")[0]);
          const currentSemNum = Math.min(Math.max(((ayStart - batchStart) * 2) + 1, 1), Object.keys(semesters).length);

          const semKey = String(currentSemNum);
          setCurrentSem(semKey);
          setCourses(semesters[semKey] || []);
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchCourses();
  }, [studentData]);

  const toggleRegistered = (courseCode) => {
    setRegistered((prev) => ({
      ...prev,
      [courseCode]: !prev[courseCode],
    }));
  };

  const totalCredits = useMemo(() => {
    return courses.reduce((s, c) => s + (Number(c.credits) || 0), 0);
  }, [courses]);

  const registeredCredits = useMemo(() => {
    return courses
      .filter((c) => registered[c.code])
      .reduce((s, c) => s + (Number(c.credits) || 0), 0);
  }, [courses, registered]);

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
          <ClipboardList size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Course Registration</h1>
          <p className="text-sm text-slate-500">
            {studentData.studentName} &middot; {formatProgDisplay(studentData.programme)} &middot; {studentData.batch}
          </p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <ClipboardList size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No courses available for this semester.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Semester</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{getOrdinal(Number(currentSem))}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Courses</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{courses.length}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Credits</p>
              <p className="text-lg font-black text-[#120c7a] mt-1">{totalCredits}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registered Credits</p>
              <p className="text-lg font-black text-emerald-600 mt-1">{registeredCredits}</p>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-8 py-5">
              <h2 className="text-white font-bold text-xl">{getOrdinal(Number(currentSem))} Semester Courses</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Course Code</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Course Name</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Register</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courses.map((course, idx) => (
                    <tr key={course.code || idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-slate-300">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-700 font-mono">{course.code || "-"}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-700">{course.name || course.subject || "-"}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-black text-[#120c7a] bg-blue-50 px-3 py-1 rounded-lg">
                          {course.credits || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border uppercase ${
                          (course.type || "Theory").toLowerCase() === "elective"
                            ? "bg-purple-50 text-purple-600 border-purple-200"
                            : "bg-emerald-50 text-emerald-600 border-emerald-200"
                        }`}>
                          {course.type || "Theory"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleRegistered(course.code)}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            registered[course.code]
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200 hover:border-emerald-200 hover:text-emerald-600"
                          }`}
                        >
                          {registered[course.code] ? (
                            <><CheckCircle2 size={14} /> Registered</>
                          ) : (
                            "Register"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
