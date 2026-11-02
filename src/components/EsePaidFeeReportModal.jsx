import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  Download,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  Printer,
  FileSpreadsheet,
  IndianRupee,
  Users,
  Clock,
  ArrowUpDown,
  GraduationCap,
  Copy,
  Check,
} from "lucide-react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatDepartmentDisplay,
  formatProgrammeKey,
  formatProgDisplay,
  formatBatchDisplay,
  isDeptMatch,
} from "../lib/utils";

const normAlpha = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const isBatchMatch = (b1, b2) => {
  if (!b1 || !b2) return false;
  const n1 = normAlpha(b1);
  const n2 = normAlpha(b2);
  if (!n1 || !n2) return false;
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  const y1 = String(b1).match(/20\d{2}/)?.[0] || String(b1).match(/\b\d{2}\b/)?.[0] || "";
  const y2 = String(b2).match(/20\d{2}/)?.[0] || String(b2).match(/\b\d{2}\b/)?.[0] || "";
  if (y1 && y2) {
    const c1 = y1.length === 2 ? `20${y1}` : y1;
    const c2 = y2.length === 2 ? `20${y2}` : y2;
    if (c1 === c2) return true;
  }
  return false;
};

// Helper to reliably extract payment date from a registration document
function extractPaymentDate(item) {
  if (!item) return null;
  if (item.paidAt?.toDate) return item.paidAt.toDate();
  if (item.timestamp?.toDate) return item.timestamp.toDate();
  if (item.updatedAt?.toDate) return item.updatedAt.toDate();
  if (item.createdAt?.toDate) return item.createdAt.toDate();
  if (item.paidAtIso) {
    const d = new Date(item.paidAtIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.isoTimestamp) {
    const d = new Date(item.isoTimestamp);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.createdIso) {
    const d = new Date(item.createdIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.paidDate) {
    const d = new Date(item.paidDate);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Format Date for table display
function formatPaymentDateTime(item) {
  const d = extractPaymentDate(item);
  if (d) {
    const dateStr = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr}, ${timeStr}`;
  }
  return item.paidDate ? `${item.paidDate} ${item.paidTime || ""}`.trim() : "-";
}

export default function EsePaidFeeReportModal({
  isOpen,
  onClose,
  selectedExam = null,
  allExams = [],
  availableDepartments = [],
  availableBatches = [],
}) {
  // Date Range state: defaults to past 30 days up to today
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return thirtyDaysAgo.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Filter states
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [batchFilter, setBatchFilter] = useState("ALL");
  const [examFilter, setExamFilter] = useState(() => selectedExam?.id || "ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc"); // date_desc, date_asc, amount_desc, reg_asc

  // Data states
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [internalExams, setInternalExams] = useState([]);

  // Direct Firestore listener for ese_exams to guarantee instant access to exam names
  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      collection(db, "ese_exams"),
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setInternalExams(list);
      },
      (err) => console.warn("ese_exams load error in modal:", err)
    );
    return () => unsub();
  }, [isOpen]);

  // Combined exams collection from internal listener, props, and selectedExam
  const examsList = useMemo(() => {
    const map = new Map();
    internalExams.forEach((e) => {
      if (e?.id) map.set(e.id, e);
    });
    (allExams || []).forEach((e) => {
      if (e?.id) {
        map.set(e.id, { ...(map.get(e.id) || {}), ...e });
      }
    });
    if (selectedExam?.id) {
      map.set(selectedExam.id, { ...(map.get(selectedExam.id) || {}), ...selectedExam });
    }
    return Array.from(map.values());
  }, [internalExams, allExams, selectedExam]);

  // Helper: Detect whether a string looks like a raw auto-generated Firestore document ID
  const isFirestoreDocId = (val) => {
    if (!val || typeof val !== "string") return false;
    const trimmed = val.trim();
    return /^[A-Za-z0-9_-]{16,28}$/.test(trimmed) && !trimmed.includes(" ") && !trimmed.toLowerCase().includes("exam");
  };

  // Helper: Resolve human-readable examination name (never shows raw doc IDs)
  const getResolvedExamName = (target, fallback = "Autonomous End Semester Examination (ESE)") => {
    if (!target) return fallback;
    if (target === "ALL") return "All Active Examinations";

    if (typeof target === "object") {
      const candidate = target.name || target.examName || target.title;
      if (candidate && !isFirestoreDocId(candidate)) return candidate;
      target = target.id || target.examId || "";
    }

    const str = String(target || "").trim();
    if (!str || str === "ALL") return "All Active Examinations";

    // 1. Look up in examsList by ID
    const foundById = examsList.find((e) => e.id === str);
    if (foundById) {
      const n = foundById.name || foundById.title || foundById.examName;
      if (n && !isFirestoreDocId(n)) {
        return foundById.session ? `${n} (${foundById.session})` : n;
      }
    }

    // 2. Look up in examsList by name
    const foundByName = examsList.find(
      (e) =>
        (e.name && e.name.toLowerCase() === str.toLowerCase()) ||
        (e.title && e.title.toLowerCase() === str.toLowerCase()) ||
        (e.examName && e.examName.toLowerCase() === str.toLowerCase())
    );
    if (foundByName) {
      const n = foundByName.name || foundByName.title || foundByName.examName;
      if (n && !isFirestoreDocId(n)) return n;
    }

    // 3. Check selectedExam prop
    if (selectedExam && (selectedExam.id === str || selectedExam.name === str)) {
      const n = selectedExam.name || selectedExam.title;
      if (n && !isFirestoreDocId(n)) return n;
    }

    // 4. Look up in loaded student payment records matching this exam ID
    const matchingRecord = records.find(
      (r) =>
        (r.examId === str || r.id?.startsWith(str)) &&
        r.examName &&
        !isFirestoreDocId(r.examName)
    );
    if (matchingRecord?.examName) {
      return matchingRecord.examName;
    }

    // 5. Look for any record with a valid human-readable examName if str is a doc ID
    if (isFirestoreDocId(str)) {
      const anyRecord = records.find((r) => r.examName && !isFirestoreDocId(r.examName));
      if (anyRecord?.examName) {
        return anyRecord.examName;
      }
    }

    // 6. If str is already a human-readable title (not an auto-generated doc ID)
    if (!isFirestoreDocId(str)) {
      return str;
    }

    // 7. Safe institutional fallback
    return fallback;
  };

  // Distinct exam options for the filter dropdown
  const distinctExamOptions = useMemo(() => {
    const map = new Map();
    examsList.forEach((ex) => {
      if (ex.id) {
        map.set(ex.id, getResolvedExamName(ex));
      }
    });
    records.forEach((r) => {
      if (r.examId && !map.has(r.examId)) {
        map.set(r.examId, getResolvedExamName(r.examName || r.examId));
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [examsList, records]);

  // Sync selected exam filter on open
  useEffect(() => {
    if (selectedExam?.id && (examFilter === "ALL" || !examFilter)) {
      setExamFilter(selectedExam.id);
    }
  }, [selectedExam, isOpen]);

  // Real-time listener for paid registrations from Firestore
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const qRegs = query(collection(db, "ese_fee_registrations"));

    const unsubscribe = onSnapshot(
      qRegs,
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const pStatus = (data.paymentStatus || data.status || "").toLowerCase();
          const isPaid =
            pStatus === "paid" ||
            pStatus === "success" ||
            pStatus === "successful" ||
            data.billAttached === true ||
            Boolean(data.receiptNo) ||
            Boolean(data.paidAt);

          if (isPaid) {
            list.push({
              id: docSnap.id,
              ...data,
            });
          }
        });

        // Also check ese_fee_payments for any records that might not be in ese_fee_registrations
        setRecords(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading ese_fee_registrations for report:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  // Quick Date Range Shortcuts
  const handleQuickDate = (type) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (type === "today") {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === "yesterday") {
      const y = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yStr = y.toISOString().slice(0, 10);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (type === "7days") {
      const past = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (type === "30days") {
      const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (type === "month") {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(startOfMonth.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (type === "all") {
      setFromDate("");
      setToDate("");
    }
  };

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // 1. Date Range Filter
    if (fromDate || toDate) {
      const startTime = fromDate ? new Date(`${fromDate}T00:00:00.000`).getTime() : 0;
      const endTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;

      result = result.filter((r) => {
        const d = extractPaymentDate(r);
        if (!d) return true; // keep if timestamp missing to avoid missing manual payments
        const time = d.getTime();
        return time >= startTime && time <= endTime;
      });
    }

    // 2. Exam Filter
    if (examFilter && examFilter !== "ALL") {
      result = result.filter((r) => {
        if (r.examId === examFilter) return true;
        if (r.id && r.id.startsWith(examFilter)) return true;
        if (
          r.examName &&
          (r.examName.toLowerCase() === examFilter.toLowerCase() ||
            getResolvedExamName(r.examName) === getResolvedExamName(examFilter))
        ) {
          return true;
        }
        return false;
      });
    }

    // 3. Department Filter
    if (deptFilter && deptFilter !== "ALL") {
      result = result.filter((r) => isDeptMatch(r.department, deptFilter));
    }

    // 4. Batch Filter
    if (batchFilter && batchFilter !== "ALL") {
      result = result.filter((r) => isBatchMatch(r.batch, batchFilter));
    }

    // 5. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const reg = String(r.regNo || "").toLowerCase();
        const name = String(r.studentName || "").toLowerCase();
        const order = String(r.orderId || "").toLowerCase();
        const receipt = String(r.receiptNo || "").toLowerCase();
        const dept = String(r.department || "").toLowerCase();
        return reg.includes(q) || name.includes(q) || order.includes(q) || receipt.includes(q) || dept.includes(q);
      });
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "date_desc") {
        const tA = extractPaymentDate(a)?.getTime() || 0;
        const tB = extractPaymentDate(b)?.getTime() || 0;
        return tB - tA;
      }
      if (sortBy === "date_asc") {
        const tA = extractPaymentDate(a)?.getTime() || 0;
        const tB = extractPaymentDate(b)?.getTime() || 0;
        return tA - tB;
      }
      if (sortBy === "amount_desc") {
        return (Number(b.feeAmount) || 0) - (Number(a.feeAmount) || 0);
      }
      if (sortBy === "reg_asc") {
        return String(a.regNo || "").localeCompare(String(b.regNo || ""), undefined, { numeric: true });
      }
      return 0;
    });

    return result;
  }, [records, fromDate, toDate, examFilter, deptFilter, batchFilter, searchQuery, sortBy, examsList]);

  // Aggregate Metrics
  const totalStudentsPaid = filteredRecords.length;
  const totalAmountPaid = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + (Number(r.feeAmount) || 0), 0);
  }, [filteredRecords]);

  // Copy Order ID helper
  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedOrderId(text);
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      alert("No payment records found for the selected criteria.");
      return;
    }

    const titleRow = [
      ["C.K. COLLEGE OF ENGINEERING AND TECHNOLOGY"],
      ["AUTONOMOUS EXAMINATION CELL - ESE FEE PAYMENT REPORT"],
      [
        `Date Range: ${fromDate || "Start"} to ${toDate || "Today"} | Exam: ${getResolvedExamName(
          examFilter
        )} | Total Paid Students: ${totalStudentsPaid} | Total Collected: INR ${totalAmountPaid.toLocaleString(
          "en-IN"
        )}`,
      ],
      [],
    ];

    const headers = [
      "S.No",
      "Register Number",
      "Student Candidate Name",
      "Programme",
      "Department",
      "Batch",
      "Section",
      "Examination Name",
      "Order / Txn ID",
      "Receipt Number",
      "Payment Date & Time",
      "Fee Amount (INR)",
      "Payment Status",
    ];

    const rows = filteredRecords.map((r, idx) => [
      idx + 1,
      r.regNo || "-",
      r.studentName || "-",
      r.programme || "UG",
      r.department || "-",
      r.batch || "-",
      r.section || "A",
      getResolvedExamName(r.examName || r.examId || examFilter),
      r.orderId || "-",
      r.receiptNo || `REC-ESE-${r.orderId || "REF"}`,
      formatPaymentDateTime(r),
      Number(r.feeAmount || 0),
      "PAID / SUCCESS",
    ]);

    const footerRow = [
      [],
      ["", "", "", "", "", "", "", "", "", "", "Total Amount Collected:", totalAmountPaid, ""],
    ];

    const fullData = [...titleRow, headers, ...rows, ...footerRow];
    const ws = XLSX.utils.aoa_to_sheet(fullData);

    // Auto-fit column widths
    const colWidths = [
      { wch: 6 },
      { wch: 16 },
      { wch: 26 },
      { wch: 10 },
      { wch: 32 },
      { wch: 14 },
      { wch: 10 },
      { wch: 28 },
      { wch: 26 },
      { wch: 24 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Paid_Students_Report");

    const fileName = `ESE_Paid_Fee_Report_${fromDate || "All"}_to_${toDate || "Now"}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (filteredRecords.length === 0) {
      alert("No payment records found for the selected criteria.");
      return;
    }

    try {
      const doc = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Outer border
      doc.setDrawColor(18, 12, 122);
      doc.setLineWidth(0.6);
      doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

      // Load /logo.png
      let yPos = 12;
      try {
        const logoImg = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = "/logo.png";
        });
        if (logoImg && logoImg.width > 0) {
          const maxWidth = 180;
          const maxHeight = 18;
          const ratio = Math.min(maxWidth / logoImg.width, maxHeight / logoImg.height);
          const logoWidth = logoImg.width * ratio;
          const logoHeight = logoImg.height * ratio;
          doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + 3;
        } else {
          doc.setTextColor(18, 12, 122);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.text("C.K. COLLEGE OF ENGINEERING AND TECHNOLOGY", pageWidth / 2, yPos + 6, { align: "center" });
          yPos += 12;
        }
      } catch (e) {
        yPos += 12;
      }

      // Title Banner
      doc.setFillColor(18, 12, 122);
      doc.roundedRect(12, yPos, pageWidth - 24, 7, 1.2, 1.2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text("AUTONOMOUS END SEMESTER EXAMINATION (ESE) FEE PAYMENT REPORT", pageWidth / 2, yPos + 4.8, {
        align: "center",
      });

      // Filter & Summary info strip
      yPos += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(50, 60, 80);

      const dateRangeText = `Date Range: ${fromDate || "Inception"} to ${toDate || "Present"}`;
      const resolvedExamTitle = getResolvedExamName(examFilter);
      const displayExam = resolvedExamTitle.length > 50 ? `${resolvedExamTitle.slice(0, 48)}...` : resolvedExamTitle;
      const examText = `Exam: ${displayExam}`;
      const summaryText = `Total Paid Students: ${totalStudentsPaid} | Total Amount: INR ${totalAmountPaid.toLocaleString("en-IN")}`;

      doc.setFont("helvetica", "bold");
      doc.text(dateRangeText, 14, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(examText, pageWidth / 2, yPos, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 122, 59);
      doc.text(summaryText, pageWidth - 14, yPos, { align: "right" });

      yPos += 3;

      // Table Data
      const tableBody = filteredRecords.map((r, i) => [
        i + 1,
        String(r.regNo || "-").toUpperCase(),
        String(r.studentName || "-").toUpperCase(),
        `${formatProgDisplay(r.programme || "UG")} - ${formatDepartmentDisplay(r.department || "General")}`,
        `Batch ${r.batch || "-"} (${r.section || "A"})`,
        r.orderId || "-",
        formatPaymentDateTime(r),
        `INR ${Number(r.feeAmount || 0).toLocaleString("en-IN")}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        margin: { left: 12, right: 12 },
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
        headStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        head: [
          ["S.No", "Register No", "Candidate Name", "Department", "Batch & Sec", "Order / Txn ID", "Date of Payment", "Amount Paid"],
        ],
        body: tableBody,
        foot: [
          [
            "",
            "",
            "",
            "",
            "",
            "",
            "Total Amount Collected:",
            `INR ${totalAmountPaid.toLocaleString("en-IN")}`,
          ],
        ],
        footStyles: { fillColor: [241, 245, 249], textColor: [18, 12, 122], fontStyle: "bold", fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 26, fontStyle: "bold" },
          2: { cellWidth: 42, fontStyle: "bold" },
          3: { cellWidth: 60 },
          4: { cellWidth: 32 },
          5: { cellWidth: 40, fontStyle: "normal" },
          6: { cellWidth: 32 },
          7: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        },
      });

      // Signatures Block
      const finalY = doc.lastAutoTable.finalY || yPos + 40;
      let sigY = Math.min(finalY + 14, pageHeight - 22);

      if (sigY + 20 > pageHeight) {
        doc.addPage();
        sigY = pageHeight - 26;
      }

      doc.setDrawColor(180, 185, 200);
      doc.setLineWidth(0.4);
      doc.line(16, sigY, 70, sigY);
      doc.line(pageWidth - 70, sigY, pageWidth - 16, sigY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text("Accountant / Cashier", 43, sigY + 4, { align: "center" });
      doc.text("Controller of Examinations", pageWidth - 43, sigY + 4, { align: "center" });

      doc.save(`ESE_Paid_Fee_Report_${fromDate || "Start"}_to_${toDate || "Now"}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Failed to export PDF: " + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-6xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-[#120c7a] via-indigo-900 to-slate-900 px-6 py-4 flex items-center justify-between gap-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <FileText size={20} className="text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-tight">ESE Fee Payment & Collection Report</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-extrabold uppercase">
                  Live Firestore Sync
                </span>
              </div>
              <p className="text-xs text-blue-200 font-medium">
                Complete audit breakdown of student fee payments with date range filtering and instant Excel/PDF export.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Date Range & Filter Controls (Requested by User) */}
        <div className="p-5 bg-slate-50/80 border-b border-slate-200 space-y-3 shrink-0">
          {/* Main Date Selection Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            {/* From Date */}
            <div>
              <label className="text-[11px] font-extrabold uppercase text-slate-500 flex items-center gap-1 mb-1">
                <Calendar size={12} className="text-indigo-600" /> From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="text-[11px] font-extrabold uppercase text-slate-500 flex items-center gap-1 mb-1">
                <Calendar size={12} className="text-indigo-600" /> To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
              />
            </div>

            {/* Examination Filter */}
            <div>
              <label className="text-[11px] font-extrabold uppercase text-slate-500 flex items-center gap-1 mb-1">
                <GraduationCap size={12} className="text-indigo-600" /> Examination
              </label>
              <select
                value={examFilter}
                onChange={(e) => setExamFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
              >
                <option value="ALL">All Examinations</option>
                {distinctExamOptions.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                Department
              </label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
              >
                <option value="ALL">All Departments</option>
                {availableDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Box */}
            <div>
              <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                Quick Search
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Reg No, Name, Order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Quick Shortcuts & Preset Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">Quick Dates:</span>
              <button
                type="button"
                onClick={() => handleQuickDate("today")}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[11px] transition cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate("yesterday")}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[11px] transition cursor-pointer"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate("7days")}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[11px] transition cursor-pointer"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate("month")}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[11px] transition cursor-pointer"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate("all")}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 font-semibold text-[11px] transition cursor-pointer"
              >
                All Time
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="date_desc">Latest Payment First</option>
                <option value="date_asc">Oldest Payment First</option>
                <option value="amount_desc">Highest Fee Amount</option>
                <option value="reg_asc">Register No (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Metric Ribbon */}
        <div className="px-6 py-3 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Students Paid</span>
              <span className="text-xl font-black text-amber-300 font-mono">
                {totalStudentsPaid}{" "}
                <span className="text-xs font-normal text-slate-300">Candidates</span>
              </span>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Amount Collected</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                ₹{totalAmountPaid.toLocaleString("en-IN")}
              </span>
            </div>
            {(fromDate || toDate) && (
              <>
                <div className="h-8 w-px bg-slate-700 hidden sm:block" />
                <div className="hidden sm:block">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Date Range</span>
                  <span className="text-xs font-semibold text-blue-200">
                    {fromDate || "Start"} &rarr; {toDate || "Present"}
                  </span>
                </div>
              </>
            )}
            {examFilter && examFilter !== "ALL" && (
              <>
                <div className="h-8 w-px bg-slate-700 hidden md:block" />
                <div className="hidden md:block">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Filtered Exam</span>
                  <span className="text-xs font-semibold text-amber-300">
                    {getResolvedExamName(examFilter)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <FileSpreadsheet size={13} />
              <span>Download Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Download size={13} />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Table Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {loading ? (
            <div className="py-20 text-center space-y-2">
              <RefreshCw size={28} className="mx-auto text-[#120c7a] animate-spin" />
              <p className="text-xs font-bold text-slate-600">Loading payment records from Firestore...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-8 space-y-2 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                <Calendar size={22} />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Payments Found for Selected Date Range</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No student has recorded an ESE examination fee payment between{" "}
                <strong className="text-slate-700">{fromDate || "start"}</strong> and{" "}
                <strong className="text-slate-700">{toDate || "today"}</strong>.
              </p>
              <button
                type="button"
                onClick={() => handleQuickDate("all")}
                className="mt-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[#120c7a] text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
              >
                View All Time Records ({records.length})
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 uppercase font-black tracking-wider text-[10px]">
                      <th className="py-3 px-3 text-center w-12">S.No</th>
                      <th className="py-3 px-4">Register Number</th>
                      <th className="py-3 px-4">Student Candidate Name</th>
                      <th className="py-3 px-4">Programme & Department</th>
                      <th className="py-3 px-4">Batch & Sec</th>
                      <th className="py-3 px-4">Order / Txn ID</th>
                      <th className="py-3 px-4">Date of Payment</th>
                      <th className="py-3 px-4 text-right">Fee Amount</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredRecords.map((r, idx) => (
                      <tr key={r.id || idx} className="hover:bg-indigo-50/40 transition">
                        {/* S.No */}
                        <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Register Number */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-[#120c7a] text-[12px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {r.regNo || "-"}
                          </span>
                        </td>

                        {/* Student Name */}
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div>{r.studentName || "Candidate"}</div>
                          <div className="text-[10px] text-indigo-700 font-semibold flex items-center gap-1 mt-0.5">
                            <GraduationCap size={10} className="shrink-0 text-indigo-500" />
                            <span>{getResolvedExamName(r.examName || r.examId || examFilter)}</span>
                          </div>
                        </td>

                        {/* Programme & Department */}
                        <td className="py-3 px-4 text-slate-600">
                          <span className="font-semibold text-slate-800">
                            {formatProgDisplay(r.programme || "UG")}
                          </span>{" "}
                          - {formatDepartmentDisplay(r.department || "General")}
                        </td>

                        {/* Batch & Section */}
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {r.batch || "N/A"} ({r.section || "A"})
                          </span>
                        </td>

                        {/* Order ID */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                            <span>{r.orderId || "-"}</span>
                            {r.orderId && (
                              <button
                                onClick={() => handleCopy(r.orderId)}
                                title="Copy Order ID"
                                className="text-slate-400 hover:text-indigo-600 cursor-pointer p-0.5"
                              >
                                {copiedOrderId === r.orderId ? (
                                  <Check size={12} className="text-emerald-600" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Date of Payment */}
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock size={12} className="text-slate-400 shrink-0" />
                            <span>{formatPaymentDateTime(r)}</span>
                          </div>
                        </td>

                        {/* Fee Amount */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono font-bold text-emerald-700 text-[13px] bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                            ₹{Number(r.feeAmount || 0).toLocaleString("en-IN")}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                            <CheckCircle2 size={11} className="text-emerald-600" /> Paid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary Footer */}
                  <tfoot>
                    <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-xs">
                      <td colSpan={6} className="py-3 px-4 text-right uppercase tracking-wider text-slate-600">
                        Total Amount Paid ({totalStudentsPaid} Students):
                      </td>
                      <td className="py-3 px-4" />
                      <td className="py-3 px-4 text-right font-mono text-sm text-[#120c7a]">
                        ₹{totalAmountPaid.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Showing <b>{filteredRecords.length}</b> of <b>{records.length}</b> total paid registration(s).
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" />
              <span>Export Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={filteredRecords.length === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              <Download size={14} className="text-rose-600" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
