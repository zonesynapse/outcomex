import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { 
  FileText, CheckCircle2, Settings2, LayoutDashboard, 
  User, LogOut, Menu, X, ChevronRight, Building2, 
  ShieldCheck, Award, Bell, GraduationCap, Users
} from "lucide-react";

export default function HRLayout({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const localStr = localStorage.getItem(`user_profile_${currentUser.uid}`);
        const localProfile = localStr ? JSON.parse(localStr) : null;

        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data());
          } else {
            setProfile(localProfile || {
              name: currentUser.displayName || currentUser.email.split("@")[0],
              email: currentUser.email,
              role: "Staff / Non-Teaching",
              institution: "CKSPK (Matric)"
            });
          }
        } catch (e) {
          console.warn("Firestore profile fetch notice:", e);
          setProfile(localProfile || {
            name: currentUser.displayName || currentUser.email.split("@")[0],
            email: currentUser.email,
            role: "Staff / Non-Teaching",
            institution: "CKSPK (Matric)"
          });
        }
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/auth");
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const userRole = profile?.role || "Staff / Non-Teaching";
  const normalizedRole = String(userRole).toLowerCase();
  
  const isCoordinator = normalizedRole.includes("coordinator");
  const isPrincipalHR = normalizedRole.includes("principal") || normalizedRole.includes("hr") || normalizedRole.includes("admin");

  let navItems = [];
  if (isCoordinator) {
    navItems = [
      { id: "coordinator-appraisal", label: "Coordinator Appraisal Request", path: "/coordinator-appraisal", icon: Award },
      { id: "appraisal-reviews", label: "Appraisal Reviews", path: "/reviews", icon: CheckCircle2 }
    ];
  } else if (isPrincipalHR) {
    navItems = [
      { id: "appraisal-reviews", label: "Appraisal Reviews", path: "/reviews", icon: CheckCircle2 },
      { id: "user-management", label: "User Management", path: "/users", icon: Users },
      { id: "appraisal-settings", label: "Appraisal Settings", path: "/settings", icon: Settings2 }
    ];
  } else {
    // Default: Staff / Non-Teaching / Teacher
    navItems = [
      { id: "teacher-appraisal", label: "Teacher Appraisal Request", path: "/teacher-appraisal", icon: GraduationCap },
      { id: "non-teaching-appraisal", label: "Non-Teaching Appraisal Request", path: "/non-teaching-appraisal", icon: FileText }
    ];
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white sticky top-0 z-40 px-4 py-3 flex items-center justify-between border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-600 rounded-xl">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-base font-heading text-slate-900">CK HR Portal</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:text-slate-900"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200/80 flex flex-col shadow-sm transition-transform duration-300 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Branding */}
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-md shadow-indigo-600/20">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg font-heading text-slate-900 leading-tight">HR Portal</h1>
            <p className="text-xs text-slate-500 font-medium">CK Group of Institutions</p>
          </div>
        </div>

        {/* User Pill Card */}
        {profile && (
          <div className="mx-4 mt-5 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
              {profile.name ? profile.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate">{profile.name || "User"}</div>
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="truncate">{profile.role || "Staff"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            HR Module Services
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/70"
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? "text-white" : "text-slate-500 group-hover:text-indigo-600"
                }`} />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-4 h-4 text-indigo-200" />}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out Footer */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen bg-slate-50">
        {/* Desktop Top Navbar */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">
              {profile?.institution || "CK Group"}
            </span>
            <span className="text-slate-800">•</span>
            <span className="text-sm font-medium text-slate-600">
              Human Resources Portal
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-bold text-slate-900">{profile?.name || user?.email}</div>
              <div className="text-xs text-slate-500 font-medium">{profile?.empId ? `Emp ID: ${profile.empId}` : user?.email}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : "U"}
            </div>
          </div>
        </header>

        {/* Page Content Container */}
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
