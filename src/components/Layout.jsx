import { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from "firebase/firestore";
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
  Trash2,
  Wallet,
  ScanLine,
  Library,
  ArrowLeftRight,
  Tags,
  Building2,
  Briefcase,
  GraduationCap,
  ClipboardList,
  CalendarDays,
  Award,
  IndianRupee,
  ShieldAlert,
  Layers
} from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";

// All possible menu items with their IDs
const allPossibleItems = [
  { id: "reports", icon: LayoutDashboard, label: "Reports", path: "/reports" },
  { id: "faculty-dashboard", icon: LayoutDashboard, label: "Faculty Dashboard", path: "/faculty-dashboard" },
  { id: "hod-dashboard", icon: LayoutDashboard, label: "HOD Dashboard", path: "/hod-dashboard" },
  { id: "principal-dashboard", icon: LayoutDashboard, label: "Principal Dashboard", path: "/principal-dashboard" },
  { id: "course-bank", icon: BookOpen, label: "Course Bank", path: "/course-bank" },
  { id: "admin-roles", icon: User, label: "Admin Role Config", path: "/admin-roles" },
  { id: "student-management", icon: Users, label: "Student Management", path: "/student-management" },
  { id: "info-configuration", icon: Settings2, label: "Info Configuration", path: "/info-configuration" },
  { id: "curriculum", icon: BookOpen, label: "General Config", path: "/curriculum" },
  { id: "blooms-taxonomy", icon: BrainCircuit, label: "Bloom's Taxonomy", path: "/blooms-taxonomy" },
  { id: "hod-role-configuration", icon: Users, label: "Faculty Course Allocation", path: "/hod-role-configuration" },
  { id: "po_and_pso_configuration", icon: Settings2, label: "PO's Configuration", path: "/po_and_pso_configuration" },
  { id: "upload", icon: Upload, label: "Student Namelist and Curriculum", path: "/upload" },
  // { id: "cia-configuration", icon: Settings2, label: "CIA Configuration", path: "/cia-configuration" },
  { id: "course-enrolment", icon: Users, label: "Course Enrolment", path: "/course-enrolment" },
  { id: "admission-enquiries", icon: Users, label: "Admission Enquiries", path: "/admissions/enquiries" },
  { id: "seat-management", icon: Settings2, label: "Seat Management", path: "/admissions/seats" },

  { id: "fee-dashboard", icon: BarChart3, label: "Fee Dashboard", path: "/fee/dashboard" },
  { id: "fee-operations", icon: IndianRupee, label: "Fee Operations", path: "/fee/operations" },
  { id: "fee-control", icon: ShieldAlert, label: "Fee Control", path: "/fee/control" },
  { id: "admission-confirmation", icon: CheckCircle2, label: "Admission Confirmation", path: "/admissions/confirm" },
  { id: "vision_and_mission", icon: Target, label: "Vision and Mission", path: "/vision_and_mission" },
  { id: "academic-calendar", icon: Calendar, label: "Academic Calendar", path: "/academic-calendar" },
  { id: "attendance", icon: CheckCircle2, label: "Attendance", path: "/attendance" },
  { id: "timetable", icon: Clock, label: "Time Table", path: "/tt" },
  // { id: "regulation-formation", icon: Settings2, label: "Regulation Formation", path: "/regulation-formation" },
  { id: "co-po", icon: Network, label: "CO-PO Mapping", path: "/co-po" },
  { id: "po-attainment", icon: BarChart3, label: "PO Calculation & Attainment", path: "/po-attainment" },
  { id: "co_configuration", icon: Database, label: "CO Configuration", path: "/co_configuration" },
  { id: "questionpaper", icon: BookOpen, label: "Question Paper Generator", path: "/question-paper-generator" },
  { id: "markk", icon: FileText, label: "Marks Entry", path: "/markk" },
  { id: "library-catalog", icon: BookOpen, label: "Catalog", path: "/library/catalog" },
  { id: "library-circulation", icon: ArrowLeftRight, label: "Circulation", path: "/library/circulation" },
  { id: "library-reports", icon: BarChart3, label: "Reports", path: "/library/reports" },
  { id: "library-categories", icon: Tags, label: "Categories", path: "/library/categories" },
  { id: "library-entry-exit", icon: ScanLine, label: "Entry / Exit", path: "/library/entry-exit" },
  { id: "placement-dashboard", icon: LayoutDashboard, label: "Placement Dashboard", path: "/placement/dashboard" },
  { id: "placement-drives", icon: Briefcase, label: "Drives & Apps", path: "/placement/drives" },
  { id: "placement-students", icon: Users, label: "Students & Offers", path: "/placement/students" },
  { id: "placement-activities", icon: CalendarDays, label: "Interviews & Training", path: "/placement/activities" },

  // Payment Module
  { id: "payment-roles", icon: Settings2, label: "Payment Roles", path: "/exam-payment/roles" },
  { id: "payment-entries", icon: FileText, label: "Payment Entries", path: "/exam-payment/entries" },
  { id: "payment-reports", icon: BarChart3, label: "Payment Reports", path: "/exam-payment/reports" }
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
    id: "admission",
    label: "Admission",
    icon: Users,
    itemIds: ["admission-enquiries", "seat-management", "admission-confirmation"]
  },
  {
    id: "fee",
    label: "Fee",
    icon: Wallet,
    itemIds: ["fee-dashboard", "fee-operations", "fee-control"]
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    itemIds: ["academic-calendar", "attendance", "timetable", "course-bank", "course-enrolment", "hod-role-configuration", "upload"]
  },
  {
    id: "config",
    label: "Config",
    icon: Settings2,
    // itemIds: ["info-configuration", "regulation-formation", "admin-roles", "curriculum"]
    itemIds: ["info-configuration", "admin-roles", "curriculum"]
  },
  {
    id: "library",
    label: "Library",
    icon: Library,
    itemIds: ["library-catalog", "library-circulation", "library-reports", "library-categories", "library-entry-exit"]
  },
  {
    id: "placement",
    label: "Placement",
    icon: Briefcase,
    itemIds: ["placement-dashboard", "placement-drives", "placement-students", "placement-activities"]
  },
  {
    id: "examinations",
    label: "Examinations",
    icon: FileText,
    itemIds: ["payment-roles", "payment-entries", "payment-reports"]
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
  const masterAdminEmail = import.meta.env.VITE_MASTER_ADMIN_EMAIL;

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
        // Use onSnapshot for real-time user data updates (including role changes)
        const userRef = doc(db, "users", currentUser.uid);
        unsubscribeUser = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setUserData(data);
            setUserRole(data.role);

            if (data.role) {
              // Use onSnapshot for real-time permission updates
              const permsRef = doc(db, "role_permissions", data.role.trim());
              unsubscribePerms(); // Unsubscribe from previous role permissions if any
              unsubscribePerms = onSnapshot(permsRef, (permsSnap) => {
                if (permsSnap.exists()) {
                  const permsData = permsSnap.data();
                  let permsArray = [];
                  
                  // Robust parsing of permissions document
                  if (Array.isArray(permsData)) {
                    permsArray = permsData;
                  } else if (permsData.value && Array.isArray(permsData.value)) {
                    permsArray = permsData.value;
                  } else if (permsData.permissions && Array.isArray(permsData.permissions)) {
                    permsArray = permsData.permissions;
                  } else if (typeof permsData === 'object' && permsData !== null) {
                    const entries = Object.entries(permsData);
                    // Check if it's a map of permissionId -> boolean (standard Firestore pattern)
                    if (entries.length > 0 && typeof entries[0][1] === 'boolean') {
                      permsArray = entries.filter(([, val]) => val === true).map(([key]) => key);
                    } else {
                      // Handle map of something -> ID (e.g. numeric keys) or ID -> ID
                      permsArray = Object.values(permsData).filter(v => typeof v === 'string');
                    }
                  }
                  setRolePermissions(permsArray);
                } else {
                  setRolePermissions([]);
                }
              }, () => setRolePermissions([]));
            } else {
              setRolePermissions([]);
            }

            if (data.role === 'HOD') {
              // Default to true for HODs to ensure they see faculty menu items.
              setHasAssignments(true);
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
      const facultyPermsRef = doc(db, 'role_permissions', 'Faculty');
      unsubscribe = onSnapshot(facultyPermsRef, (permsSnap) => {
        if (permsSnap.exists()) {
          const permsData = permsSnap.data();
          let permsArray = [];
          if (Array.isArray(permsData)) {
            permsArray = permsData;
          } else if (permsData.value && Array.isArray(permsData.value)) {
            permsArray = permsData.value;
          } else if (permsData.permissions && Array.isArray(permsData.permissions)) {
            permsArray = permsData.permissions;
          } else if (typeof permsData === 'object' && permsData !== null) {
            const entries = Object.entries(permsData);
            if (entries.length > 0 && typeof entries[0][1] === 'boolean') {
              permsArray = entries.filter(([, val]) => val === true).map(([key]) => key);
            } else {
              permsArray = Object.values(permsData).filter(v => typeof v === 'string');
            }
          }
          setFacultyPermissions(permsArray);
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
      const userRef = doc(db, "users", user.uid);
      // Programme and Department are admin-managed. Only update signature here.
      await setDoc(userRef, {
        signatureUrl: editData.signatureUrl === "CLEAR" ? "" : (editData.signatureUrl || userData?.signatureUrl || "")
      }, { merge: true });
      setIsEditingProfile(false); // Close editing mode after successful update
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
  const isMasterAdmin =
    !!user?.email &&
    !!masterAdminEmail &&
    user.email.toLowerCase() === masterAdminEmail.toLowerCase();

  const effectivePermissions = (() => {
    if (isMasterAdmin) {
      return allPossibleItems.map(item => item.id);
    }
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
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-zinc-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap');
        
        body { font-family: 'Inter', sans-serif; }
        .page-title { font-family: 'Inter', sans-serif; }

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
        .sidebar-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 4px;
        }
      `}</style>

      {/* Navbar */}
      <nav className="bg-gradient-to-r from-[#120c7a] to-[#15108a] h-16 flex items-center px-4 md:px-6 sticky top-0 z-50 shadow-sm border-b border-white/10 no-print">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-blue-600 rounded-lg text-white transition-colors"
        >
          <Menu size={24} />
        </button>
        <h3 className="flex-grow text-center text-white text-xl font-bold tracking-tight page-title uppercase">{title}</h3>
        
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
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl py-0 z-50 border border-zinc-100 overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[calc(100vh-5rem)]">
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
              <div className="p-4 space-y-4 bg-zinc-50/50 overflow-y-auto flex-1 custom-scrollbar">
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
                          <p className="text-sm font-semibold text-zinc-700">{formatProgDisplay(userData?.programme) || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Department</p>
                          <p className="text-sm font-semibold text-zinc-700">{userData?.department || 'N/A'}</p>
                        </div>
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

                      <button 
                        onClick={handleUpdateProfile}
                        className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Check size={14} /> Save Changes
                      </button>
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
      <div 
        className={`fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm transition-all duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-[#120c7a] via-[#120c7a] to-[#0d075a] z-[70] transform transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-y-auto sidebar-scrollbar no-print ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full shadow-none'}`}>
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
          {/* Global Items */}
          {globalItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.label}
                to={item.path}
                className={`relative flex items-center gap-3 w-full text-white px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium sidebar-link group ${isActive ? 'bg-white/12 text-white shadow-sm' : 'hover:bg-white/8 text-white/85 hover:text-white'}`}
                onClick={() => setIsSidebarOpen(false)}
              >
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${isActive ? 'bg-white/20' : 'bg-white/6 group-hover:bg-white/12'}`}>
                  <item.icon size={16} className={isActive ? 'text-white' : 'text-white/80'} />
                </span>
                <span className="flex-grow truncate">{item.label}</span>
              </Link>
            );
          })}

          {/* Divider between global and module items */}
          {globalItems.length > 0 && moduleGroups.length > 0 && (
            <div className="my-2 mx-4 border-t border-white/8" />
          )}

          {/* Module Based Groups */}
          {moduleGroups.map((module) => {
            const moduleActive = module.items.some(item => location.pathname === item.path);
            return (
            <div key={module.id} className="space-y-0.5">
              <button
                onClick={() => toggleModule(module.id)}
                className={`relative flex items-center gap-3 w-full text-white px-4 py-2.5 rounded-xl transition-all duration-200 text-xs font-bold uppercase tracking-wider sidebar-link group ${expandedModules[module.id] ? 'bg-white/8 text-white' : 'text-white/75 hover:text-white hover:bg-white/6'}`}
              >
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${expandedModules[module.id] ? 'bg-white/20' : 'bg-white/6 group-hover:bg-white/12'}`}>
                  <module.icon size={16} className={expandedModules[module.id] ? 'text-white' : 'text-white/75'} />
                </span>
                <span className="flex-grow text-left">{module.label}</span>
                <span className={`transition-transform duration-200 ${expandedModules[module.id] ? 'rotate-90' : ''}`}>
                  <ChevronRight size={13} className="text-white/50" />
                </span>
              </button>
              
              <div className={`overflow-hidden transition-all duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] ${expandedModules[module.id] ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="ml-4 pl-4 border-l border-white/10 space-y-0.5 py-0.5">
                  {module.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link 
                        key={item.label}
                        to={item.path}
                        className={`relative flex items-center gap-3 w-full px-4 py-2 rounded-lg transition-all duration-200 text-[12px] font-semibold sidebar-link group ${isActive ? 'bg-white/15 text-white' : 'text-white hover:text-white/80 hover:bg-white/8'}`}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${isActive ? 'bg-white' : 'bg-white/40 group-hover:bg-white/70'}`} />
                        <span className="flex-grow truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            );
          })}

          {/* Bottom spacer */}
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
