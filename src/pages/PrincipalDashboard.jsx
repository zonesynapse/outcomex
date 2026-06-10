import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Search, Filter, X, Eye, Edit2, Inbox, AlertTriangle } from "lucide-react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import DashboardCards from "../components/DashboardCards";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { getEnquiriesRealtime, updateEnquiry, getEnquiryById } from "../services/enquiryService";
import { useDepartments } from "../hooks/useDepartments";

const formatDate = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

const formatCurrencyLikeNumber = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return numericValue.toFixed(2).replace(/\.00$/, "");
};

export default function PrincipalDashboard() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [editModal, setEditModal] = useState({ open: false, enquiry: null, saving: false });
  const [viewModal, setViewModal] = useState({ open: false, enquiry: null, loading: false });
  const [rejectModal, setRejectModal] = useState({ open: false, enquiry: null, saving: false, reason: "" });
  const [rejectError, setRejectError] = useState("");
  const { departments: allDeptMap } = useDepartments();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = getEnquiriesRealtime(
      (items) => {
        setApplications(items);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const admissionItems = useMemo(() => applications.filter((e) => e.status === "Admission"), [applications]);

  const departmentOptions = useMemo(() => {
    const set = new Set();
    applications.forEach((app) => {
      [app.department, app.department2, app.department3].filter(Boolean).forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return admissionItems.filter((app) => {
      const matchesSearch = !query || [app.enquiryId, app.applicationNo, app.studentName, app.firstName, app.lastName, app.mobile]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
      const matchesDepartment = !departmentFilter || [app.department, app.department2, app.department3].includes(departmentFilter);
      const matchesStatus = !statusFilter || app.status === statusFilter;
      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [admissionItems, searchTerm, departmentFilter, statusFilter]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: applications.length,
      today: applications.filter((e) => new Date(e.createdAt).toDateString() === today).length,
      new: applications.filter((e) => e.status === "Enquiry").length,
      application: applications.filter((e) => e.status === "Application").length,
      admission: applications.filter((e) => e.status === "Admission").length,
    };
  }, [applications]);

  const departmentList = useMemo(() => {
    return Object.values(allDeptMap || {}).flat().sort((a, b) => a.localeCompare(b));
  }, [allDeptMap]);

  const openViewModal = async (app) => {
    setViewModal({ open: true, enquiry: app, loading: true });
    if (app?.enquiryId) {
      try {
        const fresh = await getEnquiryById(app.enquiryId);
        setViewModal({ open: true, enquiry: fresh || app, loading: false });
        return;
      } catch (e) {
        console.error("Failed to fetch enquiry:", e);
      }
    }
    setViewModal({ open: true, enquiry: app, loading: false });
  };

  const closeViewModal = () => {
    setViewModal({ open: false, enquiry: null, loading: false });
  };

  const openEditModal = (app) => {
    setEditModal({ open: true, enquiry: app, saving: false });
  };

  const closeEditModal = () => {
    setEditModal({ open: false, enquiry: null, saving: false });
  };

  const handleEditSave = async (values) => {
    if (!editModal.enquiry?.enquiryId) return;
    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateEnquiry(editModal.enquiry.enquiryId, {
        ...editModal.enquiry,
        ...values
      });
      showToast("Application updated successfully");
      closeEditModal();
    } catch (error) {
      console.error("Edit save error:", error);
      showToast("Failed to update application", "error");
      setEditModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleApprove = async (app) => {
    try {
      await updateEnquiry(app.enquiryId, { ...app, status: "Approved" });
      showToast("Admission approved successfully");
    } catch (err) {
      console.error("Approve error:", err);
      showToast("Failed to approve admission", "error");
    }
  };

  const openRejectModal = (app) => {
    setRejectModal({ open: true, enquiry: app, saving: false, reason: "" });
    setRejectError("");
  };

  const closeRejectModal = () => {
    setRejectModal({ open: false, enquiry: null, saving: false, reason: "" });
    setRejectError("");
  };

  const handleConfirmReject = async () => {
    const app = rejectModal.enquiry;
    if (!app?.enquiryId) return;
    if (!rejectModal.reason.trim()) {
      setRejectError("Please fill the message");
      return;
    }
    setRejectModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateEnquiry(app.enquiryId, {
        ...app,
        status: "Rejected",
        remarks: rejectModal.reason || "Rejected by Principal",
      });
      showToast("Admission rejected");
      closeRejectModal();
    } catch (err) {
      console.error("Reject error:", err);
      showToast("Failed to reject admission", "error");
      setRejectModal((prev) => ({ ...prev, saving: false }));
    }
  };

  return (
    <>
      <Layout title="Principal Dashboard">
        <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">

          <div className="mb-6">
            <DashboardCards loading={loading} stats={stats} onCardClick={(key) => { if (key === "application") setShowList(true); }} />
          </div>

          {showList && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900">Application List</h2>
                <button
                  type="button"
                  onClick={() => { setShowList(false); setSearchTerm(""); setDepartmentFilter(""); setStatusFilter(""); }}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600"
                >
                  <X size={14} />
                  Close
                </button>
              </div>

              {/* Filters */}
              <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr_0.6fr_auto]">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-zinc-700">Search</span>
                    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10">
                      <Search size={18} className="text-zinc-400" />
                      <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                        placeholder="Search by name, mobile, or ID"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-zinc-700">Department</span>
                    <div className="relative">
                      <select
                        value={departmentFilter}
                        onChange={(event) => setDepartmentFilter(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                      >
                        <option value="">All Departments</option>
                        {departmentOptions.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-zinc-700">Status</span>
                    <div className="relative">
                      <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                      >
                        <option value="">All Statuses</option>
                        <option value="Admission">Pending Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                  </label>

                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(""); setDepartmentFilter(""); setStatusFilter(""); }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
                    >
                      <Filter size={16} />
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full border-collapse">
                      <thead className="bg-zinc-50">
                        <tr>
                          {Array.from({ length: 9 }).map((_, i) => (
                            <th key={i} className="border-b border-zinc-200 px-4 py-4">
                              <div className="h-3 w-20 rounded-full bg-zinc-200 animate-pulse" />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 4 }).map((_, ri) => (
                          <tr key={ri} className="border-b border-zinc-100">
                            {Array.from({ length: 9 }).map((__, ci) => (
                              <td key={ci} className="px-4 py-4">
                                <div className="h-3 w-full rounded-full bg-zinc-200 animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : admissionItems.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
                    <Inbox size={28} />
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-zinc-900">No applications yet</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                    Applications moved from Admission Confirmation will appear here.
                  </p>
                </div>
              ) : filteredApplications.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
                    <Search size={28} />
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-zinc-900">No applications match your filters</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Try a different department, status, or search keyword.</p>
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(""); setDepartmentFilter(""); setStatusFilter(""); }}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
                  >
                    <X size={18} />
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1200px] w-full border-collapse">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">App No</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Student Name</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Mobile</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Cutoff</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Department Choices</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Status</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Date</th>
                          <th className="border-b border-zinc-200 px-4 py-4 text-center text-xs font-bold uppercase tracking-wide text-zinc-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApplications.map((app) => (
                          <tr key={app.enquiryId} className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80">
                            <td className="px-4 py-4 text-sm font-semibold text-[#120c7a]">
                              {app.applicationNo || app.enquiryId}
                            </td>
                            <td className="px-4 py-4 text-sm font-medium text-zinc-900">
                              {app.firstName || app.lastName
                                ? `${app.firstName || ""} ${app.lastName || ""}`.trim()
                                : app.studentName || "-"}
                            </td>
                            <td className="px-4 py-4 text-sm text-zinc-700">{app.mobile}</td>
                            <td className="px-4 py-4 text-sm text-zinc-700">{formatCurrencyLikeNumber(app.cutoff)}</td>
                            <td className="px-4 py-4 text-sm text-zinc-700">
                              {[app.department, app.department2, app.department3].filter(Boolean).join(", ")}
                            </td>
                            <td className="px-4 py-4">
                              <StatusBadge status={app.status} />
                            </td>
                            <td className="px-4 py-4 text-sm text-zinc-700">{formatDate(app.enquiryDate || app.createdAt)}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-2">
                                {app.status === "Admission" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApprove(app)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-emerald-700"
                                      title="Approve"
                                    >
                                      <CheckCircle2 size={10} />
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                        onClick={() => openRejectModal(app)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-red-700"
                                      title="Reject"
                                    >
                                      <XCircle size={10} />
                                      Reject
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openViewModal(app)}
                                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 p-2 text-zinc-600 transition-all hover:border-[#120c7a] hover:text-[#120c7a] hover:bg-[#120c7a]/5"
                                  title="View Details"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(app)}
                                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 p-2 text-zinc-600 transition-all hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                  title="Edit Application"
                                >
                                  <Edit2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {toast.show && (
          <div className={`fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl ${
            toast.type === "success" ? "bg-emerald-700" : "bg-red-600"
          }`}>
            {toast.message}
          </div>
        )}
      </Layout>

      <AddEnquiryModal
        open={editModal.open}
        mode="edit"
        initialValues={editModal.enquiry}
        departments={departmentList}
        saving={editModal.saving}
        onClose={closeEditModal}
        onSubmit={handleEditSave}
      />

      <AddEnquiryModal
        open={viewModal.open}
        mode="view"
        initialValues={viewModal.enquiry}
        departments={departmentList}
        saving={false}
        onClose={closeViewModal}
        onSubmit={closeViewModal}
      />

      {rejectModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeRejectModal} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Reject Admission</h3>
                <p className="text-sm text-zinc-500">
                  {rejectModal.enquiry?.firstName || rejectModal.enquiry?.studentName}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Reason for Rejection</span>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => { setRejectModal((prev) => ({ ...prev, reason: e.target.value })); setRejectError(""); }}
                rows={4}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all resize-none ${
                  rejectError ? "border-red-400 ring-2 ring-red-100" : "border-zinc-200 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                }`}
                placeholder="Enter reason for rejecting this admission..."
              />
              {rejectError && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertTriangle size={12} />
                  {rejectError}
                </p>
              )}
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeRejectModal}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectModal.saving}
                onClick={handleConfirmReject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {rejectModal.saving ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
