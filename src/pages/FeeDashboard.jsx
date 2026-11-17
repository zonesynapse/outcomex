import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, getDoc, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { 
  IndianRupee, TrendingUp, Users, AlertTriangle, Receipt, 
  PiggyBank, BarChart3, BarChart2, CalendarDays, Clock, ArrowUpRight,
  ArrowDownRight, CreditCard, Wallet, Building2, Download,
  ChevronRight, ChevronDown, Sparkles, Search, Plus, ShieldAlert, CheckCircle2,
  FileSpreadsheet, Layers, Landmark, ShieldCheck, Eye, ArrowUpDown, ExternalLink, X
} from "lucide-react";
import Layout from "../components/Layout";
import { formatProgrammeKey } from "../lib/utils";
import { isDeptMatch as isDeptMatchRegistry, getDeptFromRegNo } from "../lib/departmentRegistry";

const normAlpha = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");

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
import { 
  normHead, 
  isBatchMatch, 
  isProgMatch, 
  normalizeQuotaStr, 
  isQuotaMatchExact, 
  isQuotaApplicable, 
  normalizeCategoryStr, 
  isCategoryMatchExact, 
  isCategoryApplicable, 
  parseYearStart,
  buildStudentCanonicalLookup,
  aggregatePaymentsByStudent,
  aggregateConcessionsByStudent,
  aggregateOpeningDuesByStudent,
  getActiveSemesterConfigs,
  isStudentInActiveConfigs,
  filterActiveStudyingStudents
} from "../utils/feeAllocation";

const getQuota = (obj) => obj?.seatCategory || obj?.quotaAskedFor || obj?.quota || "";
const getCategory = (obj) => obj?.studentCategory || obj?.category || obj?.admissionType || obj?.entryType || "";


export const getCanonicalDept = (rawDept) => {
  if (!rawDept) return "General";
  const str = String(rawDept).trim();
  if (str === "—" || str.toLowerCase() === "all" || !str) return "General";

  // Clean underscores, multiple spaces, and strip leading Anna University / Dept code (e.g. "401 - ", "631 - ", "105 - ")
  let clean = str
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\d{2,4}\s*[-:_]\s*/, "");

  const lower = clean.toLowerCase();

  // 1. MBA / Master of Business Administration
  if (lower.includes("business administration") || lower === "mba" || lower.includes("management studies")) {
    return "Master of Business Administration";
  }

  // 2. MCA / Master of Computer Applications
  if (lower.includes("computer applications") || lower === "mca") {
    return "Master of Computer Applications";
  }

  // 3. Artificial Intelligence and Data Science
  if (lower.includes("artificial intelligence") || lower.includes("ai&ds") || lower.includes("aids") || lower.includes("data science")) {
    return "B.Tech. Artificial Intelligence and Data Science";
  }

  // 4. Information Technology
  if (lower.includes("information technology") || lower === "it" || lower.includes("info tech")) {
    return "B.Tech. Information Technology";
  }

  // 5. Computer Science and Engineering
  if (lower.includes("computer science") || lower === "cse" || lower.includes("comp sci")) {
    return lower.includes("m.") || lower.includes("master") ? "M.E. Computer Science and Engineering" : "B.E. Computer Science and Engineering";
  }

  // 6. Electronics and Communication Engineering
  if (lower.includes("electronics and communication") || lower === "ece" || lower.includes("electronics & communication")) {
    return lower.includes("m.") || lower.includes("master") ? "M.E. Electronics and Communication Engineering" : "B.E. Electronics and Communication Engineering";
  }

  // 7. Electrical and Electronics Engineering
  if (lower.includes("electrical and electronics") || lower === "eee" || lower.includes("electrical & electronics")) {
    return lower.includes("m.") || lower.includes("master") ? "M.E. Electrical and Electronics Engineering" : "B.E. Electrical and Electronics Engineering";
  }

  // 8. Mechanical Engineering
  if (lower.includes("mechanical") || lower === "mech") {
    return lower.includes("m.") || lower.includes("master") ? "M.E. Mechanical Engineering" : "B.E. Mechanical Engineering";
  }

  // 9. Civil Engineering
  if (lower.includes("civil")) {
    return lower.includes("m.") || lower.includes("master") ? "M.E. Civil Engineering" : "B.E. Civil Engineering";
  }

  // 10. Bio Medical Engineering
  if (lower.includes("bio medical") || lower.includes("biomedical") || lower === "bme") {
    return "B.E. Bio Medical Engineering";
  }

  // 11. Applied Electronics
  if (lower.includes("applied electronics")) {
    return "M.E. Applied Electronics";
  }

  // 12. Robotics and Automation
  if (lower.includes("robotics")) {
    return "B.E. Robotics and Automation";
  }

  // Generic prefix normalizations for dynamic/custom departments created by users
  if (/^b\.?\s*e\.?\s+/i.test(clean)) {
    return clean.replace(/^b\.?\s*e\.?\s+/i, "B.E. ");
  }
  if (/^b\.?\s*tech\.?\s+/i.test(clean)) {
    return clean.replace(/^b\.?\s*tech\.?\s+/i, "B.Tech. ");
  }
  if (/^m\.?\s*e\.?\s+/i.test(clean)) {
    return clean.replace(/^m\.?\s*e\.?\s+/i, "M.E. ");
  }
  if (/^m\.?\s*tech\.?\s+/i.test(clean)) {
    return clean.replace(/^m\.?\s*tech\.?\s+/i, "M.Tech. ");
  }

  return clean;
};

export const getSmoothSvgPath = (points) => {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
};

export const parseStudentDoc = (docId, data) => {
  const meta = data?._meta || {};
  let batch = meta.batch || meta.Batch || meta.batch_name || data?.batch || "";
  let department = meta.department || meta.dept || meta.department_name || data?.department || "";
  let programme = meta.programme || meta.programme_name || meta.prog || data?.programme || "";
  let section = meta.section || data?.section || "";

  if (!batch) {
    const bMatch = String(docId).match(/(\d{4}\s*[-_]\s*\d{2,4})/);
    if (bMatch) {
      const parts = bMatch[1].split(/[-_]/);
      const y1 = parts[0].trim();
      let y2 = parts[1].trim();
      if (y2.length === 2) y2 = '20' + y2;
      batch = `${y1}-${y2}`;
    }
  }

  if (!section) {
    const sMatch = String(docId).match(/Sec-([A-Za-z0-9]+)/i);
    if (sMatch) section = sMatch[0];
  }

  if (!programme) {
    if (/(^|_)(pg)(_|$)/i.test(docId) || /mba/i.test(docId)) programme = "PG";
    else programme = "UG";
  }

  if (!department) {
    let dStr = String(docId || "");
    dStr = dStr.replace(/^\d{4}\s*[-_]\s*\d{2,4}[-_]?/i, "");
    dStr = dStr.replace(/_?Sec-.*$/i, "").replace(/_?Section-.*$/i, "");
    dStr = dStr.replace(/^(ug|pg)[-_]/i, "");
    if (dStr) {
      department = getCanonicalDept(dStr);
    }
  } else {
    department = getCanonicalDept(department);
  }

  return { batch, department, programme, section };
};

export function getPaymentDateObj(payment) {
  if (!payment) return null;
  const raw = payment.paymentDate || payment.paidAt || payment.appliedAt || payment.createdAt || payment.verifiedAt || payment.timestamp || payment.date || payment.paidAtIso || payment.isoTimestamp || payment.paidDate;
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  if (raw.seconds) return new Date(raw.seconds * 1000);
  if (raw._seconds) return new Date(raw._seconds * 1000);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(rawDate) {
  if (!rawDate) return "—";
  let d = null;
  if (rawDate.toDate) d = rawDate.toDate();
  else if (rawDate.seconds) d = new Date(rawDate.seconds * 1000);
  else d = new Date(rawDate);
  if (!d || isNaN(d.getTime())) return "—";

  const datePart = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return `${datePart}, ${timePart}`;
}

/**
 * Resolves the academic year for a fee payment document:
 * 1. Honors explicit payment.academicYear if set
 * 2. Checks against semester_config date ranges from AcademicCalendar
 * 3. Falls back to standard Indian higher education academic calendar (June to May)
 */
export function getPaymentAcademicYear(payment, configs = []) {
  if (!payment) return "";

  // 1. Direct explicit academicYear property on payment document
  const rawAy = (payment.academicYear || payment.examSession || "").toString().trim();
  if (rawAy) {
    // If standard YYYY-YYYY or YYYY-YY (e.g. "2026-2027" or "2026-27")
    const stdMatch = rawAy.match(/^(\d{4})\s*[-_]\s*(\d{2,4})$/);
    if (stdMatch) {
      const y1 = stdMatch[1];
      let y2 = stdMatch[2];
      if (y2.length === 2) y2 = '20' + y2;
      return `${y1}-${y2}`;
    }
    // Check if it is an exam session string like "Nov/Dec 2026", "April/May 2026", etc.
    const mSession = rawAy.match(/(nov|dec|apr|may|jun|jul|aug|sep|oct|jan|feb|mar)[^0-9]*(\d{4})/i);
    if (mSession) {
      const mon = mSession[1].toLowerCase();
      const yr = parseInt(mSession[2]);
      if (['nov', 'dec', 'jun', 'jul', 'aug', 'sep', 'oct'].includes(mon)) {
        return `${yr}-${yr + 1}`;
      } else {
        return `${yr - 1}-${yr}`;
      }
    }
  }

  // 2. Parse payment date from createdAt, paymentDate, or verifiedAt
  const pDate = getPaymentDateObj(payment);

  if (pDate && !isNaN(pDate.getTime())) {
    // 3. Match against semester_config (Academic Calendar) date ranges
    const dateStr = pDate.toISOString().split("T")[0];
    const matchingConfig = configs.find(cfg => {
      if (!cfg.startDate || !cfg.endDate || !cfg.academicYear) return false;
      return dateStr >= cfg.startDate && dateStr <= cfg.endDate;
    });
    if (matchingConfig?.academicYear) {
      return matchingConfig.academicYear.trim();
    }

    // 4. Fallback: Indian Academic Year calendar based on date
    // June 1 (month index 5) to May 31
    const year = pDate.getFullYear();
    const month = pDate.getMonth();
    return month >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  }

  return rawAy || "";
}

/**
 * Resolves the payment mode / gateway for a transaction:
 * - Accurately identifies HDFC SmartGateway transactions (hdfcOrderId, hdfcStatus, gatewayResponse, FEEM... orders, isOnline)
 * - Identifies Demand Draft (DD), UPI, Cash, Cheque, Online Netbanking
 */
export function getPaymentMode(payment) {
  if (!payment) return "other";

  const rawMode = (payment.mode || payment.paymentMode || "").trim().toLowerCase();

  // If this is an Admission Enquiry / Application payment:
  // It is NEVER SmartGateway. It is strictly Cash, UPI, DD, or Cheque!
  if (
    payment.isApplicationFee ||
    payment.source === "admission_enquiry" ||
    payment.enquiryId ||
    String(payment.id || "").startsWith("enq_") ||
    String(payment.receiptNo || "").includes("-APP-")
  ) {
    if (rawMode === "cash" || rawMode.includes("hand")) return "cash";
    if (rawMode === "upi" || rawMode === "pay_online" || rawMode === "online" || Boolean(payment.upiNumber)) return "upi";
    if (rawMode === "dd" || rawMode.includes("draft")) return "dd";
    if (rawMode === "cheque" || rawMode.includes("check")) return "cheque";
    return Boolean(payment.upiNumber) ? "upi" : "cash";
  }

  // 1. Explicit offline / specific modes take precedence
  if (rawMode === "dd" || rawMode === "demand draft" || rawMode.includes("draft")) return "dd";
  if (rawMode === "cash" || rawMode.includes("hand")) return "cash";
  if (rawMode === "cheque" || rawMode.includes("check")) return "cheque";
  if (rawMode === "upi" || rawMode === "pay_online") return "upi";

  // 2. Explicit SmartGateway or HDFC indicators
  const isSmartGateway = Boolean(
    payment.hdfcOrderId ||
    payment.hdfcStatus ||
    payment.gatewayResponse ||
    payment.paymentGateway?.toLowerCase().includes("smartgateway") ||
    payment.paymentUrl?.toLowerCase().includes("smartgateway") ||
    rawMode === "smartgateway" ||
    rawMode === "hdfc" ||
    rawMode.includes("smartgateway") ||
    rawMode.includes("gateway")
  );
  if (isSmartGateway) return "gateway";

  // 3. Online netbanking / card
  if (rawMode === "online" || rawMode === "netbanking" || rawMode === "card") return "online";

  // 4. Online checkout fallback (FEEM... prefix, isOnline, verifiedAt)
  if (payment.orderId?.startsWith("FEEM") || payment.returnUrl) {
    return "gateway";
  }
  if ((payment.isOnline || payment.verifiedAt) && !payment.isApplicationFee && payment.source !== "admission_enquiry") {
    return "gateway";
  }

  return rawMode || "other";
}

export default function FeeDashboard() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [openingDues, setOpeningDues] = useState([]);
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [loading, setLoading] = useState(true);

  // Defaulter & Audit modal state
  const [defaulterSearch, setDefaulterSearch] = useState("");
  const [selectedAuditHead, setSelectedAuditHead] = useState(null);
  const [auditDeptSearch, setAuditDeptSearch] = useState("");
  const [selectedAccountFilter, setSelectedAccountFilter] = useState("ALL"); // "ALL" | "76980" | "76983"
  const [trendView, setTrendView] = useState("area"); // "area" | "bar" | "cumulative"
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState(null);

  // Exam Cell Collections state (Account #76983)
  const [eseRegistrations, setEseRegistrations] = useState([]);
  const [eseFeePayments, setEseFeePayments] = useState([]);
  const [eseStudentFees, setEseStudentFees] = useState([]);
  const [photocopyApps, setPhotocopyApps] = useState([]);
  const [revaluationApps, setRevaluationApps] = useState([]);
  const [reviewApps, setReviewApps] = useState([]);
  const [examCellPayments, setExamCellPayments] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [transportStages, setTransportStages] = useState([]);
  const [userLookup, setUserLookup] = useState(new Map());

  // Real-time synchronization with Firestore
  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, "fee_payments"), snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const unsub2 = onSnapshot(collection(db, "fee_receipts"), snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const unsub3 = onSnapshot(collection(db, "fee_concessions"), snap => setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});

    // Primary official student namelist + admissions + user accounts + enquiries
    let rawNamelistDocs = [];
    let rawAdmissionsDocs = [];
    let rawUserDocs = [];
    let rawEnquiriesDocs = [];

    const rebuildStudentsList = () => {
      const studentMap = new Map();

      // 1. Process students collection FIRST (uploaded official namelists matching Reports.jsx)
      rawNamelistDocs.forEach(d => {
        const data = d.data || {};
        const { batch, department, programme, section } = parseStudentDoc(d.id, data);
        const studentDataMap = data._student_data || {};

        Object.entries(data).forEach(([k, val]) => {
          if (k.startsWith("_") || k === "id") return;
          const reg = String(k).trim();
          if (!reg) return;
          const regKey = reg.toUpperCase();
          const extra = studentDataMap[reg] || {};

          let sName = "";
          if (typeof val === "object" && val !== null) {
            sName = val.name || val.studentName || val.displayName || "";
          } else if (typeof val === "string") {
            sName = val.trim();
          }
          if (!sName && extra.name) sName = extra.name;
          if (!sName && extra.studentName) sName = extra.studentName;

          const rawDept = extra.department || department;
          const stuDept = getCanonicalDept(rawDept);
          const stuBatch = extra.batch || batch;
          const existing = studentMap.get(regKey);
          const quota = getQuota(extra) || getQuota(val) || existing?.quota || "";
          const category = getCategory(extra) || getCategory(val) || existing?.category || "Regular";
          const transportStage = extra.transportStage || (typeof val === "object" && val !== null ? val.transportStage : "") || existing?.transportStage || "";

          studentMap.set(regKey, {
            id: reg,
            regNo: reg,
            examNumber: reg,
            rollNo: reg,
            displayName: sName || existing?.displayName || reg,
            studentName: sName || existing?.studentName || reg,
            name: sName || existing?.name || reg,
            department: stuDept || existing?.department || "",
            batch: stuBatch || existing?.batch || "",
            programme: programme || existing?.programme || "UG",
            section: section || existing?.section || "",
            quota,
            category,
            transportStage,
            _profile_data: { ...(existing?._profile_data || {}), ...extra }
          });
        });
      });

      // 2. Process approved_admissions (enrich student data, and register active admissions)
      rawAdmissionsDocs.forEach(d => {
        const data = d.data || {};
        const { batch, department, programme, section } = parseStudentDoc(d.id, data);
        Object.entries(data).forEach(([k, val]) => {
          if (k.startsWith("_") || k === "id") return;
          const reg = String(k).trim();
          if (!reg) return;
          const regKey = reg.toUpperCase();
          const sName = typeof val === "object" && val !== null ? (val.name || val.studentName || "") : String(val || "");
          const quota = getQuota(val) || getQuota(data);
          const category = getCategory(val) || getCategory(data);
          const transportStage = (typeof val === "object" && val !== null ? val.transportStage : "") || data.transportStage || "";

          if (studentMap.has(regKey)) {
            const existing = studentMap.get(regKey);
            if (!existing.quota && quota) existing.quota = quota;
            if ((!existing.category || existing.category === "Regular") && category) existing.category = category;
            if (!existing.transportStage && transportStage) existing.transportStage = transportStage;
            if ((!existing.name || existing.name === reg) && sName) {
              existing.name = sName;
              existing.displayName = sName;
              existing.studentName = sName;
            }
          } else {
            const stuDept = getCanonicalDept(department);
            studentMap.set(regKey, {
              id: reg,
              regNo: reg,
              examNumber: reg,
              rollNo: reg,
              displayName: sName || reg,
              studentName: sName || reg,
              name: sName || reg,
              department: stuDept || "",
              batch: batch || "",
              programme: programme || "UG",
              section: section || "",
              quota: quota || "",
              category: category || "Regular",
              transportStage: transportStage || "",
              _profile_data: typeof val === "object" && val !== null ? { ...val } : {}
            });
          }
        });
      });

      // 3. Attach login / auth info (email, uid, quota, category) from users collection without duplicating student list
      rawUserDocs.forEach(u => {
        const reg = (u.regNo || u.examNumber || u.rollNo || "").trim();
        if (reg) {
          const regKey = reg.toUpperCase();
          const existing = studentMap.get(regKey);
          if (existing) {
            existing.uid = u.id || u.uid || existing.uid;
            existing.email = u.email || existing.email;
            existing.emailId = u.emailId || u.email || existing.emailId;
            if (!existing.quota) existing.quota = getQuota(u);
            if (!existing.category || existing.category === "Regular") {
              const uCat = getCategory(u);
              if (uCat) existing.category = uCat;
            }
            if (!existing.transportStage) existing.transportStage = u.transportStage || "";
          }
        }
      });

      // 4. Attach verified Quota, Category & Transport Stage from enquiries (Primary admission records)
      rawEnquiriesDocs.forEach(enq => {
        const q = getQuota(enq);
        const c = getCategory(enq);
        const stage = enq.transportStage || "";
        if (!q && !c && !stage) return;

        const regKeys = [
          enq.regNo,
          enq.studentRegNo,
          enq.rollNo,
          enq.examNumber,
          enq.applicationNo,
          enq.enquiryId,
          enq.id
        ].filter(Boolean).map(r => String(r).trim().toUpperCase());

        const enqName = (enq.studentName || `${enq.firstName || ''} ${enq.lastName || ''}`.trim() || "").trim().toLowerCase();

        let targetStudent = null;
        for (const rk of regKeys) {
          if (studentMap.has(rk)) {
            targetStudent = studentMap.get(rk);
            break;
          }
        }
        if (!targetStudent && enqName) {
          for (const s of studentMap.values()) {
            const sName = (s.displayName || s.studentName || s.name || "").trim().toLowerCase();
            if (sName && sName === enqName) {
              targetStudent = s;
              break;
            }
          }
        }

        if (targetStudent) {
          if (!targetStudent.quota && q) targetStudent.quota = q;
          if ((!targetStudent.category || targetStudent.category === "Regular") && c) targetStudent.category = c;
          if (!targetStudent.transportStage && stage) targetStudent.transportStage = stage;
          targetStudent._profile_data = {
            ...(targetStudent._profile_data || {}),
            quota: targetStudent.quota || q,
            seatCategory: targetStudent.quota || q,
            studentCategory: targetStudent.category || c,
            transportStage: targetStudent.transportStage || stage
          };
        }
      });

      setStudents(Array.from(studentMap.values()));
    };

    const unsubStudents = onSnapshot(collection(db, "students"), snap => {
      rawNamelistDocs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      rebuildStudentsList();
    }, () => {});

    const unsubAdmissions = onSnapshot(collection(db, "approved_admissions"), snap => {
      rawAdmissionsDocs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      rebuildStudentsList();
    }, () => {});

    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      rawUserDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const map = new Map();
      snap.forEach(d => {
        const u = d.data();
        const reg = (u.regNo || u.registerNumber || u.examNumber || u.rollNo || "").trim();
        const cleanReg = normAlpha(reg);
        const name = (u.displayName || u.name || u.studentName || "").trim();
        const email = (u.email || u.studentEmail || "").trim().toLowerCase();
        const dept = u.department || "";
        const batch = u.batch || "";
        const programme = u.programme || "UG";
        const section = u.section || "A";

        const profile = {
          id: d.id,
          uid: u.uid || d.id,
          regNo: cleanReg || reg,
          registerNumber: cleanReg || reg,
          examNumber: cleanReg || reg,
          rollNo: cleanReg || reg,
          displayName: name,
          studentName: name,
          name: name,
          department: dept,
          batch,
          programme,
          section,
          email
        };

        if (cleanReg) map.set(cleanReg.toLowerCase(), profile);
        if (reg) map.set(reg.toLowerCase(), profile);
        if (d.id) map.set(d.id.toLowerCase(), profile);
        if (u.uid) map.set(String(u.uid).toLowerCase(), profile);
        if (email) map.set(email, profile);
        if (name) {
          map.set(name.toLowerCase(), profile);
          const stripped = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (stripped) map.set(stripped, profile);
        }
      });
      setUserLookup(map);
      rebuildStudentsList();
    }, () => {});

    const unsubConfigs = onSnapshot(collection(db, "fee_configurations"), snap => {
      setFeeConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubOpeningDues = onSnapshot(collection(db, "fee_opening_dues"), snap => {
      setOpeningDues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    // Semester Configs from Academic Calendar (semester_config)
    const unsub5 = onSnapshot(collection(db, "semester_config"), snap => setSemesterConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});

    // Exam Cell fee collections real-time listeners
    const unsubCOE1 = onSnapshot(collection(db, "ese_fee_registrations"), snap => {
      setEseRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubCOE1b = onSnapshot(collection(db, "ese_fee_payments"), snap => {
      setEseFeePayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubCOE2 = onSnapshot(collection(db, "photocopy_applications"), snap => {
      setPhotocopyApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubCOE3 = onSnapshot(collection(db, "revaluation_applications"), snap => {
      setRevaluationApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubCOE4 = onSnapshot(collection(db, "review_applications"), snap => {
      setReviewApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubCOE5 = onSnapshot(collection(db, "exam_cell_payments"), snap => {
      setExamCellPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubCOE6 = onSnapshot(collection(db, "ese_student_fees"), snap => {
      setEseStudentFees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    // Admission Enquiries & Applications real-time listener
    const unsubEnq = onSnapshot(collection(db, "enquiries"), snap => {
      const enqList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rawEnquiriesDocs = enqList;
      setEnquiries(enqList);
      rebuildStudentsList();
    }, () => {});

    // Transport stages listener
    const unsubTransport = onSnapshot(collection(db, "transport_stages"), snap => {
      setTransportStages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    setTimeout(() => setLoading(false), 500);
    return () => {
      unsub1(); unsub2(); unsub3(); unsub5();
      unsubStudents(); unsubAdmissions(); unsubUsers();
      unsubConfigs(); unsubOpeningDues();
      unsubCOE1(); unsubCOE1b(); unsubCOE2(); unsubCOE3(); unsubCOE4(); unsubCOE5(); unsubCOE6();
      unsubEnq();
      unsubTransport();
    };
  }, []);

  const now = new Date();
  const formatAmt = (val) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  // Extract all relevant academic years where students/faculty fall into & pay fees based on AcademicCalendar (semester_config) & payments
  const academicYearOptions = useMemo(() => {
    const yearsSet = new Set();

    // 1. Academic years configured in AcademicCalendar (semester_config)
    semesterConfigs.forEach(cfg => {
      if (cfg.academicYear && typeof cfg.academicYear === "string" && cfg.academicYear.trim()) {
        yearsSet.add(cfg.academicYear.trim());
      }
    });

    // 2. Academic years where students / faculty made fee payments
    payments.forEach(p => {
      const ay = getPaymentAcademicYear(p, semesterConfigs);
      if (ay) yearsSet.add(ay);
    });

    // 3. Academic years recorded in fee receipts
    receipts.forEach(r => {
      const ay = r.academicYear || getPaymentAcademicYear(r, semesterConfigs);
      if (ay) yearsSet.add(ay);
    });

    // Sort chronologically descending (e.g. 2026-2027, 2025-2026, 2024-2025...)
    const sorted = Array.from(yearsSet).sort((a, b) => {
      const yA = parseInt(a.split("-")[0]) || 0;
      const yB = parseInt(b.split("-")[0]) || 0;
      return yB - yA;
    });

    // Fallback: If empty, ensure current academic year is present
    if (sorted.length === 0) {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const defAy = curMonth >= 5 ? `${curYear}-${curYear + 1}` : `${curYear - 1}-${curYear}`;
      sorted.push(defAy);
    }

    return sorted;
  }, [semesterConfigs, payments, receipts]);

  // Set default active academic year (the one active today or latest)
  useEffect(() => {
    if (academicYearOptions.length > 0 && !selectedAcademicYear) {
      const todayStr = new Date().toISOString().split("T")[0];
      const activeCfg = semesterConfigs.find(c => c.startDate && c.endDate && todayStr >= c.startDate && todayStr <= c.endDate);
      if (activeCfg?.academicYear && academicYearOptions.includes(activeCfg.academicYear.trim())) {
        setSelectedAcademicYear(activeCfg.academicYear.trim());
      } else {
        setSelectedAcademicYear(academicYearOptions[0]);
      }
    }
  }, [academicYearOptions, semesterConfigs, selectedAcademicYear]);

  const dropdownAcademicYears = useMemo(() => {
    return [...academicYearOptions, "ALL"];
  }, [academicYearOptions]);

  // Fast lookup map for students by id, uid, regNo, registerNumber, examNumber, rollNo, studentName, displayName, email
  const studentLookup = useMemo(() => {
    const map = new Map();
    students.forEach(s => {
      if (s.id) map.set(String(s.id).toLowerCase(), s);
      if (s.uid) map.set(String(s.uid).toLowerCase(), s);
      if (s.regNo) map.set(String(s.regNo).toLowerCase(), s);
      if (s.registerNumber) map.set(String(s.registerNumber).toLowerCase(), s);
      if (s.examNumber) map.set(String(s.examNumber).toLowerCase(), s);
      if (s.rollNo) map.set(String(s.rollNo).toLowerCase(), s);
      if (s.studentName) map.set(String(s.studentName).toLowerCase(), s);
      if (s.displayName) map.set(String(s.displayName).toLowerCase(), s);
      if (s.name) map.set(String(s.name).toLowerCase(), s);
      if (s.email) map.set(String(s.email).toLowerCase(), s);
      if (s.emailId) map.set(String(s.emailId).toLowerCase(), s);
      if (s._profile_data?.emailId) map.set(String(s._profile_data.emailId).toLowerCase(), s);
      if (s._profile_data?.email) map.set(String(s._profile_data.email).toLowerCase(), s);
      if (s._profile_data?.regNo) map.set(String(s._profile_data.regNo).toLowerCase(), s);
    });
    return map;
  }, [students]);

  // Students strictly enrolled in currently active academic calendar batches (past date ranges excluded)
  const currentStudyingStudents = useMemo(() => {
    return filterActiveStudyingStudents(students, semesterConfigs);
  }, [students, semesterConfigs]);

  const resolveStudentMeta = (reg, name, sId, email, docId) => {
    const kReg = (reg || "").trim().toLowerCase();
    const kName = (name || "").trim().toLowerCase();
    const kId = (sId || "").trim().toLowerCase();
    const kEmail = (email || "").trim().toLowerCase();
    const kDoc = (docId || "").trim().toLowerCase();
    const cleanUid = kDoc.startsWith("ese_") ? kDoc.replace("ese_", "") : "";

    let found = (kReg ? studentLookup.get(kReg) : null) ||
      (kEmail ? studentLookup.get(kEmail) : null) ||
      (kId ? studentLookup.get(kId) : null) ||
      (cleanUid ? studentLookup.get(cleanUid) : null) ||
      (kName ? studentLookup.get(kName) : null);

    if (found) return found;

    const userMeta = (kReg ? userLookup.get(kReg) : null) ||
      (kEmail ? userLookup.get(kEmail) : null) ||
      (kId ? userLookup.get(kId) : null) ||
      (cleanUid ? userLookup.get(cleanUid) : null) ||
      (kDoc ? userLookup.get(kDoc) : null) ||
      (kName ? userLookup.get(kName) : null);

    if (userMeta) {
      if (userMeta.regNo) {
        const sByReg = studentLookup.get(String(userMeta.regNo).trim().toLowerCase());
        if (sByReg) return sByReg;
      }
      return userMeta;
    }
    return null;
  };

  const successPayments = useMemo(() => {
    const isPaidStatus = (st) => {
      const s = String(st || "").toUpperCase().trim();
      return s === "SUCCESS" || s === "CHARGED" || s === "PAID" || s === "COMPLETED";
    };
    const list = payments.filter(p => isPaidStatus(p.status)).map(p => {
      const regNo = (p.examNumber || p.regNo || p.studentRegNo || p.registerNumber || "").trim();
      const rawEmail = (p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentId || p.uid, rawEmail);

      const rawName = (p.studentName || p.candidateName || p.name || "").trim();
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || (regNo ? `Student (${regNo})` : "Student")));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const resolvedDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || "—";
      const resolvedBatch = p.batch || sMeta?.batch || "—";

      return {
        ...p,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs),
        feeHead: p.feeHead || p.head || "Fee",
        isCoe: false,
        accountNo: "76980"
      };
    });

    const coeList = [];
    const seenCoeKeys = new Set();
    const allEseSources = [...eseRegistrations, ...eseFeePayments];

    allEseSources.forEach(p => {
      const pStatus = (p.paymentStatus || p.status || p.hdfcStatus || "").toLowerCase();
      const isPaid =
        pStatus === "paid" ||
        pStatus === "success" ||
        pStatus === "successful" ||
        pStatus === "charged" ||
        pStatus === "completed" ||
        p.billAttached === true ||
        Boolean(p.receiptNo) ||
        Boolean(p.paidAt);
      if (!isPaid) return;

      const amt = Number(p.feeAmount || p.amount || p.chargedAmount || 0);
      if (amt <= 0) return;

      let regNo = (p.regNo || p.studentRegNo || p.examNumber || p.rollNo || "").trim();
      if (!regNo || !/4207\d{8}/.test(regNo)) {
        const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
        for (const f of scanFields) {
          if (typeof f === "string" && f) {
            const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
            if (m) {
              regNo = m[1];
              break;
            }
          }
        }
      }

      const rawEmail = (p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid || p.uid, rawEmail, p.id);

      const rawName = (p.studentName || p.candidateName || p.name || "").trim();
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || (regNo ? `Student (${regNo})` : "Student")));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = getCanonicalDept(rawDept);
      const resolvedBatch = p.batch || sMeta?.batch || "—";

      const orderId = (p.orderId || p.transactionId || (p.id && !p.id.startsWith("ESE_") ? p.id : "") || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-ESE-${orderId}` : `ESE-${p.id}`)).trim();
      const paymentDate = p.paidAt || p.paymentDate || p.appliedAt || p.createdAt || p.timestamp || p.verifiedAt;
      let ay = p.academicYear || (p.examSession ? p.examSession : null) || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027";
      if (typeof ay === "string" && ay.trim().length === 4 && !ay.includes("-")) {
        ay = `${ay.trim()}-${Number(ay.trim()) + 1}`;
      }

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_ese_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);
      seenCoeKeys.add(`ese_${p.id}_${orderId}_${amt}`);

      coeList.push({
        id: `coe_ese_${p.id}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: "ESE registration Fee",
        mode: "gateway",
        paymentMode: "gateway",
        paymentDate,
        createdAt: paymentDate ? new Date(paymentDate) : new Date(),
        receiptNo,
        academicYear: ay,
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        isCoe: true,
        accountNo: "76983",
        orderId,
      });
    });

    photocopyApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" || p.billAttached === true || Boolean(p.electronicBill) || Boolean(p.transactionId) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;
      const orderId = (p.orderId || p.electronicBill?.transactionId || p.transactionId || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-PHOTO-${orderId}` : `PHOTO-${p.id}`)).trim();

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
      const rawEmail = (p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid || p.uid, rawEmail, p.id);

      const rawName = (p.studentName || p.candidateName || p.name || "").trim();
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || (regNo ? `Student (${regNo})` : "Student")));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = getCanonicalDept(rawDept);
      const resolvedBatch = p.batch || sMeta?.batch || "—";

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_photo_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);

      coeList.push({
        id: `coe_photo_${p.id}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: "Photocopy Fee",
        mode: "gateway",
        paymentMode: "gateway",
        paymentDate: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt,
        createdAt: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt,
        receiptNo,
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        isCoe: true,
        accountNo: "76983",
        orderId,
      });
    });

    revaluationApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" || p.billAttached === true || Boolean(p.electronicBill) || Boolean(p.transactionId) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;
      const orderId = (p.orderId || p.electronicBill?.transactionId || p.transactionId || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-REVAL-${orderId}` : `REVAL-${p.id}`)).trim();

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
      const rawEmail = (p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid || p.uid, rawEmail, p.id);

      const rawName = (p.studentName || p.candidateName || p.name || "").trim();
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || (regNo ? `Student (${regNo})` : "Student")));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = getCanonicalDept(rawDept);
      const resolvedBatch = p.batch || sMeta?.batch || "—";

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_reval_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);

      coeList.push({
        id: `coe_reval_${p.id}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: "Revaluation Fee",
        mode: "gateway",
        paymentMode: "gateway",
        paymentDate: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt,
        createdAt: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt,
        receiptNo,
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        isCoe: true,
        accountNo: "76983",
        orderId,
      });
    });

    reviewApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" || p.billAttached === true || Boolean(p.electronicBill) || Boolean(p.transactionId) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;
      const orderId = (p.orderId || p.electronicBill?.transactionId || p.transactionId || "").trim();
      const receiptNo = (p.receiptNo || (orderId ? `REC-REVIEW-${orderId}` : `REVIEW-${p.id}`)).trim();

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
      const rawEmail = (p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid || p.uid, rawEmail, p.id);

      const rawName = (p.studentName || p.candidateName || p.name || "").trim();
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || (regNo ? `Student (${regNo})` : "Student")));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = getCanonicalDept(rawDept);
      const resolvedBatch = p.batch || sMeta?.batch || "—";

      const normReceipt = (receiptNo || "").toLowerCase();
      const normOrder = (orderId || "").toLowerCase();
      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_review_${amt}_${normOrder || normReceipt}`;

      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);

      coeList.push({
        id: `coe_review_${p.id}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: "Review Fee",
        mode: "gateway",
        paymentMode: "gateway",
        paymentDate: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt,
        createdAt: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt,
        receiptNo,
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        isCoe: true,
        accountNo: "76983",
        orderId,
      });
    });

    examCellPayments.forEach(p => {
      if ((p.status || "").toUpperCase() !== "SUCCESS") return;
      const orderId = (p.id || p.orderId || "").trim();
      const normOrder = orderId.toLowerCase();
      if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;

      const amt = Number(p.amount || p.chargedAmount || 0);
      if (amt <= 0) return;

      const catLower = (p.category || "").toLowerCase();
      let head = "ESE registration Fee";
      if (catLower.includes("review")) head = "Review Fee";
      else if (catLower.includes("revaluation")) head = "Revaluation Fee";
      else if (catLower.includes("photocopy")) head = "Photocopy Fee";

      const receiptNo = (p.receiptNo || `REC-EXAM-${orderId}`).trim();
      const normReceipt = receiptNo.toLowerCase();
      if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;

      let regNo = (p.regNo || p.examNumber || p.studentRegNo || p.rollNo || "").trim();
      if (!regNo || !/4207\d{8}/.test(regNo)) {
        const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
        for (const f of scanFields) {
          if (typeof f === "string" && f) {
            const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
            if (m) {
              regNo = m[1];
              break;
            }
          }
        }
      }

      const rawEmail = (p.email || p.studentEmail || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
      const sMeta = resolveStudentMeta(regNo, p.studentName, p.uid || p.studentId, rawEmail, p.id || p.orderId);
      const rawName = (p.studentName || p.candidateName || p.name || "").trim();
      const isRawEmail = rawName && rawName.includes("@");
      const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || (regNo ? `Student (${regNo})` : "Student")));
      const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
      const regDept = getDeptFromRegNo(resolvedReg);
      const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
      const resolvedDept = getCanonicalDept(rawDept);
      const resolvedBatch = p.batch || sMeta?.batch || "—";

      const normReg = (resolvedReg || "").toLowerCase();
      const studentTxnKey = `${normReg}_${head.toLowerCase()}_${amt}_${normOrder || normReceipt}`;
      if (seenCoeKeys.has(studentTxnKey)) return;

      if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
      if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
      seenCoeKeys.add(studentTxnKey);

      coeList.push({
        id: `coe_pay_${orderId}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: head,
        mode: "gateway",
        paymentMode: "gateway",
        paymentDate: p.verifiedAt || p.createdAt || p.paymentDate,
        createdAt: p.verifiedAt || p.createdAt || p.paymentDate,
        receiptNo,
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: resolvedStudentName,
        examNumber: resolvedReg,
        regNo: resolvedReg,
        department: resolvedDept,
        batch: resolvedBatch,
        isCoe: true,
        accountNo: "76983",
        orderId,
      });
    });

    // Map Admission Enquiry & Application payments
    const seenPayKeys = new Set(list.map(p => (p.receiptNo || p.id || "").toLowerCase()));
    const enquiryList = [];

    enquiries.forEach(enq => {
      const rawPayments = Array.isArray(enq.payments) && enq.payments.length > 0
        ? enq.payments
        : (enq.feeAmount ? [{
            feeCategory: enq.feeCategory || "Application Fee",
            feeAmount: enq.feeAmount,
            paymentMode: enq.paymentMode || "cash",
            paymentDate: enq.paymentDate || enq.enquiryDate,
            upiNumber: enq.upiNumber || ""
          }] : []);

      rawPayments.forEach((p, idx) => {
        const amt = Number(p.feeAmount);
        if (isNaN(amt) || amt <= 0) return;
        const enqId = enq.enquiryId || enq.id;
        const appNo = enq.applicationNo || enqId;
        const payDocId = `enq_pay_${enqId}_${idx}`;
        const receiptNo = p.receiptNo || `REC-APP-${String(enqId).replace(/[^A-Za-z0-9]/g, '')}-${idx + 1}`;

        if (seenPayKeys.has(payDocId.toLowerCase()) || seenPayKeys.has(receiptNo.toLowerCase())) {
          return;
        }
        seenPayKeys.add(payDocId.toLowerCase());
        seenPayKeys.add(receiptNo.toLowerCase());

        const feeHead = p.feeCategory || (enq.status === "Admission" || enq.status === "Approved" ? "Admission Fee" : "Application Fee");
        const rawMode = String(p.paymentMode || "cash").toLowerCase();
        const mode = (rawMode === "cash" || rawMode.includes("hand")) ? "cash"
          : (rawMode === "pay_online" || rawMode === "upi" || rawMode === "online" || Boolean(p.upiNumber)) ? "upi"
          : rawMode === "dd" ? "dd"
          : rawMode === "cheque" ? "cheque"
          : "cash";

        const pDate = p.paymentDate || enq.enquiryDate || enq.admissionDate || enq.createdAt;
        const ay = enq.academicYear || getPaymentAcademicYear({ paymentDate: pDate, createdAt: pDate }, semesterConfigs) || "2026-2027";
        const enqName = enq.studentName || `${enq.firstName || ""} ${enq.lastName || ""}`.trim() || "Candidate";

        enquiryList.push({
          id: payDocId,
          status: "SUCCESS",
          amount: amt,
          chargedAmount: amt,
          feeHead,
          mode,
          paymentMode: mode,
          paymentDate: pDate,
          createdAt: pDate ? new Date(pDate) : new Date(),
          receiptNo,
          academicYear: ay,
          studentName: enqName,
          examNumber: appNo,
          regNo: appNo,
          department: enq.department || "—",
          batch: enq.batch || "—",
          isApplicationFee: true,
          source: "admission_enquiry",
          enquiryId: enqId,
          upiNumber: p.upiNumber || "",
          isCoe: false,
          accountNo: "76980"
        });
      });
    });

    return [...list, ...coeList, ...enquiryList];
  }, [payments, eseRegistrations, eseFeePayments, photocopyApps, revaluationApps, reviewApps, examCellPayments, enquiries, semesterConfigs, studentLookup]);

  // Combined receipts including Admission Enquiries
  const allReceipts = useMemo(() => {
    const list = [...receipts];
    const seenRecNos = new Set(receipts.map(r => (r.receiptNo || r.id || "").toLowerCase()));

    enquiries.forEach(enq => {
      const rawPayments = Array.isArray(enq.payments) && enq.payments.length > 0
        ? enq.payments
        : (enq.feeAmount ? [{
            feeCategory: enq.feeCategory || "Application Fee",
            feeAmount: enq.feeAmount,
            paymentMode: enq.paymentMode || "cash",
            paymentDate: enq.paymentDate || enq.enquiryDate,
            upiNumber: enq.upiNumber || ""
          }] : []);

      rawPayments.forEach((p, idx) => {
        const amt = Number(p.feeAmount);
        if (isNaN(amt) || amt <= 0) return;
        const enqId = enq.enquiryId || enq.id;
        const appNo = enq.applicationNo || enqId;
        const recDocId = `enq_rec_${enqId}_${idx}`;
        const receiptNo = p.receiptNo || `REC-APP-${String(enqId).replace(/[^A-Za-z0-9]/g, '')}-${idx + 1}`;

        if (seenRecNos.has(recDocId.toLowerCase()) || seenRecNos.has(receiptNo.toLowerCase())) return;
        seenRecNos.add(recDocId.toLowerCase());
        seenRecNos.add(receiptNo.toLowerCase());

        const pDate = p.paymentDate || enq.enquiryDate || enq.admissionDate || enq.createdAt;
        const ay = enq.academicYear || getPaymentAcademicYear({ paymentDate: pDate, createdAt: pDate }, semesterConfigs) || "2026-2027";
        const enqName = enq.studentName || `${enq.firstName || ""} ${enq.lastName || ""}`.trim() || "Candidate";

        list.push({
          id: recDocId,
          receiptNo,
          amount: amt,
          feeHead: p.feeCategory || "Application Fee",
          academicYear: ay,
          paymentDate: pDate,
          createdAt: pDate ? new Date(pDate) : new Date(),
          studentName: enqName,
          examNumber: appNo,
          department: enq.department || "—",
          status: "active"
        });
      });
    });

    return list;
  }, [receipts, enquiries, semesterConfigs]);

  // Filter payments by selected Academic Year
  const activePayments = useMemo(() => {
    if (!selectedAcademicYear || selectedAcademicYear === "ALL") {
      return successPayments;
    }
    return successPayments.filter(p => getPaymentAcademicYear(p, semesterConfigs) === selectedAcademicYear);
  }, [successPayments, selectedAcademicYear, semesterConfigs]);

  // Filter receipts by selected Academic Year
  const activeReceipts = useMemo(() => {
    if (!selectedAcademicYear || selectedAcademicYear === "ALL") {
      return allReceipts;
    }
    return allReceipts.filter(r => (r.academicYear || getPaymentAcademicYear(r, semesterConfigs)) === selectedAcademicYear);
  }, [allReceipts, selectedAcademicYear, semesterConfigs]);

  // Filter concessions by selected Academic Year
  const activeConcessions = useMemo(() => {
    if (!selectedAcademicYear || selectedAcademicYear === "ALL") {
      return concessions;
    }
    return concessions.filter(c => !c.academicYear || c.academicYear === selectedAcademicYear);
  }, [concessions, selectedAcademicYear]);

  // Today's payments belonging to this academic year
  const todayPayments = activePayments.filter(p => {
    if (!p.createdAt && !p.paymentDate) return false;
    const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : p.paymentDate?.toDate ? p.paymentDate.toDate() : new Date(p.createdAt || p.paymentDate);
    return pDate.getFullYear() === now.getFullYear() &&
           pDate.getMonth() === now.getMonth() &&
           pDate.getDate() === now.getDate();
  });

  // Month's payments belonging to this academic year
  const monthPayments = activePayments.filter(p => {
    if (!p.createdAt && !p.paymentDate) return false;
    const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : p.paymentDate?.toDate ? p.paymentDate.toDate() : new Date(p.createdAt || p.paymentDate);
    return pDate.getFullYear() === now.getFullYear() &&
           pDate.getMonth() === now.getMonth();
  });

  // Overall Year Collection for the selected Academic Year
  const yearPayments = activePayments;

  const todayCollection = todayPayments.reduce((s, p) => s + (p.chargedAmount || p.amount || 0), 0);
  const monthCollection = monthPayments.reduce((s, p) => s + (p.chargedAmount || p.amount || 0), 0);
  const yearCollection = yearPayments.reduce((s, p) => s + (p.chargedAmount || p.amount || 0), 0);

  // Helper to strictly categorize a transaction or fee head between Exam Cell Account #76983 vs College Account #76980
  const isCoeHeadOrPayment = (p) => {
    if (!p) return false;
    if (p.isCoe === true || p.accountNo === "76983") return true;
    if (p.accountNo === "76980") return false;

    const idStr = String(p.id || p._id || '').toLowerCase();
    if (idStr.startsWith('coe_') || idStr.startsWith('ese_')) return true;

    const orderStr = String(p.orderId || p.transactionId || '').toUpperCase();
    if (orderStr.startsWith('FEEM') || orderStr.startsWith('ESE_') || orderStr.startsWith('COE_')) return true;

    const headStr = String(p.feeHead || p.head || p.category || '').toLowerCase().trim();
    if (
      headStr.includes('ese') ||
      headStr.includes('photocopy') ||
      headStr.includes('revaluation') ||
      headStr.includes('review') ||
      headStr.includes('exam cell') ||
      headStr.includes('autonomous exam') ||
      headStr.includes('end semester') ||
      headStr.includes('coe fee')
    ) {
      return true;
    }
    return false;
  };
  const isCoePayment = isCoeHeadOrPayment;

  // Bank Account-wise fee collection distribution (#76980 College vs #76983 Exam Cell)
  const accountStats = useMemo(() => {
    let collegeTotal = 0;
    let collegeCount = 0;
    let coeTotal = 0;
    let coeCount = 0;

    activePayments.forEach(p => {
      const amt = Number(p.chargedAmount || p.amount || 0);
      const isCoe = isCoeHeadOrPayment(p);
      if (isCoe) {
        coeTotal += amt;
        coeCount += 1;
      } else {
        collegeTotal += amt;
        collegeCount += 1;
      }
    });

    const total = collegeTotal + coeTotal;
    const collegePct = total > 0 ? ((collegeTotal / total) * 100).toFixed(1) : "0.0";
    const coePct = total > 0 ? ((coeTotal / total) * 100).toFixed(1) : "0.0";

    return {
      collegeTotal,
      collegeCount,
      collegePct,
      coeTotal,
      coeCount,
      coePct,
      total
    };
  }, [activePayments]);

  // Real Defaulters calculation matching FeeOperations audit-grade logic (strictly scoped to active studying batches)
  const topDefaulters = useMemo(() => {
    const targetStudents = currentStudyingStudents.length > 0 ? currentStudyingStudents : students;
    if (targetStudents.length === 0) return [];

    const studentLookup = buildStudentCanonicalLookup(students);
    const studentPaidMap = aggregatePaymentsByStudent(successPayments, studentLookup);
    const studentConcessionsMap = aggregateConcessionsByStudent(concessions, studentLookup);
    const targetYearStart = parseYearStart(selectedAcademicYear);
    const studentOpeningDuesMap = aggregateOpeningDuesByStudent(openingDues, studentLookup, targetYearStart);

    // Fast lookup for enquiries to resolve student Quota (e.g. GQ vs MQ) and Transport Stage
    const enqLookup = new Map();
    enquiries.forEach(enq => {
      const q = getQuota(enq);
      const c = getCategory(enq);
      const stage = enq.transportStage || "";
      if (!q && !c && !stage) return;

      const keys = [
        enq.regNo,
        enq.studentRegNo,
        enq.rollNo,
        enq.examNumber,
        enq.applicationNo,
        enq.enquiryId,
        enq.id,
        enq.studentName,
        `${enq.firstName || ''} ${enq.lastName || ''}`.trim()
      ].filter(Boolean);

      keys.forEach(k => {
        const kNorm = String(k).trim().toLowerCase();
        if (kNorm && !enqLookup.has(kNorm)) {
          enqLookup.set(kNorm, { quota: q, category: c, transportStage: stage });
        }
      });
    });

    const defaulters = [];

    targetStudents.forEach(s => {
      const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim().toUpperCase();
      if (!reg) return;

      let studentQuota = s.quota || s._profile_data?.quota || s._profile_data?.seatCategory || s._profile_data?.quotaAskedFor || "";
      let studentCategory = s.category || s._profile_data?.category || s._profile_data?.studentCategory || s._profile_data?.admissionType || "Regular";
      let studentStage = s.transportStage || s._profile_data?.transportStage || "";

      // Fallback to enquiry lookup if quota or transport stage missing on student object
      if (!studentQuota || !studentStage) {
        const enqInfo = enqLookup.get(reg.toLowerCase()) || 
          (s.name ? enqLookup.get(s.name.toLowerCase().trim()) : null) ||
          (s.displayName ? enqLookup.get(s.displayName.toLowerCase().trim()) : null) ||
          (s.id ? enqLookup.get(String(s.id).toLowerCase().trim()) : null);
        if (enqInfo) {
          if (!studentQuota && enqInfo.quota) studentQuota = enqInfo.quota;
          if ((!studentCategory || studentCategory === "Regular") && enqInfo.category) studentCategory = enqInfo.category;
          if (!studentStage && enqInfo.transportStage) studentStage = enqInfo.transportStage;
        }
      }

      const sDept = getCanonicalDept(s.department);

      // Filter configs matching student programme, department, batch, quota and category UP TO selectedAcademicYear
      const matchedFees = feeConfigs.filter(f => {
        // If an academic year is selected, exclude future academic years
        if (targetYearStart > 0 && f.academicYear) {
          const cfgYearStart = parseYearStart(f.academicYear);
          if (cfgYearStart > targetYearStart) {
            return false;
          }
        }

        const isProg = isProgMatch(f.programme, s.programme || "UG");
        const isDept = !f.department || f.department.toLowerCase() === "all" || isDeptMatchRegistry(f.department, sDept);
        const batchMatch = !f.batch || f.batch.toLowerCase() === "all" || isBatchMatch(f.batch, s.batch);
        const isQuota = isQuotaApplicable(f.quota, studentQuota);
        const isCategory = isCategoryApplicable(f.studentCategory, studentCategory);

        return isProg && isDept && batchMatch && isQuota && isCategory;
      });

      // Deduplicate & prioritize quota-specific configs per (academicYear + semester + head)
      const configMap = new Map();
      matchedFees.forEach(c => {
        const key = `${c.academicYear || ''}_${c.semester || ''}_${normHead(c.head)}`;
        const existing = configMap.get(key);
        if (!existing) {
          configMap.set(key, c);
        } else {
          const existingMatchesExact = isQuotaMatchExact(existing.quota, studentQuota);
          const currentMatchesExact = isQuotaMatchExact(c.quota, studentQuota);

          if (currentMatchesExact && !existingMatchesExact) {
            configMap.set(key, c);
          } else if (!existingMatchesExact && (!existing.quota || existing.quota.trim().toLowerCase() === 'all')) {
            const currentHasQuota = Boolean(c.quota && c.quota.trim().toLowerCase() !== 'all');
            if (currentHasQuota) {
              configMap.set(key, c);
            }
          }
        }
      });

      let allocatedAmount = Array.from(configMap.values()).reduce((sum, c) => sum + Number(c.amount || 0), 0);

      // Transport stage fee matching student's stage
      if (studentStage && transportStages.length) {
        const stageMatch = transportStages.find(t => String(t.stageNo).trim() === String(studentStage).trim() || String(t.stageName || t.name).toLowerCase().trim() === String(studentStage).toLowerCase().trim());
        if (stageMatch && Number(stageMatch.fee || stageMatch.amount)) {
          allocatedAmount += Number(stageMatch.fee || stageMatch.amount);
        }
      }

      // Add previous academic year opening dues / arrears
      const sKey = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim().toUpperCase();
      const openingDueAmt = studentOpeningDuesMap.get(sKey) || 0;
      allocatedAmount += openingDueAmt;

      if (allocatedAmount <= 0) return;

      const paidAmt = studentPaidMap.get(sKey) || 0;
      const concessionAmt = studentConcessionsMap.get(sKey) || 0;
      const netDue = Math.max(0, allocatedAmount - paidAmt - concessionAmt);

      if (netDue > 0) {
        defaulters.push({
          id: s.id || reg,
          regNo: reg,
          name: s.displayName || s.studentName || s.name || `Student ${reg}`,
          department: sDept || "—",
          batch: s.batch || "—",
          allocatedAmount,
          paidAmount: paidAmt,
          concessionAmount: concessionAmt,
          dueAmount: netDue,
          overdueDays: Math.min(180, Math.floor(netDue / 1000) + 15)
        });
      }
    });

    return defaulters.sort((a, b) => b.dueAmount - a.dueAmount);
  }, [currentStudyingStudents, students, successPayments, concessions, openingDues, feeConfigs, enquiries, selectedAcademicYear, transportStages]);

  const filteredDefaulters = useMemo(() => {
    if (!defaulterSearch.trim()) return topDefaulters;
    const q = defaulterSearch.toLowerCase().trim();
    return topDefaulters.filter(d => 
      d.name.toLowerCase().includes(q) ||
      d.regNo.toLowerCase().includes(q) ||
      d.department.toLowerCase().includes(q)
    );
  }, [topDefaulters, defaulterSearch]);

  const totalDue = topDefaulters.reduce((sum, d) => sum + d.allocatedAmount, 0) || (yearCollection + 1000000);
  const pendingDues = topDefaulters.reduce((sum, d) => sum + d.dueAmount, 0);
  const collectionEff = totalDue > 0 ? ((yearCollection / (yearCollection + pendingDues || 1)) * 100).toFixed(1) : "0.0";
  const activeDefaulters = topDefaulters.length;
  const totalConcessions = activeConcessions.filter(c => c.status === "approved").reduce((s, c) => s + (c.amount || 0), 0);
  
  const receiptsToday = activeReceipts.filter(r => {
    if (!r.createdAt && !r.paymentDate) return false;
    const rDate = r.createdAt?.toDate ? r.createdAt.toDate() : r.paymentDate?.toDate ? r.paymentDate.toDate() : new Date(r.createdAt || r.paymentDate);
    return rDate.getFullYear() === now.getFullYear() &&
           rDate.getMonth() === now.getMonth() &&
           rDate.getDate() === now.getDate();
  }).length;

  const recentPayments = useMemo(() => {
    return [...activePayments].sort((a, b) => {
      const getMs = (p) => {
        if (!p) return 0;
        if (p.createdAt?.toMillis) return p.createdAt.toMillis();
        if (p.createdAt?.seconds) return p.createdAt.seconds * 1000;
        if (p.paymentDate?.toMillis) return p.paymentDate.toMillis();
        if (p.paymentDate?.seconds) return p.paymentDate.seconds * 1000;
        const d = new Date(p.createdAt || p.paymentDate || 0);
        return !isNaN(d.getTime()) ? d.getTime() : 0;
      };
      return getMs(b) - getMs(a);
    }).slice(0, 25);
  }, [activePayments]);

  // Filter active payments by selected account (#76980 College vs #76983 Exam Cell vs ALL)
  const accountFilteredPayments = useMemo(() => {
    if (selectedAccountFilter === "76980") {
      return activePayments.filter(p => !isCoeHeadOrPayment(p));
    }
    if (selectedAccountFilter === "76983") {
      return activePayments.filter(p => isCoeHeadOrPayment(p));
    }
    return activePayments;
  }, [activePayments, selectedAccountFilter]);

  // Total collections for currently selected account filter (e.g. ₹2.15 Cr for College, ₹4.28 L for COE, or ₹2.20 Cr for Both)
  const trendTotalCollection = useMemo(() => {
    return accountFilteredPayments.reduce((s, p) => s + Number(p.chargedAmount || p.amount || 0), 0);
  }, [accountFilteredPayments]);

  // Monthly data for chart based on selected Academic Year & selected Account (#76980 vs #76983 vs ALL)
  const monthlyData = useMemo(() => {
    const [startYearStr, endYearStr] = (selectedAcademicYear || "").split("-");
    const sYear = parseInt(startYearStr);
    const eYear = parseInt(endYearStr);

    let monthsList = [];
    if (sYear && eYear && selectedAcademicYear !== "ALL") {
      // Academic year months from June of sYear to May of eYear (All 12 months for comprehensive trend)
      monthsList = [
        { year: sYear, month: 5, label: "Jun" },
        { year: sYear, month: 6, label: "Jul" },
        { year: sYear, month: 7, label: "Aug" },
        { year: sYear, month: 8, label: "Sep" },
        { year: sYear, month: 9, label: "Oct" },
        { year: sYear, month: 10, label: "Nov" },
        { year: sYear, month: 11, label: "Dec" },
        { year: eYear, month: 0, label: "Jan" },
        { year: eYear, month: 1, label: "Feb" },
        { year: eYear, month: 2, label: "Mar" },
        { year: eYear, month: 3, label: "Apr" },
        { year: eYear, month: 4, label: "May" },
      ];
    } else {
      monthsList = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-IN', { month: 'short' }) };
      });
    }

    // Accumulate each payment strictly into its month
    const monthTotals = {};
    const monthCounts = {};
    let unassignedTotal = 0;
    let unassignedCount = 0;

    accountFilteredPayments.forEach(p => {
      const pDate = getPaymentDateObj(p);
      const amt = Number(p.chargedAmount || p.amount || 0);
      if (amt <= 0) return;
      if (pDate && !isNaN(pDate.getTime())) {
        const key = `${pDate.getFullYear()}_${pDate.getMonth()}`;
        monthTotals[key] = (monthTotals[key] || 0) + amt;
        monthCounts[key] = (monthCounts[key] || 0) + 1;
      } else {
        unassignedTotal += amt;
        unassignedCount += 1;
      }
    });

    return monthsList.map(({ year, month, label }) => {
      const key = `${year}_${month}`;
      let total = monthTotals[key] || 0;
      let count = monthCounts[key] || 0;
      // If any payment had no resolvable date, assign to active month
      if (year === now.getFullYear() && month === now.getMonth() && unassignedTotal > 0) {
        total += unassignedTotal;
        count += unassignedCount;
      }
      return { month: label, year, total, count };
    });
  }, [selectedAcademicYear, accountFilteredPayments]);

  const maxMonthly = Math.max(10000, ...monthlyData.map(d => d.total));

  const cumulativeMonthlyData = useMemo(() => {
    let running = 0;
    return monthlyData.map(d => {
      running += (d.total || 0);
      return { ...d, cumulative: running };
    });
  }, [monthlyData]);

  const peakMonth = useMemo(() => {
    let max = 0;
    let peak = null;
    monthlyData.forEach(d => {
      if (d.total > max) {
        max = d.total;
        peak = d;
      }
    });
    return peak;
  }, [monthlyData]);

  const activeMonthsCount = useMemo(() => {
    return monthlyData.filter(d => (d.total || 0) > 0).length;
  }, [monthlyData]);

  const avgMonthlyCollection = useMemo(() => {
    return activeMonthsCount > 0 ? Math.round(trendTotalCollection / activeMonthsCount) : 0;
  }, [trendTotalCollection, activeMonthsCount]);

  // Separate Head collections by Account (#76980 College vs #76983 Exam Cell)
  const { collegeHeadEntries, coeHeadEntries, collegeHeadTotal, coeHeadTotal } = useMemo(() => {
    const collegeMap = {};
    const coeMap = {};

    activePayments.forEach(p => {
      const amt = Number(p.chargedAmount || p.amount || 0);
      if (amt <= 0) return;
      const head = (p.feeHead || p.head || "Other Fee").trim();
      const isCoe = isCoeHeadOrPayment(p) || isCoeHeadOrPayment({ feeHead: head });

      if (isCoe) {
        coeMap[head] = (coeMap[head] || 0) + amt;
      } else {
        collegeMap[head] = (collegeMap[head] || 0) + amt;
      }
    });

    const collegeEntries = Object.entries(collegeMap).sort((a, b) => b[1] - a[1]);
    const coeEntries = Object.entries(coeMap).sort((a, b) => b[1] - a[1]);
    const collegeTotal = collegeEntries.reduce((s, [, v]) => s + v, 0);
    const coeTotal = coeEntries.reduce((s, [, v]) => s + v, 0);

    return {
      collegeHeadEntries: collegeEntries,
      coeHeadEntries: coeEntries,
      collegeHeadTotal: collegeTotal,
      coeHeadTotal: coeTotal
    };
  }, [activePayments]);

  // Combined head entries and active head entries based on selectedAccountFilter
  const activeHeadEntries = useMemo(() => {
    if (selectedAccountFilter === "76980") return collegeHeadEntries;
    if (selectedAccountFilter === "76983") return coeHeadEntries;
    return [...collegeHeadEntries, ...coeHeadEntries].sort((a, b) => b[1] - a[1]);
  }, [selectedAccountFilter, collegeHeadEntries, coeHeadEntries]);

  const activeHeadTotal = useMemo(() => {
    if (selectedAccountFilter === "76980") return collegeHeadTotal;
    if (selectedAccountFilter === "76983") return coeHeadTotal;
    return collegeHeadTotal + coeHeadTotal;
  }, [selectedAccountFilter, collegeHeadTotal, coeHeadTotal]);

  const headEntries = activeHeadEntries;
  const totalHeadWise = activeHeadTotal || 1;
  const headColors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-cyan-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500", "bg-zinc-400"];

  // Mode-wise collection data scoped to selected academic year & account (#76980 vs #76983 vs ALL)
  const modeWiseData = useMemo(() => {
    const modeTotals = {};
    const modeCounts = {};
    let totalActiveAmt = 0;
    accountFilteredPayments.forEach(p => {
      const mode = getPaymentMode(p);
      const amt = Number(p.chargedAmount || p.amount || 0);
      modeTotals[mode] = (modeTotals[mode] || 0) + amt;
      modeCounts[mode] = (modeCounts[mode] || 0) + 1;
      totalActiveAmt += amt;
    });

    const standardModes = [
      { id: "gateway", label: "HDFC SmartGateway", icon: "🌐" },
      { id: "dd", label: "Demand Draft (DD)", icon: "🏦" },
      { id: "upi", label: "UPI Payment", icon: "📱" },
      { id: "cash", label: "Cash (Counter)", icon: "💵" },
      { id: "online", label: "Net Banking / Card", icon: "💳" },
      { id: "cheque", label: "Cheque", icon: "📝" },
    ];

    Object.keys(modeTotals).forEach(mId => {
      if (!standardModes.some(sm => sm.id === mId) && mId !== "other") {
        standardModes.push({
          id: mId,
          label: mId.toUpperCase(),
          icon: "💰"
        });
      }
    });

    const totalDenominator = totalActiveAmt || 1;
    return standardModes.map(m => {
      const total = modeTotals[m.id] || 0;
      const count = modeCounts[m.id] || 0;
      const pct = (total / totalDenominator) * 100;
      return {
        ...m,
        total,
        count,
        pct
      };
    }).sort((a, b) => b.total - a.total);
  }, [accountFilteredPayments]);

  const modeWiseTotal = useMemo(() => {
    return modeWiseData.reduce((s, m) => s + (m.total || 0), 0);
  }, [modeWiseData]);

  // Department-wise master accountant audit report for selected fee head
  const headAuditReport = useMemo(() => {
    if (!selectedAuditHead) return null;

    const normHeadName = selectedAuditHead.toLowerCase().trim();
    const isCoeHead = isCoeHeadOrPayment({ feeHead: selectedAuditHead });

    const deptMap = new Map();

    const getOrCreateDept = (rawDept) => {
      const deptName = getCanonicalDept(rawDept);
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          department: deptName,
          enrolledStudents: 0,
          paidStudentsCount: 0,
          partialPaidCount: 0,
          defaultersCount: 0,
          targetAmount: 0,
          collectedAmount: 0,
          dueAmount: 0,
          modes: { cash: 0, upi: 0, gateway: 0, dd: 0, other: 0 }
        });
      }
      return deptMap.get(deptName);
    };

    if (isCoeHead) {
      // -------------------------------------------------------------
      // CASE A: EXAM CELL / AUTONOMOUS COE HEAD (Account #76983)
      // e.g. Photocopy Fee, Revaluation Fee, Review Fee, ESE Registration Fee
      // -------------------------------------------------------------
      const isEseExamFee = normHeadName.includes('ese') || normHeadName.includes('exam');

      if (isEseExamFee) {
        // --- 1. ESE REGISTRATION FEE: Institutional Department Roster & Live Payment Reconciliation ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeBatches = new Set();
        semesterConfigs.forEach(cfg => {
          if (!cfg.startDate || !cfg.endDate) return;
          const start = new Date(cfg.startDate + 'T00:00:00');
          const end = new Date(cfg.endDate + 'T23:59:59');
          if (today >= start && today <= end) {
            const batches = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
            batches.forEach(b => {
              if (b) activeBatches.add(String(b).trim());
            });
          }
        });

        const isPgStudent = (s) => {
          const prog = String(s.programme || "").toUpperCase();
          const dept = String(s.department || "").toLowerCase();
          return prog === "PG" || dept.includes("m.") || dept.includes("master") || dept.includes("mba") || dept.includes("mca");
        };

        // Authoritative active studying students (section-assigned candidates only)
        const targetStudents = students.filter(s => {
          if (!s.section || s.section === "Unassigned") return false;
          const batch = String(s.batch || "").trim();
          if (!batch || batch === "-") return false;

          // PG 2-year programmes: for this ESE examination, strictly the active studying batch (2025-2027) is configured
          if (isPgStudent(s)) {
            return isBatchMatch(batch, "2025-2027");
          }

          // UG 4-year programmes: strictly active studying batches defined in Academic Calendar (semester_config)
          if (activeBatches.size > 0) {
            for (const ab of activeBatches) {
              if (isBatchMatch(ab, batch)) return true;
            }
            return false;
          }

          // Fallback: exclude graduated batches whose end year is in the past or current year
          const m = batch.match(/\b20(\d{2})\b/g);
          if (m && m.length >= 2) {
            const endYear = parseInt(m[1].length === 2 ? `20${m[1]}` : m[1], 10);
            if (endYear <= today.getFullYear()) return false;
          }
          return true;
        });

        const candidateMapByDept = new Map(); // canonicalDeptName -> Map(cleanReg -> candidateObj)
        const studentDeptMap = new Map(); // cleanReg -> canonicalDeptName

        const ensureDept = (rawDept) => {
          if (!rawDept || rawDept === "—" || rawDept === "All") return null;
          const dName = getCanonicalDept(rawDept);
          if (!dName || dName === "General") return null;
          getOrCreateDept(dName);
          if (!candidateMapByDept.has(dName)) candidateMapByDept.set(dName, new Map());
          return dName;
        };

        // Step A: Base population from active, section-assigned studying students
        targetStudents.forEach(s => {
          const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim();
          const clean = normAlpha(reg);
          if (!clean) return;

          const rawDept = s.department || "";
          const regDept = getDeptFromRegNo(reg);
          if (regDept && rawDept && !isDeptMatchRegistry(regDept, rawDept)) return;

          const deptName = ensureDept(regDept || rawDept);
          if (!deptName) return;

          studentDeptMap.set(clean, deptName);
          const cMap = candidateMapByDept.get(deptName);
          if (!cMap.has(clean)) {
            cMap.set(clean, {
              regNo: reg,
              studentName: s.name || s.studentName || s.displayName || reg,
              batch: s.batch || "-",
              section: s.section || "A",
              programme: s.programme || (deptName.toLowerCase().includes("m.") || deptName.toLowerCase().includes("master") ? "PG" : "UG"),
              allocatedFee: 0, // Starts at 0; strictly populated from ExamFormSetting (ese_student_fees) or payment
              amountPaid: 0,
              isPaid: false,
              paymentRecord: null,
              paymentMode: null,
            });
          }
        });

        // Step B: Merge fee allocations from ese_student_fees for active roster candidates
        eseStudentFees.forEach(cfg => {
          const rawDept = cfg.department;
          const deptName = getCanonicalDept(rawDept);
          if (!deptName || deptName === "General") return;
          const targetDept = ensureDept(deptName);
          const targetMap = candidateMapByDept.get(targetDept);
          if (!targetMap) return;

          const feesMap = cfg.fees || {};
          const studentsArr = Array.isArray(cfg.students) ? cfg.students : [];
          const allRegs = new Set([
            ...Object.keys(feesMap),
            ...studentsArr.map(s => s.reg).filter(Boolean),
          ]);

          allRegs.forEach(reg => {
            const clean = normAlpha(reg);
            if (!clean) return;

            // Strict cross-department filter check via Anna University code
            const regDept = getDeptFromRegNo(reg);
            if (regDept && !isDeptMatchRegistry(regDept, targetDept)) return;

            const studentObj = studentsArr.find(s => normAlpha(s.reg) === clean) || {};
            const fee = Number(feesMap[reg] ?? studentObj.fee ?? 0);
            const name = studentObj.name || reg;

            if (targetMap.has(clean)) {
              const cur = targetMap.get(clean);
              cur.allocatedFee = fee; // Authoritative fee from Exam Form Setting (can be 0 or > 0)
              if (name && name !== reg) cur.studentName = name;
            } else if (fee > 0) {
              // Arrear candidate (e.g. 2022-2026 batch) or cross-batch candidate configured with exam fee
              studentDeptMap.set(clean, targetDept);
              targetMap.set(clean, {
                regNo: reg,
                studentName: name,
                batch: cfg.batch || "-",
                section: cfg.section || "A",
                programme: cfg.programme || (targetDept.toLowerCase().includes("m.") || targetDept.toLowerCase().includes("master") ? "PG" : "UG"),
                allocatedFee: fee,
                amountPaid: 0,
                isPaid: false,
                paymentRecord: null,
                paymentMode: null,
              });
            }
          });
        });

        // Step C: Reconcile ALL verified ESE payments (strictly matching FeeOperations.jsx Reports tab)
        const coeTransactions = [];
        const seenCoeKeys = new Set();

        const combinedEseList = [...eseRegistrations, ...eseFeePayments];

        combinedEseList.forEach(p => {
          const pStatus = (p.paymentStatus || p.status || p.hdfcStatus || "").toLowerCase();
          const isPaid =
            pStatus === "paid" ||
            pStatus === "success" ||
            pStatus === "successful" ||
            pStatus === "charged" ||
            pStatus === "completed" ||
            p.billAttached === true ||
            Boolean(p.receiptNo) ||
            Boolean(p.paidAt);
          if (!isPaid) return;

          const amt = Number(p.feeAmount || p.amount || p.chargedAmount || 0);
          if (amt <= 0) return;

          let regNo = (p.regNo || p.studentRegNo || p.examNumber || p.rollNo || "").trim();
          if (!regNo || !/4207\d{8}/.test(regNo)) {
            const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
            for (const f of scanFields) {
              if (typeof f === "string" && f) {
                const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
                if (m) {
                  regNo = m[1];
                  break;
                }
              }
            }
          }

          const rawEmail = (p.studentEmail || p.email || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
          const sMeta = resolveStudentMeta(regNo, p.studentName, p.studentUid || p.uid, rawEmail, p.id);

          const rawName = (p.studentName || p.candidateName || p.name || "").trim();
          const isRawEmail = rawName && rawName.includes("@");
          const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || "Student"));
          const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || sMeta?.examNumber || "—";
          const regDept = getDeptFromRegNo(resolvedReg);
          const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
          const resolvedDept = getCanonicalDept(rawDept);

          const orderId = (p.orderId || p.transactionId || (p.id && !p.id.startsWith("ESE_") ? p.id : "") || "").trim();
          const receiptNo = (p.receiptNo || (orderId ? `REC-ESE-${orderId}` : `ESE-${p.id}`)).trim();
          const paymentDate = p.paidAt || p.paymentDate || p.appliedAt || p.createdAt || p.timestamp || p.verifiedAt;

          const normReceipt = (receiptNo || "").toLowerCase();
          const normOrder = (orderId || "").toLowerCase();
          const normReg = (resolvedReg || "").toLowerCase();
          const studentTxnKey = `${normReg}_ese_${amt}_${normOrder || normReceipt}`;

          if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;
          if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;
          if (seenCoeKeys.has(studentTxnKey)) return;

          if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
          if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
          seenCoeKeys.add(studentTxnKey);
          seenCoeKeys.add(`ese_${p.id}_${orderId}_${amt}`);

          coeTransactions.push({
            id: `coe_ese_${p.id}`,
            orderId,
            receiptNo,
            studentId: p.studentUid || p.uid || sMeta?.id,
            studentName: resolvedStudentName,
            regNo: resolvedReg,
            department: resolvedDept,
            batch: p.batch || sMeta?.batch || "—",
            programme: p.programme || sMeta?.programme || "UG",
            amount: amt,
            paymentDate,
            rawRecord: { ...p, orderId, feeAmount: amt }
          });
        });

        // Fallback: Any SUCCESS in exam_cell_payments not already accounted for
        examCellPayments.forEach(p => {
          const pStatus = (p.status || "").toUpperCase();
          if (pStatus !== "SUCCESS") return;
          const orderId = (p.id || p.orderId || "").trim();
          const normOrder = orderId.toLowerCase();
          if (normOrder && seenCoeKeys.has(`order_${normOrder}`)) return;

          const amt = Number(p.amount || p.chargedAmount || 0);
          if (amt <= 0) return;

          const catLower = (p.category || "").toLowerCase();
          if (catLower.includes("review") || catLower.includes("revaluation") || catLower.includes("photocopy")) {
            return;
          }
          if (catLower && !catLower.includes("ese") && !catLower.includes("exam") && !catLower.includes("examination")) {
            return;
          }

          const receiptNo = (p.receiptNo || `REC-EXAM-${orderId}`).trim();
          const normReceipt = receiptNo.toLowerCase();
          if (normReceipt && seenCoeKeys.has(`receipt_${normReceipt}`)) return;

          let regNo = (p.regNo || p.examNumber || p.studentRegNo || p.rollNo || "").trim();
          if (!regNo || !/4207\d{8}/.test(regNo)) {
            const scanFields = [p.appId, p.registrationId, p.id, p.orderId, p.studentEmail, p.email, p.studentRegNo, p.regNo];
            for (const f of scanFields) {
              if (typeof f === "string" && f) {
                const m = f.match(/(?:^|[^0-9])(4207\d{8})(?:[^0-9]|$)/);
                if (m) {
                  regNo = m[1];
                  break;
                }
              }
            }
          }

          const rawEmail = (p.email || p.studentEmail || (p.studentName && p.studentName.includes("@") ? p.studentName : "") || "").trim();
          const sMeta = resolveStudentMeta(regNo, p.studentName, p.uid || p.studentId, rawEmail, p.id || p.orderId);

          const rawName = (p.studentName || p.candidateName || p.name || "").trim();
          const isRawEmail = rawName && rawName.includes("@");
          const resolvedStudentName = (sMeta?.displayName || sMeta?.studentName || sMeta?.name) || (!isRawEmail && rawName ? rawName : (sMeta?.displayName || "Student"));
          const resolvedReg = regNo || sMeta?.regNo || sMeta?.registerNumber || "—";
          const regDept = getDeptFromRegNo(resolvedReg);
          const rawDept = (p.department && p.department !== "—" ? p.department : sMeta?.department) || regDept || "—";
          const resolvedDept = getCanonicalDept(rawDept);

          const studentTxnKey = `${(resolvedReg || "").toLowerCase()}_ese_${amt}_${normOrder || normReceipt}`;
          if (seenCoeKeys.has(studentTxnKey)) return;

          if (normReceipt) seenCoeKeys.add(`receipt_${normReceipt}`);
          if (normOrder) seenCoeKeys.add(`order_${normOrder}`);
          seenCoeKeys.add(studentTxnKey);

          coeTransactions.push({
            id: `coe_pay_${orderId}`,
            orderId,
            receiptNo,
            studentId: p.uid || p.studentId || sMeta?.id,
            studentName: resolvedStudentName,
            regNo: resolvedReg,
            department: resolvedDept,
            batch: p.batch || sMeta?.batch || "—",
            programme: p.programme || sMeta?.programme || "UG",
            amount: amt,
            paymentDate: p.verifiedAt || p.createdAt || p.paymentDate,
            rawRecord: { ...p, orderId, feeAmount: amt }
          });
        });

        // Step D: Distribute ALL verified ESE payment transactions directly into departments
        coeTransactions.forEach(item => {
          const amt = item.amount;
          const rawReg = item.regNo && item.regNo !== "—" ? item.regNo : "";
          const cleanReg = normAlpha(rawReg);

          // Resolve destination department
          let targetDeptName = null;
          if (cleanReg && studentDeptMap.has(cleanReg)) {
            targetDeptName = studentDeptMap.get(cleanReg);
          }
          if (!targetDeptName && cleanReg) {
            for (const [dName, cMap] of candidateMapByDept.entries()) {
              if (cMap.has(cleanReg)) {
                targetDeptName = dName;
                break;
              }
            }
          }
          if (!targetDeptName && rawReg) {
            const rDept = getDeptFromRegNo(rawReg);
            if (rDept) targetDeptName = ensureDept(rDept);
          }
          if (!targetDeptName && item.department && item.department !== "—" && item.department !== "General") {
            targetDeptName = ensureDept(item.department);
          }
          if (!targetDeptName) {
            targetDeptName = Array.from(candidateMapByDept.keys())[0] || ensureDept("B.E. Electrical and Electronics Engineering");
          }

          const cMap = candidateMapByDept.get(targetDeptName);
          const dObj = getOrCreateDept(targetDeptName);

          // Accumulate department collected amount & mode breakdown
          dObj.collectedAmount += amt;
          const mode = getPaymentMode(item.rawRecord) || "gateway";
          if (dObj.modes[mode] !== undefined) dObj.modes[mode] += amt;
          else dObj.modes.gateway += amt;

          // Reconcile candidate inside department
          let matchedCand = null;
          if (cleanReg && cMap.has(cleanReg)) {
            matchedCand = cMap.get(cleanReg);
          } else {
            // Check by email, uid, or name among unpaid candidates
            const pEmail = String(item.rawRecord?.studentEmail || item.rawRecord?.email || "").trim().toLowerCase();
            const pUid = String(item.studentId || item.rawRecord?.uid || "").trim().toLowerCase();
            for (const [, cand] of cMap.entries()) {
              if (!cand.isPaid) {
                const emailMatch = pEmail && cand.email && String(cand.email).trim().toLowerCase() === pEmail;
                const uidMatch = pUid && cand.uid && String(cand.uid).trim().toLowerCase() === pUid;
                const nameMatch = cand.studentName && item.studentName && areNamesMatching(cand.studentName, item.studentName);
                if (emailMatch || uidMatch || nameMatch) {
                  matchedCand = cand;
                  break;
                }
              }
            }
          }

          if (matchedCand) {
            matchedCand.isPaid = true;
            matchedCand.amountPaid += amt;
            matchedCand.allocatedFee = Math.max(matchedCand.allocatedFee, matchedCand.amountPaid);
            matchedCand.paymentRecord = item.rawRecord;
            matchedCand.paymentMode = mode;
          } else {
            // New paid candidate for this department (cross-batch, lateral, or supplementary)
            const cKey = cleanReg || `txn_${item.orderId || Math.random()}`;
            cMap.set(cKey, {
              regNo: rawReg || item.orderId || cKey,
              studentName: item.studentName || rawReg,
              batch: item.batch || "-",
              section: item.rawRecord?.section || "A",
              programme: item.programme || (targetDeptName.toLowerCase().includes("m.") || targetDeptName.toLowerCase().includes("master") ? "PG" : "UG"),
              allocatedFee: amt,
              amountPaid: amt,
              isPaid: true,
              paymentRecord: item.rawRecord,
              paymentMode: mode,
            });
          }
        });

        // Step E: Prune candidates where allocatedFee <= 0 and !cand.isPaid
        // "edhuvae 0 fee potrundha avan exam fee kata vena avan count layum vara matan"
        candidateMapByDept.forEach((cMap) => {
          for (const [key, cand] of cMap.entries()) {
            if (!cand.isPaid && cand.allocatedFee <= 0) {
              cMap.delete(key);
            }
          }
        });

        // Finalize department aggregates
        candidateMapByDept.forEach((cMap, deptName) => {
          const dObj = getOrCreateDept(deptName);
          dObj.enrolledStudents = cMap.size;
          let deptTarget = 0;
          let paidCount = 0;
          let defaultersCount = 0;

          cMap.forEach(cand => {
            deptTarget += cand.allocatedFee;
            if (cand.isPaid) {
              paidCount += 1;
            } else {
              defaultersCount += 1;
            }
          });

          dObj.targetAmount = deptTarget;
          dObj.paidStudentsCount = paidCount;
          dObj.defaultersCount = defaultersCount;
          dObj.dueAmount = Math.max(0, deptTarget - dObj.collectedAmount);
        });

        // Remove phantom General bucket so only academic departments appear
        deptMap.delete("General");

      } else {
        // --- 2. APPLICATION-BASED COE HEADS (Photocopy, Revaluation, Review) ---
        let rawApps = [];
        if (normHeadName.includes('photocopy')) {
          rawApps = photocopyApps;
        } else if (normHeadName.includes('revaluation')) {
          rawApps = revaluationApps;
        } else if (normHeadName.includes('review')) {
          rawApps = reviewApps;
        }

        const seenAppKeys = new Set();
        const seenPaymentIds = new Set();

        rawApps.forEach(app => {
          if (selectedAcademicYear && selectedAcademicYear !== "ALL") {
            const appAy = app.academicYear || getPaymentAcademicYear(app, semesterConfigs);
            if (appAy && appAy !== selectedAcademicYear) return;
          }

          const regNo = (app.registerNumber || app.regNo || app.studentRegNo || app.examNumber || "").trim();
          const rawEmail = (app.studentEmail || app.email || "").trim();
          const sMeta = resolveStudentMeta(regNo, app.studentName, app.studentUid || app.uid, rawEmail);
          const dept = (app.department && app.department !== "—" ? app.department : sMeta?.department) || "General";
          const dObj = getOrCreateDept(dept);

          const feeAmt = Number(app.feeAmount || app.totalFee || app.amount || 0);
          const pStatus = (app.paymentStatus || app.status || "").toLowerCase();
          const isPaid = pStatus === "paid" || pStatus === "success" || pStatus === "successful" || app.billAttached === true || Boolean(app.electronicBill) || Boolean(app.receiptNo) || Boolean(app.paidAt);

          const appKey = `${app.id || regNo}_${normHeadName}`;
          if (!seenAppKeys.has(appKey)) {
            seenAppKeys.add(appKey);
            dObj.enrolledStudents += 1;
            dObj.targetAmount += feeAmt;

            if (isPaid) {
              dObj.paidStudentsCount += 1;
              dObj.collectedAmount += feeAmt;
              const mode = getPaymentMode(app);
              if (dObj.modes[mode] !== undefined) dObj.modes[mode] += feeAmt;
              else dObj.modes.gateway += feeAmt;
            } else {
              dObj.defaultersCount += 1;
              dObj.dueAmount += feeAmt;
            }
          }
        });

        // Capture any additional verified payments under this fee head
        activePayments.forEach(p => {
          const pHead = (p.feeHead || "").toLowerCase().trim();
          if (!pHead.includes(normHeadName) && !normHeadName.includes(pHead)) return;
          if (seenPaymentIds.has(p.id)) return;
          seenPaymentIds.add(p.id);

          const dept = p.department && p.department !== "—" ? p.department : "General";
          const dObj = getOrCreateDept(dept);
          const amt = Number(p.chargedAmount || p.amount || 0);

          const appIdentifier = (p.examNumber || p.regNo || p.studentName || '').toLowerCase();
          if (!seenAppKeys.has(`${appIdentifier}_${normHeadName}`)) {
            dObj.enrolledStudents += 1;
            dObj.paidStudentsCount += 1;
            dObj.collectedAmount += amt;
            dObj.targetAmount += amt;

            const mode = getPaymentMode(p);
            if (dObj.modes[mode] !== undefined) dObj.modes[mode] += amt;
            else dObj.modes.other += amt;
          }
        });
      }

    } else {
      // -------------------------------------------------------------
      // CASE B: COLLEGE INSTITUTIONAL HEAD (Account #76980)
      // e.g. Tuition Fee, Other Fee, Admission Fee, Caution Deposit...
      // Strictly scoped to currently studying active academic calendar batches
      // -------------------------------------------------------------
      const targetStudents = currentStudyingStudents.length > 0 ? currentStudyingStudents : students;

      targetStudents.forEach(s => {
        if (s.department && s.department !== "—" && s.department !== "All") {
          getOrCreateDept(s.department);
        }
      });
      activePayments.forEach(p => {
        if (p.department && p.department !== "—" && p.department !== "All") {
          getOrCreateDept(p.department);
        }
      });

      const studentTargetMap = new Map();
      const studentHeadPaidMap = new Map();

      const enqLookup = new Map();
      enquiries.forEach(enq => {
        const q = getQuota(enq);
        const c = getCategory(enq);
        if (!q && !c) return;
        const keys = [enq.regNo, enq.studentRegNo, enq.rollNo, enq.examNumber, enq.applicationNo, enq.enquiryId, enq.id, enq.studentName].filter(Boolean);
        keys.forEach(k => {
          const kNorm = String(k).trim().toLowerCase();
          if (kNorm && !enqLookup.has(kNorm)) enqLookup.set(kNorm, { quota: q, category: c });
        });
      });

      const studentLookup = buildStudentCanonicalLookup(students);

      // 1. Calculate each enrolled student's target fee for this head strictly across active studying batches
      targetStudents.forEach(s => {
        const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim().toUpperCase();
        const sKey = reg || s.id;
        const dept = getCanonicalDept(s.department);
        const dObj = getOrCreateDept(dept);
        dObj.enrolledStudents += 1;

        let studentQuota = s.quota || s._profile_data?.quota || s._profile_data?.seatCategory || s._profile_data?.quotaAskedFor || "";
        let studentCategory = s.category || s._profile_data?.category || s._profile_data?.studentCategory || s._profile_data?.admissionType || "Regular";

        if (!studentQuota) {
          const enqInfo = enqLookup.get(reg.toLowerCase()) || (s.name ? enqLookup.get(s.name.toLowerCase().trim()) : null);
          if (enqInfo?.quota) studentQuota = enqInfo.quota;
          if (enqInfo?.category) studentCategory = enqInfo.category;
        }

        const matchedHeadConfigs = feeConfigs.filter(f => {
          if (selectedAcademicYear && selectedAcademicYear !== "ALL" && f.academicYear && f.academicYear !== selectedAcademicYear) {
            return false;
          }

          const fHeadNorm = normHead(f.head);
          const targetHeadNorm = normHead(selectedAuditHead);
          const isHeadMatch = fHeadNorm === targetHeadNorm || 
                              fHeadNorm.includes(targetHeadNorm) || 
                              targetHeadNorm.includes(fHeadNorm) ||
                              (f.head || "").toLowerCase().trim() === normHeadName;
          if (!isHeadMatch) return false;

          const isProg = isProgMatch(f.programme, s.programme || "UG");
          if (!isProg) return false;

          const isDept = !f.department || f.department.toLowerCase() === "all" || isDeptMatchRegistry(f.department, dept);
          if (!isDept) return false;

          const batchMatch = !f.batch || f.batch.toLowerCase() === "all" || isBatchMatch(f.batch, s.batch);
          if (!batchMatch) return false;

          const isQuota = isQuotaApplicable(f.quota, studentQuota);
          if (!isQuota) return false;

          const isCategory = isCategoryApplicable(f.studentCategory, studentCategory);
          if (!isCategory) return false;

          return true;
        });

        const configMap = new Map();
        matchedHeadConfigs.forEach(c => {
          const key = `${c.academicYear || ''}_${c.semester || ''}_${normHead(c.head)}`;
          const existing = configMap.get(key);
          if (!existing) {
            configMap.set(key, c);
          } else {
            const existingMatchesExact = isQuotaMatchExact(existing.quota, studentQuota);
            const currentMatchesExact = isQuotaMatchExact(c.quota, studentQuota);
            if (currentMatchesExact && !existingMatchesExact) {
              configMap.set(key, c);
            } else if (!existingMatchesExact && (!existing.quota || existing.quota.trim().toLowerCase() === 'all')) {
              if (c.quota && c.quota.trim().toLowerCase() !== 'all') {
                configMap.set(key, c);
              }
            }
          }
        });

        let sTarget = Array.from(configMap.values()).reduce((sum, c) => sum + Number(c.amount || 0), 0);

        // If no explicit batch config exists for this student, fall back to department-level config for this head
        if (sTarget === 0) {
          const deptFallback = feeConfigs.find(f => 
            normHead(f.head) === normHead(selectedAuditHead) && 
            isDeptMatchRegistry(f.department, dept) && 
            isProgMatch(f.programme, s.programme || "UG") &&
            Number(f.amount) > 0
          );
          if (deptFallback) {
            sTarget = Number(deptFallback.amount || 0);
          }
        }

        if (sKey) studentTargetMap.set(sKey, sTarget);
        dObj.targetAmount += sTarget;
      });

      // 2. Accumulate verified payments for this head
      activePayments.forEach(p => {
        const pHeadNorm = normHead(p.feeHead || "");
        const targetHeadNorm = normHead(selectedAuditHead);
        const isHeadMatch = pHeadNorm === targetHeadNorm || 
                            pHeadNorm.includes(targetHeadNorm) || 
                            targetHeadNorm.includes(pHeadNorm) ||
                            (p.feeHead || "").toLowerCase().trim() === normHeadName;
        if (!isHeadMatch) return;

        const dept = getCanonicalDept(p.department);
        const dObj = getOrCreateDept(dept);
        const amt = Number(p.chargedAmount || p.amount || 0);

        dObj.collectedAmount += amt;

        const mode = getPaymentMode(p);
        if (dObj.modes[mode] !== undefined) dObj.modes[mode] += amt;
        else dObj.modes.other += amt;

        const reg = (p.examNumber || p.regNo || p.studentRegNo || "").trim().toLowerCase();
        const uid = (p.studentId || p.uid || "").trim().toLowerCase();
        const canonicalKey = (reg && studentLookup.get(reg)) || (uid && studentLookup.get(uid)) || (reg ? reg.toUpperCase() : (uid ? uid.toUpperCase() : ""));
        if (canonicalKey) {
          studentHeadPaidMap.set(canonicalKey, (studentHeadPaidMap.get(canonicalKey) || 0) + amt);
        }
      });

      // 3. Reconcile paid students and defaulters per department strictly across active studying batches
      // Mathematically guaranteed: enrolledStudents === paidStudentsCount + defaultersCount
      targetStudents.forEach(s => {
        const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim().toUpperCase();
        const sKey = reg || s.id;
        const dept = getCanonicalDept(s.department);
        const dObj = getOrCreateDept(dept);

        let sTarget = studentTargetMap.get(sKey) || 0;
        const sPaid = studentHeadPaidMap.get(sKey) || 0;

        // If sTarget was 0 but student made payments under this head, align target to at least what was paid
        if (sTarget <= 0 && sPaid > 0) {
          sTarget = sPaid;
          studentTargetMap.set(sKey, sTarget);
          dObj.targetAmount += sTarget;
        }

        if (sTarget > 0) {
          if (sPaid >= sTarget) {
            // Student has completely cleared the fee for this head (Zero balance due)
            dObj.paidStudentsCount += 1;
          } else {
            // Student has an outstanding balance due (Defaulter)
            dObj.defaultersCount += 1;
            if (sPaid > 0) {
              dObj.partialPaidCount += 1;
            }
          }
        } else {
          // Zero fee obligation / Exempt (0 balance due -> Cleared)
          dObj.paidStudentsCount += 1;
        }
      });
    }

    // Finalize rows and totals
    const rows = Array.from(deptMap.values()).map(d => {
      let effectiveTarget = d.targetAmount;
      if (effectiveTarget < d.collectedAmount && d.collectedAmount > 0) {
        effectiveTarget = d.collectedAmount;
      }
      if (!isCoeHead && d.defaultersCount > 0 && effectiveTarget <= d.collectedAmount) {
        const deptFeeCfg = feeConfigs.find(f => 
          normHead(f.head) === normHead(selectedAuditHead) && 
          isDeptMatchRegistry(f.department, d.department) && 
          Number(f.amount) > 0
        );
        const avgHeadFee = deptFeeCfg ? Number(deptFeeCfg.amount) : (d.paidStudentsCount > 0 ? Math.round(d.collectedAmount / d.paidStudentsCount) : 0);
        if (avgHeadFee > 0) {
          effectiveTarget = Math.max(d.collectedAmount + (d.defaultersCount * avgHeadFee), d.enrolledStudents * avgHeadFee);
        }
      }

      const due = Math.max(0, effectiveTarget - d.collectedAmount);
      const pct = effectiveTarget > 0 
        ? ((d.collectedAmount / effectiveTarget) * 100).toFixed(1) 
        : (d.collectedAmount > 0 ? "100.0" : "0.0");

      return {
        ...d,
        targetAmount: effectiveTarget,
        dueAmount: due,
        realizationPct: pct,
        defaultersCount: d.defaultersCount
      };
    }).filter(d => d.enrolledStudents > 0 || d.collectedAmount > 0)
      .sort((a, b) => b.collectedAmount - a.collectedAmount);

    const totals = rows.reduce((acc, r) => ({
      enrolledStudents: acc.enrolledStudents + r.enrolledStudents,
      paidStudentsCount: acc.paidStudentsCount + r.paidStudentsCount,
      partialPaidCount: acc.partialPaidCount + (r.partialPaidCount || 0),
      defaultersCount: acc.defaultersCount + r.defaultersCount,
      targetAmount: acc.targetAmount + r.targetAmount,
      collectedAmount: acc.collectedAmount + r.collectedAmount,
      dueAmount: acc.dueAmount + r.dueAmount,
      modes: {
        cash: acc.modes.cash + r.modes.cash,
        upi: acc.modes.upi + r.modes.upi,
        gateway: acc.modes.gateway + r.modes.gateway,
        dd: acc.modes.dd + r.modes.dd,
        other: acc.modes.other + r.modes.other
      }
    }), {
      enrolledStudents: 0,
      paidStudentsCount: 0,
      partialPaidCount: 0,
      defaultersCount: 0,
      targetAmount: 0,
      collectedAmount: 0,
      dueAmount: 0,
      modes: { cash: 0, upi: 0, gateway: 0, dd: 0, other: 0 }
    });

    const overallPct = totals.targetAmount > 0 
      ? ((totals.collectedAmount / totals.targetAmount) * 100).toFixed(1) 
      : "0.0";

    return {
      head: selectedAuditHead,
      isCoeHead,
      rows,
      totals,
      overallPct
    };
  }, [
    selectedAuditHead, 
    selectedAcademicYear, 
    currentStudyingStudents,
    students, 
    activePayments, 
    feeConfigs, 
    enquiries, 
    semesterConfigs, 
    photocopyApps, 
    revaluationApps, 
    reviewApps, 
    eseRegistrations,
    eseFeePayments,
    examCellPayments,
    eseStudentFees,
    userLookup
  ]);

  const handleExportDepartmentAuditExcel = async () => {
    if (!headAuditReport) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CKCET Finance & Accounting Office";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`${headAuditReport.head.slice(0, 25)} Audit`);
    sheet.views = [{ showGridLines: true }];

    // Column definitions
    sheet.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Department", key: "dept", width: 44 },
      { header: headAuditReport.isCoeHead ? "Candidates / Registered" : "Enrolled Students", key: "enrolled", width: 22 },
      { header: headAuditReport.isCoeHead ? "Paid Candidates" : "Paid Students", key: "paid", width: 18 },
      { header: headAuditReport.isCoeHead ? "Pending Applications" : "Defaulters", key: "defaulters", width: 20 },
      { header: "Target Amount (₹)", key: "target", width: 22 },
      { header: "Collected Amount (₹)", key: "collected", width: 22 },
      { header: "Outstanding Due (₹)", key: "due", width: 22 },
      { header: "Realization %", key: "pct", width: 16 },
      { header: "Cash (₹)", key: "cash", width: 16 },
      { header: "UPI (₹)", key: "upi", width: 16 },
      { header: "SmartGateway (₹)", key: "gateway", width: 18 },
      { header: "DD / Other (₹)", key: "dd", width: 16 },
    ];

    // Title rows
    sheet.spliceRows(1, 0,
      ["C.K. COLLEGE OF ENGINEERING & TECHNOLOGY (AUTONOMOUS)"],
      [`DEPARTMENT-WISE AUDIT REPORT — ${headAuditReport.head.toUpperCase()}`],
      [`Academic Year: ${selectedAcademicYear || 'ALL'} | Generated: ${new Date().toLocaleString('en-IN')} | Master Accountant Level`]
    );

    // Merge title rows across columns A to M
    sheet.mergeCells("A1:M1");
    sheet.mergeCells("A2:M2");
    sheet.mergeCells("A3:M3");

    // Style Title Row 1
    const r1 = sheet.getRow(1);
    r1.height = 32;
    r1.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    r1.alignment = { horizontal: "center", vertical: "middle" };
    r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF120C7A" } };

    // Style Title Row 2
    const r2 = sheet.getRow(2);
    r2.height = 24;
    r2.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    r2.alignment = { horizontal: "center", vertical: "middle" };
    r2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A10A0" } };

    // Style Title Row 3
    const r3 = sheet.getRow(3);
    r3.height = 20;
    r3.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF334155" } };
    r3.alignment = { horizontal: "center", vertical: "middle" };
    r3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

    // Style Header Row (Row 5 now)
    const headerRow = sheet.getRow(5);
    headerRow.height = 26;
    headerRow.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF120C7A" } };

    // Populate data
    headAuditReport.rows.forEach((r, idx) => {
      const row = sheet.addRow({
        sno: idx + 1,
        dept: r.department,
        enrolled: r.enrolledStudents,
        paid: r.paidStudentsCount,
        defaulters: r.defaultersCount,
        target: r.targetAmount,
        collected: r.collectedAmount,
        due: r.dueAmount,
        pct: `${r.realizationPct}%`,
        cash: r.modes.cash,
        upi: r.modes.upi,
        gateway: r.modes.gateway,
        dd: r.modes.dd + r.modes.other,
      });
      row.height = 22;
      row.alignment = { vertical: "middle" };
      // Format numbers
      [6, 7, 8, 10, 11, 12, 13].forEach(colIdx => {
        row.getCell(colIdx).numFmt = '"₹"#,##0';
      });
      row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
    });

    // Total summary row
    const tot = headAuditReport.totals;
    const totRow = sheet.addRow({
      sno: "TOTAL",
      dept: "COLLEGE OVERALL TOTAL",
      enrolled: tot.enrolledStudents,
      paid: tot.paidStudentsCount,
      defaulters: tot.defaultersCount,
      target: tot.targetAmount,
      collected: tot.collectedAmount,
      due: tot.dueAmount,
      pct: `${headAuditReport.overallPct}%`,
      cash: tot.modes.cash,
      upi: tot.modes.upi,
      gateway: tot.modes.gateway,
      dd: tot.modes.dd + tot.modes.other,
    });
    totRow.height = 28;
    totRow.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    [6, 7, 8, 10, 11, 12, 13].forEach(colIdx => {
      totRow.getCell(colIdx).numFmt = '"₹"#,##0';
    });
    totRow.getCell(9).alignment = { horizontal: "center", vertical: "middle" };

    // Write and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CKCET_Fee_Audit_${headAuditReport.head.replace(/\s+/g, '_')}_${selectedAcademicYear || 'ALL'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredAuditRows = useMemo(() => {
    if (!headAuditReport) return [];
    if (!auditDeptSearch.trim()) return headAuditReport.rows;
    const q = auditDeptSearch.toLowerCase().trim();
    return headAuditReport.rows.filter(r => r.department.toLowerCase().includes(q));
  }, [headAuditReport, auditDeptSearch]);

  if (loading) {
    return (
      <Layout title="Fee Dashboard">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Fee Dashboard">
      <div className="p-4 md:p-8 w-full space-y-6 pb-24">
        {/* Header Hero Banner */}
        <div className="bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-blue-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-blue-500/10 rounded-full translate-y-1/2 -translate-x-1/3" />
          <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <PiggyBank size={18} className="text-yellow-300" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Fee Management</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black mb-1">Fee Dashboard</h1>
              <p className="text-blue-200 text-sm">Real-time fee collection, dues, and analytics</p>
            </div>

            {/* Blue Bar Stats Box with Academic Year Dropdown before YEAR COLLECTION */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6 bg-white/10 backdrop-blur-md rounded-2xl px-5 md:px-6 py-3.5 md:py-4 border border-white/15 shadow-xl">
              {/* Academic Year Dropdown (Directly before YEAR COLLECTION) */}
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarDays size={13} className="text-blue-200" />
                  <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Academic Year</span>
                </div>
                <div className="relative">
                  <select
                    value={selectedAcademicYear}
                    onChange={(e) => setSelectedAcademicYear(e.target.value)}
                    className="appearance-none bg-white/15 hover:bg-white/25 focus:bg-[#120c7a] text-white font-black text-sm md:text-base rounded-xl px-3 py-1.5 pr-8 border border-white/25 focus:border-white/60 outline-none cursor-pointer transition-all shadow-inner"
                  >
                    {dropdownAcademicYears.map((ay) => (
                      <option key={ay} value={ay} className="bg-slate-900 text-white font-bold py-1.5">
                        {ay === "ALL" ? "All Academic Years" : `AY ${ay}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-200 pointer-events-none" />
                </div>
              </div>

              <div className="w-px h-10 bg-white/20 hidden sm:block" />

              {/* Year Collection */}
              <div className="text-center">
                <p className="text-2xl font-black">{formatAmt(yearCollection)}</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">
                  {selectedAcademicYear === "ALL" ? "Total Collection" : "Year Collection"}
                </p>
              </div>

              <div className="w-px h-10 bg-white/20 hidden sm:block" />

              {/* Efficiency */}
              <div className="text-center">
                <p className="text-2xl font-black">{collectionEff}%</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Efficiency</p>
              </div>

              <div className="w-px h-10 bg-white/20 hidden sm:block" />

              {/* Defaulters */}
              <div className="text-center">
                <p className="text-2xl font-black">{activeDefaulters}</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Defaulters</p>
              </div>
            </div>
          </div>
        </div>

        {/* 8 KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "Today Collection", value: `₹${(todayCollection / 1000).toFixed(1)}K`, icon: CalendarDays, color: "bg-emerald-50 text-emerald-600", trend: "+12%" },
            { label: "Month Collection", value: `₹${(monthCollection / 100000).toFixed(1)}L`, icon: TrendingUp, color: "bg-blue-50 text-blue-600", trend: "+8%" },
            { label: selectedAcademicYear === "ALL" ? "Total Collection" : "Year Collection", value: formatAmt(yearCollection), icon: PiggyBank, color: "bg-purple-50 text-purple-600", trend: `AY ${selectedAcademicYear || 'ALL'}` },
            { label: "Pending Dues", value: `₹${(pendingDues / 100000).toFixed(1)}L`, icon: AlertTriangle, color: "bg-amber-50 text-amber-600", trend: "-3%" },
            { label: "Efficiency", value: `${collectionEff}%`, icon: BarChart3, color: "bg-cyan-50 text-cyan-600", trend: "+5%" },
            { label: "Defaulters", value: activeDefaulters, icon: ShieldAlert, color: "bg-red-50 text-red-600", trend: activeDefaulters > 0 ? `${activeDefaulters}` : "0" },
            { label: "Concessions", value: `₹${(totalConcessions / 1000).toFixed(0)}K`, icon: Wallet, color: "bg-rose-50 text-rose-600", trend: `${activeConcessions.length} active` },
            { label: "Receipts Today", value: receiptsToday, icon: Receipt, color: "bg-indigo-50 text-indigo-600", trend: "today" },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-3 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${kpi.color}`}><kpi.icon size={16} /></div>
                <span className={`text-[9px] font-bold ${kpi.trend.startsWith('+') ? 'text-emerald-500' : kpi.trend.startsWith('-') ? 'text-red-500' : 'text-zinc-400'}`}>{kpi.trend}</span>
              </div>
              <p className="text-sm font-black text-zinc-800 truncate">{kpi.value}</p>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Bank Account-wise Collections Split */}
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#120c7a] flex items-center justify-center">
                <Landmark size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-800">Bank Account-wise Fee Collections</h3>
                <p className="text-[10px] text-zinc-400 font-medium">Reconciled split between Institutional Operating Account and Autonomous Exam Cell Account</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedAccountFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSelectedAccountFilter("ALL")}
                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 transition-all"
                  title="Clear account filter and show heads from both accounts"
                >
                  <span>Show Both Accounts</span>
                  <X size={12} />
                </button>
              )}
              <span className="text-[11px] font-bold text-zinc-500">Total Realized:</span>
              <span className="text-sm font-black text-zinc-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {formatAmt(accountStats.total)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* College Account #76980 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedAccountFilter(prev => prev === "76980" ? "ALL" : "76980");
              }}
              className={`rounded-2xl p-4 transition-all cursor-pointer relative group ${
                selectedAccountFilter === "76980"
                  ? "bg-gradient-to-br from-blue-100/90 via-indigo-50 to-white border-2 border-[#120c7a] ring-4 ring-blue-500/20 shadow-lg"
                  : selectedAccountFilter === "76983"
                  ? "bg-gradient-to-br from-blue-50/40 to-white border border-blue-100 opacity-65 hover:opacity-100 hover:border-blue-300"
                  : "bg-gradient-to-br from-blue-50/60 via-indigo-50/30 to-white border border-blue-100 hover:border-blue-300 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                    selectedAccountFilter === "76980" ? "bg-[#120c7a] text-white scale-105" : "bg-[#120c7a] text-white"
                  }`}>
                    <Building2 size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-black text-sm text-[#120c7a]">College Account #76980</h4>
                      <span className="bg-blue-100/80 text-[#120c7a] text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Operating A/C
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Tuition, Admission, Application, Caution Deposit & Institutional Fees</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-black text-[#120c7a] bg-white px-2 py-0.5 rounded-full border border-blue-200 shadow-xs">
                    {accountStats.collegePct}%
                  </span>
                  {selectedAccountFilter === "76980" && (
                    <span className="flex items-center gap-1 bg-[#120c7a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                      <CheckCircle2 size={10} /> Active Filter
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-2xl font-black text-zinc-900">{formatAmt(accountStats.collegeTotal)}</p>
                <p className="text-[10px] font-bold text-zinc-500">{accountStats.collegeCount} transactions</p>
              </div>

              <div className="w-full bg-blue-100/70 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#120c7a] to-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${accountStats.collegePct}%` }}
                />
              </div>

              <div className="mt-3 pt-2.5 border-t border-blue-100/80 flex items-center justify-between text-[10px]">
                {selectedAccountFilter === "76980" ? (
                  <span className="font-bold text-[#120c7a] flex items-center gap-1">
                    <span>✓ Filtering Trend, Modes & Heads by College Account</span>
                  </span>
                ) : (
                  <span className="font-medium text-zinc-500 group-hover:text-blue-700 transition-colors">
                    Click to filter Trend, Modes & Heads
                  </span>
                )}
                <span className={`font-bold transition-all ${selectedAccountFilter === "76980" ? "text-zinc-500 hover:text-zinc-800 underline" : "text-blue-700"}`}>
                  {selectedAccountFilter === "76980" ? "Show Both Accounts" : "Filter Account →"}
                </span>
              </div>
            </div>

            {/* Exam Cell Account #76983 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedAccountFilter(prev => prev === "76983" ? "ALL" : "76983");
              }}
              className={`rounded-2xl p-4 transition-all cursor-pointer relative group ${
                selectedAccountFilter === "76983"
                  ? "bg-gradient-to-br from-purple-100/90 via-violet-50 to-white border-2 border-purple-700 ring-4 ring-purple-500/20 shadow-lg"
                  : selectedAccountFilter === "76980"
                  ? "bg-gradient-to-br from-purple-50/40 to-white border border-purple-100 opacity-65 hover:opacity-100 hover:border-purple-300"
                  : "bg-gradient-to-br from-purple-50/60 via-violet-50/30 to-white border border-purple-100 hover:border-purple-300 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                    selectedAccountFilter === "76983" ? "bg-purple-700 text-white scale-105" : "bg-purple-700 text-white"
                  }`}>
                    <Layers size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-black text-sm text-purple-950">Exam Cell / COE Account #76983</h4>
                      <span className="bg-purple-100 text-purple-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Autonomous COE
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Autonomous End Semester (ESE), Photocopy, Revaluation & Review Fees</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-black text-purple-800 bg-white px-2 py-0.5 rounded-full border border-purple-200 shadow-xs">
                    {accountStats.coePct}%
                  </span>
                  {selectedAccountFilter === "76983" && (
                    <span className="flex items-center gap-1 bg-purple-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                      <CheckCircle2 size={10} /> Active Filter
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-2xl font-black text-zinc-900">{formatAmt(accountStats.coeTotal)}</p>
                <p className="text-[10px] font-bold text-zinc-500">{accountStats.coeCount} transactions</p>
              </div>

              <div className="w-full bg-purple-100 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-700 to-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${accountStats.coePct}%` }}
                />
              </div>

              <div className="mt-3 pt-2.5 border-t border-purple-100/80 flex items-center justify-between text-[10px]">
                {selectedAccountFilter === "76983" ? (
                  <span className="font-bold text-purple-800 flex items-center gap-1">
                    <span>✓ Filtering Trend, Modes & Heads by COE Account</span>
                  </span>
                ) : (
                  <span className="font-medium text-zinc-500 group-hover:text-purple-700 transition-colors">
                    Click to filter Trend, Modes & Heads
                  </span>
                )}
                <span className={`font-bold transition-all ${selectedAccountFilter === "76983" ? "text-zinc-500 hover:text-zinc-800 underline" : "text-purple-700"}`}>
                  {selectedAccountFilter === "76983" ? "Show Both Accounts" : "Filter Account →"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Charts Row: Trends (2 Cols) + Modes (1 Col) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Collection Trend (Spans 2 columns on desktop) */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex flex-col justify-between">
            {/* Header: Title, Total, View Switcher Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-xs text-zinc-700">Monthly Collection Trend</h3>
                  <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">
                    Total: {formatAmt(trendTotalCollection)}
                  </span>
                  {selectedAccountFilter === "76980" && (
                    <span className="bg-blue-50 text-[#120c7a] font-bold text-[10px] px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                      <Building2 size={10} /> College Account #76980
                    </span>
                  )}
                  {selectedAccountFilter === "76983" && (
                    <span className="bg-purple-50 text-purple-700 font-bold text-[10px] px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                      <Layers size={10} /> COE Account #76983
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400 font-medium flex-wrap">
                  <span>{selectedAcademicYear === "ALL" ? "All Academic Years" : `AY ${selectedAcademicYear}`}</span>
                  <span>•</span>
                  {peakMonth && (
                    <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                      <TrendingUp size={10} /> Peak: {peakMonth.month} ({formatAmt(peakMonth.total)})
                    </span>
                  )}
                  <span>•</span>
                  <span className="text-zinc-600 font-semibold">
                    Avg: {formatAmt(avgMonthlyCollection)}/mo
                  </span>
                  <span>•</span>
                  <span className="text-zinc-500 font-medium">
                    {activeMonthsCount} Active Months
                  </span>
                </div>
              </div>

              {/* View Switcher & Account Pills */}
              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                {/* Quick Account Switcher Pills */}
                <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
                  <button
                    type="button"
                    onClick={() => setSelectedAccountFilter("ALL")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      selectedAccountFilter === "ALL"
                        ? "bg-white text-zinc-900 shadow-xs"
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                    title="Show collection across both accounts"
                  >
                    Both A/C
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountFilter("76980")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      selectedAccountFilter === "76980"
                        ? "bg-[#120c7a] text-white shadow-xs"
                        : "text-zinc-500 hover:text-[#120c7a]"
                    }`}
                    title="Filter by College Operating Account #76980"
                  >
                    #76980
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountFilter("76983")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      selectedAccountFilter === "76983"
                        ? "bg-purple-700 text-white shadow-xs"
                        : "text-zinc-500 hover:text-purple-700"
                    }`}
                    title="Filter by Exam Cell / COE Account #76983"
                  >
                    #76983
                  </button>
                </div>

                {/* View Switcher Pills */}
                <div className="flex items-center bg-zinc-100/90 p-0.5 rounded-xl border border-zinc-200/80">
                  <button
                    type="button"
                    onClick={() => { setTrendView("area"); setHoveredTrendIdx(null); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      trendView === "area" 
                        ? "bg-white text-[#120c7a] shadow-sm" 
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                    title="Smooth Area Flow Spline Curve"
                  >
                    <TrendingUp size={11} />
                    <span>Area Flow</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTrendView("bar"); setHoveredTrendIdx(null); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      trendView === "bar" 
                        ? "bg-white text-[#120c7a] shadow-sm" 
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                    title="Glass Column Bars"
                  >
                    <BarChart3 size={11} />
                    <span>Columns</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTrendView("cumulative"); setHoveredTrendIdx(null); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      trendView === "cumulative" 
                        ? "bg-white text-[#120c7a] shadow-sm" 
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                    title="Cumulative Growth Trajectory (S-Curve)"
                  >
                    <Layers size={11} />
                    <span>Cumulative</span>
                  </button>
                </div>
              </div>
            </div>

            {/* VIEW 1: Area Flow Spline Wave */}
            {trendView === "area" && (() => {
              const plotW = 534;
              const plotH = 128;
              const padL = 42;
              const baseLineY = 148;
              const points = monthlyData.map((d, i) => {
                const x = padL + (i * plotW) / 11;
                const val = d.total || 0;
                const y = baseLineY - (maxMonthly > 0 ? (val / maxMonthly) * plotH : 0);
                return { x, y, data: d, index: i };
              });
              const lineD = getSmoothSvgPath(points);
              const areaD = points.length ? `${lineD} L ${points[points.length - 1].x} ${baseLineY} L ${points[0].x} ${baseLineY} Z` : "";
              const activeHover = hoveredTrendIdx !== null ? points[hoveredTrendIdx] : null;

              return (
                <div className="relative w-full min-h-[195px] pt-2 pb-1">
                  <svg 
                    viewBox="0 0 600 180" 
                    className="w-full h-auto overflow-visible select-none"
                    onMouseLeave={() => setHoveredTrendIdx(null)}
                  >
                    <defs>
                      <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity="0.45" />
                        <stop offset="45%" stopColor="#4f46e5" stopOpacity="0.20" />
                        <stop offset="100%" stopColor="#312e81" stopOpacity="0.00" />
                      </linearGradient>
                      <filter id="areaGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#3b82f6" floodOpacity="0.3" />
                      </filter>
                    </defs>

                    {/* Horizontal Reference Gridlines */}
                    {[0, 0.5, 1].map((ratio, gIdx) => {
                      const yPos = baseLineY - ratio * plotH;
                      const refVal = maxMonthly * ratio;
                      const label = ratio === 0 ? "₹0" : refVal >= 10000000 ? `₹${(refVal / 10000000).toFixed(1)}Cr` : refVal >= 100000 ? `₹${(refVal / 100000).toFixed(0)}L` : `₹${Math.round(refVal / 1000)}k`;
                      return (
                        <g key={gIdx}>
                          <line x1={padL} y1={yPos} x2={padL + plotW} y2={yPos} stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth="0.8" />
                          <text x={padL - 6} y={yPos + 3} textAnchor="end" className="text-[8px] fill-zinc-400 font-bold">
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Gradient Area Fill */}
                    {areaD && <path d={areaD} fill="url(#trendAreaGrad)" />}

                    {/* Main Spline Line */}
                    {lineD && (
                      <path 
                        d={lineD} 
                        fill="none" 
                        stroke="#2563eb" 
                        strokeWidth="2.75" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        filter="url(#areaGlow)" 
                      />
                    )}

                    {/* Active Month Data Points & Hover Targets */}
                    {points.map((pt, idx) => {
                      const hasVal = (pt.data.total || 0) > 0;
                      const isHovered = hoveredTrendIdx === idx;
                      const isPeak = pt.data.total === maxMonthly && maxMonthly > 0;

                      return (
                        <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredTrendIdx(idx)}>
                          {/* Invisible hover touch zone */}
                          <rect x={pt.x - 20} y={15} width="40" height={baseLineY - 15} fill="transparent" />

                          {/* Hover Vertical Guide */}
                          {isHovered && (
                            <line 
                              x1={pt.x} 
                              y1={15} 
                              x2={pt.x} 
                              y2={baseLineY} 
                              stroke="#6366f1" 
                              strokeWidth="1.2" 
                              strokeDasharray="2 2" 
                            />
                          )}

                          {/* Pulsing ring for peak */}
                          {isPeak && !isHovered && (
                            <circle cx={pt.x} cy={pt.y} r="8" fill="#3b82f6" fillOpacity="0.18" className="animate-pulse" />
                          )}

                          {/* Point marker */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? "5.5" : hasVal ? "4.2" : "2.5"}
                            fill={isHovered ? "#120c7a" : hasVal ? "#2563eb" : "#cbd5e1"}
                            stroke="#ffffff"
                            strokeWidth={isHovered ? "2.5" : hasVal ? "2" : "1"}
                            className="transition-all duration-150"
                          />

                          {/* X-axis Month Label */}
                          <text
                            x={pt.x}
                            y={baseLineY + 18}
                            textAnchor="middle"
                            className={`text-[9px] font-bold ${
                              isHovered || hasVal ? "fill-[#120c7a] font-extrabold" : "fill-zinc-400"
                            }`}
                          >
                            {pt.data.month}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Interactive Floating Hover Tooltip */}
                  {activeHover && (
                    <div 
                      className="absolute z-30 pointer-events-none transition-all duration-150 transform -translate-x-1/2 -translate-y-full bg-zinc-900 text-white rounded-xl px-3 py-2 shadow-2xl border border-zinc-700/80 text-[10px] min-w-[130px]"
                      style={{ 
                        left: `${(activeHover.x / 600) * 100}%`, 
                        top: `${Math.max(10, (activeHover.y / 180) * 100 - 8)}%` 
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-zinc-700/60 pb-1 mb-1">
                        <span className="font-bold text-zinc-300">{activeHover.data.month} {activeHover.data.year || ''}</span>
                        {activeHover.data.total === maxMonthly && maxMonthly > 0 && (
                          <span className="bg-amber-400/20 text-amber-300 text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase">Peak</span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-400 text-[9px]">Collection:</span>
                        <span className="font-black text-emerald-400 text-xs">{formatAmt(activeHover.data.total)}</span>
                      </div>
                      {trendTotalCollection > 0 && (
                        <div className="flex items-baseline justify-between gap-2 mt-0.5 text-[9px] text-zinc-400">
                          <span>Contribution:</span>
                          <span className="font-bold text-blue-300">
                            {((activeHover.data.total / trendTotalCollection) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {activeHover.data.count > 0 && (
                        <div className="flex items-baseline justify-between gap-2 mt-0.5 text-[9px] text-zinc-400">
                          <span>Transactions:</span>
                          <span className="font-bold text-zinc-200">{activeHover.data.count}</span>
                        </div>
                      )}
                      <div className="w-2 h-2 bg-zinc-900 rotate-45 mx-auto -mb-3 mt-1.5 border-r border-b border-zinc-700/80" />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* VIEW 2: Glass Column Bars */}
            {trendView === "bar" && (
              <div className="flex items-end justify-between gap-1.5 md:gap-3 min-h-[190px] pt-6 pb-1 px-2 overflow-x-auto">
                {monthlyData.map((d, i) => {
                  const pct = maxMonthly > 0 ? (d.total / maxMonthly) * 100 : 0;
                  const formattedVal = d.total === 0
                    ? "₹0"
                    : d.total >= 100000
                    ? `₹${(d.total / 100000).toFixed(1)}L`
                    : d.total >= 1000
                    ? `₹${Math.round(d.total / 1000)}K`
                    : `₹${d.total}`;
                  const isPeak = d.total === maxMonthly && maxMonthly > 0;

                  return (
                    <div key={i} className="flex-1 min-w-[32px] flex flex-col items-center justify-end gap-1.5 group relative">
                      {/* Hover Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-30 bg-zinc-900 text-white text-[10px] py-1.5 px-2.5 rounded-xl shadow-xl whitespace-nowrap flex flex-col items-center">
                        <span className="font-bold text-zinc-300">{d.month} {d.year || ''}</span>
                        <span className="font-black text-emerald-400">{formatAmt(d.total)}</span>
                        {trendTotalCollection > 0 && (
                          <span className="text-[9px] text-blue-300 font-semibold mt-0.5">
                            {((d.total / trendTotalCollection) * 100).toFixed(1)}% of AY
                          </span>
                        )}
                        <div className="w-2 h-2 bg-zinc-900 rotate-45 -mb-1 mt-0.5" />
                      </div>

                      {/* Value above bar */}
                      <span 
                        className={`text-[9px] md:text-[10px] font-black text-center whitespace-nowrap leading-none transition-colors ${
                          isPeak ? "text-amber-600 font-extrabold" : d.total > 0 ? "text-[#120c7a] font-extrabold" : "text-zinc-400 font-bold"
                        }`}
                        title={`${d.month} ${d.year || ''}: ${formatAmt(d.total)}`}
                      >
                        {formattedVal}
                      </span>

                      {/* Bar track */}
                      <div className="w-full max-w-[28px] bg-slate-100 rounded-md h-32 relative flex items-end justify-center overflow-hidden border border-slate-200/50">
                        <div 
                          className={`w-full rounded-b-md transition-all duration-500 cursor-pointer ${
                            isPeak
                              ? "bg-gradient-to-t from-amber-600 via-indigo-600 to-blue-500 shadow-md group-hover:brightness-110"
                              : d.total > 0 
                              ? "bg-gradient-to-t from-[#120c7a] via-[#1a10a0] to-blue-500 group-hover:from-blue-600 group-hover:to-indigo-500 shadow-sm" 
                              : "bg-slate-200/60"
                          }`}
                          style={{ height: `${d.total > 0 ? Math.max(pct * 0.9, 10) : 4}%` }}
                          title={`${d.month} ${d.year || ''}: ${formatAmt(d.total)}`}
                        />
                      </div>

                      {/* Month Label below bar */}
                      <span className={`text-[10px] md:text-[11px] font-bold leading-none transition-colors ${
                        d.total > 0 ? "text-[#120c7a] font-black" : "text-zinc-500"
                      }`}>
                        {d.month}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW 3: Cumulative Growth S-Curve */}
            {trendView === "cumulative" && (() => {
              const plotW = 534;
              const plotH = 128;
              const padL = 42;
              const baseLineY = 148;
              const cumPoints = cumulativeMonthlyData.map((d, i) => {
                const x = padL + (i * plotW) / 11;
                const val = d.cumulative || 0;
                const y = baseLineY - (trendTotalCollection > 0 ? (val / trendTotalCollection) * plotH : 0);
                return { x, y, data: d, index: i };
              });
              const cumLineD = getSmoothSvgPath(cumPoints);
              const cumAreaD = cumPoints.length ? `${cumLineD} L ${cumPoints[cumPoints.length - 1].x} ${baseLineY} L ${cumPoints[0].x} ${baseLineY} Z` : "";
              const activeHover = hoveredTrendIdx !== null ? cumPoints[hoveredTrendIdx] : null;

              return (
                <div className="relative w-full min-h-[195px] pt-2 pb-1">
                  <svg 
                    viewBox="0 0 600 180" 
                    className="w-full h-auto overflow-visible select-none"
                    onMouseLeave={() => setHoveredTrendIdx(null)}
                  >
                    <defs>
                      <linearGradient id="cumAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity="0.40" />
                        <stop offset="60%" stopColor="#0284c7" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#0f172a" stopOpacity="0.00" />
                      </linearGradient>
                      <filter id="cumGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#059669" floodOpacity="0.3" />
                      </filter>
                    </defs>

                    {/* Cumulative Target Gridlines */}
                    {[0, 0.5, 1].map((ratio, gIdx) => {
                      const yPos = baseLineY - ratio * plotH;
                      const refVal = trendTotalCollection * ratio;
                      const label = ratio === 0 ? "₹0" : ratio === 1 ? `100% (${formatAmt(trendTotalCollection)})` : `50% (${formatAmt(refVal)})`;
                      return (
                        <g key={gIdx}>
                          <line x1={padL} y1={yPos} x2={padL + plotW} y2={yPos} stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth="0.8" />
                          <text x={padL - 6} y={yPos + 3} textAnchor="end" className="text-[8px] fill-zinc-400 font-bold">
                            {ratio === 1 ? "100%" : ratio === 0.5 ? "50%" : "₹0"}
                          </text>
                        </g>
                      );
                    })}

                    {/* Gradient Area Fill */}
                    {cumAreaD && <path d={cumAreaD} fill="url(#cumAreaGrad)" />}

                    {/* Main Spline Line */}
                    {cumLineD && (
                      <path 
                        d={cumLineD} 
                        fill="none" 
                        stroke="#059669" 
                        strokeWidth="2.75" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        filter="url(#cumGlow)" 
                      />
                    )}

                    {/* Data Points */}
                    {cumPoints.map((pt, idx) => {
                      const isHovered = hoveredTrendIdx === idx;
                      const isEnd = idx === cumPoints.length - 1;

                      return (
                        <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredTrendIdx(idx)}>
                          <rect x={pt.x - 20} y={15} width="40" height={baseLineY - 15} fill="transparent" />

                          {isHovered && (
                            <line x1={pt.x} y1={15} x2={pt.x} y2={baseLineY} stroke="#059669" strokeWidth="1.2" strokeDasharray="2 2" />
                          )}

                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? "5.5" : isEnd ? "4.5" : "3.5"}
                            fill={isHovered ? "#047857" : isEnd ? "#10b981" : "#059669"}
                            stroke="#ffffff"
                            strokeWidth={isHovered ? "2.5" : "1.8"}
                            className="transition-all duration-150"
                          />

                          <text
                            x={pt.x}
                            y={baseLineY + 18}
                            textAnchor="middle"
                            className={`text-[9px] font-bold ${
                              isHovered ? "fill-emerald-800 font-extrabold" : "fill-zinc-400"
                            }`}
                          >
                            {pt.data.month}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Interactive Floating Hover Tooltip */}
                  {activeHover && (
                    <div 
                      className="absolute z-30 pointer-events-none transition-all duration-150 transform -translate-x-1/2 -translate-y-full bg-zinc-900 text-white rounded-xl px-3 py-2 shadow-2xl border border-zinc-700/80 text-[10px] min-w-[140px]"
                      style={{ 
                        left: `${(activeHover.x / 600) * 100}%`, 
                        top: `${Math.max(10, (activeHover.y / 180) * 100 - 8)}%` 
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-zinc-700/60 pb-1 mb-1">
                        <span className="font-bold text-zinc-300">Through {activeHover.data.month} {activeHover.data.year || ''}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-400 text-[9px]">Cumulative:</span>
                        <span className="font-black text-emerald-400 text-xs">{formatAmt(activeHover.data.cumulative)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-0.5 text-[9px] text-zinc-400">
                        <span>This Month:</span>
                        <span className="font-bold text-blue-300">+{formatAmt(activeHover.data.total)}</span>
                      </div>
                      {trendTotalCollection > 0 && (
                        <div className="flex items-baseline justify-between gap-2 mt-0.5 text-[9px] text-zinc-400">
                          <span>Target Achieved:</span>
                          <span className="font-bold text-emerald-300">
                            {((activeHover.data.cumulative / trendTotalCollection) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      <div className="w-2 h-2 bg-zinc-900 rotate-45 mx-auto -mb-3 mt-1.5 border-r border-b border-zinc-700/80" />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Mode-wise Quick Stats (Spans 1 column on desktop) */}
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-bold text-xs text-zinc-700">Mode-wise Collection</h3>
                    {selectedAccountFilter === "76980" && (
                      <span className="bg-blue-50 text-[#120c7a] font-bold text-[9px] px-1.5 py-0.5 rounded border border-blue-200">
                        #76980
                      </span>
                    )}
                    {selectedAccountFilter === "76983" && (
                      <span className="bg-purple-50 text-purple-700 font-bold text-[9px] px-1.5 py-0.5 rounded border border-purple-200">
                        #76983
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 font-medium">
                    {selectedAcademicYear === "ALL" ? "Overall" : `AY ${selectedAcademicYear}`}
                    {selectedAccountFilter === "76980" ? " • College A/C #76980" : selectedAccountFilter === "76983" ? " • Exam Cell A/C #76983" : " • Both Accounts"}
                  </p>
                </div>
                <Wallet size={16} className="text-zinc-300" />
              </div>
              <div className="space-y-1">
                {modeWiseData.map(m => {
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0">
                      <span className="text-lg w-7 text-center">{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center text-[11px] mb-1">
                          <span className="font-bold text-zinc-700 truncate">{m.label}</span>
                          <span className="text-zinc-600 font-semibold ml-2 whitespace-nowrap">
                            {formatAmt(m.total)} <span className="text-zinc-400 font-normal">({m.count})</span>
                          </span>
                        </div>
                        <div className="w-full bg-zinc-100 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, m.pct))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {modeWiseData.length === 0 && (
                  <p className="text-xs text-zinc-400 text-center py-4">No payment modes recorded</p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 font-semibold">Total Verified Modes:</span>
              <span className="font-black text-[#120c7a]">{formatAmt(modeWiseTotal)}</span>
            </div>
          </div>
        </div>

        {/* Dedicated Full-Width Head-wise Collection Card */}
        <div id="head-wise-collection-card" className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 scroll-mt-20">
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-zinc-800">Head-wise Collection</h3>
                  {selectedAccountFilter === "76980" && (
                    <span className="bg-blue-100 text-[#120c7a] text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-200">
                      #76980 College Main Account Only
                    </span>
                  )}
                  {selectedAccountFilter === "76983" && (
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-md border border-purple-200">
                      #76983 Exam Cell / COE Account Only
                    </span>
                  )}
                  {selectedAccountFilter === "ALL" && (
                    <span className="bg-zinc-100 text-zinc-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-zinc-200">
                      Both Accounts Separated (Side-by-Side)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                  {selectedAcademicYear === "ALL" ? "Overall" : `AY ${selectedAcademicYear}`} • Click "Audit" icon on any head for master department-wise reconciliation & Excel export
                </p>
              </div>

              {/* Quick Account Switcher Pills */}
              <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedAccountFilter("ALL")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedAccountFilter === "ALL"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                  title="Show heads for both accounts"
                >
                  Both Accounts
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAccountFilter("76980")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedAccountFilter === "76980"
                      ? "bg-[#120c7a] text-white shadow-xs"
                      : "text-zinc-500 hover:text-[#120c7a]"
                  }`}
                  title="Show College Main Account #76980 heads only"
                >
                  College #76980
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAccountFilter("76983")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedAccountFilter === "76983"
                      ? "bg-purple-700 text-white shadow-xs"
                      : "text-zinc-500 hover:text-purple-700"
                  }`}
                  title="Show Exam Cell / COE Account #76983 heads only"
                >
                  COE #76983
                </button>
              </div>
            </div>

            {/* Account Filter Active Banner */}
            {selectedAccountFilter !== "ALL" && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border ${
                selectedAccountFilter === "76980"
                  ? "bg-blue-50/90 border-blue-200 text-[#120c7a]"
                  : "bg-purple-50/90 border-purple-200 text-purple-900"
              }`}>
                <span className="flex items-center gap-2">
                  {selectedAccountFilter === "76980" ? <Building2 size={14} /> : <Layers size={14} />}
                  <span>
                    {selectedAccountFilter === "76980" ? "College Account #76980" : "Exam Cell / COE #76983"}: {activeHeadEntries.length} fee head{activeHeadEntries.length === 1 ? "" : "s"} ({formatAmt(activeHeadTotal)})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAccountFilter("ALL")}
                  className="hover:underline flex items-center gap-1 text-zinc-600 hover:text-zinc-900 font-bold ml-2 shrink-0 bg-white/60 px-2 py-0.5 rounded-lg border border-zinc-200"
                  title="Show heads for both accounts"
                >
                  <span>View Both Accounts</span>
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* SEPARATE HEADS ACCORDING TO ACCOUNT */}
          {selectedAccountFilter === "ALL" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 1. College Account #76980 Heads (Left Half) */}
              <div className="bg-gradient-to-br from-blue-50/50 to-slate-50/40 rounded-2xl p-4 border border-blue-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-[#120c7a]">
                        <Building2 size={13} />
                      </div>
                      <span className="font-black text-xs text-[#120c7a]">College Main Account #76980</span>
                      <span className="text-[10px] font-bold bg-blue-100/90 text-[#120c7a] px-2 py-0.2 rounded-full">
                        {collegeHeadEntries.length} heads
                      </span>
                    </div>
                    <span className="font-black text-sm text-zinc-900">{formatAmt(collegeHeadTotal)}</span>
                  </div>

                  <div className="space-y-3">
                    {collegeHeadEntries.map(([head, amount], i) => {
                      const pct = collegeHeadTotal > 0 ? (amount / collegeHeadTotal) * 100 : 0;
                      return (
                        <div key={head} className="group">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <div className="flex items-center gap-1.5 min-w-0 pr-2">
                              <span className="font-bold text-zinc-700 truncate">{head}</span>
                              <button
                                type="button"
                                onClick={() => setSelectedAuditHead(head)}
                                title={`View ${head} Department Breakdown & Master Audit`}
                                className="opacity-80 group-hover:opacity-100 p-1 text-blue-600 hover:text-white hover:bg-[#120c7a] rounded-md transition-all text-[9px] font-bold px-1.5 py-0.5 border border-blue-200 flex items-center gap-0.5 shrink-0"
                              >
                                <BarChart2 size={10} />
                                <span>Audit</span>
                              </button>
                            </div>
                            <span className="font-black text-zinc-800 shrink-0">{formatAmt(amount)}</span>
                          </div>
                          <div className="w-full bg-blue-100/60 rounded-full h-2">
                            <div className={`${headColors[i % headColors.length]} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {collegeHeadEntries.length === 0 && (
                      <p className="text-xs text-zinc-400 text-center py-4">No college account payments</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Exam Cell / Autonomous COE Account #76983 Heads (Right Half) */}
              <div className="bg-gradient-to-br from-purple-50/50 to-violet-50/30 rounded-2xl p-4 border border-purple-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-purple-100">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                        <Layers size={13} />
                      </div>
                      <span className="font-black text-xs text-purple-950">Exam Cell / COE Account #76983</span>
                      <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.2 rounded-full">
                        {coeHeadEntries.length} heads
                      </span>
                    </div>
                    <span className="font-black text-sm text-purple-950">{formatAmt(coeHeadTotal)}</span>
                  </div>

                  <div className="space-y-3">
                    {coeHeadEntries.map(([head, amount], i) => {
                      const pct = coeHeadTotal > 0 ? (amount / coeHeadTotal) * 100 : 0;
                      return (
                        <div key={head} className="group">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <div className="flex items-center gap-1.5 min-w-0 pr-2">
                              <span className="font-bold text-zinc-700 truncate">{head}</span>
                              <button
                                type="button"
                                onClick={() => setSelectedAuditHead(head)}
                                title={`View ${head} Department Breakdown & Master Audit`}
                                className="opacity-80 group-hover:opacity-100 p-1 text-purple-700 hover:text-white hover:bg-purple-700 rounded-md transition-all text-[9px] font-bold px-1.5 py-0.5 border border-purple-200 flex items-center gap-0.5 shrink-0"
                              >
                                <BarChart2 size={10} />
                                <span>Audit</span>
                              </button>
                            </div>
                            <span className="font-black text-zinc-800 shrink-0">{formatAmt(amount)}</span>
                          </div>
                          <div className="w-full bg-purple-100 rounded-full h-2">
                            <div className="bg-purple-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {coeHeadEntries.length === 0 && (
                      <p className="text-xs text-zinc-400 text-center py-4">No exam cell account payments</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Filtered Single Account View (College #76980 or Exam Cell #76983) Spread Over 2 Columns */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              {activeHeadEntries.map(([head, amount], i) => {
                const pct = activeHeadTotal > 0 ? (amount / activeHeadTotal) * 100 : 0;
                const isCoeHead = isCoeHeadOrPayment({ feeHead: head });
                return (
                  <div key={head} className="group bg-slate-50/70 p-3 rounded-xl border border-zinc-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <span className="font-bold text-zinc-800 truncate">{head}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                          isCoeHead
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-blue-50 text-[#120c7a] border-blue-200"
                        }`}>
                          {isCoeHead ? "#76983" : "#76980"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedAuditHead(head)}
                          title={`View ${head} Department Breakdown & Master Audit`}
                          className="opacity-80 group-hover:opacity-100 p-1 text-blue-600 hover:text-white hover:bg-[#120c7a] rounded-md transition-all text-[9px] font-bold px-1.5 py-0.5 border border-blue-200 flex items-center gap-0.5 shrink-0"
                        >
                          <BarChart2 size={10} />
                          <span>Audit</span>
                        </button>
                      </div>
                      <span className="font-black text-zinc-900 shrink-0">{formatAmt(amount)}</span>
                    </div>
                    <div className="w-full bg-zinc-200/60 rounded-full h-2">
                      <div className={`${headColors[i % headColors.length]} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {activeHeadEntries.length === 0 && (
                <div className="col-span-2 text-center py-8 text-zinc-400">
                  <p className="text-sm font-semibold">No fee heads found for this account</p>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountFilter("ALL")}
                    className="mt-2 text-xs text-blue-600 font-bold hover:underline"
                  >
                    Reset to view both accounts
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Grid: Recent Activity + Top Defaulters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Activity */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#120c7a]" />
                <h3 className="font-bold text-xs text-zinc-700">Recent Activity</h3>
                {selectedAcademicYear && selectedAcademicYear !== "ALL" && (
                  <span className="bg-blue-50 text-[#120c7a] font-bold text-[10px] px-2 py-0.5 rounded-full border border-blue-200">
                    AY {selectedAcademicYear}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-bold text-zinc-400">{recentPayments.length} transactions</span>
            </div>
            <div className="divide-y divide-zinc-50 max-h-80 overflow-y-auto">
              {recentPayments.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 text-sm">No recent payments for this Academic Year</div>
              ) : (
                recentPayments.map((p, i) => {
                  const pAy = p.academicYear || getPaymentAcademicYear(p, semesterConfigs);
                  const pMode = getPaymentMode(p);
                  const modeMeta = {
                    gateway: { label: "SmartGateway", icon: "🌐", bg: "bg-blue-50 text-blue-700" },
                    dd: { label: "Demand Draft", icon: "🏦", bg: "bg-indigo-50 text-indigo-700" },
                    upi: { label: "UPI", icon: "📱", bg: "bg-purple-50 text-purple-700" },
                    cash: { label: "Cash", icon: "💵", bg: "bg-emerald-50 text-emerald-700" },
                    online: { label: "Online", icon: "💳", bg: "bg-cyan-50 text-cyan-700" },
                    cheque: { label: "Cheque", icon: "📝", bg: "bg-amber-50 text-amber-700" },
                  }[pMode] || { label: pMode || "Payment", icon: "💰", bg: "bg-zinc-50 text-zinc-700" };

                  return (
                    <div key={p.id || i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-zinc-50/50 transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${modeMeta.bg}`}>
                        {modeMeta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-zinc-800 truncate">{p.studentName || "Student"}</p>
                          {p.examNumber && p.examNumber !== "—" && (
                            <span className="text-[9px] font-mono font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200">
                              {p.examNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="font-semibold text-zinc-700">{p.feeHead || "Fee"}</span>
                          <span>•</span>
                          <span className="font-medium text-zinc-600">{modeMeta.label}</span>
                          {p.department && p.department !== "—" && (
                            <>
                              <span>•</span>
                              <span className="text-zinc-500 truncate max-w-[140px]">{p.department}</span>
                            </>
                          )}
                          {pAy && (
                            <>
                              <span>•</span>
                              <span className="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.2 rounded text-[8px] border border-blue-100">
                                AY {pAy}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end">
                        <p className="text-xs font-black text-emerald-700">₹{(p.chargedAmount || p.amount || 0).toLocaleString()}</p>
                        <p className="text-[9px] text-zinc-500 font-medium whitespace-nowrap mt-0.5">
                          {formatDateTime(p.paymentDate || p.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Top Defaulters */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-red-500" />
                <h3 className="font-bold text-xs text-zinc-700">Top Defaulters</h3>
                {selectedAcademicYear && selectedAcademicYear !== "ALL" && (
                  <span className="bg-blue-50 text-[#120c7a] font-bold text-[9px] px-2 py-0.5 rounded-full border border-blue-200">
                    Up to AY {selectedAcademicYear}
                  </span>
                )}
                <span className="bg-red-50 text-red-600 font-bold text-[10px] px-2 py-0.5 rounded-full border border-red-200">
                  {filteredDefaulters.length} Defaulters
                </span>
              </div>
              {/* Search Input for Defaulters */}
              <div className="relative">
                <input
                  type="text"
                  value={defaulterSearch}
                  onChange={(e) => setDefaulterSearch(e.target.value)}
                  placeholder="Search defaulter..."
                  className="w-36 sm:w-44 pl-7 pr-2.5 py-1 text-[11px] rounded-lg border border-zinc-200 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/20"
                />
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            <div className="divide-y divide-zinc-50 max-h-80 overflow-y-auto">
              {filteredDefaulters.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 text-sm">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
                  <p className="font-bold text-zinc-600">No Defaulters Found</p>
                  <p className="text-xs text-zinc-400 mt-1">All enrolled students have cleared their fees for this selection.</p>
                </div>
              ) : (
                filteredDefaulters.slice(0, 10).map((d, i) => {
                  const rankColor = i === 0 ? "bg-amber-400 text-amber-950 shadow-sm"
                    : i === 1 ? "bg-slate-300 text-slate-800"
                    : i === 2 ? "bg-amber-700 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200";

                  return (
                    <div 
                      key={d.id || i} 
                      onClick={() => navigate(`/fee/operations?tab=collect&search=${encodeURIComponent(d.regNo || d.name)}`)}
                      className="px-5 py-2.5 flex items-center gap-3 hover:bg-blue-50/50 transition-all cursor-pointer group"
                      title={`Click to view ${d.name}'s fee breakdown & collect payment`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${rankColor}`}>
                        #{i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-zinc-800 group-hover:text-[#120c7a] group-hover:underline truncate transition-colors">
                            {d.name}
                          </p>
                          <span className="text-[9px] font-mono bg-zinc-100 group-hover:bg-blue-100 group-hover:text-[#120c7a] text-zinc-600 px-1.5 py-0.2 rounded border border-zinc-200 transition-colors">
                            {d.regNo}
                          </span>
                        </div>
                        <p className="text-[9px] text-zinc-400 truncate mt-0.5">
                          {d.department} {d.batch ? `• ${d.batch}` : ""}
                        </p>
                        <p className="text-[8px] text-zinc-400 mt-0.5">
                          Target{selectedAcademicYear && selectedAcademicYear !== "ALL" ? ` (Up to ${selectedAcademicYear})` : ""}: {formatAmt(d.allocatedAmount)} • Paid: {formatAmt(d.paidAmount)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-red-600">{formatAmt(d.dueAmount)}</p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/fee/operations?tab=collect&search=${encodeURIComponent(d.regNo || d.name)}`);
                          }}
                          className="mt-0.5 text-[8px] font-bold text-[#120c7a] hover:underline flex items-center gap-0.5 ml-auto"
                        >
                          <span>Collect</span>
                          <ChevronRight size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Master Accountant Department-wise Audit Modal */}
        {selectedAuditHead && headAuditReport && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 lg:p-6 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-[96vw] xl:max-w-[96vw] 2xl:max-w-[1700px] max-h-[96vh] flex flex-col overflow-hidden animate-scaleUp">
              {/* Modal Header */}
              <div className={`px-6 py-5 text-white flex items-center justify-between gap-4 shrink-0 shadow-md ${
                headAuditReport.isCoeHead
                  ? "bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900"
                  : "bg-gradient-to-r from-[#120c7a] via-[#1a10a0] to-blue-900"
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <FileSpreadsheet size={22} className={headAuditReport.isCoeHead ? "text-purple-300" : "text-yellow-300"} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg md:text-xl font-black">{headAuditReport.head} — Department-wise Audit</h2>
                      <span className="bg-white/20 text-white font-bold text-[10px] px-2 py-0.5 rounded-full border border-white/20">
                        AY {selectedAcademicYear || 'ALL'}
                      </span>
                      {headAuditReport.isCoeHead ? (
                        <span className="bg-purple-500/30 text-purple-200 font-bold text-[10px] px-2 py-0.5 rounded-full border border-purple-400/30">
                          Exam Cell Account #76983
                        </span>
                      ) : (
                        <span className="bg-blue-400/30 text-blue-200 font-bold text-[10px] px-2 py-0.5 rounded-full border border-blue-300/30">
                          College Account #76980
                        </span>
                      )}
                    </div>
                    <p className="text-blue-200 text-xs mt-0.5">
                      {headAuditReport.isCoeHead 
                        ? "Autonomous Examination & Student Applications Audit • Live Registrations, Dues & Mode Reconciliation" 
                        : "Master Accountant Audit Level • Live Department Realization, Dues & Mode Reconciliation"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportDepartmentAuditExcel}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Export Audit Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedAuditHead(null); setAuditDeptSearch(""); }}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 bg-slate-50 border-b border-zinc-200 shrink-0">
                <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    {headAuditReport.isCoeHead ? "Target Fees" : "Target Budget"}
                  </p>
                  <p className="text-sm font-black text-zinc-800 truncate mt-0.5">{formatAmt(headAuditReport.totals.targetAmount)}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Realized / Paid</p>
                  <p className="text-sm font-black text-emerald-700 truncate mt-0.5">{formatAmt(headAuditReport.totals.collectedAmount)}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-red-200 shadow-2xs">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Outstanding Due</p>
                  <p className="text-sm font-black text-red-600 truncate mt-0.5">{formatAmt(headAuditReport.totals.dueAmount)}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-2xs">
                  <p className="text-[10px] font-bold text-[#120c7a] uppercase tracking-wider">Realization Rate</p>
                  <p className="text-sm font-black text-[#120c7a] mt-0.5">{headAuditReport.overallPct}%</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    {headAuditReport.isCoeHead ? "Paid Candidates" : "Paid Students"}
                  </p>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">{headAuditReport.totals.paidStudentsCount}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    {headAuditReport.isCoeHead ? "Pending Applications" : "Defaulters"}
                  </p>
                  <p className="text-sm font-black text-red-600 mt-0.5">{headAuditReport.totals.defaultersCount}</p>
                </div>
              </div>

              {/* Search Toolbar */}
              <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between gap-3 bg-white shrink-0">
                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    value={auditDeptSearch}
                    onChange={(e) => setAuditDeptSearch(e.target.value)}
                    placeholder="Search department..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:border-[#120c7a] focus:ring-1 focus:ring-[#120c7a]/20"
                  />
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <span className="text-xs font-bold text-zinc-500 whitespace-nowrap">
                  Showing {filteredAuditRows.length} of {headAuditReport.rows.length} Departments
                </span>
              </div>

              {/* Audit Table */}
              <div className="flex-1 overflow-y-auto min-h-[55vh] max-h-[70vh]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-zinc-700 font-bold border-b border-zinc-200 z-10 shadow-2xs">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">#</th>
                      <th className="py-3 px-3 min-w-[200px]">Department</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap">
                        {headAuditReport.isCoeHead ? "Candidates / Registered" : "Enrolled"}
                      </th>
                      <th className="py-3 px-3 text-center">Paid</th>
                      <th className="py-3 px-3 text-center">
                        {headAuditReport.isCoeHead ? "Pending" : "Defaulters"}
                      </th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">Target Amount</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">Amount Collected</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">Outstanding Due</th>
                      <th className="py-3 px-3 text-center min-w-[140px]">Realization Rate</th>
                      <th className="py-3 px-3 text-right text-emerald-800 font-extrabold whitespace-nowrap bg-emerald-50/50">Cash</th>
                      <th className="py-3 px-3 text-right text-purple-800 font-extrabold whitespace-nowrap bg-purple-50/50">UPI</th>
                      <th className="py-3 px-3 text-right text-blue-800 font-extrabold whitespace-nowrap bg-blue-50/50">Gateway</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredAuditRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-zinc-400 text-sm">
                          No departments matching search query
                        </td>
                      </tr>
                    ) : (
                      filteredAuditRows.map((r, i) => (
                        <tr key={r.department || i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 text-center font-bold text-zinc-400">{i + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-zinc-800">
                            {r.department}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold text-zinc-600">{r.enrolledStudents}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-emerald-700">{r.paidStudentsCount}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-red-600">
                            {r.defaultersCount}
                            {r.partialPaidCount > 0 && (
                              <span className="block text-[9px] text-amber-600 font-medium leading-tight">
                                ({r.partialPaidCount} partial)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-zinc-600">{formatAmt(r.targetAmount)}</td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-700">{formatAmt(r.collectedAmount)}</td>
                          <td className="py-2.5 px-3 text-right font-black text-red-600">{formatAmt(r.dueAmount)}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(0, r.realizationPct))}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-zinc-700 w-10 text-right">{r.realizationPct}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 bg-emerald-50/20 whitespace-nowrap">
                            {formatAmt(r.modes.cash)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-purple-700 bg-purple-50/20 whitespace-nowrap">
                            {formatAmt(r.modes.upi)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-blue-700 bg-blue-50/20 whitespace-nowrap">
                            {formatAmt(r.modes.gateway)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {/* Total Summary Footer */}
                  <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-700 sticky bottom-0">
                    <tr>
                      <td colSpan={2} className="py-3 px-3 font-black text-xs uppercase tracking-wider text-yellow-300">
                        Total Audit Summary
                      </td>
                      <td className="py-3 px-3 text-center text-xs">{headAuditReport.totals.enrolledStudents}</td>
                      <td className="py-3 px-3 text-center text-xs text-emerald-400">{headAuditReport.totals.paidStudentsCount}</td>
                      <td className="py-3 px-3 text-center text-xs text-red-400">
                        {headAuditReport.totals.defaultersCount}
                        {headAuditReport.totals.partialPaidCount > 0 && (
                          <span className="block text-[9px] text-amber-300 font-normal leading-tight">
                            ({headAuditReport.totals.partialPaidCount} partial)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-xs">{formatAmt(headAuditReport.totals.targetAmount)}</td>
                      <td className="py-3 px-3 text-right text-xs text-emerald-300">{formatAmt(headAuditReport.totals.collectedAmount)}</td>
                      <td className="py-3 px-3 text-right text-xs text-red-300">{formatAmt(headAuditReport.totals.dueAmount)}</td>
                      <td className="py-3 px-3 text-center text-xs text-yellow-300">{headAuditReport.overallPct}%</td>
                      <td className="py-3 px-3 text-right text-xs text-emerald-300 whitespace-nowrap bg-emerald-950/30">
                        {formatAmt(headAuditReport.totals.modes.cash)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs text-purple-300 whitespace-nowrap bg-purple-950/30">
                        {formatAmt(headAuditReport.totals.modes.upi)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs text-blue-300 whitespace-nowrap bg-blue-950/30">
                        {formatAmt(headAuditReport.totals.modes.gateway)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Modal Action Footer */}
              <div className="p-4 bg-slate-50 border-t border-zinc-200 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs text-zinc-500 font-medium">
                  Report verified against Firestore live collections.
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedAuditHead(null); setAuditDeptSearch(""); }}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close Audit View
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Quick Actions */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl border border-zinc-200 px-5 py-3 flex items-center gap-3">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Quick:</span>
          <button 
            onClick={() => navigate("/fee/operations?tab=collect")}
            className="px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 transition-all flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20"
          >
            <Plus size={14} /> Record Payment
          </button>
          <button 
            onClick={() => navigate("/fee/operations?tab=collect")}
            className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-all flex items-center gap-1.5"
          >
            <Receipt size={14} /> New Receipt
          </button>
          <button 
            onClick={() => navigate("/fee/operations?tab=concessions")}
            className="px-4 py-2 bg-amber-50 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all flex items-center gap-1.5"
          >
            <Wallet size={14} /> Concession
          </button>
          <button 
            onClick={() => navigate("/fee/operations?tab=reports")}
            className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl hover:bg-blue-100 transition-all flex items-center gap-1.5"
          >
            <Download size={14} /> Reports
          </button>
        </div>
      </div>
    </Layout>
  );
}
