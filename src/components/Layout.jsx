import { useState, useEffect, useRef } from "react";
import { auth, rtdb } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { ref, get, set, onValue } from "firebase/database";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { formatProgDisplay } from "../lib/utils";
import { 
  X, 
  Menu,
  Upload,
  FileText,
  BookOpen,
  Target,
  Settings2,
  Database,
  LayoutDashboard,
  BrainCircuit,
  User,
  Users,
  Edit,
  Check,
  ChevronRight,
  Network,
  BarChart3,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronDown,
  Trash2
} from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";

// All possible menu items with their IDs
const allPossibleItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { id: "faculty-dashboard", icon: LayoutDashboard, label: "Faculty Dashboard", path: "/faculty-dashboard" },
  { id: "hod-dashboard", icon: LayoutDashboard, label: "HOD Dashboard", path: "/hod-dashboard" },
  { id: "course-bank", icon: BookOpen, label: "Course Bank", path: "/course-bank" },
  { id: "admin-roles", icon: User, label: "Admin Role Config", path: "/admin-roles" },
  { id: "info-configuration", icon: Settings2, label: "Info Configuration", path: "/info-configuration" },
  { id: "curriculum", icon: BookOpen, label: "General Config", path: "/curriculum" },
  { id: "blooms-taxonomy", icon: BrainCircuit, label: "Bloom's Taxonomy", path: "/blooms-taxonomy" },
  { id: "hod-role-configuration", icon: Users, label: "Faculty Course Allocation", path: "/hod-role-configuration" },
  { id: "po_and_pso_configuration", icon: Settings2, label: "PO's Configuration", path: "/po_and_pso_configuration" },
  { id: "upload", icon: Upload, label: "Student Namelist and Curriculum", path: "/upload" },
  { id: "cia-configuration", icon: Settings2, label: "CIA Configuration", path: "/cia-configuration" },
  { id: "course-enrolment", icon: Users, label: "Course Enrolment", path: "/course-enrolment" },
  { id: "vision_and_mission", icon: Target, label: "Vision and Mission", path: "/vision_and_mission" },
  { id: "academic-calendar", icon: Calendar, label: "Academic Calendar", path: "/academic-calendar" },
  { id: "attendance", icon: CheckCircle2, label: "Attendance", path: "/attendance" },
  { id: "timetable", icon: Clock, label: "Time Table", path: "/tt" },
  { id: "regulation-formation", icon: Settings2, label: "Regulation Formation", path: "/regulation-formation" },
  { id: "co-po", icon: Network, label: "CO-PO Mapping", path: "/co-po" },
  { id: "po-attainment", icon: BarChart3, label: "PO Calculation & Attainment", path: "/po-attainment" },
  { id: "co_configuration", icon: Database, label: "CO Configuration", path: "/co_configuration" },
  { id: "questionpaper", icon: BookOpen, label: "Question Paper Generator", path: "/question-paper-generator" },
  { id: "markk", icon: FileText, label: "Marks Entry", path: "/markk" }
];

const modules = [
  {
    id: "obe",
    label: "OBE",
    icon: Target,
    itemIds: ["co_configuration", "po_and_pso_configuration", "co-po", "po-attainment", "vision_and_mission", "blooms-taxonomy"]
  },
  {
    id: "ia",
    label: "IA",
    icon: Network,
    itemIds: ["questionpaper", "markk"]
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    itemIds: ["academic-calendar", "attendance", "timetable", "course-bank", "curriculum", "course-enrolment", "hod-role-configuration", "upload"]
  },
  {
    id: "config",
    label: "Config",
    icon: Settings2,
    itemIds: ["info-configuration", "regulation-formation", "admin-roles"]
  }
];

export default function Layout({ children, title }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [facultyPermissions, setFacultyPermissions] = useState(null);
  const [hasAssignments, setHasAssignments] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editData, setEditData] = useState({ programme: "", department: "", signatureUrl: "" });
  const { departments: allDepartments } = useDepartments();
  const profileRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedModules, setExpandedModules] = useState({});

  useEffect(() => {
    // Automatically expand the module containing the active path
    const activeModule = modules.find(m => 
      m.itemIds.some(id => {
        const item = allPossibleItems.find(i => i.id === id);
        return item && location.pathname === item.path;
      })
    );
    if (activeModule) {
      setExpandedModules(prev => {
        if (prev[activeModule.id]) return prev;
        return { ...prev, [activeModule.id]: true };
      });
    }
  }, [location.pathname]);

  const toggleModule = (moduleId) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  useEffect(() => {
    let unsubscribeUser = () => {};
    let unsubscribePerms = () => {};
    let unsubscribeFacultyPerms = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Use onValue for real-time user data updates (including role changes)
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        unsubscribeUser = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setUserData(data);
            setUserRole(data.role);

            // Use onValue for real-time permission updates
            const permsRef = ref(rtdb, `role_permissions/${data.role}`);
            unsubscribePerms(); // Unsubscribe from previous role permissions if any
            unsubscribePerms = onValue(permsRef, (permsSnap) => {
              if (permsSnap.exists()) {
                const permsData = permsSnap.val();
                let permsArray = [];
                if (Array.isArray(permsData)) {
                  permsArray = permsData;
                } else if (typeof permsData === 'object' && permsData !== null) {
                  permsArray = Object.values(permsData);
                }
                setRolePermissions(permsArray);
              } else {
                setRolePermissions(null);
              }
            });

            if (data.role === 'HOD') {
              const assignmentsRef = ref(rtdb, 'subject_assignments');
              get(assignmentsRef).then(assignmentsSnap => {
                if (assignmentsSnap.exists()) {
                  const allAssignments = assignmentsSnap.val();
                  const checkAssignments = (obj) => {
                    if (!obj || typeof obj !== 'object') return false;
                    if (obj[currentUser.uid]) return true;
                    return Object.values(obj).some(val => typeof val === 'object' && checkAssignments(val));
                  };
                  setHasAssignments(checkAssignments(allAssignments));
                } else {
                  setHasAssignments(false);
                }
              }).catch(() => setHasAssignments(false));
            } else {
              setHasAssignments(false);
            }

          }
        });
      } else {
        setUserRole(null);
        setUserData(null);
        setRolePermissions(null);
        setFacultyPermissions(null);
        setHasAssignments(false);
        unsubscribeUser();
        unsubscribePerms();
        unsubscribeFacultyPerms();
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
      unsubscribePerms();
      unsubscribeFacultyPerms();
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};

    if (userRole === 'HOD' && hasAssignments) {
      const facultyPermsRef = ref(rtdb, 'role_permissions/Faculty');
      unsubscribe = onValue(facultyPermsRef, (permsSnap) => {
        if (permsSnap.exists()) {
          const permsData = permsSnap.val();
          setFacultyPermissions(Array.isArray(permsData) ? permsData : (typeof permsData === 'object' && permsData !== null ? Object.values(permsData) : []));
        } else {
          setFacultyPermissions([]);
        }
      });
    } else {
      setFacultyPermissions(null);
    }

    return () => unsubscribe();
  }, [userRole, hasAssignments]);

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
      const userRef = ref(rtdb, `users/${user.uid}`);
      await set(userRef, {
        ...userData,
        programme: editData.programme,
        department: editData.department,
        signatureUrl: editData.signatureUrl === "CLEAR" ? "" : (editData.signatureUrl || userData?.signatureUrl || "")
      });
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Update Profile Error:", error);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 102400) { // limit 100KB for base64 storage
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

  const menuItems = [];

  const effectivePermissions = (() => {
    if (rolePermissions === null) return null;
    if (userRole === 'HOD' && hasAssignments) {
      const merged = new Set([...(rolePermissions || []), ...(facultyPermissions || [])]);
      return Array.from(merged);
    }
    return rolePermissions || [];
  })();

  if (effectivePermissions !== null) {
    // Dynamic items based on Admin configuration
    allPossibleItems.forEach(item => {
      if (effectivePermissions.includes(item.id)) {
        menuItems.push(item);
      }
    });
  } else {
    // Permissions not loaded yet; keep sidebar empty until admin-defined permissions arrive.
  }

  // Deduplicate menu items by path
  const uniqueMenuItems = [];
  const seenPaths = new Set();
  for (const item of menuItems) {
    if (!seenPaths.has(item.path)) {
      uniqueMenuItems.push(item);
      seenPaths.add(item.path);
    }
  }

  // Group items into modules and identify global items
  const moduleGroups = modules.map(m => ({
    ...m,
    items: uniqueMenuItems.filter(item => m.itemIds.includes(item.id))
  })).filter(m => m.items.length > 0);

  const globalItems = uniqueMenuItems.filter(item => 
    !modules.some(m => m.itemIds.includes(item.id))
  );

  return (
    <div className="min-h-screen bg-[#f0f0fa] font-sans text-zinc-900">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .sidebar-link {
          text-decoration: none !important;
        }
        .profile-trigger {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 2px solid rgba(255, 255, 255, 0.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
        }
        .profile-trigger:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .profile-initials {
          font-weight: 700;
          font-size: 16px;
          color: white;
          letter-spacing: 0.5px;
        }
      `}</style>

      {/* Navbar */}
      <nav className="bg-[#120c7a] h-16 flex items-center px-4 md:px-6 sticky top-0 z-50 shadow-md no-print">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-blue-600 rounded-lg text-white transition-colors"
        >
          <Menu size={24} />
        </button>
        <h1 className="flex-grow text-center text-white text-xl font-bold tracking-wide">{title}</h1>
        
        <div className="relative" ref={profileRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="profile-trigger"
          >
            <span className="profile-initials">
              {userData?.facultyName ? userData.facultyName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U'}
            </span>
          </button>
          
          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl py-0 z-50 border border-zinc-100 overflow-hidden animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="bg-gradient-to-br from-[#120c7a] to-blue-800 p-6 text-white">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-lg">
                    <span className="text-2xl font-bold">
                      {userData?.facultyName ? userData.facultyName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold truncate leading-tight">
                      {userData?.title} {userData?.facultyName}
                    </h3>
                    <p className="text-blue-100 text-xs font-medium mt-1 opacity-90">
                      {userData?.designation} • {userData?.department}
                    </p>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="p-4 space-y-4 bg-zinc-50/50">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Academic Details</p>
                  <button 
                    onClick={() => {
                      if (!isEditingProfile) {
                        setEditData({ 
                          programme: userData?.programme || "", 
                          department: userData?.department || "",
                          signatureUrl: userData?.signatureUrl || ""
                        });
                      }
                      setIsEditingProfile(!isEditingProfile);
                    }}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {isEditingProfile ? <X size={14} /> : <Edit size={14} />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Faculty ID</p>
                    <p className="text-sm font-semibold text-zinc-700">{userData?.facultyId || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Joining Date</p>
                    <p className="text-sm font-semibold text-zinc-700">{userData?.dateOfJoining || 'N/A'}</p>
                  </div>
                  
                  {isEditingProfile ? (
                    <>
                      <div className="col-span-2 space-y-2">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Programme</p>
                          <select 
                            className="w-full text-xs p-1.5 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                            value={editData.programme}
                            onChange={(e) => setEditData({ ...editData, programme: e.target.value, department: "" })}
                          >
                            <option value="">Select Programme</option>
                            {Object.keys(allDepartments).map(prog => (
                              <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Department</p>
                          <select 
                            className="w-full text-xs p-1.5 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                            value={editData.department}
                            onChange={(e) => setEditData({ ...editData, department: e.target.value })}
                            disabled={!editData.programme}
                          >
                            <option value="">Select Department</option>
                            {editData.programme && allDepartments[editData.programme]?.map(dept => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                          </select>
                        </div>
                        <button 
                          onClick={handleUpdateProfile}
                          className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Check size={14} /> Save Changes
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Programme</p>
                        <p className="text-sm font-semibold text-zinc-700">{formatProgDisplay(userData?.programme) || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">System Role</p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          userData?.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 
                          userData?.role === 'HOD' ? 'bg-blue-100 text-blue-700' : 
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {userData?.role || 'User'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Digital Signature</p>
                  {isEditingProfile ? (
                    <div className="space-y-2">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                      />
                      <div 
                        onClick={() => fileInputRef.current.click()}
                        className="border-2 border-dashed border-zinc-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
                      >
                        {(editData.signatureUrl === "CLEAR" ? "" : (editData.signatureUrl || userData?.signatureUrl)) ? (
                          <div className="relative group/sig">
                            <img src={editData.signatureUrl === "CLEAR" ? "" : (editData.signatureUrl || userData?.signatureUrl)} alt="Signature Preview" className="h-12 object-contain" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/sig:opacity-100 transition-opacity rounded">
                              <Upload size={14} className="text-white" />
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditData(prev => ({ ...prev, signatureUrl: "CLEAR" })); 
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors shadow-lg z-10"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ) : (
                          <div className="text-zinc-400 group-hover:text-blue-500 flex flex-col items-center">
                            <Upload size={20} />
                            <span className="text-[10px] font-medium mt-1">Upload Signature</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[8px] text-zinc-400 text-center italic">Max size: 100KB, PNG with transparent background recommended</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl p-3 border border-zinc-100 flex items-center justify-center min-h-[60px] shadow-sm">
                      {userData?.signatureUrl ? (
                        <img src={userData.signatureUrl} alt="Signature" className="max-h-12 object-contain" />
                      ) : (
                        <div className="flex flex-col items-center gap-1 opacity-40">
                          <Edit size={16} className="text-zinc-400" />
                          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-tighter italic">Pending Upload</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Email Address</p>
                  <p className="text-sm font-medium text-zinc-600 truncate">{userData?.email}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-2 bg-white border-t border-zinc-100">
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <X size={18} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-[#120c7a] z-[70] transform transition-transform duration-300 ease-in-out shadow-2xl overflow-y-auto scrollbar-hide no-print ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 flex justify-between items-center border-b border-blue-400/30">
          <div className="flex-grow pr-2">
            <img 
              src="https://ckcet.edu.in/images/uploads/logo-1765369701693967650f8f6.png" 
              alt="CKCET Logo" 
              className="w-full h-auto rounded-lg bg-white p-1"
              referrerPolicy="no-referrer"
            />
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-white hover:bg-blue-600 p-1 rounded-lg shrink-0">
            <X size={24} />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {/* Global Items */}
          {globalItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.label}
                to={item.path}
                className={`flex items-center gap-3 w-full text-white px-4 py-3 rounded-xl transition-colors text-sm font-medium sidebar-link ${isActive ? 'bg-blue-700 shadow-inner' : 'hover:bg-blue-700'}`}
                onClick={() => setIsSidebarOpen(false)}
              >
                <item.icon size={18} />
                <span className="flex-grow">{item.label}</span>
                {isActive && <ChevronRight size={14} className="opacity-50" />}
              </Link>
            );
          })}

          {/* Module Based Groups */}
          {moduleGroups.map((module) => (
            <div key={module.id} className="space-y-1">
              <button
                onClick={() => toggleModule(module.id)}
                className={`flex items-center gap-3 w-full text-white px-4 py-3 rounded-xl transition-colors text-sm font-bold uppercase tracking-wider hover:bg-blue-700/50 ${expandedModules[module.id] ? 'bg-blue-800/40' : ''}`}
              >
                <module.icon size={18} className="text-white" />
                <span className="flex-grow text-left">{module.label}</span>
                {expandedModules[module.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              {expandedModules[module.id] && (
                <div className="ml-4 pl-4 border-l border-blue-400/20 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  {module.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link 
                        key={item.label}
                        to={item.path}
                        className={`flex items-center gap-3 w-full px-4 py-2 rounded-lg transition-colors text-[11px] font-bold sidebar-link ${
                          isActive 
                            ? 'bg-white/20 text-white shadow-sm' 
                            : 'text-white hover:bg-white/10'
                        }`}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <item.icon size={14} className="text-white" />
                        <span className="flex-grow">{item.label}</span>
                        {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
