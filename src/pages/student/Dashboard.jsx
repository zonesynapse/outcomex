import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { 
  GraduationCap, CheckCircle, BarChart3, Clock, Bell, 
  ArrowRight, BookOpen, FileText, CalendarDays, Library,
  Briefcase, IndianRupee, Loader2, AlertCircle, User
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
    { label: "Attendance", icon: CheckCircle, path: "/student/attendance", color: "bg-blue-500" },
    { label: "Marks", icon: BarChart3, path: "/student/marks", color: "bg-purple-500" },
    { label: "Timetable", icon: Clock, path: "/student/timetable", color: "bg-orange-500" },
    { label: "Syllabus", icon: BookOpen, path: "/student/syllabus", color: "bg-cyan-500" },
    { label: "Fee Details", icon: IndianRupee, path: "/student/fees", color: "bg-green-500" },
    { label: "Question Papers", icon: FileText, path: "/student/question-papers", color: "bg-rose-500" },
    { label: "Library", icon: Library, path: "/student/library", color: "bg-indigo-500" },
    { label: "Placement", icon: Briefcase, path: "/student/placement", color: "bg-teal-500" },
    { label: "Calendar", icon: CalendarDays, path: "/student/calendar", color: "bg-pink-500" },
    { label: "Profile", icon: User, path: "/student/profile", color: "bg-amber-500" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] rounded-2xl p-8 text-white mb-8 shadow-lg">
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
          <p className="text-xs text-zinc-500 mt-1">Today's Classes</p>
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
          <button key={link.path} onClick={() => navigate(link.path)} className="bg-white rounded-xl p-4 shadow-sm border border-zinc-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group">
            <div className={`w-10 h-10 rounded-lg ${link.color} bg-opacity-20 flex items-center justify-center mb-3 ${link.color.replace('bg-', 'bg-').replace('-500', '-100')}`}>
              <link.icon size={20} className={link.color.replace('bg-', 'text-')} />
            </div>
            <p className="text-sm font-semibold text-zinc-700">{link.label}</p>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 group-hover:text-blue-600 transition-colors">
              View <ArrowRight size={10} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}