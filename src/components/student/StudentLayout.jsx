import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, User, CheckCircle, BarChart3, Clock, IndianRupee,
  BookOpen, FileText, CalendarDays, ClipboardList, Library, Briefcase,
  Download, Bell, GraduationCap, Menu, X, ChevronRight, Edit, Check,
  Upload, Trash2
} from "lucide-react";

const studentMenuItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", path: "/student/dashboard" },
  { id: "profile", icon: User, label: "My Profile", path: "/student/profile" },
  { id: "attendance", icon: CheckCircle, label: "Attendance", path: "/student/attendance" },
  { id: "marks", icon: BarChart3, label: "Marks & Results", path: "/student/marks" },
  { id: "timetable", icon: Clock, label: "Timetable", path: "/student/timetable" },
  { id: "fees", icon: IndianRupee, label: "Fee Details", path: "/student/fees" },
  { id: "syllabus", icon: BookOpen, label: "Syllabus", path: "/student/syllabus" },
  { id: "qpapers", icon: FileText, label: "Question Papers", path: "/student/question-papers" },
  { id: "calendar", icon: CalendarDays, label: "Academic Calendar", path: "/student/calendar" },
  { id: "courses", icon: ClipboardList, label: "Course Registration", path: "/student/courses" },
  { id: "library", icon: Library, label: "Library", path: "/student/library" },
  { id: "placement", icon: Briefcase, label: "Placement", path: "/student/placement" },
  { id: "downloads", icon: Download, label: "Downloads", path: "/student/downloads" },
  { id: "notices", icon: Bell, label: "Notifications", path: "/student/notices" },
];

export default function StudentLayout({ children, title }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editData, setEditData] = useState({ signatureUrl: "" });
  const profileRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const unsubUser = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
          if (snap.exists()) setUserData(snap.data());
        });
        return () => unsubUser();
      } else {
        setUserData(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    try {
      const { setDoc } = await import("firebase/firestore");
      const { doc } = await import("firebase/firestore");
      await setDoc(doc(db, "users", user.uid), {
        signatureUrl: editData.signatureUrl === "CLEAR" ? "" : (editData.signatureUrl || userData?.signatureUrl || "")
      }, { merge: true });
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Update Profile Error:", error);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 102400) {
        alert("Signature image must be less than 100KB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditData(prev => ({ ...prev, signatureUrl: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f4f8] font-sans text-zinc-900">
      {/* Navbar */}
      <nav className="bg-gradient-to-r from-emerald-700 to-emerald-600 h-16 flex items-center px-4 md:px-6 sticky top-0 z-50 shadow-sm">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-emerald-600 rounded-lg text-white transition-colors">
          <Menu size={24} />
        </button>
        <h3 className="flex-grow text-center text-white text-xl font-bold tracking-tight uppercase">{title || "Student Portal"}</h3>
        <div className="relative" ref={profileRef}>
          <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-[42px] h-[42px] rounded-xl overflow-hidden flex items-center justify-center cursor-pointer border-2 border-white/20 bg-white/10 hover:bg-white/20 transition-all">
            <span className="font-bold text-sm text-white">
              {userData?.studentName ? userData.studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'S'}
            </span>
          </button>
          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl z-50 border border-zinc-100 overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-700 to-emerald-500 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center border border-white/30">
                    <span className="text-xl font-bold">
                      {userData?.studentName ? userData.studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'S'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold truncate">{userData?.studentName || "Student"}</h3>
                    <p className="text-emerald-100 text-xs mt-0.5">{userData?.regNo}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Programme</p>
                    <p className="text-sm font-semibold text-zinc-700">{userData?.programme || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Department</p>
                    <p className="text-sm font-semibold text-zinc-700">{userData?.department || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Batch</p>
                    <p className="text-sm font-semibold text-zinc-700">{userData?.batch || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Role</p>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                      Student
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm font-medium text-zinc-600 truncate">{userData?.email}</p>
                </div>
              </div>
              <div className="p-2 border-t border-zinc-100">
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                  <X size={18} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Sidebar Overlay */}
      <div className={`fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm transition-all duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-emerald-800 to-emerald-900 z-[70] transform transition-all duration-300 shadow-2xl overflow-y-auto ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-white/10">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GraduationCap size={28} className="text-emerald-300 shrink-0" />
            <span className="text-white font-bold text-lg truncate">Student Portal</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-lg shrink-0 transition-all">
            <X size={18} />
          </button>
        </div>
        <nav className="px-3 py-3 space-y-0.5">
          {studentMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.id} to={item.path} className={`relative flex items-center gap-3 w-full text-white px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium sidebar-link group ${isActive ? 'bg-white/15 text-white shadow-sm' : 'hover:bg-white/8 text-white/85'}`} onClick={() => setIsSidebarOpen(false)}>
                {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-400 rounded-r-full" />}
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${isActive ? 'bg-emerald-500/30' : 'bg-white/8 group-hover:bg-white/15'}`}>
                  <item.icon size={16} className={isActive ? 'text-emerald-300' : 'text-white/80'} />
                </span>
                <span className="flex-grow truncate">{item.label}</span>
              </Link>
            );
          })}
          <div className="h-4" />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="transition-all duration-300">
        {children}
      </main>
    </div>
  );
}