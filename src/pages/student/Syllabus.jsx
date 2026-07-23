import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, AlertCircle, Loader2, ChevronDown, GraduationCap, Layers, X, Target, Clock, BookText } from "lucide-react";
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
    if (!programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

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

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseLoading, setCourseLoading] = useState(false);

  const fetchCourseContent = useCallback(async (subject) => {
    if (!studentData || !syllabus) return;
    setCourseLoading(true);
    setSelectedCourse(subject);
    try {
      const progKey = sanitizeKey(studentData.programme);
      const deptKey = sanitizeKey(studentData.department);
      const regKey = sanitizeKey(syllabus.regulation);
      const code = sanitizeKey(subject.code);
      const keys = [
        `${progKey}_${deptKey}_${regKey}_${code}`,
        `${progKey}_${deptKey}_${code}`,
        `${progKey}_Overall_${code}`
      ];
      let courseData = null;
      for (const key of keys) {
        const snap = await getDoc(doc(db, "courses", key));
        if (snap.exists()) { courseData = snap.data(); courseData._id = key; break; }
      }
      setSelectedCourse(courseData ? { ...subject, courseData } : subject);
    } catch (err) { console.error(err); }
    setCourseLoading(false);
  }, [studentData, syllabus]);

  const closeCourseModal = () => setSelectedCourse(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedCourse) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedCourse]);

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
    <>
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {!syllabus ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-20 text-center border border-slate-100">
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
            <div className="bg-[#120c7a] px-4 md:px-8 py-5">
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
                        <th className="px-3 md:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                        <th className="px-3 md:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Code</th>
                        <th className="px-3 md:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Name</th>
                        <th className="px-3 md:px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</th>
                        <th className="px-3 md:px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentSubjects.map((sub, idx) => (
                        <tr key={idx} onClick={() => fetchCourseContent(sub)} className="hover:bg-blue-50/30 transition-colors cursor-pointer">
                          <td className="px-3 md:px-6 py-4 text-sm font-bold text-slate-300">{idx + 1}</td>
                          <td className="px-3 md:px-6 py-4 text-sm font-bold text-slate-700 font-mono">{sub.code || '-'}</td>
                          <td className="px-3 md:px-6 py-4 text-sm font-bold text-slate-700">{sub.name || '-'}</td>
                          <td className="px-3 md:px-6 py-4 text-center">
                            <span className="text-sm font-black text-[#120c7a] bg-blue-50 px-3 py-1 rounded-lg">
                              {sub.credits || 0}
                            </span>
                          </td>
                          <td className="px-3 md:px-6 py-4 text-center">
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

      {/* Course Details Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeCourseModal}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            {/* Fixed Header */}
            <div className="shrink-0 bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-t-3xl px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">{selectedCourse.code || selectedCourse.courseData?.code}</p>
                <h3 className="text-white font-bold text-xl mt-0.5">{selectedCourse.name || selectedCourse.courseData?.name}</h3>
              </div>
              <button onClick={closeCourseModal} className="shrink-0 p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto p-6 space-y-6">
              {courseLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-[#120c7a]" size={32} />
                </div>
              ) : selectedCourse.courseData ? (
                <>
                  {/* Meta Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Credits</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">{selectedCourse.courseData.credits ?? selectedCourse.credits ?? '-'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">{selectedCourse.type || selectedCourse.courseData.type || 'Theory'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">L – T – P</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">
                        {selectedCourse.courseData.periods
                          ? `${selectedCourse.courseData.periods.l || 0} – ${selectedCourse.courseData.periods.t || 0} – ${selectedCourse.courseData.periods.p || 0}`
                          : '–'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regulation</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">{selectedCourse.courseData.regulation || syllabus.regulation}</p>
                    </div>
                  </div>

                  {/* Course Outcomes */}
                  {selectedCourse.courseData.co && selectedCourse.courseData.co.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Target size={16} className="text-[#120c7a]" />
                        <h4 className="font-bold text-sm text-slate-700">Course Outcomes</h4>
                      </div>
                      <div className="space-y-2">
                        {selectedCourse.courseData.co.map((co, i) => (
                          <div key={i} className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <span className="shrink-0 w-8 h-8 rounded-lg bg-[#120c7a] text-white text-xs font-bold flex items-center justify-center">{co.id}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-700">{co.description || '—'}</p>
                                {co.content && <p className="text-xs text-slate-500 mt-1">{co.content}</p>}
                                {(co.domain || co.level) && (
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">
                                    {co.domain && `${co.domain}`}{co.domain && co.level && ' | '}{co.level && `Level: ${co.level}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw data fallback */}
                  {(!selectedCourse.courseData.co || selectedCourse.courseData.co.length === 0) && (
                    <div className="text-center py-6">
                      <BookText size={32} className="mx-auto text-slate-200 mb-2" />
                      <p className="text-sm font-medium text-slate-400">No course outcomes configured yet.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle size={40} className="mx-auto text-amber-300 mb-3" />
                  <p className="text-sm font-bold text-slate-500">Course details not available</p>
                  <p className="text-xs text-slate-400 mt-1">The detailed syllabus for this subject has not been uploaded yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
