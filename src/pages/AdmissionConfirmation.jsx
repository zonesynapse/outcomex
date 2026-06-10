import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, User, MapPin, GraduationCap, FileText, CreditCard, AlertCircle, Inbox, Search, Filter, X, Eye, Edit2, Send, MessageCircle } from "lucide-react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import DashboardCards from "../components/DashboardCards";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { getEnquiryById, updateEnquiry, getEnquiriesPaginated, getEnquiriesCount, getEnquiriesStats, getAllEnquiries } from "../services/enquiryService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

export default function AdmissionConfirmation() {
  const { enquiryId } = useParams();
  const navigate = useNavigate();
  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDept, setSelectedDept] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editModal, setEditModal] = useState({ open: false, enquiry: null, saving: false });
  const [viewModal, setViewModal] = useState({ open: false, enquiry: null, loading: false });
  const [pageCursors, setPageCursors] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, new: 0, application: 0, admission: 0 });
  const { departments: allDeptMap } = useDepartments();
  const PAGE_SIZE = 20;

  const loadPage = async (page, cursor) => {
    setAppsLoading(true);
    try {
      // Fetch without status filter first (uses only the createdAt index),
      // then filter client-side to avoid requiring a composite index.
      const result = await getEnquiriesPaginated({
        pageSize: PAGE_SIZE,
        startAfterDoc: cursor
      });
      const filtered = result.items.filter(
        (e) => e.status === "Application" || e.status === "Rejected"
      );
      setApplications(filtered);
      setHasMore(result.hasMore);
      setPageCursors((prev) => {
        const next = [...prev];
        next[page - 1] = result.lastDoc;
        return next;
      });
    } catch (err) {
      console.error("Failed to load applications:", err);
      showToast("Failed to load applications", "error");
    } finally {
      setAppsLoading(false);
    }
  };

  const goToPage = (page) => {
    if (page < 1) return;
    const cursor = page > 1 ? pageCursors[page - 2] : null;
    setCurrentPage(page);
    loadPage(page, cursor);
  };

  useEffect(() => {
    if (!enquiryId) return;
    setLoading(true);
    getEnquiryById(enquiryId)
      .then((data) => {
        setEnquiry(data);
        setSelectedDept(data?.department || data?.department2 || data?.department3 || "");
      })
      .catch((err) => console.error("Error fetching enquiry:", err))
      .finally(() => setLoading(false));
  }, [enquiryId]);

  useEffect(() => {
    if (enquiryId) return;
    goToPage(1);
    getEnquiriesCount().then((count) => setTotalCount(count)).catch(() => {});
    getEnquiriesStats().then(setStats).catch(() => {});
  }, [enquiryId]);

  const departmentOptions = useMemo(() => {
    const set = new Set();
    applications.forEach((app) => {
      [app.department, app.department2, app.department3].filter(Boolean).forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [applications]);

  const applicationItems = useMemo(() => applications, [applications]);

  const filteredApplications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return applicationItems
      .filter((app) => {
        const matchesSearch = !query || [app.enquiryId, app.applicationNo, app.studentName, app.firstName, app.lastName, app.mobile]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query));
        const matchesDepartment = !departmentFilter || [app.department, app.department2, app.department3].includes(departmentFilter);
        return matchesSearch && matchesDepartment;
      });
  }, [applications, searchTerm, departmentFilter]);

  // stats now come from getEnquiriesStats (aggregation queries on the entire dataset)

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

  const handleMoveToPrincipalDetail = async () => {
    if (!selectedDept || !enquiry) return;
    setSaving(true);
    try {
      await updateEnquiry(enquiry.enquiryId, {
        ...enquiry,
        status: "Admission",
        department: selectedDept,
      });
      showToast("Moved to Principal successfully");
      setTimeout(() => navigate("/admissions/confirm"), 1500);
    } catch (err) {
      console.error("Move to Principal error:", err);
      showToast("Failed to move to Principal", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedDept || !enquiry) return;
    setSaving(true);
    try {
      await updateEnquiry(enquiry.enquiryId, {
        ...enquiry,
        status: "Admission",
        department: selectedDept,
      });
      showToast(`Admitted successfully to ${selectedDept}`);
      setTimeout(() => navigate("/admissions/enquiries"), 1500);
    } catch (err) {
      console.error("Admission error:", err);
      showToast("Failed to confirm admission", "error");
    } finally {
      setSaving(false);
    }
  };

  const generatePaymentReport = async () => {
    try {
      showToast("Generating payment report...", "success");
      const allEnquiries = await getAllEnquiries();
      const rows = [];
      allEnquiries.forEach((e) => {
        if (!Array.isArray(e.payments)) return;
        e.payments.forEach((p) => {
          if (!p.feeCategory && !p.feeAmount) return;
          rows.push([
            e.applicationNo || e.enquiryId || "-",
            e.firstName || e.lastName
              ? `${e.firstName || ""} ${e.lastName || ""}`.trim()
              : e.studentName || "-",
            p.feeCategory || "-",
            p.feeAmount || "-",
            p.paymentDate || "-",
            p.paymentMode || "-",
            p.upiNumber || "-",
          ]);
        });
      });
      if (rows.length === 0) {
        showToast("No payment records found", "error");
        return;
      }
      const doc = new jsPDF({ orientation: "portrait", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const logoImg = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "/logo.png";
      });
      let yPos = 8;
      if (logoImg) {
        const maxWidth = 180;
        const maxHeight = 30;
        const ratio = Math.min(maxWidth / logoImg.width, maxHeight / logoImg.height);
        const logoWidth = logoImg.width * ratio;
        const logoHeight = logoImg.height * ratio;
        doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 10;
      }
      doc.setFontSize(16);
      doc.text("Payment Consolidation Report", pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 6;
      autoTable(doc, {
        startY: yPos,
        head: [["Application ID", "Student Name", "Fee Category", "Amount", "Date", "Mode", "UTR Number"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [18, 12, 122] },
      });
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
      showToast("Payment report opened for printing", "success");
    } catch (err) {
      console.error("Payment report error:", err);
      showToast("Failed to generate report", "error");
    }
  };

  const choices = [
    { label: "Choice 1", value: enquiry?.department },
    { label: "Choice 2", value: enquiry?.department2 },
    { label: "Choice 3", value: enquiry?.department3 },
  ].filter((c) => Boolean(c.value));

  if (enquiryId && loading) {
    return (
      <Layout title="Admission Confirmation">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <div className="w-12 h-12 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500">Loading applicant details...</p>
        </div>
      </Layout>
    );
  }

  if (enquiryId && !enquiry) {
    return (
      <Layout title="Admission Confirmation">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold text-zinc-900">Applicant not found</h2>
          <p className="mt-2 text-zinc-500">No application matches the provided ID.</p>

        </div>
      </Layout>
    );
  }

  if (!enquiryId) {
    return (
      <>
      <Layout title="Admission Confirmation">
        <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">

          <div className="mb-6">
            <DashboardCards loading={appsLoading} stats={stats} />
          </div>

          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr_auto]">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-700">Search</span>
                <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10">
                  <Search size={18} className="text-zinc-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                    placeholder="Search by student name, mobile, or ID"
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

              <div className="flex items-end gap-3">
                <button
                  type="button"
                  onClick={() => { setSearchTerm(""); setDepartmentFilter(""); }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
                >
                  <Filter size={16} />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={generatePaymentReport}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md"
                >
                  <CreditCard size={16} />
                  Payment Report
                </button>
              </div>
            </div>
          </div>

          {appsLoading ? (
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
          ) : applicationItems.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
                <Inbox size={28} />
              </div>
              <h2 className="mt-5 text-xl font-bold text-zinc-900">No applications to confirm</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                All applications have been processed. Move enquiries to <strong>Application</strong> status first.
              </p>
              <button
                onClick={() => navigate("/admissions/enquiries")}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f0a66]"
              >
                <ArrowLeft size={18} /> Go to Enquiries
              </button>
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
                <Search size={28} />
              </div>
              <h2 className="mt-5 text-xl font-bold text-zinc-900">No applications match your filters</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Try a different department or search keyword.</p>
              <button
                type="button"
                onClick={() => { setSearchTerm(""); setDepartmentFilter(""); }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
              >
                <X size={18} />
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full border-collapse">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">App No</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Student Name</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Mobile</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Cutoff</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Department Choices</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Status</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Date</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-center text-xs font-bold uppercase tracking-wide text-zinc-600">Admission</th>
                      <th className="border-b border-zinc-200 px-4 py-4 text-center text-xs font-bold uppercase tracking-wide text-zinc-600">Action</th>
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
                          <div className="flex items-center justify-center">
                            {app.status === "Rejected" ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admissions/confirm/${app.enquiryId}`)}
                                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                                title="View rejection reason"
                              >
                                <AlertCircle size={10} />
                                Rejected by Principal
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => navigate(`/admissions/confirm/${app.enquiryId}`)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-emerald-700"
                              >
                                <Send size={10} />
                                Move to Principal
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
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

          {applicationItems.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                Page {currentPage} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} ({totalCount} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => goToPage(currentPage + 1)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {toast.show && (
          <div className="fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
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
    </>
    );
  }

  const applicantName = enquiry.firstName || enquiry.lastName
    ? `${enquiry.firstName || ""} ${enquiry.lastName || ""}`.trim()
    : enquiry.studentName || "N/A";

  const InfoRow = ({ label, value }) => (
    <div className="flex items-baseline gap-2 py-2 border-b border-zinc-100 last:border-0">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider min-w-[160px] shrink-0">{label}</span>
      <span className="text-sm font-medium text-zinc-800">{value || "-"}</span>
    </div>
  );

  const SectionCard = ({ icon: Icon, title, children }) => (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
        <div className="p-2 rounded-xl bg-[#120c7a]/10 text-[#120c7a]">
          <Icon size={18} />
        </div>
        <h3 className="font-bold text-zinc-800">{title}</h3>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );

  return (
    <Layout title="Admission Confirmation">
      <div className="mx-auto max-w-4xl px-4 pb-10 pt-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#120c7a]/70">Admissions</p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900 md:text-3xl">Admission Confirmation</h1>
            <p className="mt-1 text-sm text-zinc-500">Review applicant details and confirm admission.</p>
          </div>
          <div className="flex items-center gap-3">
            {enquiry.status === "Admission" && (
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                <CheckCircle2 size={18} /> Admitted
              </span>
            )}
            <button
              type="button"
              onClick={() => navigate("/admissions/confirm")}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-800"
            >
              <ArrowLeft size={16} />
              Back to List
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#120c7a]/10 text-[#120c7a]">
              <User size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">{applicantName}</h2>
              <p className="text-sm text-zinc-500">
                {enquiry.gender && `${enquiry.gender} | `}App No: {enquiry.applicationNo || "N/A"} | ID: {enquiry.enquiryId}
              </p>
            </div>
          </div>
        </div>

        {enquiry.status === "Rejected" && enquiry.remarks && (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <MessageCircle size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-800">Rejected by Principal</h3>
                <p className="mt-1 text-sm text-red-700 whitespace-pre-wrap">{enquiry.remarks}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <SectionCard icon={User} title="Personal Information">
            <InfoRow label="Applicant Name" value={applicantName} />
            <InfoRow label="Father / Guardian" value={enquiry.fatherGuardianName} />
            <InfoRow label="Mother Name" value={enquiry.motherName} />
            <InfoRow label="Date of Birth" value={enquiry.dateOfBirth} />
            <InfoRow label="Gender" value={enquiry.gender} />
            <InfoRow label="Nationality" value={enquiry.nationality} />
            <InfoRow label="Religion" value={enquiry.religion} />
            <InfoRow label="Community / Caste" value={[enquiry.community, enquiry.caste].filter(Boolean).join(" / ")} />
            <InfoRow label="Mother Tongue" value={enquiry.motherTongue} />
            <InfoRow label="Blood Group" value={enquiry.bloodGroup} />
            <InfoRow label="Marital Status" value={enquiry.maritalStatus} />
            <InfoRow label="Aadhar No" value={enquiry.aadharNo} />
          </SectionCard>

          <SectionCard icon={MapPin} title="Contact & Address">
            <InfoRow label="Mobile" value={enquiry.mobile} />
            <InfoRow label="Parent Mobile" value={enquiry.parentMobile} />
            <InfoRow label="Email" value={enquiry.emailId} />
            <InfoRow label="Present Address" value={[enquiry.presentAddress, enquiry.presentCity, enquiry.presentDistrict, enquiry.presentState, enquiry.presentPincode].filter(Boolean).join(", ")} />
            <InfoRow label="Permanent Address" value={[enquiry.permanentAddress, enquiry.permanentCity, enquiry.permanentDistrict, enquiry.permanentState, enquiry.permanentPincode].filter(Boolean).join(", ")} />
          </SectionCard>

          <SectionCard icon={GraduationCap} title="Academic Details">
            <InfoRow label="Programme" value={enquiry.programme} />
            <InfoRow label="Batch" value={enquiry.batch} />
            <InfoRow label="Academic Year" value={enquiry.academicYear} />
            <InfoRow label="School / College" value={enquiry.schoolCollege} />
            <InfoRow label="Qualifying Exam" value={enquiry.qualifyingExamProgrammes} />
            <InfoRow label="Institute" value={enquiry.qualifyingExamInstitute} />
            <InfoRow label="Board / University" value={enquiry.qualifyingExamBoardUniversity} />
            <InfoRow label="10th Institute" value={enquiry.qualifyingExam10thInstitute} />
            <InfoRow label="10th Board" value={enquiry.qualifyingExam10thBoard} />
            <InfoRow label="12th Institute" value={enquiry.qualifyingExam12thInstitute} />
            <InfoRow label="12th Board" value={enquiry.qualifyingExam12thBoard} />
            <InfoRow label="Maths Mark" value={enquiry.mathsMark} />
            <InfoRow label="Physics Mark" value={enquiry.physicsMark} />
            <InfoRow label="Chemistry Mark" value={enquiry.chemistryMark} />
            <InfoRow label="Total Marks" value={enquiry.totalMarks} />
            <InfoRow label="Cutoff" value={enquiry.cutoff} />
          </SectionCard>

          <SectionCard icon={FileText} title="Documents & Eligibility">
            <InfoRow label="Eligibility" value={enquiry.eligibility} />
            <InfoRow label="Quota Asked For" value={enquiry.quotaAskedFor} />
            <InfoRow label="Seat Category" value={enquiry.seatCategory} />
            <InfoRow label="Student Category" value={enquiry.studentCategory} />
            <InfoRow label="Reference" value={enquiry.reference} />
            <InfoRow label="Enquiry Attended By" value={enquiry.enquiryAttendedBy} />
            <InfoRow label="Hosteller / Day Scholar" value={enquiry.hostellerDayScholar} />
            <InfoRow label="Transport Required" value={enquiry.transportRequired} />
          </SectionCard>

          {enquiry.payments && enquiry.payments.length > 0 && (
            <SectionCard icon={CreditCard} title="Payments">
              {enquiry.payments.map((p, i) => (
                <div key={i} className="border-b border-zinc-100 last:border-0 py-2">
                  <InfoRow label={`Payment ${i + 1} - Category`} value={p.feeCategory} />
                  <InfoRow label={`Payment ${i + 1} - Amount`} value={p.feeAmount} />
                  <InfoRow label={`Payment ${i + 1} - Mode`} value={p.paymentMode} />
                  <InfoRow label={`Payment ${i + 1} - Date`} value={p.paymentDate} />
                </div>
              ))}
            </SectionCard>
          )}

          {enquiry.status === "Application" && (
            <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <Send size={22} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-zinc-900">Move to Principal</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Review the applicant's details, select a department, and move to Principal for approval.
                  </p>

                  <div className="mt-4 space-y-3">
                    <span className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Department Choices</span>
                    {choices.length === 0 ? (
                      <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
                        This applicant has no departments chosen. Please edit the application first.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {choices.map((choice, idx) => (
                          <label
                            key={idx}
                            className={`flex items-center gap-4 rounded-xl border p-4 text-sm font-medium transition-all cursor-pointer ${
                              selectedDept === choice.value
                                ? "border-[#120c7a] bg-[#120c7a]/5 text-[#120c7a]"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="admissionDept"
                              value={choice.value}
                              checked={selectedDept === choice.value}
                              onChange={() => setSelectedDept(choice.value)}
                              className="h-4 w-4 border-zinc-300 text-[#120c7a] focus:ring-[#120c7a]"
                            />
                            <div>
                              <span className="text-xs text-zinc-400 font-normal block">{choice.label}</span>
                              <span className="text-sm font-medium">{choice.value}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => navigate("/admissions/confirm")}
                      className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                      Back to List
                    </button>
                    <button
                      type="button"
                      disabled={!selectedDept || choices.length === 0}
                      onClick={handleMoveToPrincipalDetail}
                      className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
                        !selectedDept || choices.length === 0
                          ? "bg-zinc-300 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {saving ? "Moving..." : "Move to Principal"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast.show && (
        <div className={`fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl ${
          toast.type === "success" ? "bg-emerald-700" : "bg-red-600"
        }`}>
          {toast.message}
        </div>
      )}
    </Layout>
  );
}
