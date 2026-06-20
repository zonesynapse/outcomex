import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { 
  GraduationCap, CheckCircle, BarChart3, Clock, Bell, 
  ArrowRight, BookOpen, FileText, CalendarDays, Library,
  Briefcase, IndianRupee, Loader2, User, ClipboardList, Download
} from "lucide-react";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] rounded-2xl p-5 text-white mb-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center border border-white/30">
            <GraduationCap size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Welcome, {userData?.studentName || "Student"}</h1>
            <p className="text-blue-200 text-sm mt-1">
              {userData?.regNo} • {userData?.programme} • {userData?.department} • Batch {userData?.batch}
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
          <p className="text-2xl font-bold text-zinc-800">--</p>
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