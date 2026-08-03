import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { formatProgDisplay } from "../../lib/utils";
import {
  GraduationCap, CheckCircle, BarChart3, Clock, Bell,
  ArrowRight, BookOpen, FileText, CalendarDays, Library,
  Briefcase, IndianRupee, Loader2, User, ClipboardList, Download
} from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
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
          if (snap.exists()) setUserData(snap.data());
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
    const { regNo, programme, department, batch } = userData;
    if (!regNo || !programme || !department || !batch) { setAttLoading(false); return; }

    const fetchAttendance = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);
        const snapshot = await getDocs(collection(db, "attendance"));

        // Extract subject code from doc ID
        const extractSubjectCode = (docId) => {
          const p = docId.split('_');
          const batchIdx = p.findIndex(part => /^\d{4}-\d{4}$/.test(part));
          if (batchIdx >= 0 && batchIdx + 3 < p.length) return p.slice(batchIdx + 3).join('_').replace(/_(Sec-\w+)$/, '');
          return p.slice(4).join('_');
        };

        const rawEntries = [];
        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          if (!id.startsWith(`${progKey}_${deptKey}_${batchKey}`)) return;
          const data = docSnap.data();
          const records = data?.records;
          if (!records) return;

          const subjectCode = extractSubjectCode(id);

          Object.entries(records).forEach(([key, rec]) => {
            const rawH = rec?.students?.[regNo];
            if (rawH === undefined) return;

            const hours = typeof rawH === 'object' && rawH !== null ? (rawH.hours ?? 0) : rawH;
            const storedStatus = typeof rawH === 'object' && rawH !== null ? rawH.status : undefined;
            let status = 'A';
            if (storedStatus) {
              status = storedStatus;
            } else {
              if (hours > 0) status = 'P';
              else if (hours === -1 || rawH === 'OD' || (typeof rawH === 'object' && rawH?.hours === -1)) status = 'OD';
            }

            rawEntries.push({ recordKey: key, status, subjectCode, docId: id });
          });
        });

        // Filter by course enrollment (backward compat with old data)
        const uniqueEnrolKeys = new Set();
        const enrolKeyByDoc = {};
        rawEntries.forEach(e => {
          const p = e.docId.split('_');
          const batchIdx = p.findIndex(part => /^\d{4}-\d{4}$/.test(part));
          if (batchIdx < 0 || batchIdx + 3 >= p.length) return;
          const ayKey = p[batchIdx + 1];
          const semNum = p[batchIdx + 2];
          const ek = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(ayKey)}_${semNum}_${sanitizeKey(e.subjectCode)}`;
          enrolKeyByDoc[e.docId] = ek;
          uniqueEnrolKeys.add(ek);
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
          const ek = enrolKeyByDoc[e.docId];
          const enrolledSet = enrolMap[ek];
          if (!enrolledSet) return true;
          return enrolledSet.has(regNo);
        });

        const entriesByRecordKey = {};
        const subjectPresenceCount = {};
        filteredEntries.forEach(entry => {
          if (!entriesByRecordKey[entry.recordKey]) entriesByRecordKey[entry.recordKey] = [];
          entriesByRecordKey[entry.recordKey].push(entry);
          if (entry.status === 'P' || entry.status === 'OD') {
            subjectPresenceCount[entry.subjectCode] = (subjectPresenceCount[entry.subjectCode] || 0) + 1;
          }
        });

        let totalPresent = 0, totalClasses = 0;
        Object.values(entriesByRecordKey).forEach(group => {
          totalClasses++;
          const presentEntries = group.filter(e => e.status === 'P' || e.status === 'OD');
          if (presentEntries.length > 0) {
            totalPresent++;
          }
        });

        setAttendancePct(totalClasses > 0 ? (totalPresent / totalClasses) * 100 : null);
      } catch (err) { console.error(err); }
      setAttLoading(false);
    };

    fetchAttendance();
  }, [userData]);

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
        <div className="bg-white rounded-xl p-5 shadow-sm border border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <BarChart3 size={20} className="text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-800">--</p>
          <p className="text-xs text-zinc-500 mt-1">Upcoming Exams</p>
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