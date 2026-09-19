import React, { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, updateDoc, deleteDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  CheckCircle2, UserCheck, UserX, Trash2, 
  AlertTriangle, AlertCircle, Plus, X, Search, Briefcase, Users, Building2, Filter 
} from "lucide-react";
import HRLayout from "../components/HRLayout";
import { useDepartments } from "../hooks/useDepartments";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedInstitutionFilter, setSelectedInstitutionFilter] = useState("ALL");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // Modals
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [userToRevoke, setUserToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [confirmEmpId, setConfirmEmpId] = useState("");

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState(null);

  const [availableRoles, setAvailableRoles] = useState([
    "Staff / Non-Teaching",
    "Teacher / Faculty",
    "HOD / Coordinator",
    "Principal",
    "HR / Admin"
  ]);
  const [newRoleInput, setNewRoleInput] = useState("");
  const [isAddingRole, setIsAddingRole] = useState(false);

  // Department management
  const { departments, addDepartment, removeDepartment } = useDepartments();
  const [newDepartmentInput, setNewDepartmentInput] = useState("");
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);

  useEffect(() => {
    let unsubUserData = () => {};

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        const userRef = doc(db, "users", user.uid);
        unsubUserData = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserData(snapshot.data());
          }
        });
      } else {
        setUserData(null);
        unsubUserData();
      }
    });

    // Real-time listener for all users
    const usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map(d => ({
        ...d.data(),
        uid: d.id,
        name: d.data().name || d.data().displayName || "Staff Member",
        empId: d.data().empId || d.data().facultyId || "-",
        role: d.data().role || "Staff / Non-Teaching",
        isApproved: d.data().isApproved ?? true
      }));
      setUsers(all);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching users:", err);
      setLoading(false);
    });

    return () => {
      unsubAuth();
      unsubUserData();
      usersUnsub();
    };
  }, []);

  const showNotification = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const localProfile = useMemo(() => {
    if (!currentUser) return null;
    try {
      const stored = localStorage.getItem(`user_profile_${currentUser.uid}`);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }, [currentUser]);

  const userRole = userData?.role || localProfile?.role || "";
  const userInstitution = userData?.institution || localProfile?.institution || "";
  const isSuperAdmin = currentUser?.email === "obe@ckcet.edu.in" || userRole === "Super Admin" || userRole === "Admin";
  const normalizedRole = String(userRole).toLowerCase();
  const isAuthorized = normalizedRole.includes("principal") || normalizedRole.includes("hr") || normalizedRole.includes("admin") || currentUser?.email === "obe@ckcet.edu.in";

  const handleCreateRole = () => {
    const roleName = newRoleInput.trim();
    if (!roleName) return;
    if (availableRoles.some(r => r.toLowerCase() === roleName.toLowerCase())) {
      showNotification("Role already exists");
      return;
    }
    setAvailableRoles(prev => [...prev, roleName]);
    setNewRoleInput("");
    setIsAddingRole(false);
    showNotification(`Role "${roleName}" added`);
  };

  const handleAddDepartmentSubmit = async () => {
    if (!newDepartmentInput.trim()) {
      showNotification("Please enter a department name.");
      return;
    }
    const res = await addDepartment(newDepartmentInput);
    showNotification(res.message);
    if (res.success) {
      setNewDepartmentInput("");
    }
  };

  const handleRemoveDepartmentSubmit = async (deptName) => {
    const res = await removeDepartment(deptName);
    showNotification(res.message);
  };

  const handleRoleChange = async (uid, newRole) => {
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
      showNotification(`Role updated to ${newRole}`);
    } catch (error) {
      console.error("Error updating role:", error);
      showNotification("Failed to update role.");
    }
  };

  const handleDepartmentChange = async (uid, newDepartment) => {
    try {
      await updateDoc(doc(db, "users", uid), { department: newDepartment });
      showNotification(`Department updated to ${newDepartment}`);
    } catch (error) {
      console.error("Error updating department:", error);
      showNotification("Failed to update department.");
    }
  };

  const handleApprove = async (uid) => {
    try {
      await updateDoc(doc(db, "users", uid), { isApproved: true });
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
      await deleteDoc(doc(db, "users", userToReject.uid));
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
    setConfirmEmpId("");
    setRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!userToRevoke) return;
    if (confirmEmpId.trim().toUpperCase() !== (userToRevoke.empId || "").toUpperCase()) {
      showNotification("Emp ID / Faculty ID does not match!");
      return;
    }
    if (!revokeReason.trim()) {
      showNotification("Please provide a reason for revocation.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", userToRevoke.uid), {
        isApproved: false,
        revocationReason: revokeReason
      });
      showNotification(`User access revoked`);
      setRevokeModalOpen(false);
      setUserToRevoke(null);
    } catch (error) {
      console.error("Error revoking user:", error);
      showNotification("Failed to revoke user access.");
    }
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];

    // Institution Data Segregation: Restrict Principal/HR to their assigned institution unless Super Admin
    if (!isSuperAdmin) {
      if (userInstitution) {
        list = list.filter(u => 
          (u.institution || "").trim().toLowerCase() === userInstitution.trim().toLowerCase()
        );
      }
    } else if (selectedInstitutionFilter && selectedInstitutionFilter !== "ALL") {
      list = list.filter(u => 
        (u.institution || "").trim().toLowerCase() === selectedInstitutionFilter.trim().toLowerCase()
      );
    }

    if (userSearchTerm.trim()) {
      const term = userSearchTerm.toLowerCase();
      list = list.filter(u => 
        (u.name || "").toLowerCase().includes(term) ||
        (u.email || "").toLowerCase().includes(term) ||
        (u.empId || "").toLowerCase().includes(term) ||
        (u.department || "").toLowerCase().includes(term) ||
        (u.institution || "").toLowerCase().includes(term) ||
        (u.designation || "").toLowerCase().includes(term)
      );
    }
    return list.sort((a, b) => (a.isApproved === b.isApproved ? (a.name || "").localeCompare(b.name || "") : a.isApproved ? 1 : -1));
  }, [users, userSearchTerm, userInstitution, isSuperAdmin, selectedInstitutionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPageClamped = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const start = (currentPageClamped - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, currentPageClamped]);

  if (loading) {
    return (
      <HRLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </HRLayout>
    );
  }

  if (!isAuthorized) {
    return (
      <HRLayout>
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center">
          <AlertCircle className="mx-auto text-rose-500 mb-4" size={48} />
          <h2 className="text-2xl font-extrabold font-heading text-rose-900 mb-2">Access Denied</h2>
          <p className="text-rose-700 text-sm font-medium">This page is restricted to Principal and HR Administrators only.</p>
        </div>
      </HRLayout>
    );
  }

  return (
    <HRLayout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-600/20 shrink-0">
              <Users size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold font-heading text-slate-900 tracking-tight">User Management</h1>
              <p className="text-slate-600 text-xs font-medium mt-0.5">Manage staff profiles, designations, roles, and access approvals.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAddingRole ? (
              <div className="flex items-center gap-2 bg-slate-50 p-1 pr-2 rounded-2xl border border-slate-200 shadow-xs animate-in fade-in">
                <input
                  type="text"
                  value={newRoleInput}
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  placeholder="New Role Name..."
                  className="px-3 py-1.5 text-sm outline-none bg-transparent font-medium"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRole()}
                />
                <button
                  onClick={handleCreateRole}
                  className="p-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => setIsAddingRole(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingRole(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-xs"
              >
                <Plus size={16} /> Add Role
              </button>
            )}

            <button
              onClick={() => setIsDepartmentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
            >
              <Plus size={16} /> Add Department
            </button>
          </div>
        </div>

        {/* Search Bar & Institution Scope / Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, email, Emp ID, department, or institution..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-600 outline-none transition-all text-sm font-medium shadow-xs"
            />
            {userSearchTerm && (
              <button onClick={() => setUserSearchTerm("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            )}
          </div>

          {!isSuperAdmin ? (
            userInstitution && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl text-xs font-bold text-indigo-900 shrink-0">
                <Building2 size={16} className="text-indigo-600" />
                <span>Institution Scope: <strong className="text-indigo-950 font-extrabold">{userInstitution}</strong></span>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold shrink-0 shadow-xs">
              <Filter size={15} className="text-indigo-600" />
              <span className="text-slate-500">Institution Filter:</span>
              <select
                value={selectedInstitutionFilter}
                onChange={(e) => setSelectedInstitutionFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="ALL">All Institutions</option>
                <option value="CKSPK (Matric)">CKSPK (Matric)</option>
                <option value="CKSPE (CBSE)">CKSPE (CBSE)</option>
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">Staff Name & ID</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">Email</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">Department</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">Institution</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">Role</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 text-center whitespace-nowrap">Status</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-slate-500 font-medium text-sm">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-sm">{user.name}</div>
                        <div className="text-xs text-indigo-600 font-medium">Emp ID: {user.empId}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={user.department || ""}
                          onChange={(e) => handleDepartmentChange(user.uid, e.target.value)}
                          className="w-full text-xs font-bold p-2 border border-slate-200 rounded-xl outline-none bg-white focus:border-indigo-600 text-slate-800"
                        >
                          <option value="">Select Department</option>
                          {departments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{user.institution || "CK Group"}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                          className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl focus:ring-indigo-600 focus:border-indigo-600 block w-full p-2 outline-none transition-all min-w-[140px]"
                        >
                          {availableRoles.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {user.isApproved ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
                            <CheckCircle2 size={13} /> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold">
                            <AlertCircle size={13} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {!user.isApproved ? (
                            <>
                              <button
                                onClick={() => handleApprove(user.uid)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                              >
                                <UserCheck size={14} /> Approve
                              </button>
                              <button
                                onClick={() => openRejectModal(user)}
                                className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Trash2 size={14} /> Reject
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openRevokeModal(user)}
                              className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <UserX size={14} /> Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-semibold">
                Page {currentPageClamped} of {totalPages} ({filteredUsers.length} total users)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPageClamped === 1}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPageClamped === totalPages}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Department Management Modal */}
        {isDepartmentModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-indigo-600 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Briefcase size={20} />
                  <div>
                    <h3 className="text-base font-bold font-heading">Department Management</h3>
                    <p className="text-xs text-indigo-100">Add new departments or delete existing ones</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDepartmentModalOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Add New Department
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newDepartmentInput}
                      onChange={(e) => setNewDepartmentInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddDepartmentSubmit()}
                      placeholder="Enter department name (e.g. Computer Science)..."
                      className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all"
                      autoFocus
                    />
                    <button
                      onClick={handleAddDepartmentSubmit}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Active Departments ({departments.length})
                  </h4>
                  <div className="space-y-2">
                    {departments.map((dept) => (
                      <div
                        key={dept}
                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-xl hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                          <span className="font-semibold text-sm text-slate-800 truncate">{dept}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveDepartmentSubmit(dept)}
                          title={`Delete department "${dept}"`}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200/60 transition-all shrink-0"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsDepartmentModalOpen(false)}
                  className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectModalOpen && userToReject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-rose-50 p-6 text-center border-b border-rose-100">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold font-heading text-rose-900">Reject User Registration</h3>
                <p className="text-sm text-rose-600 mt-1">
                  Are you sure you want to reject registration for <strong>{userToReject.name}</strong>?
                </p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReject}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Trash2 size={15} /> Confirm Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revoke Modal */}
        {revokeModalOpen && userToRevoke && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-rose-50 p-6 text-center border-b border-rose-100">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold font-heading text-rose-900">Revoke Access</h3>
                <p className="text-sm text-rose-600 mt-1">
                  You are about to revoke access for <strong>{userToRevoke.name}</strong>.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Revocation</label>
                  <textarea
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Why is this user's access being revoked?"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all resize-none h-24 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Type Emp ID to confirm: <span className="font-mono bg-slate-100 px-1 rounded text-rose-600">{userToRevoke.empId}</span>
                  </label>
                  <input
                    type="text"
                    value={confirmEmpId}
                    onChange={(e) => setConfirmEmpId(e.target.value)}
                    placeholder="Enter Emp ID"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all font-medium"
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setRevokeModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRevoke}
                  disabled={confirmEmpId.trim().toUpperCase() !== (userToRevoke.empId || "").toUpperCase() || !revokeReason.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
                >
                  <UserX size={15} /> Confirm Revoke
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 z-[1000]">
            <div className="bg-emerald-500 p-1 rounded-full">
              <CheckCircle2 size={16} />
            </div>
            <span className="font-semibold text-sm">{toastMessage}</span>
          </div>
        )}
      </div>
    </HRLayout>
  );
}
