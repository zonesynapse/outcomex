import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Download,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  FileSpreadsheet,
  IndianRupee,
  Users,
  Clock,
  GraduationCap,
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  Calendar,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatDepartmentDisplay,
  formatProgDisplay,
  isDeptMatch,
  sanitizeKey,
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

// Detect auto-generated Firestore doc IDs
const isFirestoreDocId = (val) => {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  return /^[A-Za-z0-9_-]{16,28}$/.test(trimmed) && !trimmed.includes(" ") && !trimmed.toLowerCase().includes("exam");
};

// Extract payment date from registration item
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
  if (item.paidDate) {
    const d = new Date(item.paidDate);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Format payment date
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
  return item?.paidDate ? `${item.paidDate} ${item.paidTime || ""}`.trim() : "-";
}

export default function DepartmentExamFeeDueReport({
  department = "",
  programme = "UG",
  userRole = "HOD", // "HOD" or "Academic Coordinator"
  userName = "",
  isModal = false,
}) {
  // Data states
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [examsList, setExamsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedOrderId, setCopiedOrderId] = useState(null);

  // Filters
  const [examFilter, setExamFilter] = useState("ALL");
  const [batchFilter, setBatchFilter] = useState("ALL");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("DUE_ONLY"); // "ALL", "DUE_ONLY", "PAID_ONLY"
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("due_desc"); // "due_desc", "due_asc", "reg_asc", "name_asc", "amount_desc"

  // 1. Listen to ese_student_fees in real-time
  useEffect(() => {
    setLoading(true);
    const qFee = query(collection(db, "ese_student_fees"));
    const unsub = onSnapshot(
      qFee,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setFeeConfigs(list);
        setLoading(false);
      },
      (err) => {
        console.warn("ese_student_fees error in DepartmentExamFeeDueReport:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 2. Listen to ese_fee_registrations in real-time
  useEffect(() => {
    const qRegs = query(collection(db, "ese_fee_registrations"));
    const unsub = onSnapshot(
      qRegs,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setPaymentRecords(list);
      },
      (err) => {
        console.warn("ese_fee_registrations error in DepartmentExamFeeDueReport:", err);
      }
    );
    return () => unsub();
  }, []);

  // 3. Listen to ese_exams for human-readable examination titles
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "ese_exams"),
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setExamsList(list);
      },
      (err) => {
        console.warn("ese_exams error in DepartmentExamFeeDueReport:", err);
      }
    );
    return () => unsub();
  }, []);

  // Helper to resolve clean exam name strictly from database records
  const getResolvedExamName = (target, fallback = "") => {
    if (!target) return fallback;
    if (target === "ALL") return "All Active Examinations";

    if (typeof target === "object") {
      const candidate = target.name || target.examName || target.title;
      if (candidate && !isFirestoreDocId(candidate)) return candidate;
      target = target.id || target.examId || "";
    }

    const str = String(target || "").trim();
    if (!str || str === "ALL") return "All Active Examinations";

    const foundById = examsList.find((e) => e.id === str);
    if (foundById) {
      const n = foundById.name || foundById.title || foundById.examName;
      if (n && !isFirestoreDocId(n)) {
        return foundById.session ? `${n} (${foundById.session})` : n;
      }
    }

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

    const rec = paymentRecords.find(
      (r) => (r.examId === str || r.id?.startsWith(str)) && r.examName && !isFirestoreDocId(r.examName)
    );
    if (rec?.examName) return rec.examName;

    const cfg = departmentFeeConfigs.find(
      (c) => c.examId === str && c.examName && !isFirestoreDocId(c.examName)
    );
    if (cfg?.examName) return cfg.examName;

    if (!isFirestoreDocId(str)) return str;
    return fallback;
  };

  // Filter fee configs matching current department
  const departmentFeeConfigs = useMemo(() => {
    if (!department) return feeConfigs;
    return feeConfigs.filter((cfg) => isDeptMatch(cfg.department, department));
  }, [feeConfigs, department]);

  // Extract distinct batches for this department
  const availableBatches = useMemo(() => {
    const set = new Set();
    departmentFeeConfigs.forEach((cfg) => {
      if (cfg.batch) set.add(cfg.batch);
    });
    paymentRecords.forEach((r) => {
      if (department && isDeptMatch(r.department, department) && r.batch) {
        set.add(r.batch);
      }
    });
    return Array.from(set).sort().reverse();
  }, [departmentFeeConfigs, paymentRecords, department]);

  // Extract distinct sections for this department
  const availableSections = useMemo(() => {
    const set = new Set();
    departmentFeeConfigs.forEach((cfg) => {
      if (cfg.section && cfg.section !== "ALL") set.add(cfg.section);
    });
    paymentRecords.forEach((r) => {
      if (department && isDeptMatch(r.department, department) && r.section && r.section !== "ALL") {
        set.add(r.section);
      }
    });
    return ["ALL", ...Array.from(set).sort()];
  }, [departmentFeeConfigs, paymentRecords, department]);

  // Extract distinct exams strictly from Firebase ese_exams collection (100% database retrieval)
  const availableExams = useMemo(() => {
    // ese_exams is the authoritative collection of exams created in Firebase
    if (examsList && examsList.length > 0) {
      return examsList.map((e) => ({
        id: e.id,
        name: getResolvedExamName(e),
      }));
    }

    // Fallback only if ese_exams is still loading
    const map = new Map();
    departmentFeeConfigs.forEach((cfg) => {
      const eid = cfg.examId;
      if (eid && !map.has(eid)) {
        const resolved = getResolvedExamName(cfg.examName || eid);
        if (resolved) {
          map.set(eid, resolved);
        }
      }
    });

    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [examsList, departmentFeeConfigs]);

  // Compile Comprehensive Student Fee Due Records
  const allDepartmentStudentDues = useMemo(() => {
    const studentMap = new Map(); // key = `${examId}_${normAlpha(reg)}`

    // Step A: Process all allocated fee configs in this department
    departmentFeeConfigs.forEach((cfg) => {
      const examId = cfg.examId || examsList[0]?.id || "DEFAULT_EXAM";
      const examName = getResolvedExamName(cfg.examName || cfg.examId || examsList[0]?.name);
      const batch = cfg.batch || "-";
      const section = cfg.section || "A";
      const feesMap = cfg.fees || {};
      const studentsArr = cfg.students || [];

      // Extract all student keys
      const allRegs = new Set([
        ...Object.keys(feesMap),
        ...studentsArr.map((s) => s.reg).filter(Boolean),
      ]);

      allRegs.forEach((reg) => {
        const studentObj = studentsArr.find((s) => s.reg === reg) || {};
        const allocatedFee = Number(feesMap[reg] || studentObj.fee || 0);
        const name = studentObj.name || reg;
        const key = `${examId}_${normAlpha(reg)}`;

        studentMap.set(key, {
          regNo: reg,
          studentName: name,
          batch,
          section,
          programme: cfg.programme || programme || "UG",
          department: cfg.department || department,
          examId,
          examName,
          allocatedFee,
          amountPaid: 0,
          dueAmount: allocatedFee,
          isPaid: false,
          paymentRecord: null,
          status: allocatedFee > 0 ? "DUE" : "CONFIGURED_ZERO",
        });
      });
    });

    // Step B: Match payments from ese_fee_registrations
    paymentRecords.forEach((p) => {
      if (department && !isDeptMatch(p.department, department)) return;

      const pStatus = (p.paymentStatus || p.status || "").toLowerCase();
      const isPaid =
        pStatus === "paid" ||
        pStatus === "success" ||
        pStatus === "successful" ||
        p.billAttached === true ||
        Boolean(p.receiptNo) ||
        Boolean(p.paidAt);

      if (!isPaid) return;

      const reg = p.regNo;
      if (!reg) return;

      const cleanReg = normAlpha(reg);

      // Check if student already has an allocated fee record in studentMap
      let matchedKey = null;
      if (p.examId && studentMap.has(`${p.examId}_${cleanReg}`)) {
        matchedKey = `${p.examId}_${cleanReg}`;
      } else {
        // Try to find this student under any exam key in studentMap
        for (const [key, val] of studentMap.entries()) {
          if (normAlpha(val.regNo) === cleanReg) {
            matchedKey = key;
            break;
          }
        }
      }

      const paidAmt = Number(p.feeAmount || 0);

      if (matchedKey && studentMap.has(matchedKey)) {
        const current = studentMap.get(matchedKey);
        const effectiveAllocated = Math.max(current.allocatedFee, paidAmt);
        const due = Math.max(0, effectiveAllocated - paidAmt);
        studentMap.set(matchedKey, {
          ...current,
          allocatedFee: effectiveAllocated,
          amountPaid: paidAmt,
          dueAmount: due,
          isPaid: due === 0,
          paymentRecord: p,
          status: due === 0 ? "PAID" : "PARTIAL_DUE",
        });
      } else {
        // Payment exists without prior student fee doc
        const defaultExam = examsList[0] || {};
        const examId = p.examId || defaultExam.id || "DEFAULT_EXAM";
        const examName = getResolvedExamName(examId, defaultExam.name || p.examName || "Autonomous Examination");
        const key = `${examId}_${cleanReg}`;

        studentMap.set(key, {
          regNo: reg,
          studentName: p.studentName || p.name || reg,
          batch: p.batch || "-",
          section: p.section || "A",
          programme: p.programme || programme || "UG",
          department: p.department || department,
          examId,
          examName,
          allocatedFee: paidAmt,
          amountPaid: paidAmt,
          dueAmount: 0,
          isPaid: true,
          paymentRecord: p,
          status: "PAID",
        });
      }
    });

    return Array.from(studentMap.values());
  }, [departmentFeeConfigs, paymentRecords, department, programme, examsList]);

  // Filtered & Sorted Student Dues
  const filteredRecords = useMemo(() => {
    let result = [...allDepartmentStudentDues];

    // 1. Exam Filter
    if (examFilter && examFilter !== "ALL") {
      result = result.filter(
        (r) => r.examId === examFilter || r.examName?.toLowerCase() === examFilter.toLowerCase()
      );
    }

    // 2. Batch Filter
    if (batchFilter && batchFilter !== "ALL") {
      result = result.filter((r) => isBatchMatch(r.batch, batchFilter));
    }

    // 3. Section Filter
    if (sectionFilter && sectionFilter !== "ALL") {
      result = result.filter((r) => String(r.section || "A").toUpperCase() === sectionFilter.toUpperCase());
    }

    // 4. Due Status Filter
    if (statusFilter === "DUE_ONLY") {
      result = result.filter((r) => r.dueAmount > 0);
    } else if (statusFilter === "PAID_ONLY") {
      result = result.filter((r) => r.isPaid || r.dueAmount === 0);
    }

    // 5. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const reg = String(r.regNo || "").toLowerCase();
        const name = String(r.studentName || "").toLowerCase();
        const order = String(r.paymentRecord?.orderId || "").toLowerCase();
        return reg.includes(q) || name.includes(q) || order.includes(q);
      });
    }

    // 6. Sorting
    result.sort((a, b) => {
      if (sortBy === "due_desc") return b.dueAmount - a.dueAmount;
      if (sortBy === "due_asc") return a.dueAmount - b.dueAmount;
      if (sortBy === "amount_desc") return b.allocatedFee - a.allocatedFee;
      if (sortBy === "name_asc") return String(a.studentName).localeCompare(String(b.studentName));
      if (sortBy === "reg_asc") {
        return String(a.regNo || "").localeCompare(String(b.regNo || ""), undefined, { numeric: true });
      }
      return 0;
    });

    return result;
  }, [allDepartmentStudentDues, examFilter, batchFilter, sectionFilter, statusFilter, searchQuery, sortBy]);

  // Aggregate Metrics
  const totalCandidates = allDepartmentStudentDues.length;
  const totalAllocatedFee = useMemo(() => {
    return allDepartmentStudentDues.reduce((sum, r) => sum + r.allocatedFee, 0);
  }, [allDepartmentStudentDues]);
  const totalCollectedFee = useMemo(() => {
    return allDepartmentStudentDues.reduce((sum, r) => sum + r.amountPaid, 0);
  }, [allDepartmentStudentDues]);
  const totalDueFee = useMemo(() => {
    return allDepartmentStudentDues.reduce((sum, r) => sum + r.dueAmount, 0);
  }, [allDepartmentStudentDues]);

  const studentsDueCount = useMemo(() => {
    return allDepartmentStudentDues.filter((r) => r.dueAmount > 0).length;
  }, [allDepartmentStudentDues]);
  const studentsPaidCount = totalCandidates - studentsDueCount;

  const clearanceRate = totalAllocatedFee > 0 ? ((totalCollectedFee / totalAllocatedFee) * 100).toFixed(1) : 0;

  // Filtered Counts
  const filteredTotalDue = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.dueAmount, 0);
  }, [filteredRecords]);
  const filteredTotalCollected = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.amountPaid, 0);
  }, [filteredRecords]);

  // Copy helper
  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedOrderId(text);
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      alert("No student exam fee records found for the selected criteria.");
      return;
    }

    const titleRow = [
      ["C.K. COLLEGE OF ENGINEERING AND TECHNOLOGY"],
      [`${(department || "DEPARTMENT").toUpperCase()} - END SEMESTER EXAMINATION (ESE) FEE DUE REPORT`],
      [
        `Examination: ${getResolvedExamName(examFilter)} | Batch: ${batchFilter} | Section: ${sectionFilter} | Status: ${statusFilter}`,
      ],
      [
        `Total Candidates: ${filteredRecords.length} | Total Allocated: INR ${totalAllocatedFee.toLocaleString(
          "en-IN"
        )} | Total Collected: INR ${totalCollectedFee.toLocaleString(
          "en-IN"
        )} | Total Due: INR ${filteredTotalDue.toLocaleString("en-IN")}`,
      ],
      [],
    ];

    const headers = [
      "S.No",
      "Register Number",
      "Student Candidate Name",
      "Department",
      "Batch",
      "Section",
      "Examination Name",
      "Allocated Fee (INR)",
      "Amount Paid (INR)",
      "Due Amount (INR)",
      "Payment Status",
      "Order / Txn ID",
      "Payment Date & Time",
    ];

    const rows = filteredRecords.map((r, idx) => [
      idx + 1,
      r.regNo || "-",
      r.studentName || "-",
      formatDepartmentDisplay(r.department || department),
      r.batch || "-",
      r.section || "A",
      r.examName || "End Semester Autonomous Examination",
      Number(r.allocatedFee || 0),
      Number(r.amountPaid || 0),
      Number(r.dueAmount || 0),
      r.dueAmount === 0 ? "PAID / CLEARED" : r.amountPaid > 0 ? "PARTIAL DUE" : "PENDING DUE",
      r.paymentRecord?.orderId || "-",
      r.paymentRecord ? formatPaymentDateTime(r.paymentRecord) : "Unpaid",
    ]);

    const footerRow = [
      [],
      [
        "",
        "",
        "",
        "",
        "",
        "",
        "TOTALS:",
        filteredRecords.reduce((sum, r) => sum + r.allocatedFee, 0),
        filteredTotalCollected,
        filteredTotalDue,
        "",
        "",
        "",
      ],
    ];

    const fullData = [...titleRow, headers, ...rows, ...footerRow];
    const ws = XLSX.utils.aoa_to_sheet(fullData);

    const colWidths = [
      { wch: 6 },
      { wch: 16 },
      { wch: 28 },
      { wch: 28 },
      { wch: 12 },
      { wch: 10 },
      { wch: 26 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 26 },
      { wch: 22 },
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Exam_Fee_Dues");

    const cleanDept = sanitizeKey(department || "Department");
    const fileName = `${cleanDept}_ESE_Fee_Due_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (filteredRecords.length === 0) {
      alert("No student exam fee records found for the selected criteria.");
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

      // College Logo (/logo.png)
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
          const maxHeight = 17;
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
      const deptTitle = department ? formatDepartmentDisplay(department).toUpperCase() : "DEPARTMENT";
      doc.text(`${deptTitle} - ESE EXAM FEE DUE & COLLECTION REPORT`, pageWidth / 2, yPos + 4.8, {
        align: "center",
      });

      // Filter & KPI Summary Strip
      yPos += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40, 50, 70);

      const resolvedExam = getResolvedExamName(examFilter);
      const examDisplay = resolvedExam.length > 40 ? `${resolvedExam.slice(0, 38)}...` : resolvedExam;
      const metaLeft = `Exam: ${examDisplay} | Batch: ${batchFilter} (${sectionFilter})`;
      const metaRight = `Total Due: INR ${filteredTotalDue.toLocaleString(
        "en-IN"
      )} | Collected: INR ${filteredTotalCollected.toLocaleString("en-IN")}`;

      doc.setFont("helvetica", "bold");
      doc.text(metaLeft, 14, yPos);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(185, 28, 28); // red for due
      doc.text(metaRight, pageWidth - 14, yPos, { align: "right" });

      yPos += 3;

      // Table Data
      const tableBody = filteredRecords.map((r, i) => [
        i + 1,
        String(r.regNo || "-").toUpperCase(),
        String(r.studentName || "-").toUpperCase(),
        `Batch ${r.batch || "-"} (${r.section || "A"})`,
        `INR ${Number(r.allocatedFee || 0).toLocaleString("en-IN")}`,
        `INR ${Number(r.amountPaid || 0).toLocaleString("en-IN")}`,
        `INR ${Number(r.dueAmount || 0).toLocaleString("en-IN")}`,
        r.dueAmount === 0 ? "PAID" : r.amountPaid > 0 ? "PARTIAL" : "DUE",
        r.paymentRecord?.orderId || "Pending",
      ]);

      autoTable(doc, {
        startY: yPos,
        margin: { left: 12, right: 12 },
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
        headStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        head: [
          ["S.No", "Register No", "Candidate Name", "Batch & Sec", "Allocated", "Paid", "Due Amount", "Status", "Order ID / Ref"],
        ],
        body: tableBody,
        foot: [
          [
            "",
            "",
            "TOTALS",
            `${filteredRecords.length} Students`,
            `INR ${filteredRecords.reduce((sum, r) => sum + r.allocatedFee, 0).toLocaleString("en-IN")}`,
            `INR ${filteredTotalCollected.toLocaleString("en-IN")}`,
            `INR ${filteredTotalDue.toLocaleString("en-IN")}`,
            "",
            "",
          ],
        ],
        footStyles: { fillColor: [240, 243, 250], textColor: [18, 12, 122], fontStyle: "bold", fontSize: 8 },
        didParseCell: (data) => {
          if (data.section === "body") {
            // Highlight due column
            if (data.column.index === 6) {
              const val = data.cell.raw;
              if (val && !val.includes("INR 0")) {
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = "bold";
              } else {
                data.cell.styles.textColor = [16, 122, 59];
              }
            }
            // Status column badge
            if (data.column.index === 7) {
              if (data.cell.raw === "PAID") {
                data.cell.styles.textColor = [16, 122, 59];
                data.cell.styles.fontStyle = "bold";
              } else {
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = "bold";
              }
            }
          }
        },
      });

      // Signature blocks
      const sigY = pageHeight - 16;
      doc.setDrawColor(180, 185, 200);
      doc.setLineWidth(0.4);
      doc.line(16, sigY, 70, sigY);
      doc.line(pageWidth - 70, sigY, pageWidth - 16, sigY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(userRole === "Academic Coordinator" ? "Academic Coordinator" : "Head of the Department", 43, sigY + 4, {
        align: "center",
      });
      doc.text("Controller of Examinations / Principal", pageWidth - 43, sigY + 4, { align: "center" });

      const cleanDept = sanitizeKey(department || "Department");
      doc.save(`${cleanDept}_ESE_Fee_Due_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Failed to export PDF: " + err.message);
    }
  };

  return (
    <div
      id="department-exam-fee-dues-section"
      className={`bg-white ${
        isModal
          ? "rounded-2xl border border-slate-200/60 shadow-xs"
          : "rounded-[2rem] border border-slate-200 shadow-md hover:shadow-lg mb-8"
      } overflow-hidden transition-all duration-300`}
    >
      {/* Light Mode Header Bar */}
      <div className="bg-white px-6 md:px-8 py-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#120c7a] shadow-xs shrink-0">
            <GraduationCap size={24} className="text-[#120c7a]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-slate-900 font-black text-lg md:text-xl tracking-tight leading-tight">
                Department ESE Exam Fee Dues & Collections
              </h2>
              <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[11px] font-black uppercase tracking-wide">
                {userRole} Portal
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Sync
              </span>
            </div>
            <p className="text-slate-500 text-xs font-semibold mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-indigo-900 font-bold bg-indigo-50/60 px-2 py-0.5 rounded border border-indigo-100">
                {department ? formatDepartmentDisplay(department) : "Department-level"}
              </span>
              <span className="text-slate-300">&bull;</span>
              <span>Real-time student fee allocation, payment audit, and pending due tracking.</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-black transition shadow-sm cursor-pointer active:scale-95"
          >
            <FileSpreadsheet size={15} />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#120c7a] hover:bg-indigo-900 disabled:opacity-40 text-white rounded-xl text-xs font-black transition shadow-sm cursor-pointer active:scale-95"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Metrics Banner (Light Mode) */}
      <div className="bg-slate-50/80 p-5 md:p-6 border-b border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Fee Due */}
          <div className="bg-white rounded-2xl p-4.5 border-2 border-rose-200/90 shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-rose-600 tracking-wider">Total Pending Due</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="text-3xl font-black font-mono text-rose-600 mt-2 tracking-tight">
              ₹{totalDueFee.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              <strong className="text-slate-800 font-bold">{studentsDueCount}</strong> students with pending dues
            </div>
          </div>

          {/* Card 2: Total Collected */}
          <div className="bg-white rounded-2xl p-4.5 border-2 border-emerald-200/90 shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-emerald-700 tracking-wider">Total Fee Collected</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                <IndianRupee size={16} />
              </div>
            </div>
            <div className="text-3xl font-black font-mono text-emerald-600 mt-2 tracking-tight">
              ₹{totalCollectedFee.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              <strong className="text-slate-800 font-bold">{studentsPaidCount}</strong> candidates fee cleared
            </div>
          </div>

          {/* Card 3: Total Allocated */}
          <div className="bg-white rounded-2xl p-4.5 border-2 border-indigo-200/90 shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#120c7a] to-indigo-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-indigo-700 tracking-wider">Total Allocated Fee</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <FileText size={16} />
              </div>
            </div>
            <div className="text-3xl font-black font-mono text-[#120c7a] mt-2 tracking-tight">
              ₹{totalAllocatedFee.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              Across <strong className="text-slate-800 font-bold">{totalCandidates}</strong> department candidates
            </div>
          </div>

          {/* Card 4: Clearance Progress */}
          <div className="bg-white rounded-2xl p-4.5 border-2 border-amber-200/90 shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-amber-700 tracking-wider">Clearance Progress</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="text-3xl font-black font-mono text-amber-600 mt-2 tracking-tight">
              {clearanceRate}%
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden border border-slate-200">
              <div
                className="bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, clearanceRate))}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 font-semibold mt-1">
              {studentsPaidCount} Paid / {studentsDueCount} Pending
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-5 bg-slate-50 border-b border-zinc-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {/* Examination Filter */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1 mb-1">
              <GraduationCap size={12} className="text-indigo-600" /> Examination
            </label>
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="ALL">All Active Examinations</option>
              {availableExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Filter */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1 mb-1">
              <Users size={12} className="text-indigo-600" /> Batch
            </label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="ALL">All Batches</option>
              {availableBatches.map((b) => (
                <option key={b} value={b}>
                  Batch {b}
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Section
            </label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === "ALL" ? "All Sections" : `Section ${sec}`}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By (Moved to above row as requested) */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1 mb-1">
              <ArrowUpDown size={12} className="text-indigo-600" /> Sort
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="due_desc">Highest Due Amount</option>
              <option value="due_asc">Lowest Due Amount</option>
              <option value="amount_desc">Highest Allocated Fee</option>
              <option value="reg_asc">Register No (A-Z)</option>
              <option value="name_asc">Candidate Name (A-Z)</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Search Candidate
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Reg No, Candidate Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Status Filter Badges (Quick View) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 mr-1">Quick View:</span>
            <button
              onClick={() => setStatusFilter("DUE_ONLY")}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "DUE_ONLY"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <AlertTriangle size={12} />
              <span>Pending Dues ({studentsDueCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter("PAID_ONLY")}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "PAID_ONLY"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <CheckCircle2 size={12} />
              <span>Paid / Cleared ({studentsPaidCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              All Records ({totalCandidates})
            </button>
          </div>

          <div className="text-[11px] font-bold text-slate-500">
            Showing <span className="text-slate-900 font-black">{filteredRecords.length}</span> of {totalCandidates} students
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="p-4 sm:p-6 bg-slate-50/50">
        {loading ? (
          <div className="py-16 text-center space-y-2">
            <RefreshCw size={26} className="mx-auto text-[#120c7a] animate-spin" />
            <p className="text-xs font-bold text-slate-600">Loading department exam fee dues from Firestore...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-8 space-y-2 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-sm font-bold text-slate-800">
              {statusFilter === "DUE_ONLY"
                ? "No Pending Exam Fee Dues Found!"
                : "No Student Records Match the Selected Filters"}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {statusFilter === "DUE_ONLY"
                ? "All configured students in this department have completed their examination fee payments."
                : "Try switching filters or clearing your search term to see department records."}
            </p>
            {statusFilter === "DUE_ONLY" && (
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[#120c7a] text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
              >
                View All Department Students ({totalCandidates})
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm text-slate-700 border-b border-slate-200 uppercase font-black tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3 text-center w-12">S.No</th>
                    <th className="py-3 px-4">Register Number</th>
                    <th className="py-3 px-4">Student Candidate Name</th>
                    <th className="py-3 px-4">Batch & Sec</th>
                    <th className="py-3 px-4">Examination</th>
                    <th className="py-3 px-4 text-right">Allocated Fee</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Due Amount</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4">Payment Ref / Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredRecords.map((r, idx) => {
                    const isDue = r.dueAmount > 0;
                    return (
                      <tr
                        key={`${r.examId}_${r.regNo}_${idx}`}
                        className={`transition ${
                          isDue ? "hover:bg-rose-50/40 bg-white" : "hover:bg-indigo-50/30 bg-white"
                        }`}
                      >
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
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            {formatProgDisplay(r.programme || "UG")} &bull; {r.section ? `Sec ${r.section}` : "Sec A"}
                          </div>
                        </td>

                        {/* Batch & Section */}
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {r.batch || "N/A"} ({r.section || "A"})
                          </span>
                        </td>

                        {/* Exam Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <GraduationCap size={12} className="text-indigo-600 shrink-0" />
                            <span className="truncate max-w-[160px]">{r.examName}</span>
                          </div>
                        </td>

                        {/* Allocated Fee */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                          ₹{Number(r.allocatedFee || 0).toLocaleString("en-IN")}
                        </td>

                        {/* Amount Paid */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          ₹{Number(r.amountPaid || 0).toLocaleString("en-IN")}
                        </td>

                        {/* Due Amount */}
                        <td className="py-3 px-4 text-right">
                          {isDue ? (
                            <span className="font-mono font-black text-rose-700 text-[13px] bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200 inline-block">
                              ₹{Number(r.dueAmount || 0).toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-emerald-600 text-[12px] bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 inline-block">
                              ₹0 (Cleared)
                            </span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-3 text-center">
                          {r.dueAmount === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                              <CheckCircle2 size={11} className="text-emerald-600" /> Paid
                            </span>
                          ) : r.amountPaid > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
                              <AlertTriangle size={11} className="text-amber-600" /> Partial
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 shadow-xs">
                              <AlertTriangle size={11} className="text-rose-600" /> Due
                            </span>
                          )}
                        </td>

                        {/* Payment Ref / Date */}
                        <td className="py-3 px-4">
                          {r.paymentRecord ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-700">
                                <span>{r.paymentRecord.orderId || "-"}</span>
                                {r.paymentRecord.orderId && (
                                  <button
                                    onClick={() => handleCopy(r.paymentRecord.orderId)}
                                    title="Copy Txn ID"
                                    className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                                  >
                                    {copiedOrderId === r.paymentRecord.orderId ? (
                                      <Check size={11} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={11} />
                                    )}
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock size={10} />
                                <span>{formatPaymentDateTime(r.paymentRecord)}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                              Payment Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer Summary Bar */}
            <div className="bg-slate-100/90 px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <span>Displaying {filteredRecords.length} of {totalCandidates} Candidates</span>
                {statusFilter === "DUE_ONLY" && (
                  <span className="text-rose-700 font-extrabold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
                    Filtered: {filteredRecords.length} Unpaid Dues
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <span className="text-slate-500 font-medium mr-1">Filtered Collected:</span>
                  <span className="font-mono text-emerald-700">
                    ₹{filteredTotalCollected.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium mr-1">Filtered Pending Due:</span>
                  <span className="font-mono text-rose-700 font-black">
                    ₹{filteredTotalDue.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
