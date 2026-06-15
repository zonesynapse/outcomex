import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, BookOpen, CreditCard, Briefcase,
  CheckCircle2, XCircle, Eye, Send, AlertTriangle, ArrowRight,
  UserCheck, Library, Activity, Zap, FileText, Clock,
  Calendar, DollarSign, Target, Award, BarChart3, Bell,
  ChevronRight, School
} from "lucide-react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { getEnquiriesRealtime, updateEnquiry, getEnquiryById } from "../services/enquiryService";
import { useDepartments } from "../hooks/useDepartments";
import { db } from "../firebase";
import { collection, getDocs, query, where, getCountFromServer } from "firebase/firestore";

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

const formatCurrency = (value) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num);
};

export default function PrincipalDashboard() {
  const navigate = useNavigate();
  const { departments: allDeptMap } = useDepartments();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [editModal, setEditModal] = useState({ open: false, enquiry: null, saving: false });
  const [viewModal, setViewModal] = useState({ open: false, enquiry: null, loading: false });
  const [rejectModal, setRejectModal] = useState({ open: false, enquiry: null, saving: false, reason: "" });
  const [rejectError, setRejectError] = useState("");

  const [studentCount, setStudentCount] = useState(0);
  const [feeTotal, setFeeTotal] = useState(0);
  const [placedCount, setPlacedCount] = useState(0);
  const [activeDrives, setActiveDrives] = useState(0);
  const [bookCount, setBookCount] = useState(0);
  const [activeIssues, setActiveIssues] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = getEnquiriesRealtime(
      (items) => { setApplications(items); setLoading(false); },
      () => setLoading(false)
    );
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [stuSnap, plcmtSnap, drivesSnap, booksSnap, issuesSnap] = await Promise.allSettled([
          getCountFromServer(query(collection(db, "students"))),
          getCountFromServer(query(collection(db, "placement_offers"), where("status", "==", "Accepted"))),
          getCountFromServer(query(collection(db, "placement_drives"), where("status", "==", "Active"))),
          getCountFromServer(query(collection(db, "books"))),
          getCountFromServer(query(collection(db, "book_issues"), where("returned", "==", false))),
        ]);

        if (stuSnap.status === "fulfilled") setStudentCount(stuSnap.value.data().count);
        if (plcmtSnap.status === "fulfilled") setPlacedCount(plcmtSnap.value.data().count);
        if (drivesSnap.status === "fulfilled") setActiveDrives(drivesSnap.value.data().count);
        if (booksSnap.status === "fulfilled") setBookCount(booksSnap.value.data().count);
        if (issuesSnap.status === "fulfilled") setActiveIssues(issuesSnap.value.data().count);

        const feeSnap = await getDocs(collection(db, "fee_payments"));
        let total = 0;
        feeSnap.forEach((d) => { total += Number(d.data().amount) || 0; });
        setFeeTotal(total);
      } catch (err) {
        console.error("Stats load error:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    loadStats();
  }, []);

  const admissionItems = useMemo(() => applications.filter((e) => e.status === "Admission"), [applications]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: applications.length,
      today: applications.filter((e) => new Date(e.createdAt).toDateString() === today).length,
      new: applications.filter((e) => e.status === "Enquiry").length,
      application: applications.filter((e) => e.status === "Application").length,
      admission: applications.filter((e) => e.status === "Admission").length,
      approved: applications.filter((e) => e.status === "Approved").length,
      rejected: applications.filter((e) => e.status === "Rejected").length,
    };
  }, [applications]);

  const pendingApprovals = useMemo(() => {
    return admissionItems.slice(0, 10);
  }, [admissionItems]);

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
      } catch (e) { console.error(e); }
    }
    setViewModal({ open: true, enquiry: app, loading: false });
  };

  const closeViewModal = () => setViewModal({ open: false, enquiry: null, loading: false });
  const openEditModal = (app) => setEditModal({ open: true, enquiry: app, saving: false });
  const closeEditModal = () => setEditModal({ open: false, enquiry: null, saving: false });

  const handleEditSave = async (values) => {
    if (!editModal.enquiry?.enquiryId) return;
    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateEnquiry(editModal.enquiry.enquiryId, { ...editModal.enquiry, ...values });
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
    if (!rejectModal.reason.trim()) { setRejectError("Please fill the message"); return; }
    setRejectModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateEnquiry(app.enquiryId, { ...app, status: "Rejected", remarks: rejectModal.reason || "Rejected by Principal" });
      showToast("Admission rejected");
      closeRejectModal();
    } catch (err) {
      console.error("Reject error:", err);
      showToast("Failed to reject admission", "error");
      setRejectModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const kpiCards = [
    { key: "students", label: "Total Students", value: studentCount, icon: GraduationCap, color: "blue", href: "/course-enrolment", format: (v) => v.toLocaleString() },
    { key: "pending", label: "Pending Approvals", value: stats.admission, icon: Clock, color: "amber", href: null, format: (v) => String(v) },
    { key: "enquiries", label: "Total Enquiries", value: stats.total, icon: FileText, color: "indigo", href: "/admissions/enquiries", format: (v) => v.toLocaleString() },
    { key: "placed", label: "Students Placed", value: placedCount, icon: Briefcase, color: "emerald", href: "/placement/dashboard", format: (v) => v.toLocaleString() },
    { key: "fee", label: "Fee Collected", value: feeTotal, icon: CreditCard, color: "violet", href: "/fee/dashboard", format: (v) => formatCurrency(v) },
  ];

  const colorMap = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", border: "border-blue-200", gradient: "from-blue-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-200", gradient: "from-amber-500" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", border: "border-indigo-200", gradient: "from-indigo-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200", gradient: "from-emerald-500" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-200", gradient: "from-violet-500" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-200", gradient: "from-rose-500" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-600", iconBg: "bg-cyan-100", border: "border-cyan-200", gradient: "from-cyan-500" },
  };

  const quickActions = [
    { label: "Admission Confirmation", icon: UserCheck, desc: "Review & approve applications", href: "/admissions/confirm", color: "bg-emerald-500" },
    { label: "Fee Dashboard", icon: DollarSign, desc: "Fee collection & reports", href: "/fee/dashboard", color: "bg-violet-500" },
    { label: "Placement Overview", icon: Briefcase, desc: "Drives, offers & placements", href: "/placement/dashboard", color: "bg-blue-500" },
    { label: "Library", icon: Library, desc: "Catalog, circulation & reports", href: "/library/catalog", color: "bg-amber-500" },
    { label: "Attendance", icon: Activity, desc: "Daily & overall attendance", href: "/attendance", color: "bg-rose-500" },
    { label: "Course Enrolment", icon: BookOpen, desc: "Student course registration", href: "/course-enrolment", color: "bg-cyan-500" },
    { label: "Academic Calendar", icon: Calendar, desc: "Events & holidays", href: "/academic-calendar", color: "bg-orange-500" },
    { label: "Marks Entry", icon: Award, desc: "Internal assessment marks", href: "/markk", color: "bg-teal-500" },
  ];

  const moduleCards = [
    {
      title: "Admissions", icon: UserCheck, color: "emerald",
      href: "/admissions/enquiries",
      stats: [
        { label: "Today", value: stats.today },
        { label: "Enquiries", value: stats.new },
        { label: "Applications", value: stats.application },
        { label: "Approved", value: stats.approved },
      ]
    },
    {
      title: "Fee Management", icon: CreditCard, color: "violet",
      href: "/fee/dashboard",
      stats: [
        { label: "Collected", value: formatCurrency(feeTotal) },
        { label: "Active Drives", value: activeDrives },
      ]
    },
    {
      title: "Placements", icon: Briefcase, color: "blue",
      href: "/placement/dashboard",
      stats: [
        { label: "Placed", value: placedCount },
        { label: "Active Drives", value: activeDrives },
      ]
    },
    {
      title: "Library", icon: Library, color: "amber",
      href: "/library/catalog",
      stats: [
        { label: "Books", value: bookCount },
        { label: "Issued", value: activeIssues },
      ]
    },
    {
      title: "Academics", icon: GraduationCap, color: "rose",
      href: "/academic-calendar",
      stats: [
        { label: "Students", value: studentCount },
        { label: "Courses", value: "-" },
      ]
    },
    {
      title: "Outcome Based Edu.", icon: Target, color: "cyan",
      href: "/co_configuration",
      stats: [
        { label: "CO's", value: "-" },
        { label: "PO's", value: "-" },
      ]
    },
  ];

  return (
    <>
      <Layout title="Principal Dashboard">
        <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">

          {/* Welcome Header */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-white/10">
                    <School size={24} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Principal Dashboard</h1>
                    <p className="text-blue-200 text-sm">{dateStr}</p>
                  </div>
                </div>
                <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                  Overview of institution activities across all departments and modules.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate("/admissions/confirm")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                  <Bell size={16} />
                  <span className="hidden sm:inline">Pending</span>
                  {stats.admission > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {stats.admission}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
            {kpiCards.map((kpi) => {
              const c = colorMap[kpi.color];
              const Icon = kpi.icon;
              const navHref = kpi.href;
              return (
                <div key={kpi.key}
                  onClick={() => navHref && navigate(navHref)}
                  className={`relative bg-white rounded-2xl border ${c.border} shadow-sm p-5 transition-all duration-200 ${navHref ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                      <Icon size={20} className={c.text} />
                    </div>
                    {navHref && <ChevronRight size={16} className="text-zinc-300" />}
                  </div>
                  <p className="text-2xl font-bold text-zinc-900 tracking-tight">
                    {statsLoading && ["students", "placed", "fee"].includes(kpi.key) ? (
                      <span className="inline-block w-16 h-6 rounded bg-zinc-200 animate-pulse" />
                    ) : (
                      kpi.format(kpi.value)
                    )}
                  </p>
                  <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{kpi.label}</p>
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Zap size={20} className="text-amber-500" />
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
              {quickActions.map((action) => (
                <button key={action.label}
                  onClick={() => navigate(action.href)}
                  className="group bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center mx-auto mb-2 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                    <action.icon size={18} className="text-white" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-700 leading-tight">{action.label}</p>
                  <p className="text-[9px] text-zinc-400 mt-0.5 hidden sm:block">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Pending Approvals */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Clock size={20} className="text-amber-500" />
                Pending Approvals
                {stats.admission > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{stats.admission}</span>
                )}
              </h2>
              <button onClick={() => navigate("/admissions/confirm")}
                className="text-xs font-semibold text-[#120c7a] hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              </div>
            ) : pendingApprovals.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">All Clear!</h3>
                <p className="text-sm text-zinc-500 mt-1">No pending approvals. All applications have been processed.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Applicant</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Application No</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dept. Choice</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {pendingApprovals.map((app) => (
                        <tr key={app.enquiryId} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#120c7a]/10 text-[#120c7a] flex items-center justify-center text-xs font-bold">
                                {(app.firstName || app.studentName || "?").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-zinc-900">
                                  {app.firstName || app.lastName
                                    ? `${app.firstName || ""} ${app.lastName || ""}`.trim()
                                    : app.studentName || "-"}
                                </p>
                                <p className="text-[10px] text-zinc-500">{app.mobile || "-"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-[#120c7a]">{app.applicationNo || app.enquiryId}</td>
                          <td className="px-5 py-4">
                            <span className="inline-flex px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold border border-blue-100">
                              {app.department || app.department2 || app.department3 || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-zinc-600">{formatDate(app.enquiryDate || app.createdAt)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => handleApprove(app)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                title="Approve">
                                <CheckCircle2 size={12} /> Approve
                              </button>
                              <button onClick={() => openRejectModal(app)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-bold border border-red-200 hover:bg-red-100 transition-colors"
                                title="Reject">
                                <XCircle size={12} /> Reject
                              </button>
                              <button onClick={() => openViewModal(app)}
                                className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:border-[#120c7a] hover:text-[#120c7a] transition-colors"
                                title="View">
                                <Eye size={14} />
                              </button>
                              <button onClick={() => openEditModal(app)}
                                className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:border-blue-500 hover:text-blue-600 transition-colors"
                                title="Edit">
                                <Send size={14} />
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
          </div>

          {/* Module Overview */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-indigo-500" />
                Module Overview
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {moduleCards.map((mod) => {
                const c = colorMap[mod.color];
                const Icon = mod.icon;
                return (
                  <div key={mod.title}
                    onClick={() => navigate(mod.href)}
                    className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                        <Icon size={18} className={c.text} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-zinc-900">{mod.title}</h3>
                      </div>
                      <ChevronRight size={16} className="text-zinc-300 group-hover:text-zinc-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {mod.stats.map((s) => (
                        <div key={s.label}>
                          <p className="text-lg font-bold text-zinc-900">{s.value}</p>
                          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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

      <AddEnquiryModal open={editModal.open} mode="edit" initialValues={editModal.enquiry}
        departments={departmentList} saving={editModal.saving}
        onClose={closeEditModal} onSubmit={handleEditSave} />

      <AddEnquiryModal open={viewModal.open} mode="view" initialValues={viewModal.enquiry}
        departments={departmentList} saving={false}
        onClose={closeViewModal} onSubmit={closeViewModal} />

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
                <p className="text-sm text-zinc-500">{rejectModal.enquiry?.firstName || rejectModal.enquiry?.studentName}</p>
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Reason for Rejection</span>
              <textarea value={rejectModal.reason}
                onChange={(e) => { setRejectModal((prev) => ({ ...prev, reason: e.target.value })); setRejectError(""); }}
                rows={4}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all resize-none ${
                  rejectError ? "border-red-400 ring-2 ring-red-100" : "border-zinc-200 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                }`}
                placeholder="Enter reason for rejecting this admission..." />
              {rejectError && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertTriangle size={12} /> {rejectError}
                </p>
              )}
            </label>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={closeRejectModal}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50">
                Cancel
              </button>
              <button type="button" disabled={rejectModal.saving} onClick={handleConfirmReject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                {rejectModal.saving ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}