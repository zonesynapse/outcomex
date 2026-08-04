import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection, getDocs, updateDoc } from "firebase/firestore";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { formatProgDisplay } from "../../lib/utils";
import { 
  LayoutDashboard, User, CheckCircle, BarChart3, Clock, IndianRupee,
  BookOpen, FileText, CalendarDays, ClipboardList, Library, Briefcase,
  Download, Bell, Menu, X, Award, Users, Megaphone, Globe, Building2
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
  { id: "step", icon: Award, label: "STEP Activity Points", path: "/student/step" },
  { id: "mentor", icon: Users, label: "My Mentor", path: "/student/mentor" },
  { id: "downloads", icon: Download, label: "Downloads", path: "/student/downloads" },
  { id: "notices", icon: Bell, label: "Notifications", path: "/student/notices" },
  { id: "circulars", icon: Megaphone, label: "Circulars", path: "/student/circulars" },
];

export default function StudentLayout({ children, title }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNoticesOpen, setIsNoticesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [userData, setUserData] = useState(null);
  const [approvedCirculars, setApprovedCirculars] = useState([]);
  const [circularPopup, setCircularPopup] = useState({ open: false, circular: null });
  const [viewedCirculars, setViewedCirculars] = useState(new Set());
  const noticesRef = useRef(null);
  const profileRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const unsubUser = onSnapshot(doc(db, "users", currentUser.uid), async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserData(data);

            if (data.role === "Student" && data.regNo && (!data.studentName || data.studentName === "" || !data.department || data.department === "unknown" || data.department === "")) {
              try {
                const studentsSnap = await getDocs(collection(db, "students"));
                let foundName = "";
                let foundBatch = "";
                let foundProg = "";
                let foundDept = "";

                for (const docSnap of studentsSnap.docs) {
                  const sData = docSnap.data();
                  if (sData[data.regNo]) {
                     const raw = sData[data.regNo];
                     foundName = (raw !== null && typeof raw === 'object') ? (raw.name || '') : String(raw);
                     
                     const meta = sData._meta || {};
                     if (meta.department && meta.batch && meta.programme_name) {
                       foundDept = meta.department;
                       foundBatch = meta.batch;
                       foundProg = meta.programme_name;
                     } else {
                       const id = docSnap.id;
                       const firstUnderscoreIdx = id.indexOf("_");
                       if (firstUnderscoreIdx !== -1) {
                         foundBatch = id.substring(0, firstUnderscoreIdx);
                         const remaining = id.substring(firstUnderscoreIdx + 1);

                         if (remaining.startsWith("B_Tech_")) {
                           foundProg = "B_Tech";
                           const rest = remaining.substring(7);
                           const nextParts = rest.split("_");
                           foundDept = nextParts[0] || "unknown";
                         } else if (remaining.startsWith("B_E_")) {
                           foundProg = "B_E";
                           const rest = remaining.substring(4);
                           const nextParts = rest.split("_");
                           foundDept = nextParts[0] || "unknown";
                         } else if (remaining.startsWith("M_Tech_")) {
                           foundProg = "M_Tech";
                           const rest = remaining.substring(7);
                           const nextParts = rest.split("_");
                           foundDept = nextParts[0] || "unknown";
                         } else if (remaining.startsWith("M_E_")) {
                           foundProg = "M_E";
                           const rest = remaining.substring(4);
                           const nextParts = rest.split("_");
                           foundDept = nextParts[0] || "unknown";
                         } else {
                           const nextParts = remaining.split("_");
                           foundProg = nextParts[0] || "unknown";
                           foundDept = nextParts[1] || "unknown";
                         }
                       }
                     }
                     break;
                  }
                }

                if (foundName) {
                  await updateDoc(doc(db, "users", currentUser.uid), {
                    studentName: foundName,
                    displayName: foundName,
                    programme: foundProg || data.programme,
                    department: foundDept !== "unknown" ? foundDept : data.department,
                    batch: foundBatch || data.batch
                  });
                }
              } catch (err) {
                console.error("Error auto-fetching student details on login:", err);
              }
            }
          }
        });
        return () => unsubUser();
      } else {
        setUserData(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    // Fetch notices for notification counter & dropdown
    const unsubNotices = onSnapshot(collection(db, "notices"), (snapshot) => {
      if (!snapshot.empty) {
        const fetched = [];
        snapshot.forEach((docSnap) => {
          fetched.push({ id: docSnap.id, ...docSnap.data() });
        });
        fetched.sort((a, b) => new Date(b.date || b.createdAt || Date.now()) - new Date(a.date || a.createdAt || Date.now()));
        setNotices(fetched);
      } else {
        onSnapshot(doc(db, "info_configuration", "notices"), (configSnap) => {
          if (configSnap.exists()) {
            const data = configSnap.data();
            const items = data.items || data.notices || [];
            const parsed = items.map((item, i) => ({
              id: `config_${i}`,
              title: item.title || item.heading || "",
              description: item.description || item.content || "",
              date: item.date || item.createdAt || new Date().toISOString(),
            }));
            parsed.sort((a, b) => new Date(b.date) - new Date(a.date));
            setNotices(parsed);
          } else {
            setNotices([
              {
                id: "sample_1",
                title: "End Semester Exam Schedule Released",
                description: "The timetable for end semester examinations has been published. Check the exam section for details.",
                date: new Date().toISOString(),
              },
              {
                id: "sample_2",
                title: "Library Holiday Notice",
                description: "The library will remain closed on public holidays. Kindly plan your visits accordingly.",
                date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              }
            ]);
          }
        });
      }
    });
    return () => unsubNotices();
  }, []);

  // Fetch approved circulars
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "circulars"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === "Approved") {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => {
        const da = a.principalApprovedAt || a.createdAt || "";
        const db = b.principalApprovedAt || b.createdAt || "";
        return db.localeCompare(da);
      });
      setApprovedCirculars(list);
    });
    return () => unsub();
  }, []);

  // Show popup for unread approved circulars
  useEffect(() => {
    const uid = userData?.uid;
    if (!uid) return;
    const unviewed = approvedCirculars.filter(c => !c.viewedBy?.[uid]);
    if (unviewed.length > 0 && !circularPopup.open) {
      setCircularPopup({ open: true, circular: unviewed[0] });
    }
  }, [approvedCirculars, userData]);

  const markCircularViewed = async (circId) => {
    if (!userData?.uid) return;
    try {
      await updateDoc(doc(db, "circulars", circId), {
        [`viewedBy.${userData.uid}`]: new Date().toISOString()
      });
    } catch (e) { /* ignore */ }
  };

  const dismissCircularPopup = () => {
    if (circularPopup.circular) {
      markCircularViewed(circularPopup.circular.id);
    }
    setCircularPopup({ open: false, circular: null });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (noticesRef.current && !noticesRef.current.contains(event.target)) {
        setIsNoticesOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
  ];
  const displayDept = (v) => {
    if (typeof v !== 'string') return v || '--';
    let result = v;
    for (const { key, display } of progPrefixMap) {
      const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
      if (regex.test(result)) {
        result = result.replace(regex, display + ' ');
        break;
      }
    }
    return result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f4f8] font-sans text-zinc-900">
      {/* Navbar */}
      <nav className="bg-gradient-to-r from-[#120c7a] to-[#15108a] h-16 flex items-center px-4 md:px-6 sticky top-0 z-50 shadow-sm border-b border-white/10">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-blue-600 rounded-lg text-white transition-colors">
          <Menu size={24} />
        </button>
        <h3 className="flex-grow text-center text-white text-xl font-bold tracking-tight uppercase">{title || "Student Portal"}</h3>
        <div className="flex items-center gap-3">
          {/* Circulars Bell */}
          <div className="relative">
            <button
              onClick={() => navigate("/student/circulars")}
              className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border-2 border-white/20 bg-white/10 hover:bg-white/20 text-white transition-all relative"
              title="Circulars"
            >
              <Megaphone size={20} />
              {(() => {
                const uid = userData?.uid;
                if (!uid) return null;
                const unviewed = approvedCirculars.filter(c => !c.viewedBy?.[uid]);
                return unviewed.length > 0 ? (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-[#120c7a]">
                    {unviewed.length > 9 ? '9+' : unviewed.length}
                  </span>
                ) : null;
              })()}
            </button>
          </div>

          {/* Notifications Bell Dropdown */}
          <div className="relative" ref={noticesRef}>
            <button 
              onClick={() => setIsNoticesOpen(!isNoticesOpen)} 
              className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border-2 border-white/20 bg-white/10 hover:bg-white/20 text-white transition-all relative"
              title="Notifications"
            >
              <Bell size={20} />
              {notices.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-[#120c7a] animate-pulse" />
              )}
            </button>

            {isNoticesOpen && (
              <div className="absolute right-0 mt-3 w-72 sm:w-96 bg-white rounded-2xl shadow-2xl z-50 border border-zinc-100 overflow-hidden text-zinc-800">
                <div className="bg-gradient-to-br from-[#120c7a] to-blue-800 p-4 text-white flex items-center justify-between">
                  <h4 className="font-bold text-sm font-sans">Notifications</h4>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                    {notices.length} New
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 custom-scrollbar">
                  {notices.length === 0 ? (
                    <div className="p-8 text-center text-zinc-450">
                      <Bell size={28} className="mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-semibold">No notifications yet.</p>
                    </div>
                  ) : (
                    notices.slice(0, 5).map((notice) => (
                      <div 
                        key={notice.id} 
                        onClick={() => {
                          setIsNoticesOpen(false);
                          navigate("/student/notices");
                        }}
                        className="p-4 hover:bg-zinc-50 transition-colors cursor-pointer text-left"
                      >
                        <h5 className="font-bold text-xs text-zinc-800 line-clamp-1">{notice.title}</h5>
                        <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">
                          {notice.description}
                        </p>
                        <span className="text-[9px] text-zinc-400 block mt-2 font-semibold">
                          {notice.date ? new Date(notice.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short"
                          }) : "Recent"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-2.5 bg-zinc-50 border-t border-zinc-100 text-center">
                  <button 
                    onClick={() => {
                      setIsNoticesOpen(false);
                      navigate("/student/notices");
                    }} 
                    className="text-xs font-bold text-[#120c7a] hover:text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    View All Notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-[42px] h-[42px] rounded-xl overflow-hidden flex items-center justify-center border-2 border-white/20 bg-white/10 hover:bg-white/20 transition-all"
              title="My Profile"
            >
              {userData?.photoURL ? (
                <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold text-sm text-white">
                  {userData?.studentName ? userData.studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'S'}
                </span>
              )}
            </button>
            {isProfileOpen && (
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl z-50 border border-zinc-100 overflow-hidden text-zinc-800">
                <div className="bg-gradient-to-br from-[#120c7a] to-blue-800 p-4 text-white relative">
                  <p className="font-bold text-sm">{userData?.studentName || 'Student'}</p>
                  <p className="text-[11px] text-white/70 mt-1">{displayDept(userData?.department)}</p>
                  <p className="text-[11px] text-white/50">{userData?.regNo || ''}</p>
                  <button
                    onClick={() => { setIsProfileOpen(false); navigate("/student/profile"); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-white/20 transition-all text-white/70 hover:text-white"
                    title="Edit Profile"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 transition-all text-sm font-bold text-red-600"
                  >
                    <X size={16} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Sidebar Overlay */}
      <div className={`fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm transition-all duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-[#120c7a] via-[#120c7a] to-[#0d075a] z-[70] transform transition-all duration-300 shadow-2xl overflow-y-auto sidebar-scrollbar no-print ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <img 
              src="https://ckcet.edu.in/images/uploads/logo-1765369701693967650f8f6.png" 
              alt="CKCET" 
              className="w-full h-auto rounded-lg bg-white/90 p-1"
              referrerPolicy="no-referrer"
            />
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-lg shrink-0 transition-all">
            <X size={18} />
          </button>
        </div>
        <nav className="px-3 py-3 space-y-0.5">
          {studentMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.id} to={item.path} style={{textDecoration:'none'}} className={`no-underline relative flex items-center gap-3 w-full text-white px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium sidebar-link group ${isActive ? 'bg-white/15 text-white shadow-sm' : 'hover:bg-white/8 text-white/85'}`} onClick={() => setIsSidebarOpen(false)}>
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${isActive ? 'bg-white/20' : 'bg-white/8 group-hover:bg-white/15'}`}>
                  <item.icon size={16} className={isActive ? 'text-white' : 'text-white/80'} />
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

      {/* Circular Popup Modal */}
      {circularPopup.open && circularPopup.circular && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={dismissCircularPopup} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 overflow-hidden mx-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-white/20">
                    <Megaphone size={16} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-blue-200 uppercase tracking-wider">New Circular</span>
                </div>
                <button onClick={dismissCircularPopup} className="p-1 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <h3 className="text-base font-bold text-white mt-2 pr-8">{circularPopup.circular.title}</h3>
              <p className="text-[11px] text-blue-200 mt-1 flex items-center gap-1">
                {circularPopup.circular.type === "institution" ? <Globe size={11} /> : <Building2 size={11} />}
                {circularPopup.circular.type === "institution" ? "Institution Level" : circularPopup.circular.department || "Department"}
                <span className="mx-1.5">•</span>
                {new Date(circularPopup.circular.principalApprovedAt || circularPopup.circular.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <div className="px-5 py-4 max-h-[50vh] overflow-y-auto">
              <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                {circularPopup.circular.content}
              </div>
            </div>
            <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
              <button
                onClick={() => { dismissCircularPopup(); navigate("/student/circulars"); }}
                className="text-xs font-semibold text-[#120c7a] hover:underline"
              >
                View All Circulars
              </button>
              <button
                onClick={dismissCircularPopup}
                className="px-4 py-2 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-[#0e095e] transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}