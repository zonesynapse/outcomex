import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  formatProgDisplay,
  formatProgrammeKey,
  getAcademicYears,
  calculateStudentAttendanceOverview,
  cleanStudentId,
  extractSubjectCodeFromDocId
} from "../../lib/utils";
import {
  GraduationCap, CheckCircle, BarChart3, Clock, Bell,
  ArrowRight, BookOpen, FileText, CalendarDays, Library,
  Briefcase, IndianRupee, Loader2, User, ClipboardList, Download
} from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const normKey = (key) => {
  if (!key) return '';
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
};

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attendancePct, setAttendancePct] = useState(null);
  const [attLoading, setAttLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            let uData = snap.data();
            const reg = uData.regNo || uData.registerNo || uData.rollNo || uData.admissionNo || '';
            if (reg && (!uData.programme || !uData.department || !uData.batch)) {
              try {
                const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
                if (idxSnap.exists()) {
                  const idxData = idxSnap.data();
                  uData = {
                    ...idxData,
                    ...uData,
                    programme: uData.programme || idxData.programme || idxData.degree || '',
                    department: uData.department || idxData.department || idxData.dept || idxData.branch || '',
                    batch: uData.batch || idxData.batch || idxData.batchYear || '',
                  };
                }
              } catch {
                // ignore
              }
            }
            setUserData(uData);
          }
        } catch (err) {
          console.error(err);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userData) return;
    const profData = userData._profile_data || {};
    const stuData = userData._student_data || {};

    const regNo = String(userData.regNo || userData.registerNo || userData.registerNumber || userData.rollNo || userData.admissionNo || profData.regNo || profData.registerNo || stuData.regNo || '').trim();
    const programme = String(userData.programme || userData.program || userData.degree || profData.programme || stuData.programme || '').trim();
    const department = String(userData.department || userData.dept || userData.branch || profData.department || stuData.department || '').trim();
    const batch = String(userData.batch || userData.batchYear || profData.batch || stuData.batch || '').trim();

    if (!regNo && !userData.email) {
      setAttendancePct(0);
      setAttLoading(false);
      return;
    }

    const studentIds = [
      regNo,
      userData.admissionNo, userData.admNo, userData.id, userData.registerNo, userData.registerNumber, userData.rollNo, userData.examNumber,
      profData.regNo, profData.admissionNo, profData.admNo,
      stuData.regNo, stuData.admissionNo, stuData.admNo
    ].filter(Boolean).map(x => String(x).trim());

    const fetchAttendance = async () => {
      try {
        const progKey = formatProgrammeKey(programme) || sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);

        const batchPrefix = (progKey && deptKey && batchKey) ? `${progKey}_${deptKey}_${batchKey}` : '';

        const [attSnapshot, assignSnap, studentsSnap] = await Promise.all([
          getDocs(collection(db, "attendance")),
          getDocs(collection(db, "subject_assignments")).catch(() => ({ forEach: () => { } })),
          (batchKey && progKey && deptKey) ? getDoc(doc(db, "students", `${batchKey}_${progKey}_${deptKey}`)).catch(() => null) : Promise.resolve(null),
        ]);

        const admissionNoForJoin = String(userData.admissionNo || userData.admNo || profData.admissionNo || stuData.admissionNo || '').trim();
        const joiningDate = userData.joiningDate ||
          userData._joiningDate ||
          studentsSnap?.data()?._joiningDate?.[regNo] ||
          (admissionNoForJoin ? studentsSnap?.data()?._joiningDate?.[admissionNoForJoin] : '') ||
          '';

        // Extract student aliases from students document so admissionNo/rollNo from earlier months match
        if (studentsSnap?.exists()) {
          const sData = studentsSnap.data();
          const targetClean = cleanStudentId(regNo || userData.admissionNo);
          Object.entries(sData).forEach(([k, v]) => {
            if (k.startsWith('_') || !v) return;
            const kClean = cleanStudentId(k);
            let vObj = typeof v === 'object' ? v : {};
            const vReg = cleanStudentId(vObj.regNo || vObj.reg || vObj.registerNo);
            const vAdm = cleanStudentId(vObj.admissionNo || vObj.admNo);
            if (kClean === targetClean || vReg === targetClean || vAdm === targetClean) {
              if (k) studentIds.push(String(k).trim());
              if (vObj.regNo) studentIds.push(String(vObj.regNo).trim());
              if (vObj.admissionNo) studentIds.push(String(vObj.admissionNo).trim());
              if (vObj.admNo) studentIds.push(String(vObj.admNo).trim());
              if (vObj.rollNo) studentIds.push(String(vObj.rollNo).trim());
            }
          });
        }

        const facultyUidMap = {};
        if (assignSnap && assignSnap.forEach) {
          assignSnap.forEach(d => {
            const dId = d.id;
            const matchBatch = dId.includes(batchKey) || dId.includes(sanitizeKey(batch));
            if (!matchBatch) return;
            const data = d.data();
            Object.entries(data).forEach(([uid, codes]) => {
              if (uid.startsWith('_') || !Array.isArray(codes)) return;
              codes.forEach(code => { if (!facultyUidMap[code]) facultyUidMap[code] = uid; });
            });
          });
        }

        // Filter attendance docs for this student's batch and department
        const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const batchNorm = norm(batch);
        const batchYearMatch = String(batch).match(/\d{4}\s*[-_]\s*\d{2,4}/);
        const bYear = batchYearMatch ? norm(batchYearMatch[0]) : '';
        const bStartYear = String(batch).match(/\b(20\d{2})\b/)?.[1] || '';
        const deptNorm = norm(department);
        const matchAcronym = department.match(/\(([^)]+)\)/);
        const deptAcronym = matchAcronym ? norm(matchAcronym[1]) : '';
        const words = department.replace(/^(B\.?Tech\.?|B\.?E\.?|M\.?E\.?|M\.?Tech\.?|MBA|MCA)\s+/i, '').split(/[\s&/_-]+/);
        const softAcronym = words.length > 1 ? norm(words.map(w => w[0]).join('')) : '';

        const matchedAttDocs = attSnapshot.docs.filter(docSnap => {
          const id = docSnap.id;
          const idNorm = norm(id);
          const hasBatch = idNorm.includes(batchNorm) || (bYear && idNorm.includes(bYear)) || (bStartYear && idNorm.includes(bStartYear));
          if (!hasBatch) return false;

          const dData = docSnap.data();
          const docDept = norm(dData._meta?.department || dData.department || '');
          const hasDept = !department ||
            idNorm.includes(deptNorm) ||
            (deptAcronym && idNorm.includes(deptAcronym)) ||
            (softAcronym && idNorm.includes(softAcronym)) ||
            (docDept && (docDept.includes(deptNorm) || deptNorm.includes(docDept))) ||
            (batchPrefix && id.startsWith(batchPrefix));

          return hasDept;
        });

        const uniqueEnrolKeys = new Set();
        matchedAttDocs.forEach((docSnap) => {
          const id = docSnap.id;
          const subjectCode = extractSubjectCodeFromDocId(id);
          const parts = id.split('_');
          const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
          if (batchIdx < 0 || batchIdx + 2 >= parts.length) return;
          const bKey = parts[batchIdx];
          const ayKey = parts[batchIdx + 1];
          const semNum = parts[batchIdx + 2];
          const enrolKey = `${progKey}_${deptKey}_${sanitizeKey(bKey)}_${sanitizeKey(ayKey)}_${semNum}_${sanitizeKey(subjectCode)}`;
          uniqueEnrolKeys.add(enrolKey);
        });

        const enrolMap = {};
        await Promise.all([...uniqueEnrolKeys].map(async (ek) => {
          try {
            const eSnap = await getDoc(doc(db, 'course_enrolments', ek));
            if (eSnap.exists()) {
              const eData = eSnap.data();
              enrolMap[ek] = new Set(Object.keys(eData).filter(k => eData[k]).map(cleanStudentId));
            }
          } catch {
            // enrollment doc may not exist
          }
        }));

        const studentSection = userData.section || userData.sec || profData.section || stuData.section || '';

        const overview = calculateStudentAttendanceOverview({
          attDocs: matchedAttDocs,
          enrolMap,
          studentIds,
          studentSection,
          joiningDate,
          facultyUidMap,
          facultyNames: {},
          subjectNames: {},
          maxPeriodsPerDay: 8
        });

        setAttendancePct(overview.overallPercentage);
      } catch (err) {
        console.error("[StudentDashboard] fetchAttendance error:", err);
        setAttendancePct(0);
      }
      setAttLoading(false);
    };

    fetchAttendance();
  }, [userData]);

  // Resolve the student's current Academic Year + Semester from their batch (mirrors Timetable.jsx)
  const currentContext = useMemo(() => {
    if (!userData?.batch) return { academicYear: "", semester: "" };
    const years = getAcademicYears(userData.batch);
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
  }, [userData]);

  const [approvedExamsCount, setApprovedExamsCount] = useState(0);

  useEffect(() => {
    if (!userData?.batch) return;
    const studentBatch = String(userData.batch).trim();
    const sanitizedStudentBatch = sanitizeKey(studentBatch);
    const studentProg = userData.programme ? String(userData.programme) : "";
    const studentDept = userData.department ? String(userData.department) : "";
    const studentProgNorm = studentProg ? normKey(studentProg) : "";
    const studentAyNorm = currentContext.academicYear ? normKey(currentContext.academicYear) : "";
    const studentDeptNorm = studentDept ? normKey(studentDept) : "";
    const studentSemNorm = currentContext.semester ? normKey(currentContext.semester) : "";

    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      let count = 0;
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d || !d.assignments) return;

        const docBatch = String(d.batch || "").trim();
        const docBatchSanitized = sanitizeKey(docBatch);

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
              count++;
            }
          });
        }
      });
      setApprovedExamsCount(count);
    }, (err) => {
      console.error("[StudentDashboard] Error reading approved IA schedules:", err);
      setApprovedExamsCount(0);
    });

    return () => unsub();
  }, [userData, currentContext]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-[#120c7a]" size={40} />
    </div>
  );

  if (!userData) return (
    <div className="min-h-screen flex items-center justify-center text-zinc-500">Please login to continue.</div>
  );

  const quickLinks = [
    { label: "My Profile", icon: User, path: "/student/profile", bgClass: "bg-teal-50 border border-teal-100 text-teal-600", hoverColor: "group-hover:text-teal-600" },
    { label: "Attendance", icon: CheckCircle, path: "/student/attendance", bgClass: "bg-emerald-50 border border-emerald-100 text-emerald-600", hoverColor: "group-hover:text-emerald-600" },
    { label: "Marks & Results", icon: BarChart3, path: "/student/marks", bgClass: "bg-indigo-50 border border-indigo-100 text-indigo-600", hoverColor: "group-hover:text-indigo-600" },
    { label: "Timetable", icon: Clock, path: "/student/timetable", bgClass: "bg-amber-50 border border-amber-100 text-amber-600", hoverColor: "group-hover:text-amber-600" },
    { label: "Fee Details", icon: IndianRupee, path: "/student/fees", bgClass: "bg-rose-50 border border-rose-100 text-rose-600", hoverColor: "group-hover:text-rose-600" },
    { label: "Syllabus", icon: BookOpen, path: "/student/syllabus", bgClass: "bg-cyan-50 border border-cyan-100 text-cyan-600", hoverColor: "group-hover:text-cyan-600" },
    { label: "Question Papers", icon: FileText, path: "/student/question-papers", bgClass: "bg-sky-50 border border-sky-100 text-sky-600", hoverColor: "group-hover:text-sky-600" },
    { label: "Academic Calendar", icon: CalendarDays, path: "/student/calendar", bgClass: "bg-pink-50 border border-pink-100 text-pink-600", hoverColor: "group-hover:text-pink-600" },
    { label: "Course Registration", icon: ClipboardList, path: "/student/courses", bgClass: "bg-violet-50 border border-violet-100 text-violet-600", hoverColor: "group-hover:text-violet-600" },
    { label: "Library", icon: Library, path: "/student/library", bgClass: "bg-fuchsia-50 border border-fuchsia-100 text-fuchsia-600", hoverColor: "group-hover:text-fuchsia-600" },
    { label: "Placement", icon: Briefcase, path: "/student/placement", bgClass: "bg-blue-50 border border-blue-100 text-blue-600", hoverColor: "group-hover:text-blue-600" },
    { label: "Downloads", icon: Download, path: "/student/downloads", bgClass: "bg-orange-50 border border-orange-100 text-orange-600", hoverColor: "group-hover:text-orange-600" },
    { label: "Notifications", icon: Bell, path: "/student/notices", bgClass: "bg-yellow-50 border border-yellow-100 text-yellow-600", hoverColor: "group-hover:text-yellow-600" },
  ];

  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
  ];
  const cleanDept = (dept) => {
    if (!dept) return '';
    let result = dept;
    for (const { key, display } of progPrefixMap) {
      const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
      if (regex.test(result)) {
        result = result.replace(regex, display + ' ');
        break;
      }
    }
    return result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] rounded-2xl p-4 md:p-5 text-white mb-6 shadow-lg">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/20 flex items-center justify-center border border-white/30 shrink-0">
            <GraduationCap size={28} className="md:hidden" />
            <GraduationCap size={32} className="hidden md:block" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold truncate">Welcome, {userData?.studentName || "Student"}</h1>
            <p className="text-blue-200 text-[11px] md:text-sm mt-1 truncate">
              {userData?.regNo} • {formatProgDisplay(userData?.programme)} • {cleanDept(userData?.department)} • Batch {userData?.batch}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <CheckCircle size={20} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-800">
            {attLoading ? (
              <Loader2 size={20} className="animate-spin inline" />
            ) : attendancePct !== null ? (
              `${attendancePct.toFixed(1)}%`
            ) : (
              '--'
            )}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Attendance %</p>
        </div>
        <div
          onClick={() => navigate("/student/timetable?tab=ia")}
          className="bg-white rounded-xl p-5 shadow-sm border border-zinc-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CalendarDays size={20} className="text-emerald-600" />
            </div>
            {approvedExamsCount > 0 && (
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Approved
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-800">{approvedExamsCount}</p>
          <p className="text-xs text-zinc-500 mt-1 flex items-center justify-between">
            Upcoming IA Exams <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock size={20} className="text-orange-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-800">--</p>
          <p className="text-xs text-zinc-500 mt-1">Today&apos;s Classes</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Bell size={20} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-800">--</p>
          <p className="text-xs text-zinc-500 mt-1">Notifications</p>
        </div>
      </div>

      {/* Quick Links */}
      <h2 className="text-lg font-bold text-zinc-700 mb-4">Quick Access</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickLinks.map((link) => (
          <button key={link.path} onClick={() => navigate(link.path)} className="bg-white rounded-xl p-4 shadow-sm border border-zinc-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group cursor-pointer">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${link.bgClass}`}>
              <link.icon size={20} />
            </div>
            <p className="text-sm font-semibold text-zinc-700">{link.label}</p>
            <div className={`flex items-center gap-1 mt-1 text-[10px] text-zinc-400 ${link.hoverColor} transition-colors`}>
              View <ArrowRight size={10} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}