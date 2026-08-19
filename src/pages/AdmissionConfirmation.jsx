import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, User, MapPin, GraduationCap, FileText, CreditCard, AlertCircle, Inbox, Search, Filter, X, Eye, Edit2, Send, MessageCircle, Clock, XCircle, Users, Calendar } from "lucide-react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import DashboardCards from "../components/DashboardCards";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { getEnquiryById, updateEnquiry, getEnquiriesPaginated, getEnquiriesCount, getEnquiriesStats, getAllEnquiries } from "../services/enquiryService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useDepartments } from "../hooks/useDepartments";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { formatProgrammeKey, sanitizeKey } from "../lib/utils";

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
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [selectedDept, setSelectedDept] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editModal, setEditModal] = useState({ open: false, enquiry: null, saving: false });
  const [pageCursors, setPageCursors] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, new: 0, application: 0, admission: 0, approved: 0 });
  const [searchResults, setSearchResults] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const { departments: allDeptMap } = useDepartments();
  const PAGE_SIZE = 20;

  const [paymentReportModalOpen, setPaymentReportModalOpen] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [feeCategoryOptions, setFeeCategoryOptions] = useState([]);
  const [selectedFeeCategories, setSelectedFeeCategories] = useState([]);
  const [reportGenerating, setReportGenerating] = useState(false);

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
        (e) => e.status === "Application" || e.status === "Admission" || e.status === "Rejected" || e.status === "Approved"
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
  }, [enquiryId, refreshTrigger]);

  useEffect(() => {
    if (enquiryId) return;
    goToPage(currentPage);
    getEnquiriesCount().then((count) => setTotalCount(count)).catch(() => {});
    getEnquiriesStats().then(setStats).catch(() => {});
  }, [enquiryId, refreshTrigger]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const all = await getAllEnquiries();
        const q = searchTerm.trim().toLowerCase();
        const filtered = all.filter((e) =>
          e.status === "Application" || e.status === "Admission" || e.status === "Rejected"
        ).filter((app) =>
          [app.enquiryId, app.applicationNo, app.studentName, app.firstName, app.lastName, app.mobile]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(q))
        );
        setSearchResults(filtered);
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, refreshTrigger]);

  const programmeOptions = useMemo(() => {
    return Object.keys(allDeptMap || {}).sort();
  }, [allDeptMap]);

  const departmentOptions = useMemo(() => {
    let fromConfig;
    if (programmeFilter) {
      fromConfig = allDeptMap?.[programmeFilter] || [];
    } else {
      fromConfig = Object.values(allDeptMap || {}).flat();
    }
    return fromConfig.sort((left, right) => left.localeCompare(right));
  }, [allDeptMap, programmeFilter]);

  const applicationItems = useMemo(() => searchResults !== null ? searchResults : applications, [applications, searchResults]);

  const filteredApplications = useMemo(() => {
    const source = searchResults !== null ? searchResults : applications;
    const progDeptList = programmeFilter ? (allDeptMap?.[programmeFilter] || []) : [];
    return source.filter((app) => {
      const matchesProgramme = !programmeFilter ||
        progDeptList.includes(app.department) ||
        progDeptList.includes(app.department2) ||
        progDeptList.includes(app.department3);
      const matchesDepartment = !departmentFilter || [app.department, app.department2, app.department3].includes(departmentFilter);
      const matchesStatus = !statusFilter || app.status === statusFilter;
      return matchesProgramme && matchesDepartment && matchesStatus;
    });
  }, [applications, searchResults, programmeFilter, departmentFilter, statusFilter, allDeptMap]);

  // stats now come from getEnquiriesStats (aggregation queries on the entire dataset)

  const departmentList = useMemo(() => {
    return Object.values(allDeptMap || {}).flat().sort((a, b) => a.localeCompare(b));
  }, [allDeptMap]);

  const openViewModal = (app) => {
    if (!app) return;
    const targetId = app?.enquiryId || app?.id || app?.docId || app?.applicationNo;
    if (targetId) {
      navigate(`/admissions/confirm/${targetId}`);
    }
  };

  const openEditModal = (app) => {
    if (app?.status === "Admission" || app?.status === "Approved") return;
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
      setRefreshTrigger(prev => prev + 1);
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

  const handleCardClick = (cardKey) => {
    const statusMap = {
      approved: "Approved",
      application: "Application",
      new: "Enquiry",
    };
    setStatusFilter(statusMap[cardKey] || "");
    setSearchTerm("");
    setProgrammeFilter("");
    setDepartmentFilter("");
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const addStudentToNamelist = async (data) => {
    try {
      const regNo = data.applicationNo || data.enquiryId;
      if (!regNo) return;
      const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.studentName || "-";
      const progKey = formatProgrammeKey(data.programme);
      if (!data.batch || !progKey || !data.department) return;
      const studentDocId = `${sanitizeKey(data.batch)}_${progKey}_${sanitizeKey(data.department)}`;
      const studentRef = doc(db, 'students', studentDocId);
      const snap = await getDoc(studentRef);
      const existingData = snap.exists() ? snap.data() : {};
      const order = existingData._order || [];
      if (!order.includes(regNo)) {
        order.push(regNo);
      }
      order.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
      const joiningAY = existingData._joiningAY || {};
      await setDoc(studentRef, {
        ...existingData,
        [regNo]: name,
        _order: order,
        _joiningAY: { ...joiningAY, [regNo]: data.academicYear || "" }
      });
    } catch (err) {
      console.error("Failed to add student to namelist:", err);
    }
  };

  const handlePrincipalApprove = async () => {
    if (!enquiry?.enquiryId) return;
    setSaving(true);
    try {
      await updateEnquiry(enquiry.enquiryId, {
        ...enquiry,
        status: "Approved",
      });
      await addStudentToNamelist(enquiry);
      showToast("Admitted successfully");
      setTimeout(() => navigate("/admissions/confirm"), 1500);
    } catch (err) {
      console.error("Approve error:", err);
      showToast("Failed to approve admission", "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePrincipalReject = async () => {
    if (!enquiry?.enquiryId) return;
    if (!rejectReason.trim()) { setRejectError("Please enter a reason"); return; }
    setSaving(true);
    try {
      await updateEnquiry(enquiry.enquiryId, {
        ...enquiry,
        status: "Rejected",
        remarks: rejectReason,
      });
      showToast("Admission rejected");
      setTimeout(() => navigate("/admissions/confirm"), 1500);
    } catch (err) {
      console.error("Reject error:", err);
      showToast("Failed to reject admission", "error");
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

  const openPaymentReportModal = async () => {
    setPaymentReportModalOpen(true);
    setReportGenerating(true);
    try {
      const all = await getAllEnquiries();
      const cats = new Set();
      all.forEach((e) => {
        if (!Array.isArray(e.payments)) return;
        e.payments.forEach((p) => {
          if (p.feeCategory) cats.add(p.feeCategory);
        });
      });
      const sorted = Array.from(cats).sort();
      setFeeCategoryOptions(sorted);
      setSelectedFeeCategories(sorted);
    } catch (err) {
      console.error("Failed to load fee categories:", err);
      showToast("Failed to load payment data", "error");
    } finally {
      setReportGenerating(false);
    }
  };

  const handleSelectAllFeeCategories = (checked) => {
    setSelectedFeeCategories(checked ? [...feeCategoryOptions] : []);
  };

  const handleToggleFeeCategory = (cat) => {
    setSelectedFeeCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const parsePaymentDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      const parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  const handleGeneratePaymentReport = async () => {
    if (selectedFeeCategories.length === 0) {
      showToast("Select at least one fee category", "error");
      return;
    }
    setReportGenerating(true);
    try {
      const allEnquiries = await getAllEnquiries();
      const rows = [];
      const dateFrom = reportDateFrom ? new Date(reportDateFrom + "T00:00:00") : null;
      const dateTo = reportDateTo ? new Date(reportDateTo + "T23:59:59") : null;
      allEnquiries.forEach((e) => {
        if (!Array.isArray(e.payments)) return;
        e.payments.forEach((p) => {
          if (!p.feeCategory && !p.feeAmount) return;
          if (!selectedFeeCategories.includes(p.feeCategory)) return;
          if (p.paymentDate) {
            const pd = parsePaymentDate(p.paymentDate);
            if (pd) {
              if (dateFrom && pd < dateFrom) return;
              if (dateTo && pd > dateTo) return;
            }
          }
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
        showToast("No payment records match the filters", "error");
        setReportGenerating(false);
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
      const title =
        selectedFeeCategories.length === feeCategoryOptions.length
          ? "Overall Payment Report"
          : `Payment Report: ${selectedFeeCategories.join(" + ")}`;
      doc.text(title, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.setFontSize(10);
      let dateInfo = "All time";
      if (dateFrom && dateTo) dateInfo = `${dateFrom.toLocaleDateString("en-IN")} - ${dateTo.toLocaleDateString("en-IN")}`;
      else if (dateFrom) dateInfo = `From ${dateFrom.toLocaleDateString("en-IN")}`;
      else if (dateTo) dateInfo = `Till ${dateTo.toLocaleDateString("en-IN")}`;
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")} | ${dateInfo}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      autoTable(doc, {
        startY: yPos,
        head: [["Application ID", "Student Name", "Fee Category", "Amount", "Date", "Mode", "UTR Number"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [18, 12, 122] },
        showFoot: 'lastPage',
        foot: [["", "", "Total", rows.reduce((s, r) => s + (parseFloat(r[3]) || 0), 0).toFixed(2), "", "", ""]],
        footStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "right" },
      });
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
      setPaymentReportModalOpen(false);
      showToast("Payment report generated", "success");
    } catch (err) {
      console.error("Payment report error:", err);
      showToast("Failed to generate report", "error");
    } finally {
      setReportGenerating(false);
    }
  };

  const findProgrammeForDept = (dept) => {
    if (!dept || !allDeptMap) return "";
    for (const [prog, depts] of Object.entries(allDeptMap)) {
      if (depts.includes(dept)) return prog;
    }
    return "";
  };

  const generateAdmittedListPdf = async () => {
    setReportGenerating(true);
    try {
      const allEnquiries = await getAllEnquiries();
      let list = allEnquiries.filter((a) => a.status === "Approved");
      if (programmeFilter) {
        const progOfDept = (dept) => {
          if (!dept || !allDeptMap) return "";
          for (const [prog, depts] of Object.entries(allDeptMap)) {
            if (depts.includes(dept)) return prog;
          }
          return "";
        };
        list = list.filter((a) => progOfDept(a.department) === programmeFilter);
      }
      if (departmentFilter) {
        list = list.filter((a) => a.department === departmentFilter);
      }
      if (list.length === 0) {
        showToast("No admitted students to export", "error");
        setReportGenerating(false);
        return;
      }
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "portrait", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      const logoImg = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "/logo.png";
      });
      let yPos = 8;
      if (logoImg) {
        const logoWidth = pageWidth - margin * 2;
        const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
        doc.addImage(logoImg, "PNG", margin, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 3;
      }

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("ADMITTED STUDENTS LIST", pageWidth / 2, yPos, { align: "center" });
      yPos += 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}  |  Total Admitted: ${list.length}`, pageWidth / 2, yPos, { align: "center" });
      doc.setTextColor(0, 0, 0);
      yPos += 4;

      if (programmeFilter || departmentFilter) {
        const filters = [];
        if (programmeFilter) filters.push(`Programme: ${programmeFilter}`);
        if (departmentFilter) filters.push(`Department: ${departmentFilter}`);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(`Filter: ${filters.join(" | ")}`, margin, yPos);
        yPos += 5;
      }

      const rows = list.map((a, i) => [
        i + 1,
        a.applicationNo || a.enquiryId || "-",
        [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || a.studentName || "-",
        a.department || "-",
        a.community || "-",
        a.seatCategory || a.quotaAskedFor || a.quota || "-",
        a.studentCategory || a.category || "-",
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["S.No", "Admission No", "Student Name", "Department", "Community", "Seat Cat.", "Student Cat."]],
        body: rows,
        styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, halign: "center", cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 24, halign: "center" },
          2: { cellWidth: 46 },
          3: { cellWidth: 49 },
          4: { cellWidth: 16, halign: "center" },
          5: { cellWidth: 15, halign: "center" },
          6: { cellWidth: 20, halign: "center" },
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text(
            `Page ${doc.internal.getNumberOfPages()}`,
            pageWidth - margin,
            pageHeight - 8,
            { align: "right" }
          );
          doc.text("CKCET — Admitted Students List", margin, pageHeight - 8);
          doc.setTextColor(0, 0, 0);
        },
      });

      const blobUrl = doc.output("bloburl");
      window.open(blobUrl, "_blank");
      showToast("Admitted list PDF generated", "success");
    } catch (err) {
      console.error("Admitted list PDF error:", err);
      showToast("Failed to generate PDF", "error");
    } finally {
      setReportGenerating(false);
    }
  };

  const generateReceipt = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 15;

    // College header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CKCET - ADMISSION RECEIPT", pageWidth / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Chennai Krishnaswamy College of Engineering & Technology", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("(Approved by AICTE, Affiliated to Anna University)", pageWidth / 2, y, { align: "center" });
    y += 12;

    // Receipt details
    const choice1Dept = enquiry.department || "";
    const programme = findProgrammeForDept(choice1Dept);

    const receiptData = [
      ["Receipt No", `ADM-${enquiry.applicationNo || enquiry.enquiryId || "N/A"}`],
      ["Date", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })],
      ["Application No", enquiry.applicationNo || "-"],
      ["Student Name", applicantName],
      ["Father / Guardian", enquiry.fatherGuardianName || enquiry.fatherName || enquiry.guardianName || "-"],
      ["Programme", programme || enquiry.programme || "-"],
      ["Choice 1 - Department", choice1Dept || "-"],
      ["Batch", enquiry.batch || "-"],
      ["Academic Year", enquiry.academicYear || "-"],
      ["Seat Category", enquiry.seatCategory || enquiry.quotaAskedFor || enquiry.quota || "-"],
      ["Student Category", enquiry.studentCategory || enquiry.category || "-"],
      ["Scholarship Details", enquiry.scholarshipDetails || enquiry.scholarship || "-"],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Field", "Details"]],
      body: receiptData,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 55 },
        1: { cellWidth: "auto" },
      },
    });

    y = doc.lastAutoTable.finalY + 15;

    // Fee details if payments exist
    if (enquiry.payments && enquiry.payments.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Fee Details", pageWidth / 2, y, { align: "center" });
      y += 8;

      const feeRows = enquiry.payments.map((p, i) => [
        `Payment ${i + 1}`,
        p.feeCategory || "-",
        p.feeAmount || "-",
        p.paymentMode || "-",
        p.paymentDate || "-",
      ]);
      const totalAmount = enquiry.payments.reduce((sum, p) => sum + (parseFloat(p.feeAmount) || 0), 0);

      autoTable(doc, {
        startY: y,
        head: [["#", "Category", "Amount", "Mode", "Date"]],
        body: feeRows,
        foot: [["", "Total", totalAmount.toFixed(2), "", ""]],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [240, 240, 240], fontStyle: "bold", fontSize: 8 },
      });

      y = doc.lastAutoTable.finalY + 15;
    }

    // Student details section
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Student Information", pageWidth / 2, y, { align: "center" });
    y += 8;

    const studentInfo = [
      ["Mobile", enquiry.mobile || "-"],
      ["Email", enquiry.emailId || "-"],
      ["Gender", enquiry.gender || "-"],
      ["Date of Birth", enquiry.dateOfBirth || "-"],
      ["Community", enquiry.community || "-"],
      ["Address", [enquiry.permanentAddress, enquiry.permanentCity, enquiry.permanentDistrict, enquiry.permanentState].filter(Boolean).join(", ") || "-"],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Field", "Details"]],
      body: studentInfo,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [100, 100, 100], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40 },
        1: { cellWidth: "auto" },
      },
    });

    y = doc.lastAutoTable.finalY + 20;

    // Footer
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text("This is a computer-generated receipt and does not require a signature.", pageWidth / 2, y, { align: "center" });
    y += 4;
    doc.text(`Generated on: ${new Date().toLocaleString("en-IN")}`, pageWidth / 2, y, { align: "center" });

    // Save/print
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  };

  const choices = [
    { label: "Choice 1", value: enquiry?.department },
    { label: "Choice 2", value: enquiry?.department2 },
    { label: "Choice 3", value: enquiry?.department3 },
  ].filter((c) => Boolean(c.value));

  const otherDeptOptions = useMemo(() => {
    if (!enquiry?.programme || !allDeptMap) return [];
    const chosen = [enquiry.department, enquiry.department2, enquiry.department3].filter(Boolean);
    return (allDeptMap[enquiry.programme] || [])
      .filter((d) => !chosen.includes(d))
      .sort((a, b) => a.localeCompare(b));
  }, [enquiry, allDeptMap]);

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
            <DashboardCards loading={appsLoading} stats={stats} onCardClick={handleCardClick} cards={[
              { key: "total", label: "Total Enquiries", icon: Users, accent: "#120c7a" },
              { key: "today", label: "Today Enquiries", icon: Calendar, accent: "#120c7a" },
              { key: "new", label: "Enquiry", icon: Clock, accent: "#120c7a" },
              { key: "application", label: "Application", icon: FileText, accent: "#120c7a" },
              { key: "approved", label: "Admitted", icon: CheckCircle2, accent: "#120c7a" },
            ]} />
          </div>

          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
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
                <span className="mb-2 block text-sm font-semibold text-zinc-700">Programme</span>
                <div className="relative">
                  <select
                    value={programmeFilter}
                    onChange={(event) => { setProgrammeFilter(event.target.value); setDepartmentFilter(""); }}
                    className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                  >
                    <option value="">All Programmes</option>
                    {programmeOptions.map((prog) => (
                      <option key={prog} value={prog}>{prog}</option>
                    ))}
                  </select>
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
                  onClick={() => { setSearchTerm(""); setProgrammeFilter(""); setDepartmentFilter(""); }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
                >
                  <Filter size={16} />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={openPaymentReportModal}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md border border-emerald-600"
                >
                  <CreditCard size={16} />
                  Payment Report
                </button>
                <button
                  type="button"
                  onClick={generateAdmittedListPdf}
                  disabled={!statusFilter || reportGenerating}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#120c7a] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0e0960] hover:shadow-md border border-[#120c7a] disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Export the currently filtered (Admitted) list as a PDF"
                >
                  <FileText size={16} />
                  Export Admitted PDF
                </button>
              </div>
            </div>
          </div>

          {statusFilter && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold text-emerald-800">
                Showing: <span className="capitalize">{statusFilter.toLowerCase()}</span> students ({filteredApplications.length})
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer"
              >
                <X size={12} /> Clear filter
              </button>
            </div>
          )}

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
                      <tr key={app.enquiryId} onClick={() => openViewModal(app)} className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80 cursor-pointer">
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
                                onClick={(e) => { e.stopPropagation(); navigate(`/admissions/confirm/${app.enquiryId}`); }}
                                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                                title="View rejection reason"
                              >
                                <AlertCircle size={10} />
                                Rejected by Principal
                              </button>
                            ) : app.status === "Approved" ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 size={10} />
                                Admitted
                              </span>
                            ) : app.status === "Admission" ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/admissions/confirm/${app.enquiryId}`); }}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                                title="Pending principal approval"
                              >
                                <Clock size={10} />
                                Pending Approval
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/admissions/confirm/${app.enquiryId}`); }}
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
                              onClick={(e) => { e.stopPropagation(); openViewModal(app); }}
                              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 p-2 text-zinc-600 transition-all hover:border-[#120c7a] hover:text-[#120c7a] hover:bg-[#120c7a]/5"
                              title="View Details"
                            >
                              <Eye size={16} />
                            </button>
                            {app?.status !== "Admission" && app?.status !== "Approved" && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEditModal(app); }}
                                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 p-2 text-zinc-600 transition-all hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                title="Edit Application"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {applicationItems.length > 0 && searchResults === null && (
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

      {paymentReportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Payment Report</h3>
                  <p className="text-xs text-zinc-500">Apply filters to generate a custom payment report</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">From Date</label>
                  <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">To Date</label>
                  <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10" />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-2">Fee Categories</label>
                <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 cursor-pointer hover:bg-zinc-100 transition-colors mb-2">
                  <input type="checkbox" checked={selectedFeeCategories.length === feeCategoryOptions.length}
                    onChange={(e) => handleSelectAllFeeCategories(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-[#120c7a] focus:ring-[#120c7a]" />
                  <span className="text-sm font-semibold text-zinc-700">Select All</span>
                </label>
                <div className="max-h-44 overflow-y-auto space-y-1 rounded-xl border border-zinc-200 p-2">
                  {feeCategoryOptions.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-4">No fee categories found</p>
                  ) : (
                    feeCategoryOptions.map((cat) => (
                      <label key={cat} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors">
                        <input type="checkbox" checked={selectedFeeCategories.includes(cat)}
                          onChange={() => handleToggleFeeCategory(cat)}
                          className="h-4 w-4 rounded border-zinc-300 text-[#120c7a] focus:ring-[#120c7a]" />
                        <span className="text-sm text-zinc-700">{cat}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">{selectedFeeCategories.length} of {feeCategoryOptions.length} selected</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
                <button type="button" onClick={() => setPaymentReportModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50">
                  Cancel
                </button>
                <button type="button" onClick={handleGeneratePaymentReport}
                  disabled={reportGenerating || selectedFeeCategories.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {reportGenerating ? (
                    <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                  ) : (
                    <><CreditCard size={16} /> Generate Report</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AddEnquiryModal
        open={editModal.open}
        mode="edit"
        initialValues={editModal.enquiry}
        departments={departmentList}
        saving={editModal.saving}
        onClose={closeEditModal}
        onSubmit={handleEditSave}
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
              <span className="inline-flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                <Clock size={18} /> Pending Principal Approval
              </span>
            )}
            {enquiry.status === "Approved" && (
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                <CheckCircle2 size={18} /> Admitted
              </span>
            )}
            <div className="flex items-center gap-2">
              {enquiry.status === "Approved" && (
                <button
                  type="button"
                  onClick={generateReceipt}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0e0960]"
                >
                  <FileText size={16} />
                  Generate Receipt
                </button>
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
            <InfoRow label="Gender" value={enquiry.gender} />
            <InfoRow label="Date of Birth" value={enquiry.dateOfBirth} />
            <InfoRow label="Age" value={enquiry.age} />
          </SectionCard>

          <SectionCard icon={MapPin} title="Contact Details">
            <InfoRow label="Mobile" value={enquiry.mobile} />
            <InfoRow label="Parent Mobile" value={enquiry.parentMobile} />
            <InfoRow label="Email" value={enquiry.emailId} />
          </SectionCard>

          <SectionCard icon={GraduationCap} title="Academic Details">
            <InfoRow label="Programme" value={enquiry.programme} />
            <InfoRow label="Batch" value={enquiry.batch} />
            <InfoRow label="Academic Year" value={enquiry.academicYear} />
            <InfoRow label="School / College" value={enquiry.schoolCollege} />
            <InfoRow label="Medium of Instruction" value={enquiry.mediumOfInstruction} />
            <InfoRow label="Enquiry For" value={enquiry.enquiryFor} />
            <InfoRow label="Examination Passed / Appeared" value={enquiry.examinationPassedAppeared} />
            <InfoRow label="Qualifying Exam" value={enquiry.qualifyingExamProgrammes} />
            <InfoRow label="Institute" value={enquiry.qualifyingExamInstitute} />
            <InfoRow label="Board / University" value={enquiry.qualifyingExamBoardUniversity} />
            <InfoRow label="Month & Year of Passing" value={enquiry.qualifyingExamMonthYear} />
            <InfoRow label="No. of Attempts" value={enquiry.qualifyingExamAttempts} />
            <InfoRow label="% of Marks" value={enquiry.qualifyingExamMarks} />
            <InfoRow label="10th Institute" value={enquiry.qualifyingExam10thInstitute} />
            <InfoRow label="10th Board" value={enquiry.qualifyingExam10thBoard} />
            <InfoRow label="10th Month & Year" value={enquiry.qualifyingExam10thMonthYear} />
            <InfoRow label="10th Attempts" value={enquiry.qualifyingExam10thAttempts} />
            <InfoRow label="10th % Marks" value={enquiry.qualifyingExam10thMarks} />
            <InfoRow label="11th Institute" value={enquiry.qualifyingExam11thInstitute} />
            <InfoRow label="11th Board" value={enquiry.qualifyingExam11thBoard} />
            <InfoRow label="11th Month & Year" value={enquiry.qualifyingExam11thMonthYear} />
            <InfoRow label="11th Attempts" value={enquiry.qualifyingExam11thAttempts} />
            <InfoRow label="11th % Marks" value={enquiry.qualifyingExam11thMarks} />
            <InfoRow label="12th Institute" value={enquiry.qualifyingExam12thInstitute} />
            <InfoRow label="12th Board" value={enquiry.qualifyingExam12thBoard} />
            <InfoRow label="12th Month & Year" value={enquiry.qualifyingExam12thMonthYear} />
            <InfoRow label="12th Attempts" value={enquiry.qualifyingExam12thAttempts} />
            <InfoRow label="12th % Marks" value={enquiry.qualifyingExam12thMarks} />
            <InfoRow label="Diploma / Degree Institute" value={enquiry.qualifyingExamDipDegInstitute} />
            <InfoRow label="Diploma / Degree Board" value={enquiry.qualifyingExamDipDegBoard} />
            <InfoRow label="Diploma / Degree Month & Year" value={enquiry.qualifyingExamDipDegMonthYear} />
            <InfoRow label="Diploma / Degree Attempts" value={enquiry.qualifyingExamDipDegAttempts} />
            <InfoRow label="Diploma / Degree % Marks" value={enquiry.qualifyingExamDipDegMarks} />
            <InfoRow label="Maths Mark" value={enquiry.mathsMark} />
            <InfoRow label="Physics Mark" value={enquiry.physicsMark} />
            <InfoRow label="Chemistry Mark" value={enquiry.chemistryMark} />
            <InfoRow label="Total Marks" value={enquiry.totalMarks} />
            <InfoRow label="Cutoff" value={enquiry.cutoff} />
          </SectionCard>

          <SectionCard icon={FileText} title="Application & Eligibility">
            <InfoRow label="Application No" value={enquiry.applicationNo} />
            <InfoRow label="Department Choices" value={[enquiry.department, enquiry.department2, enquiry.department3].filter(Boolean).join(" / ")} />
            <InfoRow label="Eligibility" value={enquiry.eligibility} />
            <InfoRow label="Quota Asked For" value={enquiry.quotaAskedFor || enquiry.seatCategory} />
            <InfoRow label="Seat Category" value={enquiry.seatCategory || enquiry.quotaAskedFor || enquiry.quota} />
            <InfoRow label="Student Category" value={enquiry.studentCategory || enquiry.category} />
            <InfoRow label="Scholarship Details" value={enquiry.scholarshipDetails || enquiry.scholarship} />
            <InfoRow label="Status" value={enquiry.status} />
          </SectionCard>

          {enquiry.payments && enquiry.payments.length > 0 && (
            <SectionCard icon={CreditCard} title="Payments">
              {enquiry.payments.map((p, i) => (
                <div key={i} className="border-b border-zinc-100 last:border-0 py-2">
                  <InfoRow label={`Payment ${i + 1} - Category`} value={p.feeCategory} />
                  <InfoRow label={`Payment ${i + 1} - Amount`} value={p.feeAmount} />
                  <InfoRow label={`Payment ${i + 1} - Mode`} value={p.paymentMode === "pay_online" ? `Online (UTR: ${p.upiNumber || "N/A"})` : p.paymentMode} />
                  <InfoRow label={`Payment ${i + 1} - Date`} value={p.paymentDate} />
                </div>
              ))}
            </SectionCard>
          )}

          {enquiry.status === "Admission" && (
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <Clock size={22} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-zinc-900">Waiting for Principal Approval</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    This application has been forwarded to the Principal for approval. The Admit/Reject decision can only be made from the Principal Dashboard.
                  </p>

                  <div className="mt-6 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => navigate("/admissions/confirm")}
                      className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                      Back to List
                    </button>
                  </div>

                  {showReject && (
                    <div className="mt-5 p-5 rounded-xl bg-white border border-red-200 shadow-sm">
                      <label className="block">
                        <span className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
                          <AlertCircle size={16} /> Reason for Rejection
                        </span>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => { setRejectReason(e.target.value); setRejectError(""); }}
                          rows={3}
                          className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all resize-none ${
                            rejectError ? "border-red-400 ring-2 ring-red-100" : "border-zinc-200 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                          }`}
                          placeholder="Enter the reason for rejecting this admission..."
                        />
                        {rejectError && (
                          <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                            <AlertCircle size={12} /> {rejectError}
                          </p>
                        )}
                      </label>
                      <div className="mt-4 flex items-center gap-3 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowReject(false); setRejectReason(""); setRejectError(""); }}
                          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handlePrincipalReject}
                          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-700 disabled:opacity-50"
                        >
                          {saving ? "Rejecting..." : "Confirm Reject"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
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

                  {otherDeptOptions.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <span className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Other Departments in {enquiry.programme}</span>
                      <div className="space-y-2">
                        {otherDeptOptions.map((dept) => (
                          <label
                            key={dept}
                            className={`flex items-center gap-4 rounded-xl border p-4 text-sm font-medium transition-all cursor-pointer ${
                              selectedDept === dept
                                ? "border-[#120c7a] bg-[#120c7a]/5 text-[#120c7a]"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="admissionDept"
                              value={dept}
                              checked={selectedDept === dept}
                              onChange={() => setSelectedDept(dept)}
                              className="h-4 w-4 border-zinc-300 text-[#120c7a] focus:ring-[#120c7a]"
                            />
                            <div>
                              <span className="text-xs text-zinc-400 font-normal block">Other Department</span>
                              <span className="text-sm font-medium">{dept}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

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
