import { useState, useEffect, useRef, useMemo } from "react";
import { auth, rtdb } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { ref, get, set, onValue, update } from "firebase/database";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { formatProgDisplay } from "../lib/utils";
import { 
  X, 
  Menu,
  Upload,
  FileText,
  BookOpen,
  AlertCircle,
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
  CalendarCheck2
} from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";

export default function Layout({ children, title }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [hasAssignments, setHasAssignments] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editData, setEditData] = useState({ programme: "", department: "" });
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [signatureSuccess, setSignatureSuccess] = useState("");
  const MAX_SIGNATURE_SIZE = 100 * 1024; // 100 KB
  const { departments: allDepartments } = useDepartments();
  const profileRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let unsubscribeUser = () => {};
    let unsubscribePerms = () => {};

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

            // If HOD, check if they have any subjects assigned to them
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
                }
              });
            }
            setSignatureUrl(data.signatureUrl || "");
          }
        });
      } else {
        setUserRole(null);
        setUserData(null);
        setRolePermissions(null);
        setHasAssignments(false);
        unsubscribeUser();
        setSignatureUrl("");
        unsubscribePerms();
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
      unsubscribePerms();
    };
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
      const userRef = ref(rtdb, `users/${user.uid}`);
      await set(userRef, {
        ...userData,
        programme: editData.programme,
        department: editData.department
      });
      // No need to update signature here, it's handled separately
      setUserData({ ...userData, programme: editData.programme, department: editData.department });
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Update Profile Error:", error);
    }
  };

  const handleSignatureFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > MAX_SIGNATURE_SIZE) {
        setSignatureError("Signature file size must be less than 100KB.");
        setSignatureFile(null);
        return;
      }
      if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
        setSignatureError("Only PNG, JPG, or JPEG images are allowed for signature.");
        setSignatureFile(null);
        return;
      }
      setSignatureError("");
      setSignatureFile(file);
    } else {
      setSignatureFile(null);
    }
  };

  const handleSignatureUpload = async () => {
    if (!user || !signatureFile) return;
    setUploadingSignature(true);
    setSignatureError("");
    setSignatureSuccess("");

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result;
        const userRef = ref(rtdb, `users/${user.uid}`);
        await update(userRef, { signatureUrl: base64String });
        
        setSignatureUrl(base64String);
        setUserData(prev => ({ ...prev, signatureUrl: base64String }));
        setSignatureFile(null);
        setSignatureSuccess("Signature uploaded successfully!");
        alert("Signature uploaded successfully!");
        setTimeout(() => setSignatureSuccess(""), 4000);
      } catch (error) {
        console.error("Error saving signature:", error);
        setSignatureError("Failed to save signature. Please try again.");
      } finally {
        setUploadingSignature(false);
      }
    };
    reader.readAsDataURL(signatureFile);
  };

  const handleSignatureRemove = async () => {
    if (!user || !signatureUrl) return;
    setUploadingSignature(true);
    setSignatureError("");
    setSignatureSuccess("");
    try {
      const userRef = ref(rtdb, `users/${user.uid}`);
      await update(userRef, { signatureUrl: null });
      setSignatureUrl("");
      setUserData(prev => ({ ...prev, signatureUrl: null }));
      setSignatureSuccess("Signature removed successfully!");
      setTimeout(() => setSignatureSuccess(""), 4000);
    } catch (error) {
      console.error("Error removing signature:", error);
      setSignatureError("Failed to remove signature. Please try again.");
    } finally {
      setUploadingSignature(false);
    }
  };

  const isAdmin = userRole === 'Admin' || user?.email === 'cselab2022@gmail.com';
  const isPrincipal = userRole === 'Principal';
  const isHOD = userRole === 'HOD';
  const isFaculty = userRole === 'Faculty';

  // All possible menu items with their IDs
  const allPossibleItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { id: "faculty-dashboard", icon: BookOpen, label: "Faculty Dashboard", path: "/faculty-dashboard" },
    { id: "hod-dashboard", icon: Users, label: "HOD Dashboard", path: "/hod-dashboard" },
    { id: "course-bank", icon: BookOpen, label: "Course Bank", path: "/course-bank" },
    { id: "admin-roles", icon: User, label: "Admin Role Config", path: "/admin-roles" },
    { id: "info-configuration", icon: Settings2, label: "Info Configuration", path: "/info-configuration" },
    { id: "curriculum", icon: BookOpen, label: "Curriculum", path: "/curriculum" },
    { id: "regulation-formation", icon: BookOpen, label: "Regulation Formation", path: "/regulation-formation" },
    { id: "blooms-taxonomy", icon: BrainCircuit, label: "Bloom's Taxonomy", path: "/blooms-taxonomy" },
    { id: "hod-role-configuration", icon: Users, label: "HOD Role Config", path: "/hod-role-configuration" },
    { id: "po_and_pso_configuration", icon: Settings2, label: "PO's Configuration", path: "/po_and_pso_configuration" },
    { id: "upload", icon: Upload, label: "Update Namelist", path: "/upload" },
    { id: "course-enrolment", icon: Users, label: "Course Enrolment", path: "/course-enrolment" },
    { id: "vision_and_mission", icon: Target, label: "Vision and Mission", path: "/vision_and_mission" },
    { id: "co-po", icon: Network, label: "CO-PO Mapping", path: "/co-po" },
    { id: "po-attainment", icon: BarChart3, label: "PO Calculation & Attainment", path: "/po-attainment" },
    { id: "co_configuration", icon: Database, label: "CO Configuration", path: "/co_configuration" },
    { id: "questionpaper", icon: BookOpen, label: "Question Papers", path: "/questionpaper" },
    { id: "markk", icon: FileText, label: "Marks Entry", path: "/markk" },
    { id: "attendance", icon: CalendarCheck2, label: "Attendance", path: "/attendance" },
    { id: "academic-calendar", icon: Calendar, label: "Academic Calendar", path: "/academic-calendar" }
    ,{ id: "timetable", icon: Calendar, label: "Timetable", path: "/tt" }
  ];

  const menuItems = [];

  if (rolePermissions && rolePermissions.length > 0) {
    // Dynamic items based on Admin configuration
    allPossibleItems.forEach(item => {
      if (rolePermissions.includes(item.id)) {
        menuItems.push(item);
      }
    });

    // SAFETY: Ensure Admin always has access to core config pages even if dynamic perms are messed up
    if (isAdmin) {
      const adminCoreIds = ["dashboard", "admin-roles", "info-configuration", "curriculum", "regulation-formation", "blooms-taxonomy", "course-bank"];
      adminCoreIds.forEach(id => {
        if (!menuItems.some(i => i.id === id)) {
          const item = allPossibleItems.find(i => i.id === id);
          if (item) menuItems.push(item);
        }
      });
    }

    // Special logic for Faculty/HOD/Principal co-doc access refinement
    // If they have certain "HOD" level logic that depends on 'hasAssignments'
    if (hasAssignments) {
        // Ensure standard faculty items are there if they have assignments
        const facultyItems = ["co_configuration", "questionpaper", "markk", "course-bank", "attendance"];
        facultyItems.forEach(id => {
            if (!menuItems.some(i => i.id === id)) {
                const item = allPossibleItems.find(i => i.id === id);
                if (item) menuItems.push(item);
            }
        });
    }
  } else {
    // Fallback to static items if permissions haven't loaded yet
    const fallbackIds = [];
    if (isAdmin) {
      fallbackIds.push("dashboard", "admin-roles", "info-configuration", "curriculum", "regulation-formation", "blooms-taxonomy", "course-enrolment", "course-bank", "upload", "attendance", "academic-calendar");
      fallbackIds.push("timetable");
    } else if (isPrincipal) {
      fallbackIds.push("dashboard", "hod-role-configuration", "hod-dashboard", "po_and_pso_configuration", "upload", "vision_and_mission", "co-po", "po-attainment", "co_configuration", "questionpaper", "markk", "course-bank", "attendance", "academic-calendar", "timetable");
    } else if (isHOD) {
      fallbackIds.push("dashboard", "hod-dashboard", "hod-role-configuration", "po_and_pso_configuration", "upload", "vision_and_mission", "co-po", "po-attainment", "course-bank", "attendance", "academic-calendar", "timetable");
      if (hasAssignments) fallbackIds.push("co_configuration", "questionpaper", "markk", "attendance");
    } else if (isFaculty) {
      fallbackIds.push("dashboard", "faculty-dashboard", "co_configuration", "questionpaper", "markk", "course-bank", "attendance", "academic-calendar", "timetable");
    }

    allPossibleItems.forEach(item => {
      if (fallbackIds.includes(item.id)) {
        menuItems.push(item);
      }
    });
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

  const [sidebarSearch, setSidebarSearch] = useState("");

  const displayedMenuItems = useMemo(() => {
    const q = (sidebarSearch || "").trim().toLowerCase();
    if (!q) return uniqueMenuItems;
    const matches = [];
    const others = [];
    uniqueMenuItems.forEach(item => {
      const label = (item.label || "").toLowerCase();
      const idx = label.indexOf(q);
      if (idx !== -1) {
        matches.push({ item, idx });
      } else others.push(item);
    });
    // sort matches by earliest match position, then alphabetically
    matches.sort((a, b) => a.idx - b.idx || a.item.label.localeCompare(b.item.label));
    return [...matches.map(m => m.item), ...others];
  }, [sidebarSearch, uniqueMenuItems]);

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
                        setEditData({ programme: userData?.programme || "", department: userData?.department || "" });
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
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Email Address</p>
                  <p className="text-sm font-medium text-zinc-600 truncate">{userData?.email}</p>
                </div>

                {/* Digital Signature Section */}
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Digital Signature</p>
                  {signatureUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={signatureUrl} alt="Digital Signature" className="h-16 w-auto border border-zinc-200 rounded-lg p-1 bg-white" />
                      <button
                        onClick={handleSignatureRemove}
                        disabled={uploadingSignature}
                        className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {uploadingSignature ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg"
                        onChange={handleSignatureFileChange}
                        className="w-full text-[10px] text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                      {signatureFile && (
                        <button
                          onClick={handleSignatureUpload}
                          disabled={uploadingSignature}
                          className="w-full py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {uploadingSignature ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Upload Signature
                        </button>
                      )}
                      {signatureError && (
                        <div className="text-red-500 text-[10px] mt-1 flex items-center gap-1">
                          <AlertCircle size={10} /> {signatureError}
                        </div>
                      )}
                      {signatureSuccess && (
                        <div className="text-green-600 text-[10px] mt-1 flex items-center gap-1 font-bold">
                          <Check size={12} /> {signatureSuccess}
                        </div>
                      )}
                      <p className="text-[9px] text-zinc-400 mt-1 leading-tight">
                        Max size: 100KB. Formats: PNG, JPG, JPEG.
                      </p>
                    </div>
                  )}
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
        <div className="p-4">
          <input
            type="search"
            placeholder="Search pages..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg text-sm font-medium outline-none bg-white/10 text-white placeholder-white/70"
          />
          <nav className="space-y-1">
            {displayedMenuItems.map((item) => {
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
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
