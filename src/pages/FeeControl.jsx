import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { 
  collection, onSnapshot, doc, setDoc, addDoc, serverTimestamp 
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import ExcelJS from "exceljs";
import {
  ShieldAlert, BarChart3, Download, IndianRupee, Users, AlertTriangle,
  CheckCircle2, Search, Filter, Building2, Clock, TrendingUp,
  PieChart, FileSpreadsheet, ArrowUpRight, ArrowDownRight,
  CalendarDays, Bell, Lock, Unlock, MessageSquare, X, ExternalLink,
  RefreshCw, AlertCircle, Eye, Send, Smartphone, Mail, Layers, ChevronDown,
  ChevronLeft, ChevronRight, Landmark
} from "lucide-react";
import Layout from "../components/Layout";
import { formatProgrammeKey } from "../lib/utils";
import { isDeptMatch as isDeptMatchRegistry } from "../lib/departmentRegistry";
import {
  getCanonicalDept,
  getPaymentDateObj,
  formatDateTime,
  getPaymentAcademicYear,
  getPaymentMode,
  getSmoothSvgPath
} from "./FeeDashboard";
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

const formatCurrency = (val) => `₹${Math.round(val || 0).toLocaleString("en-IN")}`;

const parseStudentDoc = (docId, data) => {
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
      if (y2.length === 2) y2 = "20" + y2;
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

export default function FeeControl() {
  const navigate = useNavigate();

  // Top Tabs: Defaulters & Alerts | Reports | Analytics
  const [tab, setTab] = useState("defaulters");
  const [reportTab, setReportTab] = useState("daybook");

  // Collections state
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [openingDues, setOpeningDues] = useState([]);
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [transportStages, setTransportStages] = useState([]);
  const [eseRegistrations, setEseRegistrations] = useState([]);
  const [eseFeePayments, setEseFeePayments] = useState([]);
  const [photocopyApps, setPhotocopyApps] = useState([]);
  const [revaluationApps, setRevaluationApps] = useState([]);
  const [reviewApps, setReviewApps] = useState([]);
  const [examCellPayments, setExamCellPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Global filters
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [selectedAccountFilter, setSelectedAccountFilter] = useState("ALL"); // "ALL" | "76980" | "76983"
  const [searchDefaulter, setSearchDefaulter] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("ALL");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState("ALL");
  const [selectedHeadFilter, setSelectedHeadFilter] = useState("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL"); // "ALL" | "critical" | "warning" | "notice"
  const [selectedRestrictFilter, setSelectedRestrictFilter] = useState("ALL"); // "ALL" | "restricted" | "active"
  const [currentPage, setCurrentPage] = useState(1);

  // Available fee heads based on selected account
  const availableFeeHeads = useMemo(() => {
    if (selectedAccountFilter === "76980") {
      return ["Tuition Fee", "Other Fee", "Caution Deposit", "Admission Fee", "Bus Fee", "Previous Year Arrears"];
    }
    if (selectedAccountFilter === "76983") {
      return ["ESE Registration Fee", "Photocopy Fee", "Revaluation Fee", "Review Fee"];
    }
    return [
      "Tuition Fee", "Other Fee", "Caution Deposit", "Admission Fee", "Bus Fee", "Previous Year Arrears",
      "ESE Registration Fee", "Photocopy Fee", "Revaluation Fee", "Review Fee"
    ];
  }, [selectedAccountFilter]);

  // Day Book specific date
  const [dayBookDate, setDayBookDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dayBookSearch, setDayBookSearch] = useState("");

  // Reminder Modal State
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTarget, setReminderTarget] = useState("all"); // "all" | "critical" | "warning"
  const [reminderTemplate, setReminderTemplate] = useState("gentle"); // "gentle" | "urgent" | "final"
  const [sendingReminders, setSendingReminders] = useState(false);

  // Toast notification
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Real-time Firestore sync
  useEffect(() => {
    let rawNamelistDocs = [];
    let rawAdmissionsDocs = [];
    let rawUserDocs = [];
    let rawEnquiriesDocs = [];

    const rebuildStudentsList = () => {
      const studentMap = new Map();

      // 1. Process uploaded namelists (authoritative registry)
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

      // 2. Process approved admissions (enrichment + new entries)
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

      // 3. Attach user login auth metadata
      rawUserDocs.forEach(u => {
        const reg = (u.regNo || u.examNumber || u.rollNo || "").trim();
        if (reg) {
          const regKey = reg.toUpperCase();
          const existing = studentMap.get(regKey);
          if (existing) {
            existing.uid = u.id || u.uid || existing.uid;
            existing.email = u.email || existing.email;
            if (!existing.quota) existing.quota = getQuota(u);
            if (!existing.category || existing.category === "Regular") {
              const uCat = getCategory(u);
              if (uCat) existing.category = uCat;
            }
            if (!existing.transportStage) existing.transportStage = u.transportStage || "";
          }
        }
      });

      // 4. Attach verified Quota, Category, Transport Stage, ApplicationNo & EnquiryId from enquiries
      rawEnquiriesDocs.forEach(enq => {
        const q = getQuota(enq);
        const c = getCategory(enq);
        const tStage = enq.transportStage || enq.boardingPoint || "";

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
          if (!targetStudent.transportStage && tStage) targetStudent.transportStage = tStage;
          if (!targetStudent.applicationNo && enq.applicationNo) targetStudent.applicationNo = enq.applicationNo;
          if (!targetStudent.enquiryId && enq.enquiryId) targetStudent.enquiryId = enq.enquiryId;
          targetStudent._profile_data = {
            ...(targetStudent._profile_data || {}),
            quota: targetStudent.quota || q,
            seatCategory: targetStudent.quota || q,
            studentCategory: targetStudent.category || c,
            transportStage: targetStudent.transportStage || tStage,
            applicationNo: targetStudent.applicationNo || enq.applicationNo,
            enquiryId: targetStudent.enquiryId || enq.enquiryId
          };
        }
      });

      setStudents(Array.from(studentMap.values()));
      setLoading(false);
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
      rebuildStudentsList();
    }, () => {});

    const unsubEnquiries = onSnapshot(collection(db, "enquiries"), snap => {
      const enqList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rawEnquiriesDocs = enqList;
      setEnquiries(enqList);
      rebuildStudentsList();
    }, () => {});

    const unsubPayments = onSnapshot(collection(db, "fee_payments"), snap => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubReceipts = onSnapshot(collection(db, "fee_receipts"), snap => {
      setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubConcessions = onSnapshot(collection(db, "fee_concessions"), snap => {
      setConcessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubFeeConfigs = onSnapshot(collection(db, "fee_configurations"), snap => {
      setFeeConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubOpeningDues = onSnapshot(collection(db, "fee_opening_dues"), snap => {
      setOpeningDues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubSemesterConfig = onSnapshot(collection(db, "semester_config"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSemesterConfigs(list);
      // Auto-set latest active academic year
      const activeCfg = list.find(s => s.status === "active") || list[0];
      if (activeCfg?.academicYear) {
        setSelectedAcademicYear(prev => prev || activeCfg.academicYear);
      }
    }, () => {});

    const unsubRestrictions = onSnapshot(collection(db, "fee_restrictions"), snap => {
      setRestrictions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubReminders = onSnapshot(collection(db, "fee_reminders"), snap => {
      setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubTransport = onSnapshot(collection(db, "transport_stages"), snap => {
      setTransportStages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    // Exam Cell / COE collections real-time listeners (#76983)
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

    return () => {
      unsubStudents();
      unsubAdmissions();
      unsubUsers();
      unsubEnquiries();
      unsubPayments();
      unsubReceipts();
      unsubConcessions();
      unsubFeeConfigs();
      unsubOpeningDues();
      unsubSemesterConfig();
      unsubRestrictions();
      unsubReminders();
      unsubTransport();
      unsubCOE1();
      unsubCOE1b();
      unsubCOE2();
      unsubCOE3();
      unsubCOE4();
      unsubCOE5();
    };
  }, []);

  // Map of restrictions by student regNo
  const restrictionsMap = useMemo(() => {
    const map = {};
    restrictions.forEach(r => {
      const key = (r.regNo || r.id || "").trim().toUpperCase();
      if (key) map[key] = r;
    });
    return map;
  }, [restrictions]);

  // Helper to strictly categorize a transaction or fee head between Exam Cell Account #76983 vs College Account #76980
  const isCoeHeadOrPayment = (p) => {
    if (!p) return false;
    if (p.isCoe === true || p.accountNo === "76983") return true;
    if (p.accountNo === "76980") return false;

    const idStr = String(p.id || p._id || '').toLowerCase();
    if (idStr.startsWith('coe_') || idStr.startsWith('ese_')) return true;

    const orderStr = String(p.orderId || p.transactionId || '').toUpperCase();
    if (orderStr.startsWith('FEEM') || orderStr.startsWith('ESE_') || orderStr.startsWith('COE_') || orderStr.startsWith('REV') || orderStr.startsWith('PHO') || orderStr.startsWith('RET')) return true;

    const h = String(p.feeHead || p.head || p.name || '').trim().toLowerCase();
    if (!h) return false;

    if (
      h.includes('ese') ||
      h.includes('end semester') ||
      h.includes('photocopy') ||
      h.includes('revaluation') ||
      h.includes('re-total') ||
      h.includes('retotal') ||
      h.includes('review') ||
      h.includes('coe') ||
      h.includes('exam cell') ||
      h.includes('autonomous exam') ||
      (h.includes('exam fee') && !h.includes('college'))
    ) {
      return true;
    }
    return false;
  };

  // Verified Payments (College & COE consolidated, with distinct account tags #76980 vs #76983)
  const verifiedPayments = useMemo(() => {
    const list = payments.filter(p => {
      const st = String(p.status || "").toLowerCase();
      if (st === "failed" || st === "cancelled" || st === "rejected") return false;
      return true;
    }).map(p => ({
      ...p,
      isCoe: false,
      accountNo: "76980"
    }));

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
        const amt = Number(p.feeAmount || p.amount || 0);
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

        const feeHead = p.feeCategory || p.feeHead || (enq.status === "Admission" || enq.status === "Approved" ? "Admission Fee" : "Application Fee");
        const rawMode = String(p.paymentMode || p.mode || "cash").toLowerCase();
        const mode = (rawMode === "cash" || rawMode.includes("hand")) ? "cash"
          : (rawMode === "pay_online" || rawMode === "upi" || rawMode === "online" || Boolean(p.upiNumber)) ? "upi"
          : rawMode === "dd" ? "dd"
          : rawMode === "cheque" ? "cheque"
          : "cash";

        const pDate = p.paymentDate || enq.enquiryDate || enq.admissionDate || enq.createdAt;
        const ay = enq.academicYear || getPaymentAcademicYear({ paymentDate: pDate, createdAt: pDate }, semesterConfigs) || "2026-2027";
        const enqName = enq.studentName || `${enq.firstName || ""} ${enq.lastName || ""}`.trim() || "";

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
          examNumber: enq.regNo || enq.studentRegNo || enq.rollNo || appNo,
          regNo: enq.regNo || enq.studentRegNo || enq.rollNo || appNo,
          applicationNo: enq.applicationNo || "",
          enquiryId: enqId,
          department: enq.department || "—",
          batch: enq.batch || "—",
          isApplicationFee: true,
          source: "admission_enquiry",
          upiNumber: p.upiNumber || "",
          isCoe: false,
          accountNo: "76980"
        });
      });
    });

    const coeList = [];
    const seenOrderIds = new Set();

    const combinedEse = [...eseRegistrations, ...eseFeePayments];
    combinedEse.forEach(p => {
      const pStatus = (p.paymentStatus || p.status || "").toLowerCase();
      const isPaid = pStatus === "paid" || pStatus === "success" || pStatus === "successful" || p.billAttached === true || Boolean(p.receiptNo) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.amount || 0);
      if (amt <= 0) return;
      const orderId = p.orderId || p.transactionId || "";
      if (orderId && seenOrderIds.has(orderId)) return;
      if (orderId) seenOrderIds.add(orderId);

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
      coeList.push({
        id: `coe_ese_${p.id}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: "ESE registration Fee",
        mode: "gateway",
        paymentMode: "gateway",
        paymentDate: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt || p.timestamp,
        createdAt: p.paidAt || p.paymentDate || p.appliedAt || p.createdAt || p.timestamp,
        academicYear: p.academicYear || (p.examSession ? p.examSession : null) || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: p.studentName || p.candidateName || p.name || "",
        examNumber: regNo,
        regNo,
        department: p.department || "—",
        batch: p.batch || "—",
        isCoe: true,
        accountNo: "76983"
      });
    });

    photocopyApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" || p.billAttached === true || Boolean(p.electronicBill) || Boolean(p.transactionId) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;
      const orderId = p.orderId || p.electronicBill?.transactionId || p.transactionId || "";
      if (orderId && seenOrderIds.has(orderId)) return;
      if (orderId) seenOrderIds.add(orderId);

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
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
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: p.studentName || p.candidateName || p.name || "",
        examNumber: regNo,
        regNo,
        department: p.department || "—",
        batch: p.batch || "—",
        isCoe: true,
        accountNo: "76983"
      });
    });

    revaluationApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" || p.billAttached === true || Boolean(p.electronicBill) || Boolean(p.transactionId) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;
      const orderId = p.orderId || p.electronicBill?.transactionId || p.transactionId || "";
      if (orderId && seenOrderIds.has(orderId)) return;
      if (orderId) seenOrderIds.add(orderId);

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
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
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: p.studentName || p.candidateName || p.name || "",
        examNumber: regNo,
        regNo,
        department: p.department || "—",
        batch: p.batch || "—",
        isCoe: true,
        accountNo: "76983"
      });
    });

    reviewApps.forEach(p => {
      const pStatus = (p.paymentStatus || "").toLowerCase();
      const isPaid = pStatus === "paid" || p.billAttached === true || Boolean(p.electronicBill) || Boolean(p.transactionId) || Boolean(p.paidAt);
      if (!isPaid) return;
      const amt = Number(p.feeAmount || p.totalFee || p.amount || 0);
      if (amt <= 0) return;
      const orderId = p.orderId || p.electronicBill?.transactionId || p.transactionId || "";
      if (orderId && seenOrderIds.has(orderId)) return;
      if (orderId) seenOrderIds.add(orderId);

      const regNo = (p.registerNumber || p.regNo || p.studentRegNo || p.examNumber || "").trim();
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
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: p.studentName || p.candidateName || p.name || "",
        examNumber: regNo,
        regNo,
        department: p.department || "—",
        batch: p.batch || "—",
        isCoe: true,
        accountNo: "76983"
      });
    });

    examCellPayments.forEach(p => {
      const orderId = p.orderId || p.receiptNo || p.id || "";
      if (orderId && seenOrderIds.has(orderId)) return;
      const amt = Number(p.amount || p.chargedAmount || 0);
      if (amt <= 0) return;
      const catLower = (p.category || "").toLowerCase();
      let head = "ESE registration Fee";
      if (catLower.includes("review")) head = "Review Fee";
      else if (catLower.includes("revaluation")) head = "Revaluation Fee";
      else if (catLower.includes("photocopy")) head = "Photocopy Fee";

      const regNo = (p.regNo || p.examNumber || p.studentRegNo || "").trim();
      coeList.push({
        id: `coe_pay_${orderId}`,
        status: "SUCCESS",
        amount: amt,
        chargedAmount: amt,
        feeHead: head,
        mode: p.mode || "gateway",
        paymentMode: p.mode || "gateway",
        paymentDate: p.date || p.paymentDate || p.createdAt,
        createdAt: p.date || p.paymentDate || p.createdAt,
        academicYear: p.academicYear || getPaymentAcademicYear(p, semesterConfigs) || "2026-2027",
        studentName: p.studentName || p.candidateName || p.name || "",
        examNumber: regNo,
        regNo,
        department: p.department || "—",
        batch: p.batch || "—",
        isCoe: true,
        accountNo: "76983"
      });
    });

    return [...list, ...enquiryList, ...coeList];
  }, [payments, enquiries, eseRegistrations, eseFeePayments, photocopyApps, revaluationApps, reviewApps, examCellPayments, semesterConfigs]);

  // Available Academic Years for filter
  const academicYears = useMemo(() => {
    const set = new Set();
    semesterConfigs.forEach(s => s.academicYear && set.add(s.academicYear.trim()));
    feeConfigs.forEach(f => f.academicYear && set.add(f.academicYear.trim()));
    payments.forEach(p => p.academicYear && set.add(p.academicYear.trim()));
    return Array.from(set).sort().reverse();
  }, [semesterConfigs, feeConfigs, payments]);

  // Default to first AY if not chosen
  useEffect(() => {
    if (!selectedAcademicYear && academicYears.length > 0) {
      setSelectedAcademicYear(academicYears[0]);
    }
  }, [academicYears, selectedAcademicYear]);

  // Active Payments filtered by selected Academic Year
  const activePayments = useMemo(() => {
    if (!selectedAcademicYear || selectedAcademicYear === "ALL") return verifiedPayments;
    return verifiedPayments.filter(p => {
      const pAy = getPaymentAcademicYear(p, semesterConfigs);
      return !pAy || pAy === selectedAcademicYear;
    });
  }, [verifiedPayments, selectedAcademicYear, semesterConfigs]);

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

  // Students strictly enrolled in currently active academic calendar batches (past date ranges excluded)
  const currentStudyingStudents = useMemo(() => {
    return filterActiveStudyingStudents(students, semesterConfigs);
  }, [students, semesterConfigs]);

  // Distinct Departments & Batches for filters strictly from currently studying active batches
  const allDepartments = useMemo(() => {
    const set = new Set();
    const targetStudents = currentStudyingStudents.length > 0 ? currentStudyingStudents : students;
    targetStudents.forEach(s => {
      const d = getCanonicalDept(s.department);
      if (d && d !== "General") set.add(d);
    });
    return Array.from(set).sort();
  }, [currentStudyingStudents, students]);

  const allBatches = useMemo(() => {
    const set = new Set();
    const targetStudents = currentStudyingStudents.length > 0 ? currentStudyingStudents : students;
    targetStudents.forEach(s => s.batch && set.add(s.batch.trim()));
    return Array.from(set).sort().reverse();
  }, [currentStudyingStudents, students]);

  // Master Student Defaulters Calculation (Reconciled across College Account #76980 & COE Account #76983)
  const studentFinancials = useMemo(() => {
    const targetYearStart = parseYearStart(selectedAcademicYear);
    const now = new Date();

    const studentLookup = buildStudentCanonicalLookup(students);
    const studentOpeningDuesMap = aggregateOpeningDuesByStudent(openingDues, studentLookup, targetYearStart);
    const studentConcessionsMap = aggregateConcessionsByStudent(concessions, studentLookup);

    // Fast enquiries lookup
    const enqLookup = new Map();
    enquiries.forEach(enq => {
      const q = getQuota(enq);
      const c = getCategory(enq);
      const tStage = enq.transportStage || enq.boardingPoint || "";
      if (!q && !c && !tStage) return;
      const keys = [enq.regNo, enq.studentRegNo, enq.rollNo, enq.examNumber, enq.applicationNo, enq.enquiryId, enq.id, enq.studentName].filter(Boolean);
      keys.forEach(k => {
        const kNorm = String(k).trim().toLowerCase();
        if (kNorm && !enqLookup.has(kNorm)) enqLookup.set(kNorm, { quota: q, category: c, transportStage: tStage });
      });
    });

    // Separate verified payments by Account (#76980 College vs #76983 Exam Cell)
    const collegePaidByStudent = new Map();
    const coePaidByStudent = new Map();
    const collegePaymentsByStudent = new Map();
    const coePaymentsByStudent = new Map();

    verifiedPayments.forEach(p => {
      const amt = Number(p.chargedAmount || p.amount || 0);
      if (amt <= 0) return;
      const reg = (p.examNumber || p.regNo || p.studentRegNo || p.registerNumber || p.applicationNo || "").trim().toLowerCase();
      const uid = (p.studentId || p.uid || p.enquiryId || "").trim().toLowerCase();
      const email = (p.studentEmail || p.email || "").trim().toLowerCase();
      const name = (p.studentName || p.candidateName || p.name || "").trim().toLowerCase();
      const sKey = (reg && studentLookup.get(reg)) ||
                   (uid && studentLookup.get(uid)) ||
                   (email && studentLookup.get(email)) ||
                   (name && studentLookup.get(name)) ||
                   (reg ? reg.toUpperCase() : (uid ? uid.toUpperCase() : ""));
      if (!sKey) return;

      if (isCoeHeadOrPayment(p)) {
        coePaidByStudent.set(sKey, (coePaidByStudent.get(sKey) || 0) + amt);
        if (!coePaymentsByStudent.has(sKey)) coePaymentsByStudent.set(sKey, []);
        coePaymentsByStudent.get(sKey).push(p);
      } else {
        collegePaidByStudent.set(sKey, (collegePaidByStudent.get(sKey) || 0) + amt);
        if (!collegePaymentsByStudent.has(sKey)) collegePaymentsByStudent.set(sKey, []);
        collegePaymentsByStudent.get(sKey).push(p);
      }
    });

    // Index COE applications per canonical student key
    const coeAppsByStudent = new Map();
    const addCoeApp = (app, rawHead) => {
      if (targetYearStart > 0 && app.academicYear) {
        const appYear = parseYearStart(app.academicYear);
        if (appYear > targetYearStart) return;
      }
      const reg = (app.registerNumber || app.regNo || app.studentRegNo || app.examNumber || "").trim().toLowerCase();
      const uid = (app.studentId || app.uid || app.studentUid || "").trim().toLowerCase();
      const email = (app.studentEmail || app.email || "").trim().toLowerCase();
      const name = (app.studentName || app.candidateName || app.name || "").trim().toLowerCase();
      const sKey = (reg && studentLookup.get(reg)) ||
                   (uid && studentLookup.get(uid)) ||
                   (email && studentLookup.get(email)) ||
                   (name && studentLookup.get(name)) ||
                   (reg ? reg.toUpperCase() : (uid ? uid.toUpperCase() : ""));
      if (!sKey) return;
      if (!coeAppsByStudent.has(sKey)) coeAppsByStudent.set(sKey, []);
      coeAppsByStudent.get(sKey).push({ ...app, head: rawHead });
    };

    [...eseRegistrations, ...eseFeePayments].forEach(a => addCoeApp(a, "ESE registration Fee"));
    photocopyApps.forEach(a => addCoeApp(a, "Photocopy Fee"));
    revaluationApps.forEach(a => addCoeApp(a, "Revaluation Fee"));
    reviewApps.forEach(a => addCoeApp(a, "Review Fee"));

    const targetStudents = currentStudyingStudents.length > 0 ? currentStudyingStudents : students;

    // Calculate per student strictly across active studying batches
    return targetStudents.map(s => {
      const reg = (s.regNo || s.examNumber || s.rollNo || s.id || "").trim().toUpperCase();
      const sKey = reg || s.id;
      const sBatch = (s.batch || "").trim().toLowerCase();
      const sDept = getCanonicalDept(s.department);

      let studentQuota = s.quota || s._profile_data?.quota || s._profile_data?.seatCategory || "";
      let studentCategory = s.category || s._profile_data?.category || "Regular";
      let studentTransportStage = s.transportStage || s._profile_data?.transportStage || "";

      if (!studentQuota || !studentTransportStage) {
        const enqInfo = enqLookup.get(reg.toLowerCase()) || (s.name ? enqLookup.get(s.name.toLowerCase().trim()) : null);
        if (!studentQuota && enqInfo?.quota) studentQuota = enqInfo.quota;
        if ((!studentCategory || studentCategory === "Regular") && enqInfo?.category) studentCategory = enqInfo.category;
        if (!studentTransportStage && enqInfo?.transportStage) studentTransportStage = enqInfo.transportStage;
      }

      // ─────────────────────────────────────────────────────────────
      // 1. COLLEGE ACCOUNT (#76980) FINANCIALS
      // ─────────────────────────────────────────────────────────────
      const matchedHeadConfigs = feeConfigs.filter(f => {
        if (targetYearStart > 0 && f.academicYear) {
          const cfgYearStart = parseYearStart(f.academicYear);
          if (cfgYearStart > targetYearStart) return false;
        }
        if (isCoeHeadOrPayment(f)) return false; // Exclude COE heads from college configs

        const isProg = isProgMatch(f.programme, s.programme || "UG");
        if (!isProg) return false;

        const isDept = !f.department || f.department.toLowerCase() === "all" || isDeptMatchRegistry(f.department, sDept);
        if (!isDept) return false;

        const batchMatch = !f.batch || f.batch.toLowerCase() === "all" || isBatchMatch(f.batch, sBatch);
        if (!batchMatch) return false;

        const isQuota = isQuotaApplicable(f.quota, studentQuota);
        if (!isQuota) return false;

        const isCat = isCategoryApplicable(f.studentCategory, studentCategory);
        if (!isCat) return false;

        return true;
      });

      // Deduplicate configs by AY + Sem + Head
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

      let collegeAllocatedAmount = Array.from(configMap.values()).reduce((sum, c) => sum + Number(c.amount || 0), 0);

      // Add transport stage fee if assigned
      let stageAmount = 0;
      if (studentTransportStage && transportStages.length > 0) {
        const stageObj = transportStages.find(st => st.stageName?.toLowerCase().trim() === studentTransportStage.toLowerCase().trim() || st.name?.toLowerCase().trim() === studentTransportStage.toLowerCase().trim());
        if (stageObj?.amount) {
          stageAmount = Number(stageObj.amount);
          collegeAllocatedAmount += stageAmount;
        }
      }

      const openingDue = studentOpeningDuesMap.get(sKey) || 0;
      const collegeTarget = collegeAllocatedAmount + openingDue;
      const collegePaid = collegePaidByStudent.get(sKey) || 0;
      const collegeConcession = studentConcessionsMap.get(sKey) || 0;
      const collegeDue = Math.max(0, collegeTarget - collegePaid - collegeConcession);

      // College head targets breakdown
      const collegeTargets = {};
      Array.from(configMap.values()).forEach(c => {
        const h = normHead(c.head);
        let headLabel = "Tuition Fee";
        if (h.includes("other")) headLabel = "Other Fee";
        else if (h.includes("caution")) headLabel = "Caution Deposit";
        else if (h.includes("admission") || h.includes("application")) headLabel = "Admission Fee";
        else if (h.includes("transport") || h.includes("bus")) headLabel = "Bus Fee";
        else if (h.includes("hostel")) headLabel = "Hostel Fee";
        else if (c.head) headLabel = c.head;
        collegeTargets[headLabel] = (collegeTargets[headLabel] || 0) + (Number(c.amount) || 0);
      });
      if (stageAmount > 0) collegeTargets["Bus Fee"] = (collegeTargets["Bus Fee"] || 0) + stageAmount;
      if (openingDue > 0) collegeTargets["Previous Year Arrears"] = (collegeTargets["Previous Year Arrears"] || 0) + openingDue;

      // College head dues resolution
      const collegeDirectPaid = {};
      let allocatedCollegePayments = 0;
      (collegePaymentsByStudent.get(sKey) || []).forEach(p => {
        const pAmt = Number(p.chargedAmount || p.amount || 0);
        if (pAmt <= 0) return;
        const pH = normHead(p.feeHead);
        let matchedTargetHead = null;
        if (pH.includes("tuition")) matchedTargetHead = "Tuition Fee";
        else if (pH.includes("other")) matchedTargetHead = "Other Fee";
        else if (pH.includes("caution")) matchedTargetHead = "Caution Deposit";
        else if (pH.includes("admission") || pH.includes("application")) matchedTargetHead = "Admission Fee";
        else if (pH.includes("bus") || pH.includes("transport")) matchedTargetHead = "Bus Fee";
        else if (pH.includes("arrear") || pH.includes("opening")) matchedTargetHead = "Previous Year Arrears";

        if (matchedTargetHead && collegeTargets[matchedTargetHead] !== undefined) {
          const cur = collegeDirectPaid[matchedTargetHead] || 0;
          const cap = collegeTargets[matchedTargetHead];
          const take = Math.min(cap - cur, pAmt);
          if (take > 0) {
            collegeDirectPaid[matchedTargetHead] = cur + take;
            allocatedCollegePayments += take;
          }
        }
      });

      const collegeConcessions = { "Tuition Fee": collegeConcession };
      let unallocatedCollegePaid = Math.max(0, collegePaid - allocatedCollegePayments);
      const collegeWaterfall = ["Previous Year Arrears", "Tuition Fee", "Other Fee", "Caution Deposit", "Admission Fee", "Bus Fee"];
      Object.keys(collegeTargets).forEach(h => { if (!collegeWaterfall.includes(h)) collegeWaterfall.push(h); });

      const collegeHeadDues = {};
      collegeWaterfall.forEach(h => {
        const tgt = collegeTargets[h] || 0;
        const pd = collegeDirectPaid[h] || 0;
        const conc = collegeConcessions[h] || 0;
        let rem = Math.max(0, tgt - pd - conc);
        if (rem > 0 && unallocatedCollegePaid > 0) {
          const take = Math.min(rem, unallocatedCollegePaid);
          collegeDirectPaid[h] = pd + take;
          unallocatedCollegePaid -= take;
          rem -= take;
        }
        collegeHeadDues[h] = rem;
      });

      const colDuesSum = Object.values(collegeHeadDues).reduce((a, b) => a + b, 0);
      const colDiff = collegeDue - colDuesSum;
      if (colDiff !== 0) {
        const leadHead = collegeTargets["Tuition Fee"] !== undefined ? "Tuition Fee" : (Object.keys(collegeTargets)[0] || "Tuition Fee");
        collegeHeadDues[leadHead] = Math.max(0, (collegeHeadDues[leadHead] || 0) + colDiff);
      }

      // ─────────────────────────────────────────────────────────────
      // 2. COE ACCOUNT (#76983) FINANCIALS
      // ─────────────────────────────────────────────────────────────
      const coeApps = coeAppsByStudent.get(sKey) || [];
      const coeTargets = {
        "ESE registration Fee": 0,
        "Photocopy Fee": 0,
        "Revaluation Fee": 0,
        "Review Fee": 0
      };
      const coePaidPerHead = {
        "ESE registration Fee": 0,
        "Photocopy Fee": 0,
        "Revaluation Fee": 0,
        "Review Fee": 0
      };
      const coeDuesPerHead = {
        "ESE registration Fee": 0,
        "Photocopy Fee": 0,
        "Revaluation Fee": 0,
        "Review Fee": 0
      };

      coeApps.forEach(app => {
        const h = app.head || "ESE registration Fee";
        const amt = Number(app.feeAmount || app.totalFee || app.amount || 0);
        const pStatus = (app.paymentStatus || app.status || "").toLowerCase();
        const isPaid = pStatus === "paid" || pStatus === "success" || app.billAttached === true || Boolean(app.electronicBill) || Boolean(app.receiptNo) || Boolean(app.paidAt);

        if (coeTargets[h] !== undefined) coeTargets[h] += amt;
        else coeTargets[h] = amt;

        if (isPaid) {
          if (coePaidPerHead[h] !== undefined) coePaidPerHead[h] += amt;
          else coePaidPerHead[h] = amt;
        } else {
          if (coeDuesPerHead[h] !== undefined) coeDuesPerHead[h] += amt;
          else coeDuesPerHead[h] = amt;
        }
      });

      const coeTarget = Object.values(coeTargets).reduce((a, b) => a + b, 0);
      const coePaidFromPayments = coePaidByStudent.get(sKey) || 0;
      const coePaidFromApps = Object.values(coePaidPerHead).reduce((a, b) => a + b, 0);
      const coePaid = Math.max(coePaidFromPayments, coePaidFromApps);
      const coeDue = Math.max(0, coeTarget - coePaid);

      const coeDuesSum = Object.values(coeDuesPerHead).reduce((a, b) => a + b, 0);
      const coeDiff = coeDue - coeDuesSum;
      if (coeDiff !== 0) {
        coeDuesPerHead["ESE registration Fee"] = Math.max(0, (coeDuesPerHead["ESE registration Fee"] || 0) + coeDiff);
      }

      // ─────────────────────────────────────────────────────────────
      // 3. DYNAMIC RESOLUTION BASED ON SELECTED ACCOUNT FILTER
      // ─────────────────────────────────────────────────────────────
      let targetAmount = 0;
      let paidAmount = 0;
      let concessionAmount = 0;
      let dueAmount = 0;
      let activeHeadTargets = {};
      let activeHeadDues = {};

      if (selectedAccountFilter === "76980") {
        targetAmount = collegeTarget;
        paidAmount = collegePaid;
        concessionAmount = collegeConcession;
        dueAmount = collegeDue;
        activeHeadTargets = collegeTargets;
        activeHeadDues = collegeHeadDues;
      } else if (selectedAccountFilter === "76983") {
        targetAmount = coeTarget;
        paidAmount = coePaid;
        concessionAmount = 0;
        dueAmount = coeDue;
        activeHeadTargets = coeTargets;
        activeHeadDues = coeDuesPerHead;
      } else {
        // "ALL" (Both Accounts Consolidated)
        targetAmount = collegeTarget + coeTarget;
        paidAmount = collegePaid + coePaid;
        concessionAmount = collegeConcession;
        dueAmount = collegeDue + coeDue;
        activeHeadTargets = { ...collegeTargets, ...coeTargets };
        activeHeadDues = { ...collegeHeadDues, ...coeDuesPerHead };
      }

      const isDefaulter = dueAmount > 0 && targetAmount > 0;

      // Calculate days overdue based on academic calendar
      let daysOverdue = 0;
      if (isDefaulter) {
        const ayStartYear = targetYearStart || (now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1);
        const termStart = new Date(ayStartYear, 6, 1); // July 1
        daysOverdue = Math.max(1, Math.floor((now.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24)));
      }

      // Aging Category: Critical (>30d), Warning (15-30d), Notice (1-15d)
      let overdueStatus = "current";
      if (daysOverdue > 30) overdueStatus = "critical";
      else if (daysOverdue >= 15) overdueStatus = "warning";
      else if (daysOverdue > 0) overdueStatus = "notice";

      const isRestricted = Boolean(restrictionsMap[reg]?.restricted);

      return {
        ...s,
        regNo: reg,
        department: sDept,
        quota: studentQuota || "GQ",
        category: studentCategory,
        targetAmount,
        paidAmount,
        concessionAmount,
        dueAmount,
        isDefaulter,
        daysOverdue,
        overdueStatus,
        isRestricted,
        // Preserved granular account structures for reports & multi-tier export
        collegeFinancials: {
          target: collegeTarget,
          paid: collegePaid,
          concession: collegeConcession,
          due: collegeDue,
          targets: collegeTargets,
          dues: collegeHeadDues,
          configs: Array.from(configMap.values()),
          stageFee: stageAmount,
          openingDue
        },
        coeFinancials: {
          target: coeTarget,
          paid: coePaid,
          concession: 0,
          due: coeDue,
          targets: coeTargets,
          dues: coeDuesPerHead,
          apps: coeApps
        },
        headTargets: activeHeadTargets,
        headDues: activeHeadDues,
        matchedConfigs: Array.from(configMap.values()),
        studentTransportStage,
        transportStageFee: stageAmount,
        openingDue
      };
    });
  }, [currentStudyingStudents, students, feeConfigs, openingDues, verifiedPayments, concessions, enquiries, transportStages, selectedAcademicYear, selectedAccountFilter, restrictionsMap, eseRegistrations, eseFeePayments, photocopyApps, revaluationApps, reviewApps]);

  // Aggregate stats across all 3 account views for the top Account Switcher cards
  const accountTotals = useMemo(() => {
    let allTarget = 0, allPaid = 0, allDue = 0, allDefaulters = 0;
    let collegeTarget = 0, collegePaid = 0, collegeDue = 0, collegeDefaulters = 0;
    let coeTarget = 0, coePaid = 0, coeDue = 0, coeDefaulters = 0;

    studentFinancials.forEach(s => {
      const cTgt = s.collegeFinancials?.target || 0;
      const cPd = s.collegeFinancials?.paid || 0;
      const cDue = s.collegeFinancials?.due || 0;
      collegeTarget += cTgt;
      collegePaid += cPd;
      collegeDue += cDue;
      if (cDue > 0 && cTgt > 0) collegeDefaulters++;

      const coeTgt = s.coeFinancials?.target || 0;
      const coePd = s.coeFinancials?.paid || 0;
      const coeD = s.coeFinancials?.due || 0;
      coeTarget += coeTgt;
      coePaid += coePd;
      coeDue += coeD;
      if (coeD > 0 && coeTgt > 0) coeDefaulters++;

      allTarget += (cTgt + coeTgt);
      allPaid += (cPd + coePd);
      allDue += (cDue + coeD);
      if ((cDue + coeD) > 0 && (cTgt + coeTgt) > 0) allDefaulters++;
    });

    const calcRecovery = (paid, tgt) => tgt > 0 ? ((paid / tgt) * 100).toFixed(1) : "0.0";

    return {
      allTarget, allPaid, allDue, allDefaulters, allRecoveryRate: calcRecovery(allPaid, allTarget),
      collegeTarget, collegePaid, collegeDue, collegeDefaulters, collegeRecoveryRate: calcRecovery(collegePaid, collegeTarget),
      coeTarget, coePaid, coeDue, coeDefaulters, coeRecoveryRate: calcRecovery(coePaid, coeTarget)
    };
  }, [studentFinancials]);

  // Defaulters List
  const defaultersList = useMemo(() => {
    return studentFinancials
      .filter(s => s.isDefaulter)
      .sort((a, b) => b.dueAmount - a.dueAmount);
  }, [studentFinancials]);

  // Filtered Defaulters for table
  const filteredDefaulters = useMemo(() => {
    const list = defaultersList.filter(d => {
      if (selectedDeptFilter !== "ALL" && d.department !== selectedDeptFilter) return false;
      if (selectedBatchFilter !== "ALL" && d.batch !== selectedBatchFilter) return false;
      if (selectedHeadFilter !== "ALL") {
        const headDue = Number(d.headDues?.[selectedHeadFilter] || 0);
        if (headDue <= 0) return false;
      }
      if (selectedStatusFilter !== "ALL" && d.overdueStatus !== selectedStatusFilter) return false;
      if (selectedRestrictFilter === "restricted" && !d.isRestricted) return false;
      if (selectedRestrictFilter === "active" && d.isRestricted) return false;

      if (searchDefaulter) {
        const q = searchDefaulter.toLowerCase().trim();
        const regStr = (d.regNo || d.examNumber || d.rollNo || d.id || "").toLowerCase();
        const nameStr = (d.name || d.studentName || d.displayName || "").toLowerCase();
        const deptStr = (d.department || "").toLowerCase();
        const batchStr = (d.batch || "").toLowerCase();
        if (!regStr.includes(q) && !nameStr.includes(q) && !deptStr.includes(q) && !batchStr.includes(q)) return false;
      }
      return true;
    });

    if (searchDefaulter.trim()) {
      const q = searchDefaulter.toLowerCase().trim();
      return list.sort((a, b) => {
        const aReg = (a.regNo || a.examNumber || "").toLowerCase();
        const bReg = (b.regNo || b.examNumber || "").toLowerCase();
        const aExact = aReg === q;
        const bExact = bReg === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = aReg.startsWith(q);
        const bStarts = bReg.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return b.dueAmount - a.dueAmount;
      });
    }

    return list;
  }, [defaultersList, selectedDeptFilter, selectedBatchFilter, selectedHeadFilter, selectedStatusFilter, selectedRestrictFilter, searchDefaulter]);

  // Auto-reset page when search query or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchDefaulter, selectedDeptFilter, selectedBatchFilter, selectedHeadFilter, selectedStatusFilter, selectedRestrictFilter, selectedAcademicYear, selectedAccountFilter]);

  // 10 items per page pagination
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredDefaulters.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredDefaulters.length);
  const paginatedDefaulters = useMemo(() => {
    return filteredDefaulters.slice(startIndex, endIndex);
  }, [filteredDefaulters, startIndex, endIndex]);

  // Overall Financial KPIs
  const kpis = useMemo(() => {
    const totalDue = defaultersList.reduce((s, d) => s + d.dueAmount, 0);
    const totalCollected = studentFinancials.reduce((s, d) => s + d.paidAmount, 0);
    const totalTarget = studentFinancials.reduce((s, d) => s + d.targetAmount, 0);
    const criticalCount = defaultersList.filter(d => d.overdueStatus === "critical").length;
    const warningCount = defaultersList.filter(d => d.overdueStatus === "warning").length;
    const restrictedCount = defaultersList.filter(d => d.isRestricted).length;

    const avgDays = defaultersList.length > 0
      ? Math.round(defaultersList.reduce((s, d) => s + d.daysOverdue, 0) / defaultersList.length)
      : 0;

    const recoveryRate = (totalCollected + totalDue) > 0
      ? ((totalCollected / (totalCollected + totalDue)) * 100).toFixed(1)
      : "100.0";

    return {
      activeDefaultersCount: defaultersList.length,
      totalDue,
      totalCollected,
      totalTarget,
      avgDaysOverdue: avgDays,
      criticalCount,
      warningCount,
      restrictedCount,
      recoveryRate
    };
  }, [defaultersList, studentFinancials]);

  // Toggle Restriction Status in Firestore
  const handleToggleRestriction = async (student) => {
    const regKey = (student.regNo || student.id || "").trim().toUpperCase();
    if (!regKey) return;
    const current = restrictionsMap[regKey];
    const newRestrictedState = !current?.restricted;

    try {
      await setDoc(doc(db, "fee_restrictions", regKey), {
        regNo: regKey,
        studentName: student.name || student.studentName || regKey,
        department: student.department || "",
        batch: student.batch || "",
        dueAmount: student.dueAmount || 0,
        restricted: newRestrictedState,
        reason: newRestrictedState ? "Fee Defaulter - Restricted by Finance Office" : "Fee Restriction Lifted",
        updatedAt: serverTimestamp(),
        updatedBy: "Finance Control"
      }, { merge: true });

      showToast(newRestrictedState ? `Restriction placed on ${student.name} (${regKey})` : `Restriction removed for ${student.name}`);
    } catch (err) {
      showToast("Error updating student restriction", "error");
    }
  };

  // Dispatch Fee Reminders
  const handleSendBulkReminder = async () => {
    setSendingReminders(true);
    try {
      const recipients = reminderTarget === "critical"
        ? defaultersList.filter(d => d.overdueStatus === "critical")
        : reminderTarget === "warning"
        ? defaultersList.filter(d => d.overdueStatus === "warning")
        : defaultersList;

      const totalAmt = recipients.reduce((s, r) => s + r.dueAmount, 0);

      await addDoc(collection(db, "fee_reminders"), {
        audience: reminderTarget,
        template: reminderTemplate,
        recipientCount: recipients.length,
        totalDueAmount: totalAmt,
        academicYear: selectedAcademicYear || "ALL",
        sentAt: serverTimestamp(),
        status: "dispatched",
        sender: "Finance Control"
      });

      setShowReminderModal(false);
      showToast(`Fee reminders dispatched to ${recipients.length} students (${formatCurrency(totalAmt)} total due)!`);
    } catch (err) {
      showToast("Error dispatching reminders", "error");
    } finally {
      setSendingReminders(false);
    }
  };

  // Day Book Transactions (Filtered by Date and Account)
  const dayBookTransactions = useMemo(() => {
    return accountFilteredPayments.filter(p => {
      const d = getPaymentDateObj(p);
      if (!d) return false;
      const pDateStr = d.toISOString().split("T")[0];
      if (pDateStr !== dayBookDate) return false;

      if (dayBookSearch) {
        const q = dayBookSearch.toLowerCase().trim();
        const sMatch = (p.studentName || "").toLowerCase().includes(q);
        const rMatch = (p.regNo || p.examNumber || "").toLowerCase().includes(q);
        const hMatch = (p.feeHead || "").toLowerCase().includes(q);
        const recMatch = (p.receiptNo || "").toLowerCase().includes(q);
        if (!sMatch && !rMatch && !hMatch && !recMatch) return false;
      }
      return true;
    }).sort((a, b) => {
      const tA = getPaymentDateObj(a)?.getTime() || 0;
      const tB = getPaymentDateObj(b)?.getTime() || 0;
      return tB - tA;
    });
  }, [accountFilteredPayments, dayBookDate, dayBookSearch]);

  const dayBookTotals = useMemo(() => {
    let cash = 0;
    let upi = 0;
    let gateway = 0;
    let dd = 0;
    let other = 0;
    let total = 0;

    dayBookTransactions.forEach(p => {
      const amt = Number(p.chargedAmount || p.amount || 0);
      total += amt;
      const m = getPaymentMode(p);
      if (m === "cash") cash += amt;
      else if (m === "upi") upi += amt;
      else if (m === "gateway") gateway += amt;
      else if (m === "dd") dd += amt;
      else other += amt;
    });

    return { total, count: dayBookTransactions.length, cash, upi, gateway, dd, other };
  }, [dayBookTransactions]);

  // Export Day Book to Excel
  const handleExportDayBookExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`DayBook_${dayBookDate}`);

    sheet.columns = [
      { header: "#", key: "idx", width: 6 },
      { header: "Time", key: "time", width: 14 },
      { header: "Student Name", key: "name", width: 26 },
      { header: "Register / Exam No", key: "regNo", width: 18 },
      { header: "Department", key: "dept", width: 32 },
      { header: "Receipt #", key: "receiptNo", width: 16 },
      { header: "Fee Head", key: "feeHead", width: 22 },
      { header: "Mode", key: "mode", width: 14 },
      { header: "Ref / Order ID", key: "ref", width: 22 },
      { header: "Amount (₹)", key: "amount", width: 16 }
    ];

    dayBookTransactions.forEach((p, idx) => {
      const d = getPaymentDateObj(p);
      const timeStr = d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
      sheet.addRow({
        idx: idx + 1,
        time: timeStr,
        name: p.studentName || "—",
        regNo: p.examNumber || p.regNo || "—",
        dept: getCanonicalDept(p.department),
        receiptNo: p.receiptNo || "—",
        feeHead: p.feeHead || "Fee",
        mode: getPaymentMode(p).toUpperCase(),
        ref: p.hdfcOrderId || p.orderId || p.transactionId || "—",
        amount: Number(p.chargedAmount || p.amount || 0)
      });
    });

    sheet.addRow({});
    const totalRow = sheet.addRow({
      idx: "",
      time: "",
      name: "TOTAL DAY BOOK COLLECTION",
      regNo: "",
      dept: "",
      receiptNo: "",
      feeHead: "",
      mode: "",
      ref: "",
      amount: dayBookTotals.total
    });
    totalRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CKCET_DayBook_${dayBookDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Defaulters to Excel with Full Fee Head Breakdown & Executive Layout (Account-Reactive)
  const handleExportDefaultersExcel = async () => {
    if (!filteredDefaulters || !filteredDefaulters.length) {
      showToast("No defaulter records to export for selected filters", "error");
      return;
    }

    try {
      showToast("Generating Head-wise Defaulters Excel Report...", "info");

      // Account Scope & Executive Title
      const accountDisplayName = selectedAccountFilter === "76980"
        ? "College Account #76980 Only"
        : selectedAccountFilter === "76983"
          ? "Exam Cell Account #76983 Only"
          : "All Accounts (#76980 College & #76983 COE Consolidated)";

      const reportTitleStr = selectedAccountFilter === "76980"
        ? "STUDENT FEE DEFAULTERS & HEAD-WISE OUTSTANDING DUES REPORT — COLLEGE ACCOUNT #76980"
        : selectedAccountFilter === "76983"
          ? "STUDENT FEE DEFAULTERS & HEAD-WISE OUTSTANDING DUES REPORT — COE ACCOUNT #76983"
          : "STUDENT FEE DEFAULTERS & HEAD-WISE OUTSTANDING DUES REPORT — ALL ACCOUNTS CONSOLIDATED";

      const coeHeadDefs = [
        { key: "ESE registration Fee", colName: "ESE REGISTRATION FEE", width: 22 },
        { key: "Photocopy Fee", colName: "PHOTOCOPY FEE", width: 18 },
        { key: "Revaluation Fee", colName: "REVALUATION FEE", width: 18 },
        { key: "Review Fee", colName: "REVIEW FEE", width: 16 }
      ];

      const canonicalInstOrder = [
        "Tuition Fee",
        "Other Fee",
        "Caution Deposit",
        "Admission Fee",
        "Bus Fee",
        "Previous Year Arrears",
        "Exam Fee",
        "Placement Fee",
        "Hostel Fee"
      ];

      const formatFeeHeadColName = (headName) => {
        const upper = String(headName).trim().toUpperCase();
        if (upper === "TUITION FEE") return "TUITION FEES";
        if (upper === "OTHER FEE") return "OTHER FEES";
        if (upper === "ADMISSION FEE") return "ADMISSION FEES";
        if (upper === "BUS FEE") return "BUS / TRANSPORT FEES";
        if (upper === "PREVIOUS YEAR ARREARS") return "PREVIOUS ARREARS";
        return upper;
      };

      // Determine active institutional heads
      const presentInstHeads = new Set(["Tuition Fee", "Other Fee"]);
      filteredDefaulters.forEach(d => {
        const dues = d.collegeFinancials?.dues || {};
        const targets = d.collegeFinancials?.targets || {};
        Object.keys(dues).forEach(h => {
          if (dues[h] > 0 || (targets[h] && targets[h] > 0)) presentInstHeads.add(h);
        });
      });

      const distinctInstHeads = Array.from(presentInstHeads).sort((a, b) => {
        const ia = canonicalInstOrder.findIndex(c => c.toLowerCase() === a.toLowerCase());
        const ib = canonicalInstOrder.findIndex(c => c.toLowerCase() === b.toLowerCase());
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      });

      // Assemble columns based on selectedAccountFilter
      const baseHeaders = [
        "S.No",
        "Register No",
        "Student Name",
        "Department",
        "Batch",
        "Quota",
        "Category"
      ];
      const baseColWidths = [8, 18, 28, 36, 14, 12, 14];

      const summaryHeaders = [
        "TOTAL TARGET (₹)",
        "TOTAL PAID (₹)",
        "CONCESSION (₹)",
        "NET OUTSTANDING DUE (₹)"
      ];
      const summaryColWidths = [18, 18, 16, 22];

      const escHeaders = [
        "DAYS OVERDUE",
        "AGING STATUS",
        "RESTRICTION"
      ];
      const escColWidths = [14, 16, 16];

      let allHeaders = [];
      let allColWidths = [];

      // Column range indices for super headers
      let coeStartCol = -1;
      let coeEndCol = -1;
      let instStartCol = -1;
      let instEndCol = -1;
      let summaryStartCol = -1;
      let summaryEndCol = -1;
      let escStartCol = -1;
      let escEndCol = -1;

      if (selectedAccountFilter === "76980") {
        // Mode 1: College Account #76980 Only
        const instCols = distinctInstHeads.map(formatFeeHeadColName);
        allHeaders = [...baseHeaders, ...instCols, ...summaryHeaders, ...escHeaders];
        allColWidths = [...baseColWidths, ...distinctInstHeads.map(() => 18), ...summaryColWidths, ...escColWidths];

        instStartCol = 8;
        instEndCol = 7 + distinctInstHeads.length;
        summaryStartCol = instEndCol + 1;
        summaryEndCol = summaryStartCol + 3;
        escStartCol = summaryEndCol + 1;
        escEndCol = allHeaders.length;
      } else if (selectedAccountFilter === "76983") {
        // Mode 2: COE Account #76983 Only
        const coeCols = coeHeadDefs.map(c => c.colName);
        allHeaders = [...baseHeaders, ...coeCols, ...summaryHeaders, ...escHeaders];
        allColWidths = [...baseColWidths, ...coeHeadDefs.map(c => c.width), ...summaryColWidths, ...escColWidths];

        coeStartCol = 8;
        coeEndCol = 11;
        summaryStartCol = 12;
        summaryEndCol = 15;
        escStartCol = 16;
        escEndCol = allHeaders.length;
      } else {
        // Mode 3: Both Accounts Consolidated (ALL)
        const coeCols = coeHeadDefs.map(c => c.colName);
        const instCols = distinctInstHeads.map(formatFeeHeadColName);
        allHeaders = [...baseHeaders, ...coeCols, ...instCols, ...summaryHeaders, ...escHeaders];
        allColWidths = [
          ...baseColWidths,
          ...coeHeadDefs.map(c => c.width),
          ...distinctInstHeads.map(() => 18),
          ...summaryColWidths,
          ...escColWidths
        ];

        coeStartCol = 8;
        coeEndCol = 11;
        instStartCol = 12;
        instEndCol = 11 + distinctInstHeads.length;
        summaryStartCol = instEndCol + 1;
        summaryEndCol = summaryStartCol + 3;
        escStartCol = summaryEndCol + 1;
        escEndCol = allHeaders.length;
      }

      const totalCols = allHeaders.length;

      const grandTotalDue = filteredDefaulters.reduce((acc, d) => acc + (Number(d.dueAmount) || 0), 0);
      const grandTotalTarget = filteredDefaulters.reduce((acc, d) => acc + (Number(d.targetAmount) || 0), 0);
      const grandTotalPaid = filteredDefaulters.reduce((acc, d) => acc + (Number(d.paidAmount) || 0), 0);
      const grandTotalConcession = filteredDefaulters.reduce((acc, d) => acc + (Number(d.concessionAmount) || 0), 0);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "CKCET Autonomous ERP";
      workbook.lastModifiedBy = "CKCET Accounts & Finance / Fee Control";
      workbook.created = new Date();
      workbook.modified = new Date();

      const cleanSheetName = selectedAccountFilter === "76980" ? "College_Defaulters" : (selectedAccountFilter === "76983" ? "COE_Defaulters" : "All_Defaulters");
      const sheet = workbook.addWorksheet(cleanSheetName, {
        views: [
          {
            state: "frozen",
            xSplit: 0,
            ySplit: 9, // Freeze rows 1-9 so table header stays pinned during scroll
            activeCell: "A10",
            showGridLines: true
          }
        ],
        pageSetup: {
          paperSize: 9, // A4
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });

      // Apply column widths
      allColWidths.forEach((w, idx) => {
        sheet.getColumn(idx + 1).width = w;
      });

      // Rows 1-3: Institution Header & Logo
      sheet.getRow(1).height = 22;
      sheet.getRow(2).height = 22;
      sheet.getRow(3).height = 18;
      for (let r = 1; r <= 3; r++) {
        for (let c = 1; c <= totalCols; c++) {
          sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        }
      }

      // Mathematical centering for logo
      const pxPerChar = 7.8;
      const totalSheetWidthPx = allColWidths.reduce((sum, w) => sum + (w * pxPerChar), 0);
      const logoImgWidth = 550;
      const logoImgHeight = 58;
      const targetStartPx = Math.max(0, (totalSheetWidthPx - logoImgWidth) / 2);

      let accumPx = 0;
      let startColIndex = 0;
      for (let c = 0; c < allColWidths.length; c++) {
        const colPx = allColWidths[c] * pxPerChar;
        if (accumPx + colPx >= targetStartPx) {
          const remainder = targetStartPx - accumPx;
          startColIndex = c + (remainder / colPx);
          break;
        }
        accumPx += colPx;
      }

      let hasLogo = false;
      try {
        const resp = await fetch("/logo.png");
        if (resp.ok) {
          const blob = await resp.blob();
          const base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (base64Data) {
            const imageId = workbook.addImage({
              base64: base64Data,
              extension: "png"
            });
            sheet.addImage(imageId, {
              tl: { col: startColIndex, row: 0.1 },
              ext: { width: logoImgWidth, height: logoImgHeight }
            });
            hasLogo = true;
          }
        }
      } catch (err) {
        console.warn("Could not load /logo.png for Excel export:", err);
      }

      if (!hasLogo) {
        sheet.mergeCells(1, 1, 1, totalCols);
        const colNameCell = sheet.getCell(1, 1);
        colNameCell.value = "C.K. COLLEGE OF ENGINEERING & TECHNOLOGY";
        colNameCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF120C7A" } };
        colNameCell.alignment = { horizontal: "center", vertical: "middle" };

        sheet.mergeCells(2, 1, 2, totalCols);
        const colAffCell = sheet.getCell(2, 1);
        colAffCell.value = "(An Autonomous Institution | Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai)";
        colAffCell.font = { name: "Segoe UI", size: 9, bold: false, color: { argb: "FF475569" } };
        colAffCell.alignment = { horizontal: "center", vertical: "middle" };

        sheet.mergeCells(3, 1, 3, totalCols);
        const colAddrCell = sheet.getCell(3, 1);
        colAddrCell.value = "Jayaram Nagar, Chellangkuppam, Cuddalore, Tamil Nadu 607003";
        colAddrCell.font = { name: "Segoe UI", size: 8.5, italic: true, color: { argb: "FF64748B" } };
        colAddrCell.alignment = { horizontal: "center", vertical: "middle" };
      }

      // Row 4: Executive Report Title Bar
      sheet.getRow(4).height = 28;
      sheet.mergeCells(4, 1, 4, totalCols);
      const titleCell = sheet.getCell(4, 1);
      titleCell.value = reportTitleStr;
      titleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF120C7A" } };

      // Rows 5 & 6: Executive Metadata Summary Card
      sheet.getRow(5).height = 20;
      sheet.getRow(6).height = 20;

      const setMetaRow = (rNum, cells) => {
        cells.forEach(({ sCol, eCol, label, val, isHighlight, isBold }) => {
          if (eCol > sCol) sheet.mergeCells(rNum, sCol, rNum, eCol);
          const cell = sheet.getCell(rNum, sCol);
          cell.value = `${label ? label + " " : ""}${val || "—"}`;
          cell.font = {
            name: "Segoe UI",
            size: isHighlight ? 10 : 9,
            bold: Boolean(label || isBold || isHighlight),
            color: { argb: isHighlight ? "FF065F46" : (label ? "FF334155" : "FF0F172A") }
          };
          cell.alignment = { horizontal: "left", vertical: "middle" };
        });
        for (let c = 1; c <= totalCols; c++) {
          sheet.getCell(rNum, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      };

      const now = new Date();
      const generatedTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

      setMetaRow(5, [
        { sCol: 1, eCol: 4, label: "Account Scope :", val: accountDisplayName, isBold: true },
        { sCol: 5, eCol: 7, label: "Academic Year :", val: selectedAcademicYear || "All Academic Years" },
        { sCol: 8, eCol: 11, label: "Department Scope :", val: selectedDeptFilter === "ALL" ? "All Departments" : selectedDeptFilter },
        { sCol: 12, eCol: totalCols, label: "Batch Scope :", val: selectedBatchFilter === "ALL" ? "All Batches" : selectedBatchFilter }
      ]);

      setMetaRow(6, [
        { sCol: 1, eCol: 4, label: "Generated On :", val: generatedTimestamp },
        { sCol: 5, eCol: 7, label: "Aging Filter :", val: selectedStatusFilter === "ALL" ? "All Defaulters" : selectedStatusFilter.toUpperCase() },
        { sCol: 8, eCol: 11, label: "Total Defaulters :", val: `${filteredDefaulters.length} Candidates Enrolled` },
        { sCol: 12, eCol: totalCols, label: "Total Outstanding Due :", val: `₹ ${grandTotalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, isHighlight: true }
      ]);

      for (let c = 1; c <= totalCols; c++) {
        sheet.getCell(5, c).border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: c === 1 ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined,
          right: c === totalCols ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined
        };
        sheet.getCell(6, c).border = {
          bottom: { style: "medium", color: { argb: "FF94A3B8" } },
          left: c === 1 ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined,
          right: c === totalCols ? { style: "thin", color: { argb: "FFCBD5E1" } } : undefined
        };
      }

      // Row 7: Blank spacer row
      sheet.getRow(7).height = 10;

      // Row 8: Tier 1 Super Section Headers
      const row8 = sheet.getRow(8);
      row8.height = 26;

      // Section 1: Candidate & Enrolment Details (Cols 1-7)
      sheet.mergeCells(8, 1, 8, 7);
      const candGrpCell = sheet.getCell(8, 1);
      candGrpCell.value = "STUDENT & ENROLMENT DETAILS";
      candGrpCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      candGrpCell.alignment = { horizontal: "center", vertical: "middle" };
      for (let c = 1; c <= 7; c++) {
        const cell = sheet.getCell(8, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.border = {
          top: { style: "thin", color: { argb: "FF475569" } },
          left: { style: "thin", color: { argb: "FF475569" } },
          bottom: { style: "thin", color: { argb: "FF475569" } },
          right: { style: "thin", color: { argb: "FF475569" } }
        };
      }

      // COE Section (if COE or ALL)
      if (coeStartCol > 0 && coeEndCol >= coeStartCol) {
        sheet.mergeCells(8, coeStartCol, 8, coeEndCol);
        const coeGrpCell = sheet.getCell(8, coeStartCol);
        coeGrpCell.value = "COE BREAKUP (A/C #76983 - EXAM CELL)";
        coeGrpCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
        coeGrpCell.alignment = { horizontal: "center", vertical: "middle" };
        for (let c = coeStartCol; c <= coeEndCol; c++) {
          const cell = sheet.getCell(8, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } }; // Deep Indigo
          cell.border = {
            top: { style: "thin", color: { argb: "FF4338CA" } },
            left: { style: "thin", color: { argb: "FF4338CA" } },
            bottom: { style: "thin", color: { argb: "FF4338CA" } },
            right: { style: "thin", color: { argb: "FF4338CA" } }
          };
        }
      }

      // Institutional Section (if College or ALL)
      if (instStartCol > 0 && instEndCol >= instStartCol) {
        sheet.mergeCells(8, instStartCol, 8, instEndCol);
        const instGrpCell = sheet.getCell(8, instStartCol);
        instGrpCell.value = "INSTITUTIONAL HEADS BREAKUP (A/C #76980 - COLLEGE)";
        instGrpCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
        instGrpCell.alignment = { horizontal: "center", vertical: "middle" };
        for (let c = instStartCol; c <= instEndCol; c++) {
          const cell = sheet.getCell(8, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } }; // Deep Blue
          cell.border = {
            top: { style: "thin", color: { argb: "FF2563EB" } },
            left: { style: "thin", color: { argb: "FF2563EB" } },
            bottom: { style: "thin", color: { argb: "FF2563EB" } },
            right: { style: "thin", color: { argb: "FF2563EB" } }
          };
        }
      }

      // Financial Summary Section
      sheet.mergeCells(8, summaryStartCol, 8, summaryEndCol);
      const finGrpCell = sheet.getCell(8, summaryStartCol);
      finGrpCell.value = "FINANCIAL RECONCILIATION SUMMARY (₹)";
      finGrpCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      finGrpCell.alignment = { horizontal: "center", vertical: "middle" };
      for (let c = summaryStartCol; c <= summaryEndCol; c++) {
        const cell = sheet.getCell(8, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } }; // Deep Emerald
        cell.border = {
          top: { style: "thin", color: { argb: "FF047857" } },
          left: { style: "thin", color: { argb: "FF047857" } },
          bottom: { style: "thin", color: { argb: "FF047857" } },
          right: { style: "thin", color: { argb: "FF047857" } }
        };
      }

      // Escalation & Aging Section
      sheet.mergeCells(8, escStartCol, 8, escEndCol);
      const escGrpCell = sheet.getCell(8, escStartCol);
      escGrpCell.value = "ESCALATION & AGING STATUS";
      escGrpCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      escGrpCell.alignment = { horizontal: "center", vertical: "middle" };
      for (let c = escStartCol; c <= escEndCol; c++) {
        const cell = sheet.getCell(8, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }; // Slate 700
        cell.border = {
          top: { style: "thin", color: { argb: "FF475569" } },
          left: { style: "thin", color: { argb: "FF475569" } },
          bottom: { style: "thin", color: { argb: "FF475569" } },
          right: { style: "thin", color: { argb: "FF475569" } }
        };
      }

      // Row 9: Tier 2 Column Sub-headers
      const row9 = sheet.getRow(9);
      row9.height = 28;

      allHeaders.forEach((h, idx) => {
        const colNum = idx + 1;
        const cell = row9.getCell(colNum);
        cell.value = h;
        cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFFFF" } };

        const isCenter = colNum === 1 || colNum === 2 || colNum === 5 || colNum === 6 || colNum === 7 || colNum >= escStartCol;
        const isNum = (colNum >= 8 && colNum <= summaryEndCol);

        cell.alignment = {
          vertical: "middle",
          horizontal: isCenter ? "center" : (isNum ? "right" : "left"),
          wrapText: true
        };

        if (colNum <= 7) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        } else if (coeStartCol > 0 && colNum >= coeStartCol && colNum <= coeEndCol) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } }; // Indigo 700
        } else if (instStartCol > 0 && colNum >= instStartCol && colNum <= instEndCol) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; // Blue 600
        } else if (colNum >= summaryStartCol && colNum <= summaryEndCol) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } }; // Emerald 700
        } else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
        }

        cell.border = {
          top: { style: "thin", color: { argb: "FF64748B" } },
          left: { style: "thin", color: { argb: "FF64748B" } },
          bottom: { style: "medium", color: { argb: "FF0F172A" } },
          right: { style: "thin", color: { argb: "FF64748B" } }
        };
      });

      // Data Rows (Row 10 onwards) with Zebra Striping
      const thinBorder = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      const coeDueSums = {};
      coeHeadDefs.forEach(c => { coeDueSums[c.key] = 0; });
      const instDueSums = {};
      distinctInstHeads.forEach(h => { instDueSums[h] = 0; });

      filteredDefaulters.forEach((d, idx) => {
        const rowNum = 10 + idx;
        const row = sheet.getRow(rowNum);
        row.height = 22;

        const isEven = idx % 2 === 0;
        const rowBgColor = isEven ? "FFFFFFFF" : "FFF8FAFC";
        const rowFill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBgColor } };

        // Col 1: S.No
        const c1 = row.getCell(1);
        c1.value = idx + 1;
        c1.alignment = { horizontal: "center", vertical: "middle" };
        c1.font = { name: "Segoe UI", size: 9, color: { argb: "FF64748B" } };

        // Col 2: Register No
        const c2 = row.getCell(2);
        c2.value = d.regNo || "—";
        c2.alignment = { horizontal: "center", vertical: "middle" };
        c2.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };

        // Col 3: Student Name
        const sName = (d.name || d.studentName || d.displayName || "Student").toString().trim().toUpperCase();
        const c3 = row.getCell(3);
        c3.value = sName;
        c3.alignment = { horizontal: "left", vertical: "middle" };
        c3.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF1E293B" } };

        // Col 4: Department
        const c4 = row.getCell(4);
        c4.value = d.department || "—";
        c4.alignment = { horizontal: "left", vertical: "middle" };
        c4.font = { name: "Segoe UI", size: 9, color: { argb: "FF1E293B" } };

        // Col 5: Batch
        const c5 = row.getCell(5);
        c5.value = d.batch || "—";
        c5.alignment = { horizontal: "center", vertical: "middle" };
        c5.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

        // Col 6: Quota
        const c6 = row.getCell(6);
        c6.value = d.quota || "GQ";
        c6.alignment = { horizontal: "center", vertical: "middle" };
        c6.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

        // Col 7: Category
        const c7 = row.getCell(7);
        c7.value = d.category || "Regular";
        c7.alignment = { horizontal: "center", vertical: "middle" };
        c7.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

        // COE Breakup Cells
        if (coeStartCol > 0) {
          coeHeadDefs.forEach((cDef, cIdx) => {
            const colIdx = coeStartCol + cIdx;
            const dueVal = Number(d.coeFinancials?.dues?.[cDef.key] || 0);
            coeDueSums[cDef.key] = (coeDueSums[cDef.key] || 0) + dueVal;

            const cell = row.getCell(colIdx);
            cell.value = dueVal;
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right", vertical: "middle" };
            if (dueVal > 0) {
              cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF1E1B4B" } };
            } else {
              cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
            }
          });
        }

        // Institutional Heads Breakup Cells
        if (instStartCol > 0) {
          distinctInstHeads.forEach((h, hIdx) => {
            const colIdx = instStartCol + hIdx;
            const dueVal = Number(d.collegeFinancials?.dues?.[h] || 0);
            instDueSums[h] = (instDueSums[h] || 0) + dueVal;

            const cell = row.getCell(colIdx);
            cell.value = dueVal;
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right", vertical: "middle" };
            if (dueVal > 0) {
              cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
            } else {
              cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
            }
          });
        }

        // Summary Cols: Target, Paid, Concession, Net Due
        const cTgt = row.getCell(summaryStartCol);
        cTgt.value = Number(d.targetAmount || 0);
        cTgt.numFmt = "#,##0.00";
        cTgt.alignment = { horizontal: "right", vertical: "middle" };
        cTgt.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };

        const cPaid = row.getCell(summaryStartCol + 1);
        cPaid.value = Number(d.paidAmount || 0);
        cPaid.numFmt = "#,##0.00";
        cPaid.alignment = { horizontal: "right", vertical: "middle" };
        cPaid.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF065F46" } };

        const cConc = row.getCell(summaryStartCol + 2);
        cConc.value = Number(d.concessionAmount || 0);
        cConc.numFmt = "#,##0.00";
        cConc.alignment = { horizontal: "right", vertical: "middle" };
        cConc.font = { name: "Segoe UI", size: 9, color: { argb: "FF475569" } };

        const cDue = row.getCell(summaryStartCol + 3);
        cDue.value = Number(d.dueAmount || 0);
        cDue.numFmt = "#,##0.00";
        cDue.alignment = { horizontal: "right", vertical: "middle" };
        cDue.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF991B1B" } };

        // Escalation Cols: Days Overdue, Aging Status, Restriction Status
        const cDays = row.getCell(escStartCol);
        cDays.value = `${d.daysOverdue || 0} days`;
        cDays.alignment = { horizontal: "center", vertical: "middle" };
        cDays.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };

        const cStatus = row.getCell(escStartCol + 1);
        const stUpper = (d.overdueStatus || "current").toUpperCase();
        cStatus.value = stUpper;
        cStatus.alignment = { horizontal: "center", vertical: "middle" };
        const statusColor = stUpper === "CRITICAL" ? "FFDC2626" : (stUpper === "WARNING" ? "FFD97706" : "FF2563EB");
        cStatus.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: statusColor } };

        const cRestr = row.getCell(escStartCol + 2);
        cRestr.value = d.isRestricted ? "RESTRICTED" : "ACTIVE";
        cRestr.alignment = { horizontal: "center", vertical: "middle" };
        cRestr.font = {
          name: "Segoe UI",
          size: 9,
          bold: true,
          color: { argb: d.isRestricted ? "FFDC2626" : "FF16A34A" }
        };

        for (let c = 1; c <= totalCols; c++) {
          const cell = row.getCell(c);
          cell.fill = rowFill;
          cell.border = thinBorder;
        }
      });

      // Bottom Summary / Grand Total Row
      const totalRowNum = 10 + filteredDefaulters.length;
      const totalRow = sheet.getRow(totalRowNum);
      totalRow.height = 26;

      sheet.mergeCells(totalRowNum, 1, totalRowNum, 7);
      const totLabelCell = sheet.getCell(totalRowNum, 1);
      totLabelCell.value = "TOTAL OUTSTANDING DUES SUMMARY";
      totLabelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      totLabelCell.alignment = { horizontal: "center", vertical: "middle" };

      for (let c = 1; c <= 7; c++) {
        sheet.getCell(totalRowNum, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      }

      // COE Head Totals
      if (coeStartCol > 0) {
        coeHeadDefs.forEach((cDef, cIdx) => {
          const colIdx = coeStartCol + cIdx;
          const cell = totalRow.getCell(colIdx);
          cell.value = coeDueSums[cDef.key] || 0;
          cell.numFmt = "#,##0.00";
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } }; // Deep Indigo
        });
      }

      // Institutional Head Totals
      if (instStartCol > 0) {
        distinctInstHeads.forEach((h, hIdx) => {
          const colIdx = instStartCol + hIdx;
          const cell = totalRow.getCell(colIdx);
          cell.value = instDueSums[h] || 0;
          cell.numFmt = "#,##0.00";
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } }; // Deep Blue
        });
      }

      // Financial totals
      const tTgt = totalRow.getCell(summaryStartCol);
      tTgt.value = grandTotalTarget;
      tTgt.numFmt = "#,##0.00";
      tTgt.alignment = { horizontal: "right", vertical: "middle" };
      tTgt.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      tTgt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };

      const tPaid = totalRow.getCell(summaryStartCol + 1);
      tPaid.value = grandTotalPaid;
      tPaid.numFmt = "#,##0.00";
      tPaid.alignment = { horizontal: "right", vertical: "middle" };
      tPaid.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      tPaid.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };

      const tConc = totalRow.getCell(summaryStartCol + 2);
      tConc.value = grandTotalConcession;
      tConc.numFmt = "#,##0.00";
      tConc.alignment = { horizontal: "right", vertical: "middle" };
      tConc.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      tConc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };

      const tDue = totalRow.getCell(summaryStartCol + 3);
      tDue.value = grandTotalDue;
      tDue.numFmt = "#,##0.00";
      tDue.alignment = { horizontal: "right", vertical: "middle" };
      tDue.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
      tDue.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B1B" } }; // Deep Red

      // Status totals
      for (let c = escStartCol; c <= escEndCol; c++) {
        const cell = totalRow.getCell(c);
        cell.value = "—";
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      }

      // Total row borders
      for (let c = 1; c <= totalCols; c++) {
        totalRow.getCell(c).border = {
          top: { style: "medium", color: { argb: "FF0F172A" } },
          bottom: { style: "double", color: { argb: "FF0F172A" } },
          left: { style: "thin", color: { argb: "FF475569" } },
          right: { style: "thin", color: { argb: "FF475569" } }
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanAy = (selectedAcademicYear || "ALL").replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileAccountTag = selectedAccountFilter === "76980" ? "College_Account_76980" : (selectedAccountFilter === "76983" ? "COE_Account_76983" : "Consolidated_Both_Accounts");
      a.download = `CKCET_Defaulters_${fileAccountTag}_AY${cleanAy}_${now.toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`Exported ${filteredDefaulters.length} Defaulters (${accountDisplayName})`, "success");
    } catch (err) {
      console.error("Defaulters Excel Export error:", err);
      showToast("Failed to export defaulters Excel report", "error");
    }
  };

  // Export NIRF Financial DCS
  const handleExportNirfExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("NIRF_Finance_DCS");

    sheet.columns = [
      { header: "Parameter / Metric", key: "metric", width: 45 },
      { header: "Value (AY " + (selectedAcademicYear || "Current") + ")", key: "value", width: 28 },
      { header: "Unit / Remarks", key: "remarks", width: 30 }
    ];

    const approvedConcessions = concessions.filter(c => c.status === "approved");
    const totalScholarship = approvedConcessions.reduce((s, c) => s + Number(c.amount || 0), 0);
    const totalPaidStudents = new Set(verifiedPayments.map(p => (p.examNumber || p.regNo || "").trim().toUpperCase()).filter(Boolean)).size;

    sheet.addRow({ metric: "Total Annual Fee Revenue (Reconciled)", value: formatCurrency(kpis.totalCollected), remarks: "Tuition + Other Institutional Fees" });
    sheet.addRow({ metric: "Total Fee Concession / Scholarship Disbursed", value: formatCurrency(totalScholarship), remarks: `${approvedConcessions.length} verified beneficiaries` });
    const targetEnrolledCount = currentStudyingStudents.length > 0 ? currentStudyingStudents.length : students.length;
    sheet.addRow({ metric: "Total Number of Enrolled Students", value: targetEnrolledCount, remarks: "Official uploaded namelists (Currently Studying Active Batches)" });
    sheet.addRow({ metric: "Number of Students Paid Fees", value: totalPaidStudents, remarks: "Reconciled against verified receipts" });
    sheet.addRow({ metric: "Total Outstanding Defaulters", value: kpis.activeDefaultersCount, remarks: "Active fee balance > ₹0" });
    sheet.addRow({ metric: "Total Outstanding Due", value: formatCurrency(kpis.totalDue), remarks: "Uncollected revenue" });
    sheet.addRow({ metric: "Fee Recovery Rate / Collection Efficiency", value: `${kpis.recoveryRate}%`, remarks: "Collected vs Accrued Revenue" });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NIRF_DCS_Financial_Report_${selectedAcademicYear || "Current"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Branch-wise summary data
  const branchSummary = useMemo(() => {
    const map = {};
    studentFinancials.forEach(s => {
      const dept = s.department || "General";
      if (!map[dept]) {
        map[dept] = { dept, enrolled: 0, target: 0, collected: 0, due: 0, defaulters: 0 };
      }
      map[dept].enrolled += 1;
      map[dept].target += s.targetAmount;
      map[dept].collected += s.paidAmount;
      map[dept].due += s.dueAmount;
      if (s.isDefaulter) map[dept].defaulters += 1;
    });

    return Object.values(map).sort((a, b) => b.due - a.due);
  }, [studentFinancials]);

  // Head-wise summary data
  const headSummary = useMemo(() => {
    const map = {};
    accountFilteredPayments.forEach(p => {
      const amt = Number(p.chargedAmount || p.amount || 0);
      if (amt <= 0) return;
      const head = (p.feeHead || "Other Fee").trim();
      if (!map[head]) map[head] = { head, amount: 0, count: 0 };
      map[head].amount += amt;
      map[head].count += 1;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [accountFilteredPayments]);

  // Payment Mode breakdown
  const modeBreakdown = useMemo(() => {
    const map = {};
    let total = 0;
    accountFilteredPayments.forEach(p => {
      const amt = Number(p.chargedAmount || p.amount || 0);
      if (amt <= 0) return;
      const mode = getPaymentMode(p);
      if (!map[mode]) map[mode] = { mode, amount: 0, count: 0 };
      map[mode].amount += amt;
      map[mode].count += 1;
      total += amt;
    });
    return Object.values(map).map(m => ({
      ...m,
      pct: total > 0 ? ((m.amount / total) * 100).toFixed(1) : "0.0"
    })).sort((a, b) => b.amount - a.amount);
  }, [accountFilteredPayments]);

  // Monthly 12-Month Trend
  const monthlyTrendData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        year: d.getFullYear(),
        monthIdx: d.getMonth(),
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        total: 0,
        count: 0
      };
    });

    accountFilteredPayments.forEach(p => {
      const pDate = getPaymentDateObj(p);
      if (!pDate) return;
      const amt = Number(p.chargedAmount || p.amount || 0);
      const target = months.find(m => m.year === pDate.getFullYear() && m.monthIdx === pDate.getMonth());
      if (target) {
        target.total += amt;
        target.count += 1;
      }
    });

    return months;
  }, [accountFilteredPayments]);

  const maxMonthAmt = Math.max(10000, ...monthlyTrendData.map(m => m.total));

  return (
    <Layout title="Fee Control">
      {/* Toast Alert */}
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          toast.type === "success" 
            ? "bg-emerald-950 text-emerald-100 border border-emerald-700" 
            : "bg-red-950 text-red-100 border border-red-700"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={18} className="text-emerald-400" /> : <AlertTriangle size={18} className="text-red-400" />}
          <span className="font-bold text-xs">{toast.message}</span>
        </div>
      )}

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        {/* Top Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              <ShieldAlert size={14} className="text-blue-600" /> 
              <span>Finance Office</span> 
              <span className="text-zinc-300">/</span> 
              <span>Fee Control & Escalation</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Fee Control</h2>
              <span className="bg-blue-50 text-[#120c7a] font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-blue-200">
                Live Reconciled
              </span>
            </div>
          </div>

          {/* Academic Year Selector & Top Tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl text-xs font-bold">
              <CalendarDays size={14} className="text-zinc-400" />
              <select
                value={selectedAcademicYear}
                onChange={e => setSelectedAcademicYear(e.target.value)}
                className="bg-transparent outline-none font-bold text-zinc-700 cursor-pointer"
              >
                <option value="ALL">All Academic Years</option>
                {academicYears.map(ay => (
                  <option key={ay} value={ay}>AY {ay}</option>
                ))}
              </select>
            </div>

            <div className="flex bg-zinc-100/90 p-1 rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setTab("defaulters")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  tab === "defaulters" 
                    ? "bg-white text-[#120c7a] shadow-sm" 
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <ShieldAlert size={14} /> Defaulters & Alerts
                {kpis.activeDefaultersCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-red-100 text-red-700 text-[9px] rounded-full font-black">
                    {kpis.activeDefaultersCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setTab("reports")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  tab === "reports" 
                    ? "bg-white text-[#120c7a] shadow-sm" 
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <FileSpreadsheet size={14} /> Reports
              </button>

              <button
                type="button"
                onClick={() => setTab("analytics")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  tab === "analytics" 
                    ? "bg-white text-[#120c7a] shadow-sm" 
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <TrendingUp size={14} /> Analytics
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* BANK ACCOUNT SELECTOR STRIP (Both, College #76980, COE #76983) */}
        {/* ============================================================ */}
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-5 md:p-6 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#120c7a] flex items-center justify-center">
                <Landmark size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-800">Institutional Bank Accounts</h3>
                <p className="text-[10px] text-zinc-400 font-medium">
                  Select an account to isolate Defaulters, Head-wise Breakup, KPIs, Day Book, and Due Reports
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedAccountFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => { setSelectedAccountFilter("ALL"); setSelectedHeadFilter("ALL"); }}
                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 transition-all"
                  title="Clear account filter and show heads from both accounts"
                >
                  <span>Show Both Accounts</span>
                  <X size={12} />
                </button>
              )}
              <span className="text-[11px] font-bold text-zinc-500">Active View:</span>
              <span className="text-xs font-black px-2.5 py-1 rounded-lg border shadow-xs bg-slate-100 text-slate-800 border-slate-200">
                {selectedAccountFilter === "76980" ? "College Account #76980" : selectedAccountFilter === "76983" ? "COE Account #76983" : "Both Accounts (Consolidated)"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Both Accounts Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => { setSelectedAccountFilter("ALL"); setSelectedHeadFilter("ALL"); }}
              className={`rounded-2xl p-4 transition-all cursor-pointer relative group text-left ${
                selectedAccountFilter === "ALL"
                  ? "bg-gradient-to-br from-indigo-100/90 via-slate-50 to-white border-2 border-[#120c7a] ring-4 ring-indigo-500/20 shadow-lg"
                  : "bg-gradient-to-br from-slate-50/70 to-white border border-slate-200 hover:border-indigo-300 hover:shadow-md opacity-85 hover:opacity-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                    selectedAccountFilter === "ALL" ? "bg-[#120c7a] text-white scale-105" : "bg-slate-700 text-white"
                  }`}>
                    <Layers size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-black text-sm text-[#120c7a]">Both Accounts</h4>
                      <span className="bg-indigo-100 text-indigo-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Consolidated
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">College Operating (#76980) + Autonomous COE (#76983)</p>
                  </div>
                </div>
                {selectedAccountFilter === "ALL" && (
                  <span className="flex items-center gap-1 bg-[#120c7a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                    <CheckCircle2 size={10} /> Active
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Total Outstanding Due</span>
                  <p className="text-xl font-black text-red-600">{formatCurrency(accountTotals.allDue)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Realized / Paid</span>
                  <p className="text-sm font-black text-emerald-600">{formatCurrency(accountTotals.allPaid)}</p>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-500 font-semibold">
                <span>{accountTotals.allDefaulters} Defaulters</span>
                <span className="text-emerald-700 font-bold">{accountTotals.allRecoveryRate}% Recovery</span>
              </div>
            </div>

            {/* 2. College Account #76980 Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => { setSelectedAccountFilter("76980"); setSelectedHeadFilter("ALL"); }}
              className={`rounded-2xl p-4 transition-all cursor-pointer relative group text-left ${
                selectedAccountFilter === "76980"
                  ? "bg-gradient-to-br from-blue-100/90 via-indigo-50 to-white border-2 border-[#120c7a] ring-4 ring-blue-500/20 shadow-lg"
                  : "bg-gradient-to-br from-blue-50/40 to-white border border-blue-100 hover:border-blue-300 hover:shadow-md opacity-85 hover:opacity-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                    selectedAccountFilter === "76980" ? "bg-[#120c7a] text-white scale-105" : "bg-blue-600 text-white"
                  }`}>
                    <Building2 size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-black text-sm text-[#120c7a]">College Account #76980</h4>
                      <span className="bg-blue-100 text-[#120c7a] text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Operating A/C
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Tuition, Other, Caution, Admission & Bus Fees</p>
                  </div>
                </div>
                {selectedAccountFilter === "76980" && (
                  <span className="flex items-center gap-1 bg-[#120c7a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                    <CheckCircle2 size={10} /> Active
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Total Outstanding Due</span>
                  <p className="text-xl font-black text-red-600">{formatCurrency(accountTotals.collegeDue)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Realized / Paid</span>
                  <p className="text-sm font-black text-emerald-600">{formatCurrency(accountTotals.collegePaid)}</p>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-500 font-semibold">
                <span>{accountTotals.collegeDefaulters} Defaulters</span>
                <span className="text-blue-700 font-bold">{accountTotals.collegeRecoveryRate}% Recovery</span>
              </div>
            </div>

            {/* 3. Exam Cell / COE Account #76983 Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => { setSelectedAccountFilter("76983"); setSelectedHeadFilter("ALL"); }}
              className={`rounded-2xl p-4 transition-all cursor-pointer relative group text-left ${
                selectedAccountFilter === "76983"
                  ? "bg-gradient-to-br from-purple-100/90 via-violet-50 to-white border-2 border-purple-800 ring-4 ring-purple-500/20 shadow-lg"
                  : "bg-gradient-to-br from-purple-50/40 to-white border border-purple-100 hover:border-purple-300 hover:shadow-md opacity-85 hover:opacity-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                    selectedAccountFilter === "76983" ? "bg-purple-800 text-white scale-105" : "bg-purple-700 text-white"
                  }`}>
                    <Landmark size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-black text-sm text-purple-900">Exam Cell / COE #76983</h4>
                      <span className="bg-purple-100 text-purple-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Autonomous COE
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">ESE Registration, Photocopy, Reval & Review Fees</p>
                  </div>
                </div>
                {selectedAccountFilter === "76983" && (
                  <span className="flex items-center gap-1 bg-purple-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                    <CheckCircle2 size={10} /> Active
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Total Outstanding Due</span>
                  <p className="text-xl font-black text-red-600">{formatCurrency(accountTotals.coeDue)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Realized / Paid</span>
                  <p className="text-sm font-black text-emerald-600">{formatCurrency(accountTotals.coePaid)}</p>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-500 font-semibold">
                <span>{accountTotals.coeDefaulters} Defaulters</span>
                <span className="text-purple-700 font-bold">{accountTotals.coeRecoveryRate}% Recovery</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: DEFAULTERS & ALERTS                                  */}
        {/* ============================================================ */}
        {tab === "defaulters" && (
          <div className="space-y-4">
            {/* KPI Cards Strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Active Defaulters</span>
                  <Users size={15} className="text-zinc-400" />
                </div>
                <p className="text-2xl font-black text-red-600">{kpis.activeDefaultersCount}</p>
                <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Students with dues &gt; ₹0</p>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Total Due</span>
                  <IndianRupee size={15} className="text-zinc-400" />
                </div>
                <p className="text-2xl font-black text-zinc-900">{formatCurrency(kpis.totalDue)}</p>
                <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Outstanding balance</p>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Avg Days Overdue</span>
                  <Clock size={15} className="text-amber-500" />
                </div>
                <p className="text-2xl font-black text-amber-600">{kpis.avgDaysOverdue} days</p>
                <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Since term opening</p>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Critical (30d+)</span>
                  <AlertTriangle size={15} className="text-red-500" />
                </div>
                <p className="text-2xl font-black text-red-700">{kpis.criticalCount}</p>
                <p className="text-[10px] text-red-500/80 font-bold mt-0.5">Immediate notice required</p>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Recovery Rate</span>
                  <TrendingUp size={15} className="text-emerald-500" />
                </div>
                <p className="text-2xl font-black text-emerald-600">{kpis.recoveryRate}%</p>
                <p className="text-[10px] text-emerald-600/80 font-bold mt-0.5">Collected vs accrued</p>
              </div>
            </div>

            {/* Defaulter List Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              {/* Header + Action Buttons */}
              <div className="px-5 py-3.5 border-b border-zinc-200 bg-zinc-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className="text-red-500" />
                  <h3 className="font-bold text-xs text-zinc-800">Defaulter Escalation Registry</h3>
                  <span className="text-[10px] font-black bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded-full">
                    Page {safeCurrentPage} of {totalPages} ({filteredDefaulters.length} students)
                  </span>
                  {kpis.restrictedCount > 0 && (
                    <span className="text-[10px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock size={10} /> {kpis.restrictedCount} Blocked
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportDefaultersExcel}
                    className="px-3 py-1.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Download size={13} /> Export Excel
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowReminderModal(true)}
                    className="px-3.5 py-1.5 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Bell size={13} /> Send Reminder
                  </button>
                </div>
              </div>

              {/* Filter Strip */}
              <div className="p-3 border-b border-zinc-100 bg-white grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5">
                {/* Search Input */}
                <div className="relative md:col-span-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchDefaulter}
                    onChange={e => setSearchDefaulter(e.target.value)}
                    placeholder="Search by student name or register no..."
                    className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#120c7a] outline-none transition-all"
                  />
                  {searchDefaulter && (
                    <button onClick={() => setSearchDefaulter("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Department Filter */}
                <select
                  value={selectedDeptFilter}
                  onChange={e => setSelectedDeptFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  {allDepartments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                {/* Batch Filter */}
                <select
                  value={selectedBatchFilter}
                  onChange={e => setSelectedBatchFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Batches</option>
                  {allBatches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                {/* Fee Head Filter */}
                <select
                  value={selectedHeadFilter}
                  onChange={e => setSelectedHeadFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Fee Heads</option>
                  {availableFeeHeads.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>

                {/* Overdue Status Filter */}
                <select
                  value={selectedStatusFilter}
                  onChange={e => setSelectedStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="critical">Critical (30d+)</option>
                  <option value="warning">Warning (15-30d)</option>
                  <option value="notice">Notice (1-15d)</option>
                </select>
              </div>

              {/* Defaulter Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Dept / Batch</th>
                      <th className="px-4 py-3 text-right">Target Fee</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Due Amount</th>
                      <th className="px-4 py-3 text-center">Overdue</th>
                      <th className="px-4 py-3 text-center">Aging</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Restrict</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-100 text-xs">
                    {filteredDefaulters.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-16 text-center">
                          <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-400 animate-bounce" />
                          <p className="font-bold text-zinc-700 text-sm">No Defaulters Found</p>
                          <p className="text-zinc-400 text-xs mt-0.5">All student accounts are completely settled or match current filter criteria.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedDefaulters.map((d, i) => {
                        const isCritical = d.overdueStatus === "critical";
                        const isWarning = d.overdueStatus === "warning";

                        return (
                          <tr 
                            key={d.regNo || i} 
                            className={`hover:bg-blue-50/30 transition-colors ${
                              d.isRestricted ? "bg-red-50/40" : isCritical ? "bg-rose-50/20" : ""
                            }`}
                          >
                            {/* Student Name & Reg */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="font-bold text-zinc-800 text-xs">{d.name || d.studentName}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono text-[10px] text-zinc-500">{d.regNo}</span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600">
                                      {d.quota || "GQ"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Department / Batch */}
                            <td className="px-4 py-3">
                              <p className="font-semibold text-zinc-700 text-[11px] leading-tight">{d.department}</p>
                              <p className="text-[10px] text-zinc-400 mt-0.5">{d.batch} • {d.category}</p>
                            </td>

                            {/* Target Fee */}
                            <td className="px-4 py-3 text-right font-medium text-zinc-600">
                              {formatCurrency(d.targetAmount)}
                            </td>

                            {/* Paid Amount */}
                            <td className="px-4 py-3 text-right font-bold text-emerald-600">
                              {formatCurrency(d.paidAmount)}
                            </td>

                            {/* Due Amount */}
                            <td className="px-4 py-3 text-right">
                              <span className="font-black text-red-600 text-sm block">
                                {formatCurrency(d.dueAmount)}
                              </span>
                              {d.headDues && Object.keys(d.headDues).length > 0 && (
                                <div className="flex flex-wrap justify-end gap-1 mt-1">
                                  {Object.entries(d.headDues)
                                    .filter(([_, amt]) => Number(amt) > 0)
                                    .map(([hName, hAmt]) => (
                                      <span
                                        key={hName}
                                        className="text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60 px-1.5 py-0.2 rounded"
                                        title={`${hName}: ${formatCurrency(hAmt)}`}
                                      >
                                        {hName.replace(/Fee|Deposit/i, "").trim()}: {formatCurrency(hAmt)}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </td>

                            {/* Overdue Days */}
                            <td className="px-4 py-3 text-center text-zinc-500 font-semibold text-[11px]">
                              {d.daysOverdue} days
                            </td>

                            {/* Aging Progress Bar */}
                            <td className="px-4 py-3 text-center">
                              <div className="w-16 bg-zinc-100 rounded-full h-2 mx-auto overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isCritical ? "bg-red-600" : isWarning ? "bg-amber-500" : "bg-orange-400"
                                  }`}
                                  style={{ width: `${Math.min(100, (d.daysOverdue / 60) * 100)}%` }}
                                />
                              </div>
                            </td>

                            {/* Status Badge */}
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                isCritical 
                                  ? "bg-red-100 text-red-700 border border-red-200" 
                                  : isWarning 
                                  ? "bg-amber-100 text-amber-800 border border-amber-200" 
                                  : "bg-orange-50 text-orange-700 border border-orange-200"
                              }`}>
                                {d.overdueStatus}
                              </span>
                            </td>

                            {/* Restrict Toggle */}
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleRestriction(d)}
                                className={`p-1.5 rounded-lg font-bold transition-all ${
                                  d.isRestricted
                                    ? "bg-red-600 text-white shadow-sm hover:bg-red-700"
                                    : "bg-zinc-100 text-zinc-500 hover:text-red-600 hover:bg-red-50"
                                }`}
                                title={d.isRestricted ? "Click to lift restriction" : "Click to block hall ticket/portal"}
                              >
                                {d.isRestricted ? <Lock size={13} /> : <Unlock size={13} />}
                              </button>
                            </td>

                            {/* Direct Action: Collect */}
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => navigate(`/fee/operations?tab=collect&search=${encodeURIComponent(d.regNo || d.name)}`)}
                                className="px-2.5 py-1 bg-blue-50 text-[#120c7a] hover:bg-[#120c7a] hover:text-white rounded-lg text-[10px] font-bold transition-all shadow-xs flex items-center gap-1 mx-auto"
                              >
                                <span>Collect</span>
                                <ExternalLink size={10} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredDefaulters.length > 0 && (
                <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="text-zinc-500 font-medium text-[11px]">
                    Showing <span className="font-bold text-zinc-800">{startIndex + 1}</span> to{" "}
                    <span className="font-bold text-zinc-800">{endIndex}</span> of{" "}
                    <span className="font-bold text-zinc-800">{filteredDefaulters.length}</span> students
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-[11px] flex items-center gap-1 transition-all"
                    >
                      <ChevronLeft size={13} />
                      <span>Prev</span>
                    </button>

                    {/* Page Numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                        .filter(p => {
                          if (totalPages <= 7) return true;
                          if (p === 1 || p === totalPages) return true;
                          return Math.abs(p - safeCurrentPage) <= 1;
                        })
                        .reduce((acc, p, idx, arr) => {
                          if (idx > 0 && p - arr[idx - 1] > 1) {
                            acc.push("ellipsis-" + p);
                          }
                          acc.push(p);
                          return acc;
                        }, [])
                        .map(item => {
                          if (typeof item === "string" && item.startsWith("ellipsis")) {
                            return <span key={item} className="px-1 text-zinc-400">...</span>;
                          }
                          const pageNum = item;
                          const isActive = pageNum === safeCurrentPage;
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all ${
                                isActive
                                  ? "bg-[#120c7a] text-white shadow-xs"
                                  : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-[11px] flex items-center gap-1 transition-all"
                    >
                      <span>Next</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reminder Escalation Timeline */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs text-zinc-800 flex items-center gap-2">
                  <Bell size={14} className="text-amber-500" />
                  <span>Institutional Fee Reminder & Escalation Timeline</span>
                </h3>
                <span className="text-[10px] font-bold text-zinc-400">Policy: Automated & Manual Dispatches</span>
              </div>

              <div className="flex items-center gap-0">
                {[
                  { label: "7 days", sub: "Upcoming", color: "bg-emerald-400", count: 0 },
                  { label: "3 days", sub: "Due Soon", color: "bg-emerald-500", count: 0 },
                  { label: "Due Date", sub: "Term Start", color: "bg-amber-500", count: defaultersList.filter(d => d.daysOverdue <= 7).length },
                  { label: "7d overdue", sub: "First Notice", color: "bg-orange-500", count: defaultersList.filter(d => d.daysOverdue > 7 && d.daysOverdue <= 15).length },
                  { label: "15d overdue", sub: "Warning Notice", color: "bg-red-400", count: defaultersList.filter(d => d.daysOverdue > 15 && d.daysOverdue <= 30).length },
                  { label: "30d+ overdue", sub: "Critical Escalation", color: "bg-red-600", count: defaultersList.filter(d => d.daysOverdue > 30).length },
                ].map((s, i, arr) => (
                  <div key={s.label} className="flex-1 flex flex-col items-center">
                    <div className={`w-full h-2.5 ${s.color} ${i === 0 ? 'rounded-l-full' : ''} ${i === arr.length - 1 ? 'rounded-r-full' : ''}`} />
                    <span className="text-[9px] font-black text-zinc-700 mt-1.5">{s.label}</span>
                    <span className="text-[8px] text-zinc-400">{s.sub}</span>
                    <span className="text-[9px] font-black text-[#120c7a] bg-blue-50 px-1.5 py-0.2 rounded-full mt-0.5">
                      {s.count} students
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: REPORTS                                               */}
        {/* ============================================================ */}
        {tab === "reports" && (
          <div className="space-y-4">
            {/* Report Subtabs Bar */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: "daybook", label: "Day Book" },
                { id: "collection", label: "Collection Summary" },
                { id: "headwise", label: "Head-wise Collection" },
                { id: "branch", label: "Branch / Batch" },
                { id: "outstanding", label: "Outstanding Dues" },
                { id: "aging", label: "Aging Analysis" },
                { id: "nirf", label: "NIRF Finance DCS" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setReportTab(t.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    reportTab === t.id
                      ? "bg-[#120c7a] text-white shadow-sm"
                      : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
              {/* 1. Day Book */}
              {reportTab === "daybook" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                    <div>
                      <h3 className="font-bold text-sm text-zinc-800">
                        Daily Cash & Bank Transactions (Day Book)
                      </h3>
                      <p className="text-zinc-400 text-xs mt-0.5">
                        Selected: {new Date(dayBookDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl text-xs font-bold">
                        <CalendarDays size={13} className="text-zinc-400" />
                        <input
                          type="date"
                          value={dayBookDate}
                          onChange={e => setDayBookDate(e.target.value)}
                          className="bg-transparent outline-none cursor-pointer text-zinc-700 font-bold"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setDayBookDate(new Date().toISOString().split("T")[0])}
                        className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"
                      >
                        Today
                      </button>

                      <button
                        type="button"
                        onClick={handleExportDayBookExcel}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-blue-900 transition-all shadow-sm"
                      >
                        <Download size={13} /> Export Excel
                      </button>
                    </div>
                  </div>

                  {/* Day Book Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Day Collection</p>
                      <p className="text-xl font-black text-zinc-900 mt-0.5">{formatCurrency(dayBookTotals.total)}</p>
                      <p className="text-[10px] text-zinc-500 font-medium">{dayBookTotals.count} receipts</p>
                    </div>

                    <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">HDFC SmartGateway</p>
                      <p className="text-xl font-black text-blue-700 mt-0.5">{formatCurrency(dayBookTotals.gateway)}</p>
                      <p className="text-[10px] text-zinc-500 font-medium">Online portal collection</p>
                    </div>

                    <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">UPI / QR</p>
                      <p className="text-xl font-black text-emerald-700 mt-0.5">{formatCurrency(dayBookTotals.upi)}</p>
                      <p className="text-[10px] text-zinc-500 font-medium">Digital payments</p>
                    </div>

                    <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Cash & Cheque</p>
                      <p className="text-xl font-black text-purple-700 mt-0.5">{formatCurrency(dayBookTotals.cash + dayBookTotals.dd + dayBookTotals.other)}</p>
                      <p className="text-[10px] text-zinc-500 font-medium">Counter & bank deposit</p>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          <th className="px-3.5 py-2.5">Time</th>
                          <th className="px-3.5 py-2.5">Student</th>
                          <th className="px-3.5 py-2.5">Receipt #</th>
                          <th className="px-3.5 py-2.5">Fee Head</th>
                          <th className="px-3.5 py-2.5">Mode</th>
                          <th className="px-3.5 py-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {dayBookTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-zinc-400">
                              <CalendarDays size={28} className="mx-auto mb-1.5 text-zinc-300" />
                              No transactions recorded for {dayBookDate}
                            </td>
                          </tr>
                        ) : (
                          dayBookTransactions.map((p, i) => {
                            const d = getPaymentDateObj(p);
                            const timeStr = d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
                            return (
                              <tr key={p.id || i} className="hover:bg-zinc-50/60 transition-colors">
                                <td className="px-3.5 py-2 font-mono text-zinc-500">{timeStr}</td>
                                <td className="px-3.5 py-2">
                                  <p className="font-bold text-zinc-800">{p.studentName || "—"}</p>
                                  <p className="font-mono text-[10px] text-zinc-400">{p.examNumber || p.regNo || "—"}</p>
                                </td>
                                <td className="px-3.5 py-2 font-mono font-bold text-[#120c7a]">{p.receiptNo || "—"}</td>
                                <td className="px-3.5 py-2">
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-[10px]">
                                    {p.feeHead || "Fee"}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2 uppercase font-bold text-[10px] text-zinc-600">
                                  {getPaymentMode(p)}
                                </td>
                                <td className="px-3.5 py-2 text-right font-black text-zinc-900">
                                  {formatCurrency(p.chargedAmount || p.amount)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Collection Summary */}
              {reportTab === "collection" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-zinc-800">Periodic Collection Summary</h3>
                    <span className="text-xs font-bold text-zinc-400">AY {selectedAcademicYear || "ALL"}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50/40 rounded-2xl border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Today's Collection</p>
                      <p className="text-2xl font-black text-emerald-900">{formatCurrency(dayBookTotals.total)}</p>
                      <p className="text-xs text-emerald-700 font-semibold mt-1">{dayBookTotals.count} receipts issued</p>
                    </div>

                    <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50/40 rounded-2xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Current Academic Year</p>
                      <p className="text-2xl font-black text-blue-900">{formatCurrency(kpis.totalCollected)}</p>
                      <p className="text-xs text-blue-700 font-semibold mt-1">{accountFilteredPayments.length} transactions reconciled</p>
                    </div>

                    <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50/40 rounded-2xl border border-purple-100">
                      <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">Outstanding Balance</p>
                      <p className="text-2xl font-black text-purple-900">{formatCurrency(kpis.totalDue)}</p>
                      <p className="text-xs text-purple-700 font-semibold mt-1">{kpis.activeDefaultersCount} defaulter students</p>
                    </div>
                  </div>

                  {/* Payment Mode Split */}
                  <div>
                    <h4 className="font-bold text-xs text-zinc-700 mb-3 uppercase tracking-wider">Payment Channel Distribution</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {modeBreakdown.map(m => (
                        <div key={m.mode} className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase">{m.mode}</p>
                          <p className="text-lg font-black text-zinc-800 mt-0.5">{formatCurrency(m.amount)}</p>
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-semibold mt-1">
                            <span>{m.count} payments</span>
                            <span className="text-[#120c7a] font-bold">{m.pct}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Head-wise Collection */}
              {reportTab === "headwise" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-zinc-800">Fee Head Revenue Realization</h3>
                    <span className="text-xs font-bold text-zinc-400">Total: {formatCurrency(kpis.totalCollected)}</span>
                  </div>

                  <div className="space-y-3">
                    {headSummary.map(h => {
                      const pct = kpis.totalCollected > 0 ? (h.amount / kpis.totalCollected) * 100 : 0;
                      return (
                        <div key={h.head} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                          <div className="flex items-center justify-between text-xs font-bold mb-1">
                            <span className="text-zinc-800">{h.head}</span>
                            <span className="text-zinc-900">{formatCurrency(h.amount)} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                            <div className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-zinc-400 font-semibold mt-1">{h.count} verified receipts</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Branch / Batch Collection */}
              {reportTab === "branch" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-zinc-800">Department-wise Financial Status</h3>
                    <span className="text-xs font-bold text-zinc-400">{branchSummary.length} Academic Departments</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          <th className="px-3.5 py-2.5">Department</th>
                          <th className="px-3.5 py-2.5 text-center">Enrolled</th>
                          <th className="px-3.5 py-2.5 text-center">Defaulters</th>
                          <th className="px-3.5 py-2.5 text-right">Target Fee</th>
                          <th className="px-3.5 py-2.5 text-right">Collected</th>
                          <th className="px-3.5 py-2.5 text-right">Due Amount</th>
                          <th className="px-3.5 py-2.5 text-center">Realization</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {branchSummary.map(b => {
                          const rate = b.target > 0 ? ((b.collected / b.target) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={b.dept} className="hover:bg-zinc-50/60 transition-colors">
                              <td className="px-3.5 py-2.5 font-bold text-zinc-800">{b.dept}</td>
                              <td className="px-3.5 py-2.5 text-center font-semibold text-zinc-600">{b.enrolled}</td>
                              <td className="px-3.5 py-2.5 text-center font-bold text-red-600">{b.defaulters}</td>
                              <td className="px-3.5 py-2.5 text-right font-medium text-zinc-600">{formatCurrency(b.target)}</td>
                              <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600">{formatCurrency(b.collected)}</td>
                              <td className="px-3.5 py-2.5 text-right font-black text-red-600">{formatCurrency(b.due)}</td>
                              <td className="px-3.5 py-2.5 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-[#120c7a]">
                                  {rate}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Outstanding Dues */}
              {reportTab === "outstanding" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-zinc-800">Outstanding Revenue Audit</h3>
                      <p className="text-zinc-400 text-xs mt-0.5">Defaulters breakdown across departments</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportDefaultersExcel}
                      className="px-3 py-1.5 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-blue-900 transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <Download size={13} /> Export Defaulters Excel
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-[10px] font-bold text-red-600 uppercase">Total Outstanding</p>
                      <p className="text-xl font-black text-red-800 mt-0.5">{formatCurrency(kpis.totalDue)}</p>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-[10px] font-bold text-amber-700 uppercase">Defaulters</p>
                      <p className="text-xl font-black text-amber-900 mt-0.5">{kpis.activeDefaultersCount}</p>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 uppercase">Avg Due / Defaulter</p>
                      <p className="text-xl font-black text-blue-800 mt-0.5">
                        {formatCurrency(kpis.activeDefaultersCount > 0 ? kpis.totalDue / kpis.activeDefaultersCount : 0)}
                      </p>
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">Recovery Rate</p>
                      <p className="text-xl font-black text-emerald-800 mt-0.5">{kpis.recoveryRate}%</p>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500 italic">
                    To restrict students from examinations or dispatch individual demand notices, switch to the <strong>Defaulters & Alerts</strong> tab.
                  </p>
                </div>
              )}

              {/* 6. Aging Analysis */}
              {reportTab === "aging" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-zinc-800">Aging Schedule Analysis (Overdue Days)</h3>

                  <div className="space-y-3">
                    {[
                      {
                        label: "0 - 15 days",
                        sub: "Notice Stage",
                        color: "bg-emerald-500",
                        items: defaultersList.filter(d => d.daysOverdue <= 15)
                      },
                      {
                        label: "16 - 30 days",
                        sub: "Warning Stage",
                        color: "bg-amber-500",
                        items: defaultersList.filter(d => d.daysOverdue > 15 && d.daysOverdue <= 30)
                      },
                      {
                        label: "31 - 60 days",
                        sub: "Escalated Stage",
                        color: "bg-orange-500",
                        items: defaultersList.filter(d => d.daysOverdue > 30 && d.daysOverdue <= 60)
                      },
                      {
                        label: "60+ days",
                        sub: "Critical Escalation",
                        color: "bg-red-600",
                        items: defaultersList.filter(d => d.daysOverdue > 60)
                      },
                    ].map(bucket => {
                      const count = bucket.items.length;
                      const amount = bucket.items.reduce((s, d) => s + d.dueAmount, 0);
                      const pct = kpis.totalDue > 0 ? (amount / kpis.totalDue) * 100 : 0;

                      return (
                        <div key={bucket.label} className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                            <div>
                              <span className="text-zinc-800 text-sm font-black">{bucket.label}</span>
                              <span className="text-zinc-400 text-[10px] ml-2 font-medium">({bucket.sub})</span>
                            </div>
                            <div className="text-right">
                              <span className="text-zinc-900 font-black">{formatCurrency(amount)}</span>
                              <span className="text-zinc-400 text-[10px] ml-1.5 font-bold">({count} students • {pct.toFixed(1)}%)</span>
                            </div>
                          </div>

                          <div className="w-full bg-zinc-200 rounded-full h-3 overflow-hidden">
                            <div className={`${bucket.color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 7. NIRF Export */}
              {reportTab === "nirf" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                    <div>
                      <h3 className="font-bold text-sm text-zinc-800">NIRF Financial Data Export (DCS Section 4)</h3>
                      <p className="text-zinc-400 text-xs mt-0.5">Institutional Finance & Fee Data for Accreditation</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportNirfExcel}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#120c7a] hover:bg-blue-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                    >
                      <Download size={14} /> Download NIRF DCS Excel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50/80 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-700 uppercase">Annual Fee Collections</p>
                      <p className="text-xl font-black text-blue-900 mt-1">{formatCurrency(kpis.totalCollected)}</p>
                      <p className="text-[10px] text-blue-600 mt-0.5 font-semibold">Tuition + Other institutional revenues</p>
                    </div>

                    <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-700 uppercase">Fee Waived / Scholarship</p>
                      <p className="text-xl font-black text-emerald-900 mt-1">
                        {formatCurrency(concessions.filter(c => c.status === "approved").reduce((s, c) => s + Number(c.amount || 0), 0))}
                      </p>
                      <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">
                        {concessions.filter(c => c.status === "approved").length} verified beneficiaries
                      </p>
                    </div>

                    <div className="p-4 bg-purple-50/80 rounded-xl border border-purple-100">
                      <p className="text-[10px] font-bold text-purple-700 uppercase">Recovery Rate</p>
                      <p className="text-xl font-black text-purple-900 mt-1">{kpis.recoveryRate}%</p>
                      <p className="text-[10px] text-purple-600 mt-0.5 font-semibold">Institutional collection velocity</p>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-600 space-y-1.5">
                    <p className="font-bold text-zinc-800">Pre-formatted NIRF Data Capturing System (DCS) Deliverables:</p>
                    <ul className="text-[11px] text-zinc-500 space-y-1 list-disc list-inside">
                      <li>Total fee revenue calculated from verified receipts across UG & PG programmes</li>
                      <li>Government Quota & Management Quota financial split</li>
                      <li>Institutional scholarship & concession disbursement totals</li>
                      <li>Official enrollment vs fee payment headcount audit</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: ANALYTICS                                             */}
        {/* ============================================================ */}
        {tab === "analytics" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. 12-Month Collection Trend */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-xs text-zinc-800">12-Month Collection Trend</h3>
                  <p className="text-[10px] text-zinc-400 font-medium">Reconciled monthly collection trajectory</p>
                </div>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>

              <div className="flex items-end gap-1.5 h-44 pt-4 pb-1">
                {monthlyTrendData.map((d, i) => {
                  const pct = maxMonthAmt > 0 ? (d.total / maxMonthAmt) * 100 : 0;
                  const isPeak = d.total === maxMonthAmt && maxMonthAmt > 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-20 bg-zinc-900 text-white rounded-lg px-2 py-1 text-[9px] shadow-lg whitespace-nowrap">
                        <p className="font-bold">{d.label} {d.year}</p>
                        <p className="font-black text-emerald-400">{formatCurrency(d.total)}</p>
                      </div>

                      <span className="text-[8px] font-bold text-zinc-400">
                        {d.total > 0 ? (d.total >= 100000 ? `${(d.total / 100000).toFixed(0)}L` : `${Math.round(d.total / 1000)}k`) : "—"}
                      </span>

                      <div className="w-full max-w-[24px] bg-zinc-100 rounded-sm h-full relative overflow-hidden">
                        <div 
                          className={`absolute bottom-0 w-full transition-all duration-500 rounded-sm ${
                            isPeak 
                              ? "bg-gradient-to-t from-amber-600 to-blue-500" 
                              : d.total > 0 
                              ? "bg-gradient-to-t from-[#120c7a] to-blue-500" 
                              : "bg-zinc-200"
                          }`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      </div>

                      <span className="text-[9px] font-bold text-zinc-500">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Payment Mode Distribution */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-xs text-zinc-800">Payment Channel Breakdown</h3>
                  <p className="text-[10px] text-zinc-400 font-medium">Receipt distribution by payment mode</p>
                </div>
                <PieChart size={16} className="text-blue-500" />
              </div>

              <div className="space-y-3">
                {modeBreakdown.map(m => (
                  <div key={m.mode}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold uppercase text-zinc-700">{m.mode}</span>
                      <span className="font-black text-zinc-900">
                        {formatCurrency(m.amount)} ({m.pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">{m.count} transactions</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Realization Ratio Circular Gauge */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <h3 className="font-bold text-xs text-zinc-800 mb-1">Fee Recovery Ratio Gauge</h3>
              <p className="text-[10px] text-zinc-400 font-medium mb-4">Collected vs Target Budget</p>

              <div className="relative w-36 h-36 mx-auto mb-3">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f4f4f5" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray={`${Number(kpis.recoveryRate)} ${100 - Number(kpis.recoveryRate)}`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <p className="text-2xl font-black text-zinc-900">{kpis.recoveryRate}%</p>
                  <p className="text-[9px] font-bold text-zinc-400 uppercase">Recovery</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-2 border-t border-zinc-100">
                <div>
                  <p className="font-black text-emerald-700 text-xs">{formatCurrency(kpis.totalCollected)}</p>
                  <p className="text-zinc-400 font-semibold">Collected</p>
                </div>
                <div>
                  <p className="font-black text-zinc-800 text-xs">{formatCurrency(kpis.totalTarget)}</p>
                  <p className="text-zinc-400 font-semibold">Target</p>
                </div>
                <div>
                  <p className="font-black text-red-600 text-xs">{formatCurrency(kpis.totalDue)}</p>
                  <p className="text-zinc-400 font-semibold">Due</p>
                </div>
              </div>
            </div>

            {/* 4. Department Realization Ranking */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <h3 className="font-bold text-xs text-zinc-800 mb-1">Department Realization Ranking</h3>
              <p className="text-[10px] text-zinc-400 font-medium mb-4">Ranked by revenue collection percentage</p>

              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {branchSummary
                  .map(b => ({
                    ...b,
                    rate: b.target > 0 ? (b.collected / b.target) * 100 : 0
                  }))
                  .sort((a, b) => b.rate - a.rate)
                  .map((b, idx) => (
                    <div key={b.dept} className="flex items-center gap-3">
                      <span className="w-5 text-[10px] font-black text-zinc-400">#{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-bold text-zinc-700 truncate max-w-[190px]">{b.dept}</span>
                          <span className="font-black text-zinc-900">{b.rate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full" 
                            style={{ width: `${Math.min(100, b.rate)}%` }} 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL: SEND FEE REMINDER NOTICE                              */}
        {/* ============================================================ */}
        {showReminderModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="text-[#120c7a]" />
                  <h3 className="font-black text-base text-zinc-800">Dispatch Fee Reminder Notice</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReminderModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Target Audience */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Select Target Audience
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "all", label: "All Defaulters", count: defaultersList.length },
                    { id: "critical", label: "Critical (30d+)", count: kpis.criticalCount },
                    { id: "warning", label: "Warning Only", count: kpis.warningCount },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setReminderTarget(t.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        reminderTarget === t.id
                          ? "border-[#120c7a] bg-blue-50/60 text-[#120c7a] font-bold"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      <p className="text-xs font-black">{t.label}</p>
                      <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">{t.count} students</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Style */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Notice Template Type
                </label>
                <select
                  value={reminderTemplate}
                  onChange={e => setReminderTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 outline-none"
                >
                  <option value="gentle">First Fee Reminder Notice (Gentle Alert)</option>
                  <option value="urgent">Second Fee Notice (Urgent Dues Reminder)</option>
                  <option value="final">Final Demand Notice (Exam / Hall Ticket Restriction Warning)</option>
                </select>
              </div>

              {/* Live Preview */}
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Smartphone size={12} /> Message Template Preview (SMS / WhatsApp)
                </p>
                <p className="text-zinc-700 font-medium text-[11px] leading-relaxed bg-white p-2.5 rounded-xl border border-zinc-200/80">
                  {reminderTemplate === "gentle" && (
                    <>Dear Candidate, kindly note that your outstanding fee balance is pending for the active term. Please complete the payment online at the portal or at college counter to avoid late dues.</>
                  )}
                  {reminderTemplate === "urgent" && (
                    <>URGENT NOTICE: Fee dues for AY {selectedAcademicYear || "Current"} are overdue. Please clear your outstanding balance immediately via online SmartGateway or counter.</>
                  )}
                  {reminderTemplate === "final" && (
                    <>FINAL DEMAND NOTICE: Outstanding fee dues are critical. Failure to settle dues will result in exam hall ticket restriction and portal suspension. Contact Finance Office immediately.</>
                  )}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowReminderModal(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sendingReminders}
                  onClick={handleSendBulkReminder}
                  className="px-5 py-2 bg-[#120c7a] hover:bg-blue-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {sendingReminders ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  <span>{sendingReminders ? "Dispatching..." : "Dispatch Reminders"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
