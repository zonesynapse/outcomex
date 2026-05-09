import { useState, useEffect } from "react";
import { rtdb, auth } from "../firebase";
import { ref, onValue, update, remove, get, set, getDatabase } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { CheckCircle2, XCircle, Shield, UserCheck, UserX, Trash2, AlertTriangle, AlertCircle, Check } from "lucide-react";
import Layout from "../components/Layout";
import { formatProgDisplay } from "../lib/utils";

export default function AdminRoleConfig() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Revoke Modal State
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [userToRevoke, setUserToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [confirmFacultyId, setConfirmFacultyId] = useState("");

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState(null);

  const [activeTab, setActiveTab] = useState("users"); // "users" or "permissions"
  const [rolePermissions, setRolePermissions] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);

  const defaultAdminEmail = import.meta.env.VITE_DEFAULT_ADMIN_EMAIL;
  const masterAdminEmail = import.meta.env.VITE_MASTER_ADMIN_EMAIL;

  // All available system pages
  const ALL_PAGES = [
    { id: "dashboard", label: "Dashboard", path: "/dashboard" },
    { id: "faculty-dashboard", label: "Faculty Dashboard", path: "/faculty-dashboard" },
    { id: "hod-dashboard", label: "HOD Dashboard", path: "/hod-dashboard" },
    { id: "course-bank", label: "Course Bank", path: "/course-bank" },
    { id: "admin-roles", label: "Admin Role Config", path: "/admin-roles" },
    { id: "info-configuration", label: "Info Configuration", path: "/info-configuration" },
    { id: "curriculum", label: "Curriculum", path: "/curriculum" },
    // { id: "regulation-formation", label: "Regulation Formation", path: "/regulation-formation" },
    { id: "blooms-taxonomy", label: "Bloom's Taxonomy", path: "/blooms-taxonomy" },
    { id: "hod-role-configuration", label: "Faculty Course Allocation", path: "/hod-role-configuration" },
    { id: "po_and_pso_configuration", label: "PO's Configuration", path: "/po_and_pso_configuration" },
    { id: "upload", label: "Update Namelist", path: "/upload" },
    // { id: "cia-configuration", label: "CIA Configuration", path: "/cia-configuration" },
    { id: "course-enrolment", label: "Course Enrolment", path: "/course-enrolment" },
    { id: "vision_and_mission", label: "Vision and Mission", path: "/vision_and_mission" },
    { id: "co-po", label: "CO-PO Mapping", path: "/co-po" },
    { id: "po-attainment", label: "PO Calculation & Attainment", path: "/po-attainment" },
    { id: "co_configuration", label: "CO Configuration", path: "/co_configuration" },
    { id: "questionpaper", label: "Question Paper Generator", path: "/question-paper-generator" },
    { id: "markk", label: "Marks Entry", path: "/markk" },
    { id: "attendance", label: "Attendance", path: "/attendance" },
    { id: "academic-calendar", label: "Academic Calendar", path: "/academic-calendar" },
    { id: "timetable", label: "Timetable", path: "/tt" }
  ];

  const ROLES = ["Admin", "Principal", "HOD", "Faculty"];

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setUserData(snapshot.val());
        }
      }
    });

    const usersRef = ref(rtdb, "users");
    const unsubscribeData = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const usersList = Object.entries(data).map(([key, user]) => ({
          ...user,
          uid: user.uid || key,
          role: user.role || "Faculty",
          isApproved: user.isApproved || false
        }));
        setUsers(usersList);
      } else {
        setUsers([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    // Fetch existing role permissions
    const permsRef = ref(rtdb, "role_permissions");
    const unsubscribePerms = onValue(permsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const formatted = {};
        Object.keys(data).forEach(role => {
          const perms = data[role];
          formatted[role] = Array.isArray(perms) ? perms : (perms ? Object.values(perms) : []);
        });
        setRolePermissions(formatted);
      } else {
        // No built-in defaults: permissions are fully admin-managed.
        setRolePermissions({});
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeData();
      unsubscribePerms();
    };
  }, []);

  const handleTogglePermission = (role, pageId) => {
    const currentPerms = rolePermissions[role] || [];
    let newPerms;
    if (currentPerms.includes(pageId)) {
      newPerms = currentPerms.filter(id => id !== pageId);
    } else {
      newPerms = [...currentPerms, pageId];
    }
    setRolePermissions({
      ...rolePermissions,
      [role]: newPerms
    });
  };

  const savePermissions = async () => {
    setSavingPermissions(true);
    try {
      // Normalize permissions to arrays of strings to avoid Firebase
      // converting arrays into numeric-keyed objects which breaks
      // downstream `includes` checks.
      const normalized = {};
      Object.keys(rolePermissions).forEach(role => {
        const perms = rolePermissions[role] || [];
        normalized[role] = Array.isArray(perms) ? perms : Object.values(perms || {});
      });
      await set(ref(rtdb, 'role_permissions'), normalized);
      showNotification("Role permissions updated successfully");
    } catch (error) {
      console.error("Error saving permissions:", error);
      showNotification("Failed to save permissions.");
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleRoleChange = async (uid, newRole) => {
    try {
      await update(ref(rtdb, `users/${uid}`), { role: newRole });
      showNotification(`Role updated to ${newRole}`);
    } catch (error) {
      console.error("Error updating role:", error);
      showNotification("Failed to update role.");
    }
  };

  const handleApprove = async (uid) => {
    try {
      await update(ref(rtdb, `users/${uid}`), { isApproved: true });
      showNotification(`User approved successfully`);
    } catch (error) {
      console.error("Error approving user:", error);
      showNotification("Failed to approve user.");
    }
  };

  const openRejectModal = (user) => {
    setUserToReject(user);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!userToReject) return;
    try {
      await removeUserAssignments(userToReject.uid);
      await remove(ref(rtdb, `users/${userToReject.uid}`));
      showNotification("User request rejected and removed");
      setRejectModalOpen(false);
      setUserToReject(null);
    } catch (error) {
      console.error("Error rejecting user:", error);
      showNotification("Failed to reject user.");
    }
  };

  const openRevokeModal = (user) => {
    setUserToRevoke(user);
    setRevokeReason("");
    setConfirmFacultyId("");
    setRevokeModalOpen(true);
  };

  const removeUserAssignments = async (uid) => {
    try {
      const assignmentsRef = ref(rtdb, 'subject_assignments');
      const snapshot = await get(assignmentsRef);
      if (snapshot.exists()) {
        const allAssignments = snapshot.val();
        const updates = {};
        
        Object.entries(allAssignments).forEach(([progKey, depts]) => {
          Object.entries(depts).forEach(([deptKey, batches]) => {
            Object.entries(batches).forEach(([batchKey, years]) => {
              Object.entries(years).forEach(([yearKey, semesters]) => {
                Object.entries(semesters).forEach(([semKey, facultyAssignments]) => {
                  if (facultyAssignments[uid]) {
                    updates[`subject_assignments/${progKey}/${deptKey}/${batchKey}/${yearKey}/${semKey}/${uid}`] = null;
                  }
                });
              });
            });
          });
        });

        if (Object.keys(updates).length > 0) {
          await update(ref(rtdb), updates);
        }
      }
    } catch (error) {
      console.error("Error removing user assignments:", error);
    }
  };

  const handleConfirmRevoke = async () => {
    if (confirmFacultyId !== userToRevoke.facultyId) {
      showNotification("Faculty ID does not match!");
      return;
    }
    if (!revokeReason.trim()) {
      showNotification("Please provide a reason for revocation.");
      return;
    }
    try {
      await update(ref(rtdb, `users/${userToRevoke.uid}`), { 
        isApproved: false,
        revocationReason: revokeReason,
        role: "Faculty",
        programme: null,
        department: null
      });
      await removeUserAssignments(userToRevoke.uid);
      showNotification(`User access revoked`);
      setRevokeModalOpen(false);
      setUserToRevoke(null);
    } catch (error) {
      console.error("Error revoking user:", error);
      showNotification("Failed to revoke user access.");
    }
  };

  const showNotification = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  if (loading) {
    return (
      <Layout title="Admin Role Configuration">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  const isAdmin = userData?.role === 'Admin' || user?.email === defaultAdminEmail || user?.email === masterAdminEmail;

  if (!isAdmin) {
    return (
      <Layout title="Admin Role Configuration">
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">This page is restricted to Administrators only.</p>
        </div>
      </Layout>
    );
  }

  // Filter users based on login email
  const isMasterAdminLoggedIn = user?.email === masterAdminEmail;
  const filteredUsers = (isMasterAdminLoggedIn
    ? [...users]
    : users.filter(u => u.email !== masterAdminEmail)
  ).sort((a, b) => {
    if (a.email === masterAdminEmail) return -1;
    if (b.email === masterAdminEmail) return 1;
    return 0;
  });

  return (
    <Layout title="Admin Role Configuration">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#120c7a] rounded-xl text-white shadow-lg">
              <Shield size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-800">Role & Access Configuration</h1>
              <p className="text-zinc-500 text-sm">Manage user roles and dynamic page permissions</p>
            </div>
          </div>
          
          <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            <button 
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "users" ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
            >
              User Management
            </button>
            <button 
              onClick={() => setActiveTab("permissions")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "permissions" ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
            >
              Page Permissions
            </button>
          </div>
        </div>

        {activeTab === "users" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Faculty Name</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Email</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Designation</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Department</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Role</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 text-center whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-zinc-500">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.uid} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-zinc-800">{user.displayName || user.facultyName}</div>
                            {user.email === masterAdminEmail && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded border border-amber-200">MASTER</span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500">{user.facultyId}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{user.email}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap font-medium">{user.designation || 'N/A'}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">
                          {user.programme && user.department ? `${formatProgDisplay(user.programme)} - ${user.department}` : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                            className="bg-zinc-50 border border-zinc-200 text-zinc-800 text-sm rounded-lg focus:ring-[#120c7a] focus:border-[#120c7a] block w-full p-2 outline-none transition-all min-w-[120px]"
                          >
                            <option value="Admin">Admin</option>
                            <option value="Principal">Principal</option>
                            <option value="HOD">HOD</option>
                            <option value="Faculty">Faculty</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {user.isApproved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle2 size={14} /> Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              <XCircle size={14} /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {user.isApproved ? (
                            <button
                              onClick={() => openRevokeModal(user)}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              <UserX size={16} /> Revoke
                            </button>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleApprove(user.uid)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-[#120c7a] text-white hover:bg-[#0e0960] shadow-md shadow-[#120c7a]/20"
                              >
                                <UserCheck size={16} /> Approve
                              </button>
                              <button
                                onClick={() => openRejectModal(user)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-50 text-red-600 hover:bg-red-100"
                              >
                                <Trash2 size={16} /> Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800">
              <AlertCircle size={20} className="shrink-0" />
              <div className="text-sm">
                <p className="font-bold">Important Notice</p>
                <p>Changes made here will dynamically affect the sidebar navigation for all users in that role. Remember to save your changes.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-6 py-4 text-sm font-semibold text-zinc-600 sticky left-0 bg-zinc-50">Page / Menu Item</th>
                      {ROLES.map(role => (
                        <th key={role} className="px-6 py-4 text-sm font-semibold text-zinc-600 text-center">{role}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {ALL_PAGES.map(page => (
                      <tr key={page.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-800 sticky left-0 bg-white">
                          <div className="flex flex-col">
                            <span>{page.label}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">{page.path}</span>
                          </div>
                        </td>
                        {ROLES.map(role => (
                          <td key={`${role}-${page.id}`} className="px-6 py-4 text-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={rolePermissions[role]?.includes(page.id) || false}
                                onChange={() => handleTogglePermission(role, page.id)}
                              />
                              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#120c7a]"></div>
                            </label>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex justify-end">
                <button 
                  onClick={savePermissions}
                  disabled={savingPermissions}
                  className="bg-[#120c7a] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#0e0960] transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingPermissions ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={20} />
                  )}
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectModalOpen && userToReject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-red-50 p-6 text-center border-b border-red-100">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold text-red-900">Reject User</h3>
                <p className="text-sm text-red-600 mt-1">
                  Are you sure you want to reject and remove the request for <strong>{userToReject.displayName || userToReject.facultyName}</strong>?
                </p>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
                <button
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReject}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} /> Confirm Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revoke Modal */}
        {revokeModalOpen && userToRevoke && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-red-50 p-6 text-center border-b border-red-100">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold text-red-900">Revoke Access</h3>
                <p className="text-sm text-red-600 mt-1">
                  You are about to revoke access for <strong>{userToRevoke.displayName || userToRevoke.facultyName}</strong>.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">Reason for Revocation</label>
                  <textarea
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Why is this user's access being revoked?"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all resize-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">
                    Type Faculty ID to confirm: <span className="font-mono bg-zinc-100 px-1 rounded text-red-600">{userToRevoke.facultyId}</span>
                  </label>
                  <input
                    type="text"
                    value={confirmFacultyId}
                    onChange={(e) => setConfirmFacultyId(e.target.value)}
                    placeholder="Enter Faculty ID"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all"
                  />
                </div>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
                <button
                  onClick={() => setRevokeModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRevoke}
                  disabled={confirmFacultyId !== userToRevoke.facultyId || !revokeReason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <UserX size={16} /> Confirm Revoke
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 z-[1000]">
            <div className="bg-green-500 p-1 rounded-full">
              <CheckCircle2 size={18} />
            </div>
            <span className="font-semibold">{toastMessage}</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
