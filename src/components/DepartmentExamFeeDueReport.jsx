import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  getDeptFromRegNo,
} from "../lib/utils";

const normAlpha = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Robust normalization of section strings (e.g. "Sec-A", "Sec A", "Section A", "A" -> "A")
export function normalizeSection(sec) {
  if (!sec || sec === "ALL" || sec === "All Sections") return "ALL";
  const str = String(sec).trim();
  const match = str.match(/(?:Sec(?:tion)?[\s-_]*)?([A-Za-z0-9]+)/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return str.toUpperCase();
}

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

// Check if two names match with flexible word order/initials
function areNamesMatching(nameA, nameB) {
  if (!nameA || !nameB) return false;
  const a = String(nameA).toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = String(nameB).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  const wordsA = String(nameA).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const wordsB = String(nameB).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (wordsA.length > 0 && wordsB.length > 0) {
    const mainA = [...wordsA].sort((x, y) => y.length - x.length)[0];
    const mainB = [...wordsB].sort((x, y) => y.length - x.length)[0];
    if (mainA.length >= 4 && mainA === mainB) return true;
  }
  return false;
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
  const [eseFeePayments, setEseFeePayments] = useState([]);
  const [gatewayPayments, setGatewayPayments] = useState([]);
  const [examsList, setExamsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedOrderId, setCopiedOrderId] = useState(null);

  // Department state (Strict department isolation)
  const [selectedDept, setSelectedDept] = useState(department || "");
  useEffect(() => {
    if (department) {
      setSelectedDept(department);
    }
  }, [department]);

  const activeDepartment = selectedDept || department || "";

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

  // 2b. Listen to ese_fee_payments in real-time
  useEffect(() => {
    const qEsePay = query(collection(db, "ese_fee_payments"));
    const unsub = onSnapshot(
      qEsePay,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setEseFeePayments(list);
      },
      (err) => {
        console.warn("ese_fee_payments error in DepartmentExamFeeDueReport:", err);
      }
    );
    return () => unsub();
  }, []);

  // 2c. Listen to exam_cell_payments for confirmed gateway success
  useEffect(() => {
    const qPay = query(collection(db, "exam_cell_payments"));
    const unsub = onSnapshot(
      qPay,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          const st = (data.status || data.paymentStatus || "").toUpperCase();
          if (
            st === "SUCCESS" ||
            st === "CHARGED" ||
            st === "PAID" ||
            data.billAttached ||
            data.electronicBill ||
            data.receiptNo
          ) {
            list.push({ id: d.id, ...data });
          }
        });
        setGatewayPayments(list);
      },
      (err) => {
        console.warn("exam_cell_payments error in DepartmentExamFeeDueReport:", err);
      }
    );
    return () => unsub();
  }, []);

  // 2d. Listen to users collection for auth UID, email, and name mapping
  const [userLookup, setUserLookup] = useState(new Map());
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const map = new Map();
        snap.forEach((d) => {
          const u = d.data();
          const reg = (u.regNo || u.registerNumber || u.examNumber || u.rollNo || "").trim();
          if (reg) {
            const cleanReg = normAlpha(reg);
            if (cleanReg) {
              map.set(cleanReg.toLowerCase(), cleanReg);
              if (d.id) map.set(d.id.toLowerCase(), cleanReg);
              if (u.uid) map.set(String(u.uid).toLowerCase(), cleanReg);
              if (u.email) map.set(String(u.email).toLowerCase().trim(), cleanReg);
              if (u.studentEmail) map.set(String(u.studentEmail).toLowerCase().trim(), cleanReg);
              const uName = (u.displayName || u.name || u.studentName || "").trim().toLowerCase();
              if (uName) {
                map.set(uName, cleanReg);
                const stripped = uName.replace(/[^a-z0-9]/g, "");
                if (stripped) map.set(stripped, cleanReg);
              }
            }
          }
        });
        setUserLookup(map);
      },
      (err) => {
        console.warn("users listener error in DepartmentExamFeeDueReport:", err);
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

  // 3b. Listen to semester_config to identify currently ongoing active batches
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "semester_config"),
      (snap) => {
        setSemesterConfigs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // 3c. Listen to batch_sections directly configured in Curriculum.jsx
  const [batchSectionConfigs, setBatchSectionConfigs] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "batch_sections"),
      (snap) => {
        const data = {};
        snap.forEach((d) => {
          data[d.id] = d.data();
        });
        setBatchSectionConfigs(data);
      },
      (err) => {
        console.warn("batch_sections error in DepartmentExamFeeDueReport:", err);
      }
    );
    return () => unsub();
  }, []);

  const activeBatches = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const set = new Set();
    semesterConfigs.forEach((cfg) => {
      if (!cfg.startDate || !cfg.endDate) return;
      const start = new Date(cfg.startDate + "T00:00:00");
      const end = new Date(cfg.endDate + "T23:59:59");
      if (today >= start && today <= end) {
        const batches = Array.isArray(cfg.batch) ? cfg.batch : cfg.batch ? [cfg.batch] : [];
        batches.forEach((b) => {
          if (b) set.add(String(b).trim());
        });
      }
    });
    return set;
  }, [semesterConfigs]);

  // 4. Listen to official students collection for authoritative section-assigned department candidates
  const [departmentStudents, setDepartmentStudents] = useState([]);

  useEffect(() => {
    if (!activeDepartment) {
      setDepartmentStudents([]);
      return;
    }
    const qStudents = query(collection(db, "students"));
    const unsub = onSnapshot(
      qStudents,
      (snap) => {
        const list = [];
        const seenRegs = new Set();
        snap.forEach((docSnap) => {
          const docId = docSnap.id;
          const data = docSnap.data();

          let deptMatch = false;
          if (data._meta?.department) {
            deptMatch = isDeptMatch(data._meta.department, activeDepartment);
          }
          if (!deptMatch) {
            deptMatch = isDeptMatch(docId, activeDepartment);
          }
          if (!deptMatch) return;

          let batch = data._meta?.batch || "";
          if (!batch) {
            const bm = docId.match(/(\d{4}-\d{4})/);
            if (bm) batch = bm[1];
          }

          // If activeBatches has batches matching today, only include students from those active batches
          if (activeBatches.size > 0 && batch && !activeBatches.has(batch)) return;

          // Strictly filter to section-assigned candidates
          let section = "";
          const secMatch = docId.match(/_Sec[-_]?([A-Za-z0-9]+)/i);
          if (secMatch) section = secMatch[1];
          if (data._meta?.section) section = data._meta.section;
          if (!section) return; // Skip unassigned admission documents

          const studentDataMap = data._student_data || {};

          Object.entries(data).forEach(([key, val]) => {
            if (key.startsWith("_") || key === "_order") return;
            const reg = key;
            const cleanReg = normAlpha(reg);
            if (!cleanReg || seenRegs.has(cleanReg)) return;

            // Reject if Anna University code explicitly belongs to another department
            const regDept = getDeptFromRegNo(reg);
            if (regDept && !isDeptMatch(regDept, activeDepartment)) return;

            seenRegs.add(cleanReg);
            const extra = studentDataMap[reg] || {};
            let name = "";
            if (typeof val === "object" && val !== null) {
              name = val.name || val.displayName || val.studentName || "";
            } else if (typeof val === "string") {
              name = val;
            }
            if (!name && extra.name) name = extra.name;
            if (!name && extra.studentName) name = extra.studentName;

            const email = extra.email || extra.studentEmail || (typeof val === "object" && val !== null ? (val.email || val.studentEmail || "") : "");
            const uid = extra.uid || extra.studentUid || (typeof val === "object" && val !== null ? (val.uid || val.studentUid || "") : "");

            list.push({
              regNo: reg,
              studentName: name || reg,
              email: email,
              uid: uid,
              batch: batch || "-",
              section: section || "A",
              department: activeDepartment,
              programme: data._meta?.programme || (docId.includes("_PG_") ? "PG" : "UG"),
            });
          });
        });
        setDepartmentStudents(list);
      },
      (err) => {
        console.warn("students listener error in DepartmentExamFeeDueReport:", err);
      }
    );
    return () => unsub();
  }, [activeDepartment, activeBatches]);

  // Fast lookup for current department students by regNo, name, email, uid
  const deptStudentLookup = useMemo(() => {
    const map = new Map();
    departmentStudents.forEach((s) => {
      const cleanReg = normAlpha(s.regNo);
      if (!cleanReg) return;
      map.set(cleanReg.toLowerCase(), cleanReg);
      if (s.regNo) map.set(s.regNo.toLowerCase(), cleanReg);
      if (s.studentName) {
        const lower = s.studentName.trim().toLowerCase();
        map.set(lower, cleanReg);
        const stripped = lower.replace(/[^a-z0-9]/g, "");
        if (stripped) map.set(stripped, cleanReg);
      }
      if (s.email) map.set(String(s.email).trim().toLowerCase(), cleanReg);
      if (s.uid) map.set(String(s.uid).trim().toLowerCase(), cleanReg);
    });
    return map;
  }, [departmentStudents]);

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

  // Extract distinct departments from fee configs & payments for fallback selector
  const availableDepartments = useMemo(() => {
    const set = new Set();
    feeConfigs.forEach((c) => {
      if (c.department) set.add(c.department);
    });
    paymentRecords.forEach((p) => {
      if (p.department) set.add(p.department);
    });
    return Array.from(set).sort();
  }, [feeConfigs, paymentRecords]);

  // Filter fee configs matching current department strictly
  const departmentFeeConfigs = useMemo(() => {
    if (!activeDepartment) return [];
    return feeConfigs.filter((cfg) => isDeptMatch(cfg.department, activeDepartment));
  }, [feeConfigs, activeDepartment]);

  // Extract distinct batches for this department
  const availableBatches = useMemo(() => {
    const set = new Set();
    departmentStudents.forEach((s) => {
      if (s.batch && s.batch !== "-") set.add(s.batch);
    });
    departmentFeeConfigs.forEach((cfg) => {
      if (cfg.batch) set.add(cfg.batch);
    });
    paymentRecords.forEach((r) => {
      if (activeDepartment && isDeptMatch(r.department, activeDepartment) && r.batch) {
        set.add(r.batch);
      }
    });
    return Array.from(set).sort().reverse();
  }, [departmentStudents, departmentFeeConfigs, paymentRecords, activeDepartment]);

  // Derive available sections strictly matching Curriculum.jsx Section Configuration (batch_sections)
  const availableSections = useMemo(() => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const sectionSet = new Set();

    // 1. Primary Source: Configured batch sections from Curriculum.jsx (batch_sections)
    const matchingConfigs = Object.values(batchSectionConfigs || {}).filter((cfg) => {
      if (!cfg || !cfg.department) return false;
      const deptMatch = isDeptMatch(cfg.department, activeDepartment);
      if (!deptMatch) return false;

      if (batchFilter && batchFilter !== "ALL") {
        return cfg.batch === batchFilter || isBatchMatch(cfg.batch, batchFilter);
      }
      return true;
    });

    if (matchingConfigs.length > 0) {
      matchingConfigs.forEach((cfg) => {
        const count = Math.max(1, parseInt(cfg.numSections, 10) || 1);
        for (let i = 0; i < count; i++) {
          sectionSet.add(letters[i]);
        }
      });
    }

    // 2. Fallback: normalize any sections found on actual department students
    if (sectionSet.size === 0) {
      departmentStudents.forEach((s) => {
        if (batchFilter && batchFilter !== "ALL" && !isBatchMatch(s.batch, batchFilter)) return;
        const normSec = normalizeSection(s.section);
        if (normSec && normSec !== "ALL") {
          sectionSet.add(normSec);
        }
      });

      departmentFeeConfigs.forEach((cfg) => {
        if (batchFilter && batchFilter !== "ALL" && !isBatchMatch(cfg.batch, batchFilter)) return;
        const normSec = normalizeSection(cfg.section);
        if (normSec && normSec !== "ALL") {
          sectionSet.add(normSec);
        }
      });
    }

    // Default to at least "A" if none found
    if (sectionSet.size === 0) {
      sectionSet.add("A");
    }

    const sorted = Array.from(sectionSet).sort();
    return ["ALL", ...sorted];
  }, [batchSectionConfigs, activeDepartment, batchFilter, departmentStudents, departmentFeeConfigs]);

  // Keep sectionFilter synchronized if batch changes or section list updates
  useEffect(() => {
    if (sectionFilter !== "ALL" && !availableSections.includes(sectionFilter)) {
      setSectionFilter("ALL");
    }
  }, [availableSections, sectionFilter]);

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
    if (!activeDepartment) return [];

    // Authoritative Roster Map for this Department (keyed by cleanReg for single canonical row per student)
    const studentMap = new Map();

    const activeExam = examsList[0] || {};
    const defaultExamId = activeExam.id || "ESE_2026";
    const defaultExamName = getResolvedExamName(activeExam, "End Semester Autonomous Examination");

    // Step A: Base population from official department students roster
    departmentStudents.forEach((std) => {
      const clean = normAlpha(std.regNo);
      if (!clean) return;

      studentMap.set(clean, {
        regNo: std.regNo,
        studentName: std.studentName || std.regNo,
        batch: std.batch || "-",
        section: std.section || "A",
        programme: std.programme || programme || "UG",
        department: activeDepartment,
        examId: defaultExamId,
        examName: defaultExamName,
        allocatedFee: 0, // Starts at 0, only fee > 0 in ese_student_fees or payment makes them a candidate
        amountPaid: 0,
        dueAmount: 0,
        isPaid: false,
        paymentRecord: null,
        status: "DUE",
      });
    });

    // Step B: Merge fee allocations from ese_student_fees for this department
    departmentFeeConfigs.forEach((cfg) => {
      if (examFilter && examFilter !== "ALL" && cfg.examId !== examFilter) {
        return;
      }

      const examId = cfg.examId || defaultExamId;
      const examName = getResolvedExamName(cfg.examName || cfg.examId || defaultExamName);
      const batch = cfg.batch || "-";
      const section = cfg.section || "A";
      const feesMap = cfg.fees || {};
      const studentsArr = Array.isArray(cfg.students) ? cfg.students : [];

      const allRegs = new Set([
        ...Object.keys(feesMap),
        ...studentsArr.map((s) => s.reg).filter(Boolean),
      ]);

      allRegs.forEach((reg) => {
        const clean = normAlpha(reg);
        if (!clean) return;

        // Strict cross-department filter check via Anna University code
        const regDept = getDeptFromRegNo(reg);
        if (regDept && !isDeptMatch(regDept, activeDepartment)) return;

        const studentObj = studentsArr.find((s) => normAlpha(s.reg) === clean) || {};
        const allocatedFee = Number(feesMap[reg] ?? studentObj.fee ?? 0);
        const name = studentObj.name || reg;

        if (studentMap.has(clean)) {
          const current = studentMap.get(clean);
          studentMap.set(clean, {
            ...current,
            studentName: current.studentName && current.studentName !== current.regNo ? current.studentName : name,
            batch: current.batch && current.batch !== "-" ? current.batch : batch,
            section: current.section && current.section !== "A" ? current.section : section,
            examId,
            examName,
            allocatedFee: allocatedFee,
            dueAmount: allocatedFee,
            status: allocatedFee > 0 ? "DUE" : "CONFIGURED_ZERO",
          });
        } else if (allocatedFee > 0) {
          // Arrear candidate (e.g. 2022-2026 batch) or cross-batch candidate configured with exam fee
          studentMap.set(clean, {
            regNo: reg,
            studentName: name,
            batch: batch || "-",
            section: section || "A",
            programme: programme || "UG",
            department: activeDepartment,
            examId,
            examName,
            allocatedFee: allocatedFee,
            amountPaid: 0,
            dueAmount: allocatedFee,
            isPaid: false,
            paymentRecord: null,
            status: "DUE",
          });
        }
      });
    });

    // Step C: Match payments from ese_fee_registrations, ese_fee_payments, and exam_cell_payments
    // Deduplicate payments exactly as in FeeDashboard.jsx
    const combinedEseList = [...paymentRecords, ...eseFeePayments];
    const seenPayKeys = new Set();
    const dedupedEseList = [];

    combinedEseList.forEach((p) => {
      const oId = p.orderId || p.id || p.transactionId;
      const cleanR = normAlpha(
        p.regNo ||
        p.registerNumber ||
        p.studentRegNo ||
        p.examNumber ||
        (typeof p.id === "string" && p.id.includes("_") ? p.id.split("_").pop() : "")
      );
      const pKey = cleanR && oId ? `${cleanR}_${oId}` : (oId || cleanR || Math.random());
      if (seenPayKeys.has(pKey)) return;
      seenPayKeys.add(pKey);
      dedupedEseList.push(p);
    });

    gatewayPayments.forEach((ep) => {
      const cat = (ep.category || "").toLowerCase();
      // Exclude non-exam payments (photocopy, revaluation, review)
      if (cat && !cat.includes("ese") && !cat.includes("exam") && !cat.includes("examination")) {
        return;
      }
      const oId = ep.id || ep.orderId;
      const rrn = ep.gatewayResponse?.rrn || ep.rrn;
      const match = dedupedEseList.find((p) => (oId && p.orderId === oId) || (rrn && p.rrn === rrn));
      if (match) {
        match.paymentStatus = "Paid";
        match.status = "Paid";
        match.billAttached = true;
        if (ep.amount || ep.chargedAmount) match.feeAmount = ep.amount || ep.chargedAmount;
        if (!match.uid && ep.uid) match.uid = ep.uid;
        if (!match.studentId && ep.studentId) match.studentId = ep.studentId;
        if (!match.studentEmail && ep.studentEmail) match.studentEmail = ep.studentEmail;
        if (!match.studentName && ep.studentName) match.studentName = ep.studentName;
        if (!match.regNo && ep.regNo) match.regNo = ep.regNo;
      } else {
        dedupedEseList.push({
          ...ep,
          feeAmount: ep.amount || ep.chargedAmount || 4600,
          paymentStatus: "Paid",
          status: "Paid",
          paidAt: ep.verifiedAt || ep.createdAt || ep.updatedAt,
          billAttached: true,
        });
      }
    });

    const paidRegSet = new Set();
    const paidDeptItems = [];

    dedupedEseList.forEach((p) => {
      let rawReg = (
        p.registerNumber ||
        p.regNo ||
        p.studentRegNo ||
        p.examNumber ||
        p.rollNo ||
        (typeof p.appId === "string" && p.appId.includes("_") ? p.appId.split("_").pop() : "") ||
        (typeof p.id === "string" && p.id.includes("_") && !p.id.startsWith("ESE_") ? p.id.split("_").pop() : "") ||
        ""
      ).trim();

      // Scan string fields for CKCET Anna Univ register number (4207...)
      if (!rawReg || !/4207\d{8}/.test(rawReg)) {
        const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
        for (const f of scanFields) {
          if (typeof f === "string" && f) {
            const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
            if (m) {
              rawReg = m[1];
              break;
            }
          }
        }
      }

      // Fallback resolution via users / deptStudent lookup by UID (ONLY if rawReg is empty - NEVER overwrite!)
      if (!rawReg) {
        const uids = [
          p.uid,
          p.studentId,
          p.studentUid,
          typeof p.id === "string" && p.id.startsWith("ESE_") ? p.id.replace("ESE_", "") : "",
        ].filter(Boolean);
        for (const u of uids) {
          const k = String(u).trim().toLowerCase();
          const matched = userLookup.get(k) || deptStudentLookup.get(k);
          if (matched) {
            rawReg = matched;
            break;
          }
        }
      }

      // Fallback resolution via email (ONLY if rawReg is empty - NEVER overwrite!)
      if (!rawReg) {
        const emails = [p.studentEmail, p.email].filter(Boolean);
        for (const em of emails) {
          const cleanEmail = String(em).trim().toLowerCase();
          const matched = userLookup.get(cleanEmail) || deptStudentLookup.get(cleanEmail);
          if (matched) {
            rawReg = matched;
            break;
          }
        }
      }

      // Fallback resolution via studentName (ONLY if rawReg is empty - NEVER overwrite!)
      if (!rawReg) {
        const names = [p.studentName, p.candidateName, p.name].filter(Boolean);
        for (const nm of names) {
          const rawNm = String(nm).trim().toLowerCase();
          if (rawNm && !rawNm.includes("@")) {
            const stripped = rawNm.replace(/[^a-z0-9]/g, "");
            const matched =
              deptStudentLookup.get(rawNm) ||
              deptStudentLookup.get(stripped) ||
              userLookup.get(rawNm) ||
              userLookup.get(stripped);
            if (matched) {
              rawReg = matched;
              break;
            }
            for (const s of departmentStudents) {
              if (s.studentName && areNamesMatching(s.studentName, nm)) {
                rawReg = s.regNo;
                break;
              }
            }
            if (rawReg) break;
          }
        }
      }

      let cleanReg = normAlpha(rawReg);

      // If cleanReg is not in studentMap, check if deptStudentLookup or userLookup knows this identifier
      if (cleanReg && !studentMap.has(cleanReg)) {
        const alt = deptStudentLookup.get(cleanReg) || userLookup.get(cleanReg);
        if (alt && studentMap.has(alt)) {
          cleanReg = alt;
          rawReg = alt;
        }
      }

      if (!cleanReg) return;

      const pStatus = (p.paymentStatus || p.status || p.hdfcStatus || "").toLowerCase();
      const isPaid =
        pStatus === "paid" ||
        pStatus === "success" ||
        pStatus === "successful" ||
        pStatus === "charged" ||
        pStatus === "completed" ||
        p.billAttached === true ||
        Boolean(p.receiptNo) ||
        Boolean(p.electronicBill) ||
        Boolean(p.paidAt);

      if (!isPaid) return;

      const regDept = getDeptFromRegNo(rawReg);
      // If regDept belongs to another department, strictly ignore it
      if (regDept && !isDeptMatch(regDept, activeDepartment)) return;

      const isThisDept =
        studentMap.has(cleanReg) ||
        (regDept && isDeptMatch(regDept, activeDepartment)) ||
        (p.department && p.department !== "General" && p.department !== "—" && isDeptMatch(p.department, activeDepartment));

      if (!isThisDept) return;

      if (paidRegSet.has(cleanReg)) return;
      paidRegSet.add(cleanReg);

      const cand = studentMap.get(cleanReg);
      const itemAmt = Number(
        p.feeAmount || p.amount || p.chargedAmount || p.electronicBill?.amount || p.totalFee || cand?.allocatedFee || 4600
      );

      if (studentMap.has(cleanReg)) {
        const current = studentMap.get(cleanReg);
        studentMap.set(cleanReg, {
          ...current,
          allocatedFee: current.allocatedFee > 0 ? current.allocatedFee : itemAmt,
          amountPaid: itemAmt,
          dueAmount: 0,
          isPaid: true,
          paymentRecord: p,
          status: "PAID",
        });
      } else {
        paidDeptItems.push({ cleanReg, rawReg, p, itemAmt });
      }
    });

    // Reconcile unmatched department payments against unpaid roster candidates
    const unmatchedQueue = [...paidDeptItems];

    // Reconcile unmatched department payments against unpaid roster candidates by Email, UID, or Candidate Name
    for (let i = unmatchedQueue.length - 1; i >= 0; i--) {
      const unmatched = unmatchedQueue[i];
      const unDept = getDeptFromRegNo(unmatched.rawReg);
      if (unDept && !isDeptMatch(unDept, activeDepartment)) continue;
      if (
        unmatched.p.department &&
        unmatched.p.department !== "General" &&
        unmatched.p.department !== "—" &&
        !isDeptMatch(unmatched.p.department, activeDepartment)
      ) {
        continue;
      }

      const pEmail = String(unmatched.p.studentEmail || unmatched.p.email || "").trim().toLowerCase();
      const pUid = String(
        unmatched.p.uid ||
        unmatched.p.studentId ||
        (typeof unmatched.p.id === "string" && unmatched.p.id.startsWith("ESE_") ? unmatched.p.id.replace("ESE_", "") : "")
      ).trim().toLowerCase();

      for (const [key, cand] of studentMap.entries()) {
        if (!cand.isPaid) {
          const emailMatch = pEmail && cand.email && String(cand.email).trim().toLowerCase() === pEmail;
          const uidMatch = pUid && cand.uid && String(cand.uid).trim().toLowerCase() === pUid;
          const nameMatch =
            cand.studentName &&
            unmatched.p.studentName &&
            areNamesMatching(cand.studentName, unmatched.p.studentName);

          if (emailMatch || uidMatch || nameMatch) {
            studentMap.set(key, {
              ...cand,
              allocatedFee: cand.allocatedFee,
              amountPaid: unmatched.itemAmt || cand.allocatedFee,
              dueAmount: 0,
              isPaid: true,
              paymentRecord: unmatched.p,
              status: "PAID",
            });
            unmatchedQueue.splice(i, 1);
            break;
          }
        }
      }
    }

    // Return strictly valid candidates: those who have fee > 0 allocated in Exam Form Setting OR have paid!
    // "edhuvae 0 fee potrundha avan exam fee kata vena avan count layum vara matan"
    return Array.from(studentMap.values()).filter(s => s.isPaid || s.allocatedFee > 0);
  }, [
    departmentStudents,
    departmentFeeConfigs,
    paymentRecords,
    eseFeePayments,
    gatewayPayments,
    userLookup,
    deptStudentLookup,
    activeDepartment,
    programme,
    examsList,
    examFilter,
  ]);

  // Filtered & Sorted Student Dues
  const filteredRecords = useMemo(() => {
    let result = [...allDepartmentStudentDues];

    // Strict Department Filter Guard (Never display other departments)
    if (activeDepartment) {
      result = result.filter((r) => isDeptMatch(r.department, activeDepartment));
    }

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

    // 3. Section Filter (Strict normalized matching against Curriculum sections)
    if (sectionFilter && sectionFilter !== "ALL") {
      const targetSec = normalizeSection(sectionFilter);
      result = result.filter((r) => normalizeSection(r.section || "A") === targetSec);
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

  // Aggregate Metrics (Mathematically synchronized with Fee Dashboard Master Accountant Audit)
  const totalCandidates = allDepartmentStudentDues.length;
  const totalAllocatedFee = useMemo(() => {
    return allDepartmentStudentDues.reduce((sum, r) => sum + r.allocatedFee, 0);
  }, [allDepartmentStudentDues]);
  const totalCollectedFee = useMemo(() => {
    return allDepartmentStudentDues.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  }, [allDepartmentStudentDues]);
  const totalDueFee = useMemo(() => {
    return Math.max(0, totalAllocatedFee - totalCollectedFee);
  }, [totalAllocatedFee, totalCollectedFee]);

  const studentsDueCount = useMemo(() => {
    return allDepartmentStudentDues.filter((r) => !r.isPaid && r.dueAmount > 0).length;
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
      normalizeSection(r.section) || "A",
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
        `Batch ${r.batch || "-"} (Sec ${normalizeSection(r.section) || "A"})`,
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
            <div className="text-slate-500 text-xs font-semibold mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-indigo-900 font-bold bg-indigo-50/60 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1.5">
                <GraduationCap size={13} className="text-[#120c7a]" />
                <span>{activeDepartment ? formatDepartmentDisplay(activeDepartment) : "Select Department"}</span>
              </span>
              <span className="text-slate-300">&bull;</span>
              <span>Real-time student fee allocation, payment audit, and pending due tracking.</span>
            </div>
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
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${!department ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-3 items-end`}>
          {/* Department Filter (Available if not fixed by prop) */}
          {!department && (
            <div>
              <label className="text-[10px] font-black uppercase text-indigo-700 flex items-center gap-1 mb-1">
                <GraduationCap size={12} className="text-indigo-600" /> Department *
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full bg-indigo-50/50 border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
              >
                <option value="">-- Choose Department --</option>
                {availableDepartments.map((d) => (
                  <option key={d} value={d}>
                    {formatDepartmentDisplay(d)}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                            {formatProgDisplay(r.programme || "UG")} &bull; Sec {normalizeSection(r.section) || "A"}
                          </div>
                        </td>

                        {/* Batch & Section */}
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {r.batch || "N/A"} (Sec {normalizeSection(r.section) || "A"})
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
                          {r.paymentRecord || r.isPaid || r.dueAmount === 0 ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-700">
                                <span>{r.paymentRecord?.orderId || r.paymentRecord?.transactionId || (r.regNo ? `EXAM_${r.regNo}` : "VERIFIED_ESE")}</span>
                                {(r.paymentRecord?.orderId || r.paymentRecord?.transactionId) && (
                                  <button
                                    onClick={() => handleCopy(r.paymentRecord.orderId || r.paymentRecord.transactionId)}
                                    title="Copy Txn ID"
                                    className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                                  >
                                    {copiedOrderId === (r.paymentRecord.orderId || r.paymentRecord.transactionId) ? (
                                      <Check size={11} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={11} />
                                    )}
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock size={10} />
                                <span>
                                  {formatPaymentDateTime(r.paymentRecord) !== "-"
                                    ? formatPaymentDateTime(r.paymentRecord)
                                    : "Verified Online"}
                                </span>
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
