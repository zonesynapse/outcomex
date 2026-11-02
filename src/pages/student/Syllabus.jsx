import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, AlertCircle, Loader2, ChevronDown, Layers, X, Target, BookText } from "lucide-react";
import { formatProgDisplay } from "../../lib/utils";
import { getCachedStudentProfile, setCachedStudentProfile } from "../../lib/studentSession";

// In-memory course details cache for instant 0ms modal popups
const COURSE_CACHE = new Map();

// Local sanitizeKey (matches original and CourseReg.jsx without stripping spaces)
const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const sanitizeWithUnderscores = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const normCodeKey = (s) => String(s || "").toUpperCase().replace(/[\s-_]/g, "");

const getOrdinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function Syllabus() {
  const [studentData, setStudentData] = useState(() => getCachedStudentProfile());
  const [loading, setLoading] = useState(!getCachedStudentProfile());
  const [syllabus, setSyllabus] = useState(null);
  const [selectedSem, setSelectedSem] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          let uData = snap.data();
          const profData = uData._profile_data || {};
          const stuData = uData._student_data || {};
          const reg = uData.regNo || uData.registerNo || uData.rollNo || uData.admissionNo || profData.regNo || stuData.regNo || '';

          if (reg && (!uData.programme || !uData.department || !uData.batch)) {
            try {
              const idxSnap = await getDoc(doc(db, 'student_index', sanitizeWithUnderscores(reg)));
              if (idxSnap.exists()) {
                const idxData = idxSnap.data();
                uData = {
                  ...idxData,
                  ...uData,
                  programme: uData.programme || idxData.programme || idxData.degree || profData.programme || '',
                  department: uData.department || idxData.department || idxData.dept || idxData.branch || profData.department || '',
                  batch: uData.batch || idxData.batch || idxData.batchYear || profData.batch || '',
                };
              }
            } catch (e) {
              console.debug("Student index lookup skipped:", e);
            }
          }
          setStudentData(uData);
          setCachedStudentProfile(user.uid, uData);
        }
      } catch (err) {
        console.error("Error loading student user record:", err);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!studentData) return;
    const profData = studentData._profile_data || {};
    const stuData = studentData._student_data || {};

    const programme = studentData.programme || studentData.program || studentData.degree || profData.programme || stuData.programme || '';
    const department = studentData.department || studentData.dept || studentData.branch || profData.department || stuData.department || '';
    const batch = studentData.batch || studentData.batchYear || profData.batch || stuData.batch || '';

    if (!programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchSyllabus = async () => {
      try {
        const progKeyLocal = sanitizeKey(programme);
        const progKeyAlt = sanitizeWithUnderscores(programme);
        const deptKeyLocal = sanitizeKey(department);
        const deptKeyAlt = sanitizeWithUnderscores(department);

        // Try getting regulation from batch_regulations
        let regulation = studentData.regulation || profData.regulation || "";
        if (!regulation) {
          const possibleProgKeys = [progKeyLocal, progKeyAlt, programme, "B_E_", "B_E", "B_Tech_", "B_Tech", "M_E_", "M_E"];
          for (const pk of possibleProgKeys) {
            if (!pk) continue;
            try {
              const batchRegSnap = await getDoc(doc(db, "batch_regulations", pk));
              if (batchRegSnap.exists()) {
                const data = batchRegSnap.data();
                regulation = data[batch] || data[Object.keys(data)[0]] || "";
                if (regulation) break;
              }
            } catch (e) {
              console.debug("Batch reg check skipped:", pk, e);
            }
          }
        }

        if (!regulation) regulation = "2021"; // standard fallback

        const regKeyLocal = sanitizeKey(regulation);
        const regKeyAlt = sanitizeWithUnderscores(regulation);

        // Try primary exact doc keys first
        const candidateKeys = [
          `${progKeyLocal}_${deptKeyLocal}_${regKeyLocal}`,
          `${progKeyAlt}_${deptKeyAlt}_${regKeyAlt}`,
          `${progKeyLocal}_${deptKeyAlt}_${regKeyLocal}`,
          `${progKeyAlt}_${deptKeyLocal}_${regKeyLocal}`,
          `${deptKeyLocal}_${regKeyLocal}`,
          `${deptKeyAlt}_${regKeyAlt}`,
          deptKeyLocal,
          deptKeyAlt
        ];

        const snaps = await Promise.all(
          candidateKeys.filter(Boolean).map(key => getDoc(doc(db, "syllabus_data", key)).catch(() => null))
        );
        let foundSyllabus = snaps.find(s => s && s.exists())?.data() || null;

        // Fallback: search all docs in syllabus_data
        if (!foundSyllabus) {
          try {
            const allSnap = await getDocs(collection(db, "syllabus_data"));
            const normDept = normCodeKey(department);
            allSnap.forEach((d) => {
              if (foundSyllabus) return;
              const data = d.data();
              const dDept = normCodeKey(data.department || d.id);
              if (dDept.includes(normDept) || normDept.includes(dDept)) {
                foundSyllabus = data;
              }
            });
          } catch (e) {
            console.debug("All syllabus scan skipped:", e);
          }
        }

        if (foundSyllabus) {
          setSyllabus(foundSyllabus);
          const semKeys = Object.keys(foundSyllabus.semesters || {}).sort((a, b) => Number(a) - Number(b));
          if (semKeys.length > 0) setSelectedSem(semKeys[0]);
        }
      } catch (err) {
        console.error("Error fetching syllabus:", err);
      }
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
    if (!subject) return;

    const rawCode = subject.code || subject.subjectCode || subject.courseCode || "";
    const rawName = subject.name || subject.subjectName || subject.courseName || "";
    const rawProg = studentData?.programme || syllabus?.programme || "";
    const rawDept = studentData?.department || syllabus?.department || "";
    const rawReg = syllabus?.regulation || studentData?.regulation || "2021";
    const cacheKey = `${sanitizeKey(rawProg)}_${sanitizeKey(rawDept)}_${sanitizeKey(rawReg)}_${sanitizeKey(rawCode)}`;

    // 1. Instant Cache Hit (0ms - zero lag on reopen)
    if (COURSE_CACHE.has(cacheKey)) {
      setSelectedCourse({
        ...subject,
        courseData: COURSE_CACHE.get(cacheKey)
      });
      setCourseLoading(false);
      return;
    }

    // 2. Immediate baseline modal render (opens instantly in 0ms)
    const baselineCourseData = {
      ...subject,
      code: rawCode,
      name: rawName,
      credits: subject.credits || 0,
      type: subject.type || "Theory",
      regulation: rawReg,
      periods: subject.periods || {
        l: Number(subject.l ?? subject.lecture ?? 0),
        t: Number(subject.t ?? subject.tutorial ?? 0),
        p: Number(subject.p ?? subject.practical ?? 0)
      },
      co: subject.co || subject.outcomes || [],
      units: subject.units || null,
      description: subject.description || ""
    };

    setSelectedCourse({
      ...subject,
      courseData: baselineCourseData
    });
    setCourseLoading(true);

    try {
      const progKeyLocal = sanitizeKey(rawProg);
      const progKeyAlt = sanitizeWithUnderscores(rawProg);
      const deptKeyLocal = sanitizeKey(rawDept);
      const deptKeyAlt = sanitizeWithUnderscores(rawDept);
      const regKey = sanitizeKey(rawReg);
      const codeKey = sanitizeKey(rawCode);

      // Candidate document IDs in courses collection
      const candidateCourseKeys = [
        `${progKeyLocal}_${deptKeyLocal}_${codeKey}`,
        `${progKeyAlt}_${deptKeyAlt}_${codeKey}`,
        `${progKeyLocal}_${deptKeyLocal}_${regKey}_${codeKey}`,
        `${progKeyAlt}_${deptKeyAlt}_${regKey}_${codeKey}`,
        `${deptKeyLocal}_${codeKey}`,
        `${deptKeyLocal}_${regKey}_${codeKey}`,
        `${progKeyLocal}_Overall_${codeKey}`,
        codeKey,
        rawCode
      ].filter(Boolean);

      // Fast parallel fetch for course document (1 network roundtrip instead of 12)
      const courseSnaps = await Promise.all(
        candidateCourseKeys.map(k => getDoc(doc(db, "courses", k)).catch(() => null))
      );
      const hitSnap = courseSnaps.find(s => s && s.exists());
      let courseDocData = hitSnap ? { ...hitSnap.data(), _id: hitSnap.id } : null;

      // Course Outcomes (COs) resolution
      let loadedCOs = [];
      if (courseDocData?.co && Array.isArray(courseDocData.co) && courseDocData.co.length > 0) {
        loadedCOs = courseDocData.co.map((c, i) => ({
          id: c.id || c.code || `CO${i + 1}`,
          description: c.description || (typeof c === "string" ? c : ""),
          domain: c.domain || "",
          level: c.level || "",
          content: c.content || ""
        }));
      } else {
        const candidateCOKeys = [
          `${deptKeyLocal}_${codeKey}`,
          `${deptKeyLocal}_${regKey}_${codeKey}`,
          `${progKeyLocal}_${deptKeyLocal}_${codeKey}`,
          `${progKeyLocal}_${deptKeyLocal}_${regKey}_${codeKey}`,
          codeKey,
          rawCode
        ].filter(Boolean);

        // Fast parallel fetch for course_outcomes
        const coSnaps = await Promise.all(
          candidateCOKeys.map(k => getDoc(doc(db, "course_outcomes", k)).catch(() => null))
        );
        const hitCo = coSnaps.find(s => s && s.exists());
        if (hitCo) {
          const coData = hitCo.data();
          if (Array.isArray(coData?.co)) {
            loadedCOs = coData.co.map((c, i) => ({
              id: c.id || c.code || `CO${i + 1}`,
              description: c.description || (typeof c === "string" ? c : ""),
              domain: c.domain || "",
              level: c.level || "",
              content: c.content || ""
            }));
          } else if (coData) {
            loadedCOs = Object.entries(coData)
              .filter(([k]) => k.toLowerCase().startsWith("co"))
              .map(([code, val]) => ({
                id: code,
                description: typeof val === "object" ? (val.description || "") : String(val || ""),
                domain: typeof val === "object" ? (val.domain || "") : "",
                level: typeof val === "object" ? (val.level || "") : "",
                content: typeof val === "object" ? (val.content || "") : ""
              }))
              .sort((a, b) => (parseInt(a.id.replace(/\D/g, "")) || 0) - (parseInt(b.id.replace(/\D/g, "")) || 0));
          }
        }

        // Check course_bank if still empty
        if (loadedCOs.length === 0) {
          try {
            const cbSnap = await getDoc(doc(db, "course_bank", codeKey));
            if (cbSnap.exists() && Array.isArray(cbSnap.data()?.co)) {
              loadedCOs = cbSnap.data().co.map((c, i) => ({
                id: c.id || c.code || `CO${i + 1}`,
                description: c.description || "",
                domain: c.domain || "",
                level: c.level || "",
                content: c.content || ""
              }));
            }
          } catch (_) {}
        }

        // Check subject.co or subject.outcomes from syllabus_data
        if (loadedCOs.length === 0 && (subject.co || subject.outcomes)) {
          const rawSubjectCOs = subject.co || subject.outcomes;
          if (Array.isArray(rawSubjectCOs)) {
            loadedCOs = rawSubjectCOs.map((c, i) => ({
              id: c.id || c.code || `CO${i + 1}`,
              description: c.description || (typeof c === "string" ? c : ""),
              domain: c.domain || "",
              level: c.level || "",
              content: c.content || ""
            }));
          }
        }
      }

      // L-T-P periods
      const periods = courseDocData?.periods || subject.periods || {
        l: Number(courseDocData?.l ?? subject.l ?? subject.lecture ?? 0),
        t: Number(courseDocData?.t ?? subject.t ?? subject.tutorial ?? 0),
        p: Number(courseDocData?.p ?? subject.p ?? subject.practical ?? 0)
      };

      const finalCourseData = {
        ...baselineCourseData,
        ...(courseDocData || {}),
        code: rawCode || courseDocData?.code || "",
        name: rawName || courseDocData?.name || baselineCourseData.name,
        credits: subject.credits ?? courseDocData?.credits ?? baselineCourseData.credits,
        type: subject.type || courseDocData?.type || "Theory",
        regulation: courseDocData?.regulation || rawReg || "2021",
        periods,
        co: loadedCOs.length > 0 ? loadedCOs : baselineCourseData.co,
        units: courseDocData?.units || subject.units || null,
        description: courseDocData?.description || subject.description || ""
      };

      // Store in memory cache for subsequent instant 0ms clicks
      COURSE_CACHE.set(cacheKey, finalCourseData);

      setSelectedCourse({
        ...subject,
        courseData: finalCourseData
      });
    } catch (err) {
      console.error("Error loading course details:", err);
    } finally {
      setCourseLoading(false);
    }
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
                            <td className="px-3 md:px-6 py-4 text-sm font-bold text-slate-700 font-mono">{sub.code || sub.subjectCode || '-'}</td>
                            <td className="px-3 md:px-6 py-4 text-sm font-bold text-slate-700">{sub.name || sub.subjectName || '-'}</td>
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
                    className={`text-left p-5 rounded-2xl border-2 transition-all ${selectedSem === sem
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs" onClick={closeCourseModal}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            {/* Fixed Header */}
            <div className="shrink-0 bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-t-3xl px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-blue-200 text-xs font-bold uppercase tracking-widest font-mono">
                  {selectedCourse.code || selectedCourse.courseData?.code || selectedCourse.subjectCode}
                </p>
                <h3 className="text-white font-bold text-xl mt-0.5">
                  {selectedCourse.name || selectedCourse.courseData?.name || selectedCourse.subjectName}
                </h3>
              </div>
              <button onClick={closeCourseModal} className="shrink-0 p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer">
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
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Credits</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">
                        {selectedCourse.courseData.credits ?? selectedCourse.credits ?? 0}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">
                        {selectedCourse.type || selectedCourse.courseData.type || 'Theory'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">L – T – P</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">
                        {selectedCourse.courseData.periods
                          ? `${selectedCourse.courseData.periods.l || 0} – ${selectedCourse.courseData.periods.t || 0} – ${selectedCourse.courseData.periods.p || 0}`
                          : '–'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-center border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regulation</p>
                      <p className="text-lg font-black text-[#120c7a] mt-0.5">
                        {selectedCourse.courseData.regulation || syllabus?.regulation || '2021'}
                      </p>
                    </div>
                  </div>

                  {/* Course Description if available */}
                  {selectedCourse.courseData.description && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                      <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider mb-1">Course Description</h4>
                      <p className="text-sm text-slate-600 leading-relaxed">{selectedCourse.courseData.description}</p>
                    </div>
                  )}

                  {/* Course Outcomes */}
                  {selectedCourse.courseData.co && selectedCourse.courseData.co.length > 0 ? (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Target size={16} className="text-[#120c7a]" />
                        <h4 className="font-bold text-sm text-slate-700">Course Outcomes</h4>
                      </div>
                      <div className="space-y-2.5">
                        {selectedCourse.courseData.co.map((co, i) => (
                          <div key={i} className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 transition-all">
                            <div className="flex items-start gap-3">
                              <span className="shrink-0 w-8 h-8 rounded-lg bg-[#120c7a] text-white text-xs font-bold flex items-center justify-center shadow-xs">
                                {co.id || `CO${i + 1}`}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-800 leading-snug">
                                  {co.description || 'Outcome description specified'}
                                </p>
                                {co.content && <p className="text-xs text-slate-600 mt-1.5 bg-white/70 rounded-md p-2 border border-blue-50">{co.content}</p>}
                                {(co.domain || co.level) && (
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {co.domain && (
                                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                                        {co.domain}
                                      </span>
                                    )}
                                    {co.level && (
                                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                                        Level: {co.level}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <BookText size={32} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-600">Course Outcomes & Detailed Syllabus</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                        Course outcomes and detailed unit breakdown for this subject are being updated by the department. Subject credits, category, and contact hours are confirmed as shown above.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle size={40} className="mx-auto text-amber-400 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Course details loading</p>
                  <p className="text-xs text-slate-400 mt-1">Please wait while the subject details are loaded.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
