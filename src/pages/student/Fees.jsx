import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db, auth, functions } from "../../firebase";
import { doc, getDoc, collection, getDocs, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import {
  IndianRupee, AlertCircle, Loader2, Wallet, Receipt, X, CheckCircle2,
  ArrowRight, ExternalLink, Clock, RefreshCw, Banknote, Copy, Check,
  Ban, ShieldAlert, Bus, Users, Printer, FileText,
} from "lucide-react";
import { formatBatchDisplay, formatProgrammeKey, formatDepartmentDisplay, formatProgDisplay, sanitizeKey } from "../../lib/utils";
import { computePaidByConfig, yearStart, normHead, normalizeStandardReceiptNo } from "../../utils/feeAllocation";
import OfficialFeeReceiptModal from "../../components/OfficialFeeReceiptModal";

const PAYMENT_STATUS = {
  PENDING: { label: "Pending", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  SUCCESS: { label: "Paid", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  FAILED: { label: "Failed", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

const normalizeAcademicYearStr = (y) => {
  if (!y) return '';
  const m = String(y).match(/(\d{4})[-/](\d{2,4})/);
  if (m) {
    const y1 = m[1];
    let y2 = m[2];
    if (y2.length === 2) y2 = String(Number(y1.slice(0, 2)) * 100 + Number(y2));
    return `${y1}-${y2}`;
  }
  return String(y).trim();
};

const numberToWordsINR = (num) => {
  if (!num || isNaN(num) || num <= 0) return "Zero Rupees Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convert = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };
  const mainPart = Math.floor(num);
  const paisePart = Math.round((num - mainPart) * 100);
  let words = "Rupees " + convert(mainPart);
  if (paisePart > 0) {
    words += " and " + convert(paisePart) + " Paise";
  }
  return words + " Only";
};

const subscribeAppPaymentsForStudent = (student, setAppPayments) => {
  if (!student) {
    setAppPayments([]);
    return () => {};
  }

  const keys = new Set();
  const addKey = (k) => {
    if (k && typeof k === "string" && k.trim()) {
      keys.add(k.trim());
    }
  };

  addKey(student.applicationNo);
  addKey(student.enquiryId);
  addKey(student.regNo);
  addKey(student.examNumber);
  addKey(student.admissionNo);
  addKey(student.id);
  addKey(student._docId);
  addKey(student.uid);
  addKey(student._profile_data?.enquiryId);
  addKey(student._profile_data?.applicationNo);

  const email = (student.email || student.emailId || student._profile_data?.emailId || "").trim();
  const mobile = (student.mobile || student.parentMobile || student.studentMobile || student._profile_data?.mobile || "").trim();

  const matchingDocSnaps = new Map();

  const parseAndSet = () => {
    const collected = [];
    const seenPayments = new Set();

    matchingDocSnaps.forEach((data, docId) => {
      // 1. Array of payments
      if (Array.isArray(data.payments) && data.payments.length > 0) {
        data.payments.forEach((p, i) => {
          const amt = Number(p.feeAmount || p.amount || 0);
          if (!amt || amt <= 0) return;
          const pId = `app-${docId}-${i}`;
          if (!seenPayments.has(pId)) {
            seenPayments.add(pId);
            const dateVal = p.paymentDate
              ? (p.paymentDate.toDate ? p.paymentDate : Timestamp.fromDate(new Date(p.paymentDate)))
              : (data.createdAt ? (data.createdAt.toDate ? data.createdAt : Timestamp.fromDate(new Date(data.createdAt))) : Timestamp.now());
            const pRef = p.upiNumber || p.refNo || p.transactionId || p.utr || data.upiNumber || data.refNo || "";
            collected.push({
              id: pId,
              status: "SUCCESS",
              feeHead: p.feeCategory || p.feeHead || p.head || "Application Fee",
              amount: amt,
              chargedAmount: amt,
              paymentDate: dateVal,
              createdAt: dateVal,
              mode: p.paymentMode || p.mode || "cash",
              refNo: pRef,
              upiNumber: p.upiNumber || data.upiNumber || "",
              rawRecord: p,
              receiptNo: `APP ${data.applicationNo || data.enquiryId || docId}`,
              orderId: pRef || `APP ${data.applicationNo || data.enquiryId || docId}`,
              _source: "Application",
              enquiryId: data.enquiryId || docId,
              applicationNo: data.applicationNo || "",
              paymentIndex: i,
            });
          }
        });
      }

      // 2. Single payment fields
      if (Number(data.feeAmount) > 0) {
        const amt = Number(data.feeAmount);
        const pId = `app-${docId}-single`;
        if (!seenPayments.has(pId)) {
          seenPayments.add(pId);
          const dateVal = data.paymentDate
            ? (data.paymentDate.toDate ? data.paymentDate : Timestamp.fromDate(new Date(data.paymentDate)))
            : (data.createdAt ? (data.createdAt.toDate ? data.createdAt : Timestamp.fromDate(new Date(data.createdAt))) : Timestamp.now());
          const pRef = data.upiNumber || data.refNo || data.transactionId || "";
          collected.push({
            id: pId,
            status: "SUCCESS",
            feeHead: data.feeCategory || "Application Fee",
            amount: amt,
            chargedAmount: amt,
            paymentDate: dateVal,
            createdAt: dateVal,
            mode: data.paymentMode || "cash",
            refNo: pRef,
            upiNumber: data.upiNumber || "",
            rawRecord: data,
            receiptNo: `APP ${data.applicationNo || data.enquiryId || docId}`,
            orderId: pRef || `APP ${data.applicationNo || data.enquiryId || docId}`,
            _source: "Application",
            enquiryId: data.enquiryId || docId,
            applicationNo: data.applicationNo || "",
            paymentIndex: 0,
          });
        }
      }
    });

    setAppPayments(collected);
  };

  const handleSnapshot = (snap) => {
    snap.forEach((d) => matchingDocSnaps.set(d.id, d.data()));
    parseAndSet();
  };

  const unsubs = [];
  for (const k of keys) {
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("applicationNo", "==", k)), handleSnapshot, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("enquiryId", "==", k)), handleSnapshot, () => {}));
  }
  if (email) {
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("emailId", "==", email)), handleSnapshot, () => {}));
  }
  if (mobile) {
    unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("mobile", "==", mobile)), handleSnapshot, () => {}));
  }

  return () => {
    unsubs.forEach(u => u());
  };
};

export default function Fees() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [appPayments, setAppPayments] = useState([]);
  const [payModal, setPayModal] = useState({ open: false, feeHead: "", amount: "", maxAmount: 0 });
  const [selectedHeads, setSelectedHeads] = useState([]);
  const [customPayAmount, setCustomPayAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [seatCategory, setSeatCategory] = useState("");
  const [studentCategoryState, setStudentCategoryState] = useState("");
  const [studentStage, setStudentStage] = useState("");
  const [transportStages, setTransportStages] = useState([]);
  const [approvedTransportApps, setApprovedTransportApps] = useState([]);
  const [statusModal, setStatusModal] = useState({ open: false, success: false, orderId: "", amount: 0, feeHead: "", error: "", tampered: false, duplicate: false });
  const [receiptModal, setReceiptModal] = useState({ open: false, payment: null });
  const [selectedHistoryPayments, setSelectedHistoryPayments] = useState([]);
  const ignoreBeforeUnloadRef = useRef(false);

  const handleToggleSelectHistoryPayment = (paymentId) => {
    setSelectedHistoryPayments((prev) =>
      prev.includes(paymentId) ? prev.filter((id) => id !== paymentId) : [...prev, paymentId]
    );
  };

  const handleSelectAllHistoryPayments = (checked) => {
    if (checked) {
      const successfulIds = allHistoryPayments
        .filter(isSuccessfulPayment)
        .map((p) => p.id || p.orderId || p.receiptNo);
      setSelectedHistoryPayments(successfulIds);
    } else {
      setSelectedHistoryPayments([]);
    }
  };

  const handlePrintConsolidatedHistory = () => {
    const selected = allHistoryPayments.filter(
      (p) => selectedHistoryPayments.includes(p.id || p.orderId || p.receiptNo) && isSuccessfulPayment(p)
    );
    if (selected.length === 0) return;
    if (selected.length === 1) {
      setReceiptModal({ open: true, payment: selected[0] });
      return;
    }
    const totalAmount = selected.reduce(
      (sum, p) => sum + Number(p.chargedAmount || p.amount || 0),
      0
    );
    const combinedItems = selected.flatMap((p) => {
      if (Array.isArray(p.items) && p.items.length > 0) return p.items;
      if (Array.isArray(p.allocations) && p.allocations.length > 0) return p.allocations;
      return [
        {
          head: p.feeHead || "Semester Fee",
          amount: Number(p.chargedAmount || p.amount || 0),
          academicYear: p.academicYear || "2026-2027",
          semester: p.semester || "",
        },
      ];
    });

    const studentReg = studentData?.regNo || studentData?.admissionNo || studentData?.rollNo || studentData?.examNumber || "STU";

    const consolidatedReceipt = {
      isConsolidated: true,
      receiptNo: `REC-CONS-${studentReg}-${Date.now().toString(36).toUpperCase()}`,
      orderId: `CONS-${selected.map((s) => String(s.orderId || s.receiptNo || "REF").slice(-4)).join("-")}`,
      paymentDate: new Date(),
      items: combinedItems,
      amount: totalAmount,
      mode: "Consolidated (Online / Counter)",
      studentName: studentData?.displayName || studentData?.name || "Candidate",
      regNo: studentReg,
      department: studentData?.department,
      programme: studentData?.programme,
      batch: studentData?.batch,
      section: studentData?.section,
    };
    setReceiptModal({ open: true, payment: consolidatedReceipt });
  };

  const handlePrintDueDemandBill = () => {
    if (selectedHeads.length === 0) return;
    const totalDue = selectedHeads.reduce((sum, h) => sum + Number(h.due || 0), 0);
    const studentReg = studentData?.regNo || studentData?.admissionNo || studentData?.rollNo || studentData?.examNumber || "STU";
    const dueDemandPayment = {
      isDueDemand: true,
      demandNo: `DEM-${studentReg}-${Date.now().toString(36).toUpperCase()}`,
      demandRef: `DEM-${studentReg}-${selectedHeads.length}H`,
      demandDate: new Date(),
      items: selectedHeads.map((h) => ({
        head: h.head,
        amount: Number(h.due || 0),
        academicYear: h.academicYear || "2026-2027",
        semester: h.semester || "",
      })),
      totalDue: totalDue,
      amount: totalDue,
      mode: "Payment Due (Demand Voucher)",
      studentName: studentData?.displayName || studentData?.name || "Candidate",
      regNo: studentReg,
      department: studentData?.department,
      programme: studentData?.programme,
      batch: studentData?.batch,
      section: studentData?.section,
    };
    setReceiptModal({ open: true, payment: dueDemandPayment });
  };

  const verifyPaymentOnReturn = useCallback(async (orderId) => {
    try {
      const verifyFn = httpsCallable(functions, "verifyPayment");
      const result = await verifyFn({ orderId });
      const data = result.data;
      if (data.success) {
        localStorage.removeItem("pending_student_fee_order_id");
        setStatusModal({
          open: true,
          success: true,
          orderId: data.orderId,
          amount: data.amount,
          feeHead: "",
          tampered: data.tampered || false,
          duplicate: data.duplicate || false
        });
      } else {
        setStatusModal({
          open: true,
          success: false,
          orderId: orderId,
          amount: 0,
          error: data.tampered ? "Amount verification failed (tampered check)." : data.duplicate ? "Duplicate transaction detected." : `Payment ${data.status?.toLowerCase() || 'failed'}.`,
          tampered: data.tampered || false,
          duplicate: data.duplicate || false
        });
      }
    } catch (err) {
      console.error("Verify payment error:", err);
      const msg = err.code === "unavailable"
        ? "Payment verification service is temporarily down. Your payment may still have been processed — please check Payment History."
        : "Could not verify payment status. Check Payment History.";
      setStatusModal({
        open: true,
        success: false,
        orderId: orderId,
        amount: 0,
        error: msg
      });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    if (orderId) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      verifyPaymentOnReturn(orderId);
      return;
    }

    // Auto-recovery for student if they closed browser during payment
    const checkPendingOnMount = async () => {
      try {
        const pendingOrderId = localStorage.getItem("pending_student_fee_order_id");
        if (pendingOrderId) {
          console.log("Checking pending student fee payment on mount:", pendingOrderId);
          await verifyPaymentOnReturn(pendingOrderId);
        }
      } catch (_) {}
    };
    checkPendingOnMount();
  }, [verifyPaymentOnReturn]);

  useEffect(() => {
    let unsubUser = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        setStudentData(null);
        return;
      }
      unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
          setStudentData(snap.data());
        } else {
          setStudentData(null);
        }
      }, (err) => {
        console.error("User snapshot listen error:", err);
      });
    });
    return () => {
      unsubAuth();
      unsubUser();
    };
  }, []);

  // Prevent accidental page refresh/close during payment processing
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (processing && !ignoreBeforeUnloadRef.current) {
        e.preventDefault();
        e.returnValue = "Payment is processing. Please do not close or refresh this page.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [processing]);

  useEffect(() => {
    let interval;
    if (processing) {
      setProcessingStep(0);
      interval = setInterval(() => {
        setProcessingStep((prev) => (prev < 4 ? prev + 1 : prev));
      }, 850);
    }
    return () => clearInterval(interval);
  }, [processing]);

  // Load seatCategory and studentCategory from _student_data or _profile_data or enquiries (reactive)
  useEffect(() => {
    if (!studentData) return;
    const getQuota = (obj) => obj?.seatCategory || obj?.quotaAskedFor || obj?.quota || "";
    const getCategory = (obj) => obj?.studentCategory || obj?.category || obj?.admissionType || obj?.entryType || "";
    const reg = studentData.regNo || studentData.examNumber || "";
    const appNo = studentData.applicationNo || studentData.enquiryId || studentData._profile_data?.applicationNo || "";

    (async () => {
      let foundQuota = getQuota(studentData) || getQuota(studentData._profile_data);
      let foundCategory = getCategory(studentData) || getCategory(studentData._profile_data);
      let foundStage = studentData._profile_data?.transportStage || "";

      if (reg) {
        try {
          const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
          if (idxSnap.exists()) {
            const sDocId = idxSnap.data().studentDocId;
            if (sDocId) {
              const sSnap = await getDoc(doc(db, 'students', sDocId));
              if (sSnap.exists()) {
                const extra = sSnap.data()._student_data?.[reg] || {};
                if (!foundQuota) foundQuota = getQuota(extra);
                if (!foundCategory) foundCategory = getCategory(extra);
                if (!foundStage) foundStage = extra.transportStage || "";
              }
            }
          }
        } catch (_) {}
      }

      // If still missing, check enquiries collection
      if (!foundQuota || !foundCategory) {
        const lookupKeys = [appNo, reg, studentData.id, studentData.uid, studentData._docId].filter(Boolean);
        for (const k of lookupKeys) {
          try {
            const q1 = await getDocs(query(collection(db, "enquiries"), where("applicationNo", "==", k)));
            if (!q1.empty) {
              const d = q1.docs[0].data();
              if (!foundQuota) foundQuota = getQuota(d);
              if (!foundCategory) foundCategory = getCategory(d);
              if (foundQuota && foundCategory) break;
            }
            const q2 = await getDocs(query(collection(db, "enquiries"), where("enquiryId", "==", k)));
            if (!q2.empty) {
              const d = q2.docs[0].data();
              if (!foundQuota) foundQuota = getQuota(d);
              if (!foundCategory) foundCategory = getCategory(d);
              if (foundQuota && foundCategory) break;
            }
          } catch (_) {}
        }
      }

      if (foundQuota) setSeatCategory(foundQuota);
      setStudentCategoryState(foundCategory || "Regular");
      if (foundStage) setStudentStage(foundStage);
    })();
  }, [studentData]);

  // Fetch transport stage configurations
  useEffect(() => {
    if (!studentStage) {
      setTransportStages([]);
      return;
    }
    const unsub = onSnapshot(collection(db, "transport_stages"), (snap) => {
      setTransportStages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [studentStage]);

  // Real-time listener for current student's approved transport boarding passes & fee dues
  useEffect(() => {
    if (!studentData) {
      setApprovedTransportApps([]);
      return;
    }
    const reg = (studentData.regNo || studentData.examNumber || studentData.studentId || studentData.rollNo || "").trim();
    const uid = auth.currentUser?.uid;
    if (!reg && !uid) {
      setApprovedTransportApps([]);
      return;
    }

    let appsList = [];
    let cancelsList = [];

    const isStudentMatch = (data) => {
      if (!data) return false;
      if (uid && (data.studentUid === uid || data.uid === uid)) return true;
      if (reg) {
        const rLower = reg.toLowerCase();
        const dReg = String(data.regNo || "").trim().toLowerCase();
        const dStudentId = String(data.studentId || "").trim().toLowerCase();
        const dRoll = String(data.rollNo || "").trim().toLowerCase();
        if (dReg === rLower || dStudentId === rLower || dRoll === rLower) return true;
      }
      return false;
    };

    const recomputeTransportFees = () => {
      const approvedList = [];

      appsList.forEach((data) => {
        if (!isStudentMatch(data)) return;

        const status = String(data.status || "").trim();
        const sLower = status.toLowerCase();

        // Check if pass validity has expired (time elapsed or marked expired/deactivated)
        const isPassExpired = Boolean(
          data.isExpired ||
          data.validityExpired ||
          sLower.includes("expired") ||
          sLower.includes("deactivated") ||
          (data.validUntil && new Date(data.validUntil).getTime() < Date.now())
        );

        // Check if this application was ever approved / sanctioned / active / expired
        const wasApproved =
          status === "Approved" ||
          status === "Active" ||
          status === "Sanctioned" ||
          status === "Issued" ||
          sLower.includes("approved") ||
          sLower.includes("sanctioned") ||
          sLower.includes("issued") ||
          sLower.includes("active") ||
          sLower.includes("expired") ||
          sLower.includes("deactivated") ||
          data.wasApproved === true ||
          data.isExpired === true ||
          data.validityExpired === true ||
          Boolean(
            data.allocatedBusId ||
            data.allocatedBusNumber ||
            data.assignedBusNumber ||
            data.busId ||
            data.approvedAt ||
            data.passIssued ||
            data.cancellationStatus ||
            data.seatReleased ||
            data.seatReleasedAt ||
            data.validUntil ||
            data.validFrom
          );

        // A freshly submitted pending application that was never approved does not generate fee dues
        const isPendingOnly =
          (sLower === "pending" || sLower === "pending approval" || sLower.includes("under verification")) &&
          !data.approvedAt &&
          !data.passIssued &&
          !data.allocatedBusId &&
          !data.wasApproved;

        if (!wasApproved || isPendingOnly) return;

        // Check if cancellation & seat release completed
        const isCancelledOrReleased =
          status === "Cancelled" ||
          sLower.startsWith("cancelled") ||
          data.allocatedSeat === "Released" ||
          data.seatReleased === true;

        if (isCancelledOrReleased) {
          // Look for corresponding cancellation record
          const cancelDoc = cancelsList.find((c) =>
            (c.passId && c.passId === data.id) ||
            (c.applicationId && c.applicationId === data.id) ||
            (c.applicationNo && data.applicationNo && c.applicationNo === data.applicationNo) ||
            (c.regNo && reg && String(c.regNo).trim().toLowerCase() === reg.toLowerCase())
          );

          // User requirement:
          // ONLY if dues were explicitly marked as "cleared" / paid by coordinator during seat release:
          const isDuesCleared =
            data.duesDecision === "cleared" ||
            data.feesCleared === true ||
            (cancelDoc && (cancelDoc.duesDecision === "cleared" || cancelDoc.feesCleared === true));

          if (isDuesCleared) {
            // Fee is cleared and goes away from Fees.jsx
            return;
          }
          // If released with due (duesDecision === "waive" / releaseWithDue === true / not cleared):
          // Fee MUST NOT go away ("ilana poga kudadhu") -> Keep in approvedList!
          approvedList.push({
            ...data,
            isReleasedWithDue: true,
            isPassExpired
          });
          return;
        }

        // Active or expired passes:
        // User requirement: Even if pass validity has expired ("pass validity mudinjalum"),
        // the fee due MUST remain until paid in full!
        approvedList.push({
          ...data,
          isPassExpired
        });
      });

      // Safety guarantee: If there is any cancellation with dues that was released with due,
      // ensure it is present in approvedList even if the original application document was missing
      cancelsList.forEach((c) => {
        if (!isStudentMatch(c)) return;
        const cStatus = String(c.status || "").toLowerCase();
        if (!cStatus.includes("released")) return;
        const isDuesCleared = c.duesDecision === "cleared" || c.feesCleared === true;
        if (isDuesCleared) return;

        const alreadyIncluded = approvedList.some((a) =>
          (c.passId && a.id === c.passId) ||
          (c.applicationId && a.id === c.applicationId) ||
          (c.applicationNo && a.applicationNo === c.applicationNo)
        );

        if (!alreadyIncluded && (Number(c.calculatedFee) > 0 || Number(c.balanceDue) > 0)) {
          approvedList.push({
            id: c.passId || c.applicationId || c.id,
            applicationNo: c.applicationNo || "TR-DUE",
            calculatedFee: Number(c.balanceDue || c.calculatedFee || 0),
            academicYear: c.academicYear || "",
            semester: c.semester || "",
            billingTerm: c.billingTerm || "annual",
            routeName: c.routeName || "Transport",
            stageName: c.stageName || "",
            isReleasedWithDue: true,
            status: "Cancelled - Seat Released with Due"
          });
        }
      });

      setApprovedTransportApps(approvedList);
    };

    const unsubApps = onSnapshot(collection(db, "student_transport_applications"), (snap) => {
      appsList = [];
      snap.forEach((d) => {
        appsList.push({ id: d.id, ...d.data() });
      });
      recomputeTransportFees();
    }, (err) => {
      console.warn("Transport applications listen error in Fees:", err);
      setApprovedTransportApps([]);
    });

    const unsubCancels = onSnapshot(collection(db, "student_transport_cancellations"), (snap) => {
      cancelsList = [];
      snap.forEach((d) => {
        cancelsList.push({ id: d.id, ...d.data() });
      });
      recomputeTransportFees();
    }, (err) => {
      console.warn("Transport cancellations listen error in Fees:", err);
    });

    return () => {
      unsubApps();
      unsubCancels();
    };
  }, [studentData]);

  useEffect(() => {
    if (!studentData) return;
    const { programme, department, batch } = studentData;
    if (!programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    // 1. Fetch configs (one-off)
    const fetchConfigs = async () => {
      try {
        const feeSnap = await getDocs(collection(db, "fee_configurations"));
        const matchedConfigs = [];
        const normStudentProg = formatProgrammeKey(programme);
        const normStudentDept = (department || "").replace(/[_.\s]/g, '').toLowerCase();
        const normStudentBatch = (batch || "").trim().toLowerCase();
        const resolvedQuota = studentData.seatCategory || studentData.quotaAskedFor || studentData.quota || studentData._profile_data?.quotaAskedFor || studentData._profile_data?.seatCategory || seatCategory || "";
        const resolvedCategory = studentData.studentCategory || studentData.category || studentData.admissionType || studentData.entryType || studentData._profile_data?.studentCategory || studentCategoryState || "Regular";

        const normalizeQuotaStr = (q) => {
          if (!q) return '';
          const s = String(q).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (s.includes('mgmt') || s.includes('management') || s === 'mq') return 'management';
          if (s.includes('govt') || s.includes('government') || s === 'gq' || s.includes('75')) return 'government';
          if (s.includes('nri')) return 'nri';
          if (s.includes('sports')) return 'sports';
          return s;
        };

        const isQuotaMatchExact = (configQuota, studentQuota) => {
          if (!configQuota || !studentQuota) return false;
          const cq = normalizeQuotaStr(configQuota);
          const sq = normalizeQuotaStr(studentQuota);
          return Boolean(cq && sq && (cq === sq || cq.includes(sq) || sq.includes(cq)));
        };

        const isQuotaApplicable = (configQuota, studentQuota) => {
          if (!configQuota || configQuota.trim().toLowerCase() === 'all') return true;
          if (!studentQuota) return true;
          return isQuotaMatchExact(configQuota, studentQuota);
        };

        const normalizeCategoryStr = (cat) => {
          if (!cat) return '';
          const s = String(cat).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (s === 'all' || s === 'allcategories' || s === '') return 'all';
          if (s.includes('lateral')) return 'lateral entry';
          if (s.includes('regular')) return 'regular';
          if (s.includes('transfer')) return 'transfer';
          if (s.includes('readmission') || s.includes('re-admission')) return 'readmission';
          return s;
        };

        const isCategoryMatchExact = (configCategory, sCategory) => {
          const cc = normalizeCategoryStr(configCategory);
          const sc = normalizeCategoryStr(sCategory || 'regular');
          if (!cc || cc === 'all') return true;
          return cc === sc;
        };

        const isCategoryApplicable = (configCategory, sCategory) => {
          if (!configCategory || configCategory.trim().toLowerCase() === 'all' || configCategory.trim().toLowerCase() === 'all categories') return true;
          return isCategoryMatchExact(configCategory, sCategory || 'regular');
        };

        feeSnap.forEach((d) => {
          const data = d.data();
          const normDataProg = formatProgrammeKey(data.programme);
          const normDataDept = (data.department || "").replace(/[_.\s]/g, '').toLowerCase();
          const normDataBatch = (data.batch || "").trim().toLowerCase();

          const isProgMatch = normDataProg && normDataProg === normStudentProg;
          const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
          const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;
          const isQuotaMatch = isQuotaApplicable(data.quota, resolvedQuota);
          const isCategoryMatch = isCategoryApplicable(data.studentCategory, resolvedCategory);

          if (isProgMatch && isDeptMatch && isBatchMatch && isQuotaMatch && isCategoryMatch) {
            matchedConfigs.push({ id: d.id, ...data });
          }
        });

        // Deduplicate & prioritize quota & studentCategory specific configs over generic configs per (academicYear + semester + head)
        const configMap = new Map();
        matchedConfigs.forEach((c) => {
          const key = `${c.academicYear || ''}_${c.semester || ''}_${normHead(c.head)}`;
          const existing = configMap.get(key);
          if (!existing) {
            configMap.set(key, c);
          } else {
            const existingMatchesQuota = isQuotaMatchExact(existing.quota, resolvedQuota);
            const currentMatchesQuota = isQuotaMatchExact(c.quota, resolvedQuota);

            const existingMatchesCategory = isCategoryMatchExact(existing.studentCategory, resolvedCategory);
            const currentMatchesCategory = isCategoryMatchExact(c.studentCategory, resolvedCategory);

            const existingScore = (existingMatchesQuota ? 2 : 0) + (existingMatchesCategory ? 1 : 0);
            const currentScore = (currentMatchesQuota ? 2 : 0) + (currentMatchesCategory ? 1 : 0);

            if (currentScore > existingScore) {
              configMap.set(key, c);
            }
          }
        });

        const configs = Array.from(configMap.values());

        // Also fetch any previous academic year opening dues for this student
        try {
          const odSnap = await getDocs(collection(db, "fee_opening_dues"));
          const sReg = (studentData.regNo || studentData.examNumber || "").trim().toLowerCase();
          odSnap.docs.forEach(d => {
            const od = d.data();
            const odReg = (od.regNo || "").trim().toLowerCase();
            const isMatch = (studentData.id && (od.studentId === studentData.id || od.uid === studentData.id)) ||
              (sReg && odReg && sReg === odReg);
            if (isMatch && Number(od.amount) > 0) {
              configs.push({
                id: d.id,
                head: od.head,
                academicYear: od.academicYear || "Previous AY",
                semester: od.semester || "All",
                amount: Number(od.amount),
                isOpeningDue: true
              });
            }
          });
        } catch (e) {
          console.warn("Error fetching student opening dues in portal:", e);
        }

        setFeeConfigs(configs);
      } catch (err) { console.error("Error fetching fee configs:", err); }
    };

    fetchConfigs();

    // 2. Real-time listen to payments for this student (matching by uid, studentId, examNumber)
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setLoading(false);
      return;
    }

    const regNo = studentData.regNo || studentData.examNumber || "";
    const studentDocId = studentData.id || studentData._docId || "";
    const paymentsMap = new Map();

    const updateCombinedPayments = () => {
      const payList = Array.from(paymentsMap.values());
      payList.sort((a, b) => {
        const da = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const db2 = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return db2 - da;
      });
      setPayments(payList);
      setLoading(false);
    };

    const handleSnapshot = (snapshot) => {
      snapshot.forEach((d) => {
        paymentsMap.set(d.id, { id: d.id, ...d.data(), _docId: d.id });
      });
      updateCombinedPayments();
    };

    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("uid", "==", currentUid)), handleSnapshot, () => setLoading(false)));
    unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("studentId", "==", currentUid)), handleSnapshot, () => setLoading(false)));
    if (regNo) {
      unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("examNumber", "==", regNo)), handleSnapshot, () => setLoading(false)));
      unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("regNo", "==", regNo)), handleSnapshot, () => setLoading(false)));
      unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("studentId", "==", regNo)), handleSnapshot, () => setLoading(false)));
    }
    if (studentDocId && studentDocId !== currentUid && studentDocId !== regNo) {
      unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("uid", "==", studentDocId)), handleSnapshot, () => setLoading(false)));
      unsubs.push(onSnapshot(query(collection(db, "fee_payments"), where("studentId", "==", studentDocId)), handleSnapshot, () => setLoading(false)));
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [studentData, seatCategory, studentStage, transportStages]);

  // Load fee payments made during the admission application (from the enquiries doc)
  useEffect(() => {
    return subscribeAppPaymentsForStudent(studentData, setAppPayments);
  }, [studentData]);

  // Semester configs from Academic Calendar — the source of "current academic year".
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      setSemesterConfigs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setSemesterConfigs([]));
    return () => unsub();
  }, []);

  // Current academic year per Academic Calendar: the semester_config covering
  // TODAY for this student's programme + batch. Falls back to '' (date logic below).
  const batchStartOf = (s) => {
    const m = String(s || '').match(/(\d{4})/);
    return m ? Number(m[1]) : null;
  };

  const activeCalendarConfig = useMemo(() => {
    if (!studentData || !semesterConfigs.length) return null;
    const progKey = formatProgrammeKey(studentData.programme || '');
    const bStart = batchStartOf(studentData.batch || '');
    if (!progKey || !bStart) return null;
    const mine = semesterConfigs.filter((c) => {
      if (c.programme && formatProgrammeKey(c.programme) !== progKey) return false;
      const batches = Array.isArray(c.batch) ? c.batch : (c.batch ? [c.batch] : []);
      if (!batches.length) return false;
      return batches.some((b) => batchStartOf(b) === bStart);
    });
    if (!mine.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inRange = mine.filter((c) => {
      if (!c.startDate || !c.endDate) return false;
      return today >= new Date(`${c.startDate}T00:00:00`) && today <= new Date(`${c.endDate}T00:00:00`);
    });
    const distToRange = (c) => {
      if (!c.startDate || !c.endDate) return Infinity;
      const t = today.getTime();
      const s = new Date(`${c.startDate}T00:00:00`).getTime();
      const e = new Date(`${c.endDate}T00:00:00`).getTime();
      if (isNaN(s) || isNaN(e)) return Infinity;
      if (t < s) return s - t;
      if (t > e) return t - e;
      return 0;
    };
    return (inRange.length ? inRange : [...mine].sort((a, b) => distToRange(a) - distToRange(b)))[0] || null;
  }, [studentData, semesterConfigs]);

  const calendarAcademicYear = useMemo(() => {
    return String(activeCalendarConfig?.academicYear || '').trim();
  }, [activeCalendarConfig]);

  const activeCalendarSemNumber = useMemo(() => {
    return activeCalendarConfig?.semesterNumber || '';
  }, [activeCalendarConfig]);

  const isRealYear = (y) => /^\d{4}-\d{4}$/.test(String(y || '').trim());

  const currentAcademicYear = () => {
    const now = new Date();
    const y = now.getFullYear();
    const start = (now.getMonth() + 1) >= 6 ? y : y - 1; // June–May academic year
    return `${start}-${start + 1}`;
  };

  // Target year = batch + Academic Calendar year (date fallback).
  const targetYear = calendarAcademicYear || currentAcademicYear();

  // Combined fee configurations: standard academic heads + approved transport passes
  const combinedFeeConfigs = useMemo(() => {
    const list = feeConfigs.filter((c) => !c._transport);

    if (approvedTransportApps.length > 0) {
      approvedTransportApps.forEach((app) => {
        const rawYear = app.academicYear || calendarAcademicYear || targetYear;
        const normYear = normalizeAcademicYearStr(rawYear) || targetYear;

        // Form rule:
        // "full academic year" -> academicYear with semester: "All"
        // "semester" or "monthly term fee" -> that specific semester (e.g. Sem 3)
        let resolvedSem = "All";
        if (app.billingTerm === "semester" || app.billingTerm === "monthly") {
          if (app.semester) {
            resolvedSem = String(app.semester).trim().startsWith("Sem")
              ? String(app.semester).trim()
              : `Sem ${app.semester}`;
          } else if (activeCalendarSemNumber) {
            resolvedSem = `Sem ${activeCalendarSemNumber}`;
          } else {
            resolvedSem = "Sem 1";
          }
        }

        const feeAmount = Number(app.calculatedFee || app.fee || 0);
        if (feeAmount > 0) {
          list.push({
            id: `transport_app_${app.id}`,
            head: "Transport Fee",
            academicYear: normYear,
            semester: resolvedSem,
            amount: feeAmount,
            _transport: true,
            transportAppId: app.id,
            transportApp: app,
            routeName: app.routeName,
            stageName: app.stageName,
            billingTerm: app.billingTerm,
            applicationNo: app.applicationNo,
            isReleasedWithDue: Boolean(app.isReleasedWithDue || app.releaseWithDue || app.duesDecision === "waive"),
            isExpired: Boolean(app.isPassExpired || app.isExpired || (app.validUntil && new Date(app.validUntil).getTime() < Date.now())),
            validUntil: app.validUntil || null
          });
        }
      });
    }

    return list;
  }, [feeConfigs, approvedTransportApps, calendarAcademicYear, targetYear, activeCalendarSemNumber]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const isSuccessfulPayment = (p) => {
    if (!p) return false;
    if (p.status === "FAILED" || p.status === "CANCELLED" || p.status === "cancelled") return false;
    return p.status === "SUCCESS" || p.status === "active" || p.status === undefined || p.status === null;
  };

  // Get effective payment date (prefers original paymentDate over Firestore sync/creation timestamp)
  const getEffectivePaymentDate = useCallback((p) => {
    if (!p) return new Date(0);
    const pd = p.paymentDate;
    if (pd) {
      if (typeof pd.toDate === "function") return pd.toDate();
      const d = new Date(pd);
      if (!isNaN(d.getTime())) return d;
    }
    const ca = p.verifiedAt || p.paidAt || p.createdAt || p.timestamp;
    if (ca) {
      if (typeof ca.toDate === "function") return ca.toDate();
      const d = new Date(ca);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(0);
  }, []);

  // Deduplicate application payments:
  // If an admission/application payment from enquiries has ALREADY been synced into fee_payments
  // (e.g. as REC-APP-ENQ... or enq_pay_...), exclude the duplicate raw appPayment!
  const unSyncedAppPayments = useMemo(() => {
    if (!appPayments || appPayments.length === 0) return [];
    if (!payments || payments.length === 0) return appPayments;

    // Track synced application payments present in fee_payments
    const syncedPayments = payments.filter((p) =>
      p.isApplicationFee === true ||
      p.source === "admission_enquiry" ||
      (typeof p.id === "string" && p.id.startsWith("enq_pay_")) ||
      (typeof p.receiptNo === "string" && p.receiptNo.startsWith("REC-APP-"))
    );

    if (syncedPayments.length === 0) return appPayments;

    // Mutable pool to match against 1-to-1
    const availableSynced = [...syncedPayments];

    return appPayments.filter((ap) => {
      const apHead = normHead(ap.feeHead);
      const apAmt = Number(ap.chargedAmount || ap.amount || 0);
      const apDocId = String(ap.enquiryId || ap._docId || "").toLowerCase();
      const apAppNo = String(ap.applicationNo || "").toLowerCase();

      const matchIdx = availableSynced.findIndex((sp) => {
        const spHead = normHead(sp.feeHead);
        const spAmt = Number(sp.chargedAmount || sp.amount || 0);

        if (spHead !== apHead) return false;
        if (Math.abs(spAmt - apAmt) > 0.01) return false;

        const spId = String(sp.id || "").toLowerCase();
        const spReceipt = String(sp.receiptNo || "").toLowerCase();
        const spRef = String(sp.refNo || "").toLowerCase();
        const spRemarks = String(sp.remarks || "").toLowerCase();
        const spExam = String(sp.examNumber || "").toLowerCase();

        if (apDocId && (spId.includes(apDocId) || spReceipt.includes(apDocId) || spRemarks.includes(apDocId))) {
          return true;
        }
        if (apAppNo && (spRef.includes(apAppNo) || spRemarks.includes(apAppNo) || spExam === apAppNo)) {
          return true;
        }

        return true;
      });

      if (matchIdx !== -1) {
        availableSynced.splice(matchIdx, 1);
        return false;
      }

      return true;
    });
  }, [appPayments, payments]);

  // Combined payment history for UI display
  const allHistoryPayments = useMemo(() => {
    const parentOrderIds = new Set(
      payments.filter((p) => p.parentOrderId).map((p) => String(p.parentOrderId).trim().toLowerCase())
    );

    const resolvedReg = studentData?.regNo || studentData?.examNumber || studentData?.admissionNo || "";

    const processedPayments = payments
      .filter((p) => !(p.parentOrderId && parentOrderIds.has(String(p.parentOrderId).trim().toLowerCase())))
      .map((p) => {
        let rec = { ...p };
        const allocs = Array.isArray(rec.allocations) && rec.allocations.length > 0
          ? rec.allocations
          : Array.isArray(rec.items) && rec.items.length > 1
            ? rec.items
            : null;

        if (allocs && allocs.length > 1) {
          const allocTotal = allocs.reduce((sum, a) => sum + Number(a.allocatedAmount || a.amount || 0), 0);
          if (allocTotal > 0) {
            rec.amount = allocTotal;
            rec.chargedAmount = allocTotal;
          }
          rec.feeHead = allocs.map((a) => a.feeHead || a.head).filter(Boolean).join(" + ");
          rec.items = allocs.map((a) => ({
            head: a.feeHead || a.head,
            amount: Number(a.allocatedAmount || a.amount || 0),
            academicYear: a.academicYear || rec.academicYear,
            semester: a.semester || rec.semester || "All",
          }));
          rec.allocations = allocs;
        }

        if (rec.receiptNo || rec.orderId) {
          rec.receiptNo = normalizeStandardReceiptNo(
            rec.receiptNo || rec.orderId,
            rec.academicYear,
            rec.paymentDate || rec.createdAt,
            resolvedReg
          );
        }

        return rec;
      });

    return [...processedPayments, ...unSyncedAppPayments].sort((a, b) => {
      const da = getEffectivePaymentDate(a);
      const db2 = getEffectivePaymentDate(b);
      return db2.getTime() - da.getTime();
    });
  }, [payments, unSyncedAppPayments, getEffectivePaymentDate, studentData]);

  // Each portal payment reduces exactly ONE config (year-tagged → that year,
  // untagged legacy → oldest due first). Application payments keep the
  // first-year-only rule. Shared allocator keeps office & portal consistent.
  // Declared BEFORE the gating memos below (they read this map).
  const paidByConfigId = useMemo(() => computePaidByConfig({
    configs: combinedFeeConfigs,
    portalPayments: payments.filter((p) => isSuccessfulPayment(p)),
    appPayments: unSyncedAppPayments.filter((p) => isSuccessfulPayment(p)),
  }), [combinedFeeConfigs, payments, unSyncedAppPayments]);

  // Reactive paid calculation per head/config, honoring portal payments, fee_payments,
  // and direct transport application payments/clearance.
  const paidForHead = useCallback((cfg) => {
    if (!cfg) return 0;
    let allocated = paidByConfigId.get(cfg.id) || 0;
    if (cfg._transport && cfg.transportApp) {
      const app = cfg.transportApp;
      const appPaid = Number(app.paidAmount || app.amountPaid || 0);
      if (app.paymentStatus === "Paid" || app.feesCleared === true || app.duesDecision === "cleared") {
        return Math.max(allocated, Number(cfg.amount) || 0);
      }
      if (appPaid > 0) {
        allocated = Math.max(allocated, appPaid);
      }
    }
    return allocated;
  }, [paidByConfigId]);

  // Visible year rule:
  //  - Previous academic year incomplete → show earliest due year (current stays hidden).
  //  - Previous years clear → show the calendar/target year, paid or not.
  const visibleYear = useMemo(() => {
    const years = [...new Set(combinedFeeConfigs.map((c) => String(c.academicYear || '—')).filter(isRealYear))]
      .sort((a, b) => yearStart(a) - yearStart(b));
    if (!years.length) return '';
    const dueByYear = new Map();
    combinedFeeConfigs.forEach((c) => {
      const y = String(c.academicYear || '—');
      if (!isRealYear(y)) return;
      const paid = paidForHead(c);
      dueByYear.set(y, (dueByYear.get(y) || 0) + Math.max(0, (Number(c.amount) || 0) - paid));
    });
    const dueOf = (y) => dueByYear.get(y) || 0;
    // Only years up to the target can pull the view back; future dues never do.
    const eligible = targetYear ? years.filter((y) => yearStart(y) <= yearStart(targetYear)) : years;
    const pool = eligible.length ? eligible : years;
    const pendingPrev = pool.find((y) => dueOf(y) > 0);
    if (pendingPrev) return pendingPrev;
    if (targetYear && years.includes(targetYear)) return targetYear;
    return years[years.length - 1];
  }, [combinedFeeConfigs, paidByConfigId, targetYear]);

  // Year-agnostic rows (e.g. Transport "—") always stay visible.
  const visibleFeeConfigs = useMemo(() => {
    if (!visibleYear) return combinedFeeConfigs.filter((c) => !isRealYear(c.academicYear));
    return combinedFeeConfigs.filter((c) => {
      const y = String(c.academicYear || '—');
      return y === visibleYear || !isRealYear(y);
    });
  }, [combinedFeeConfigs, visibleYear]);

  const groupedFeeConfigs = useMemo(() => {
    const sorted = [...visibleFeeConfigs].sort((a, b) => {
      const yr = (a.academicYear || '').localeCompare(b.academicYear || '');
      if (yr) return yr;
      const semA = a.semester || 'All';
      const semB = b.semester || 'All';
      return semA.localeCompare(semB);
    });
    const groups = [];
    let currentYear = null;
    let currentSem = null;
    sorted.forEach((cfg) => {
      const year = cfg.academicYear || '—';
      const sem = cfg.semester || 'All';
      if (!currentYear || currentYear.key !== year) {
        currentSem = null;
        currentYear = { key: year, academicYear: year, semGroups: [] };
        groups.push(currentYear);
      }
      if (!currentSem || currentSem.key !== sem) {
        currentSem = { key: sem, semester: sem, rows: [] };
        currentYear.semGroups.push(currentSem);
      }
      currentSem.rows.push(cfg);
    });
    return groups;
  }, [visibleFeeConfigs]);

  // Summary cards show ONLY the visible year's sums.
  const totalFee = useMemo(() => {
    return visibleFeeConfigs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }, [visibleFeeConfigs]);

  const visiblePaid = useMemo(() => {
    return visibleFeeConfigs.reduce((s, c) => s + Math.min(Number(c.amount) || 0, paidForHead(c)), 0);
  }, [visibleFeeConfigs, paidForHead]);

  const totalPaid = visiblePaid;

  const pending = Math.max(0, totalFee - totalPaid);

  const expiredTransportDues = useMemo(() => {
    return visibleFeeConfigs.filter(
      (cfg) => cfg._transport && cfg.isExpired && Math.max(0, (Number(cfg.amount) || 0) - paidForHead(cfg)) > 0
    );
  }, [visibleFeeConfigs, paidForHead]);


  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
  };

  const parseDateSafely = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val.toDate === "function") {
      try {
        const d = val.toDate();
        if (d && !isNaN(d.getTime())) return d;
      } catch (_) {}
    }
    if (typeof val.seconds === "number") {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val._seconds === "number") {
      const d = new Date(val._seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val === "number") {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val === "string") {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
      const parts = val.split(/[-/]/);
      if (parts.length === 3) {
        const d2 = new Date(parts[2], parts[1] - 1, parts[0]);
        if (!isNaN(d2.getTime())) return d2;
      }
    }
    return null;
  };

  const formatDate = (ts) => {
    const d = parseDateSafely(ts);
    if (!d) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatTime = (ts) => {
    const d = parseDateSafely(ts);
    if (!d) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const handleToggleHead = (cfg, due, ay, sem, isChecked) => {
    let updated;
    if (isChecked) {
      updated = [
        ...selectedHeads.filter(h => h.id !== cfg.id),
        {
          id: cfg.id,
          head: cfg.head || "Fee",
          due: Number(due) || 0,
          academicYear: cfg.academicYear || ay || "2026-2027",
          semester: cfg.semester || sem || "",
          totalAmount: Number(cfg.amount) || 0
        }
      ];
    } else {
      updated = selectedHeads.filter(h => h.id !== cfg.id);
    }
    setSelectedHeads(updated);

    if (updated.length > 0) {
      const totalDue = updated.reduce((s, h) => s + h.due, 0);
      setCustomPayAmount(String(totalDue));
    } else {
      setCustomPayAmount("");
    }
  };

  const computedAllocations = useMemo(() => {
    if (!selectedHeads.length) return [];
    const maxDue = selectedHeads.reduce((s, h) => s + h.due, 0);
    const enteredAmount = Math.min(Number(customPayAmount) || 0, maxDue);
    let remainingPay = enteredAmount;
    return selectedHeads.map(item => {
      const allocated = Math.min(remainingPay, item.due);
      const balanceDueAfter = Math.max(0, item.due - allocated);
      remainingPay = Math.max(0, remainingPay - allocated);
      return {
        ...item,
        allocatedAmount: allocated,
        balanceDueAfter,
        isFullyCovered: allocated >= item.due
      };
    });
  }, [selectedHeads, customPayAmount]);

  const handleMultiHeadPay = async () => {
    const amount = Number(customPayAmount);
    if (!amount || amount < 1) { setError("Enter a valid amount"); return; }
    const totalMax = selectedHeads.reduce((s, h) => s + h.due, 0);
    if (amount > totalMax) { setError(`Cannot pay more than ${formatCurrency(totalMax)}`); return; }

    setError("");
    setProcessing(true);
    try {
      const allocationsToPass = computedAllocations
        .filter(a => a.allocatedAmount > 0)
        .map(a => ({
          feeHead: a.head,
          head: a.head,
          amount: a.allocatedAmount,
          allocatedAmount: a.allocatedAmount,
          academicYear: a.academicYear || "",
          semester: a.semester || ""
        }));

      const createSession = httpsCallable(functions, "createPaymentSession");
      const returnUrl = window.location.origin + window.location.pathname;
      const result = await createSession({
        amount,
        feeHead: allocationsToPass.map(a => a.feeHead).join(" + "),
        academicYear: selectedHeads[0]?.academicYear || "",
        returnUrl,
        phone: studentData?.phone || studentData?.mobile || "",
        studentId: studentData?.id || studentData?.uid || "",
        studentEmail: studentData?.email || "",
        studentName: studentData?.displayName || studentData?.studentName || studentData?.name || "",
        programme: studentData?.programme || "UG",
        batch: studentData?.batch || "2026-2030",
        department: studentData?.department || "",
        regNo: studentData?.regNo || studentData?.examNumber || "",
        allocations: allocationsToPass
      });

      const { paymentUrl, orderId } = result.data;
      if (orderId) {
        localStorage.setItem("pending_student_fee_order_id", orderId);
      }
      ignoreBeforeUnloadRef.current = true;
      window.location.href = paymentUrl;
    } catch (err) {
      console.error("Multi-head payment session error:", err);
      const msg = err.code === "unavailable"
        ? "Payment gateway is temporarily down. Please try again in a few minutes."
        : err.code === "unauthenticated"
          ? "Your session has expired. Please log in again."
          : err.message || "Payment could not be initiated. Please try again.";
      setError(msg);
      setToast({ show: true, message: msg, type: "error" });
    } finally {
      setProcessing(false);
    }
  };

  const handlePayClick = async () => {
    const amount = Number(payModal.amount);
    if (!amount || amount < 1) { setError("Enter a valid amount"); return; }
    if (amount > payModal.maxAmount) { setError(`Cannot pay more than ${formatCurrency(payModal.maxAmount)}`); return; }

    setError("");
    setProcessing(true);
    try {
      const createSession = httpsCallable(functions, "createPaymentSession");
      const returnUrl = window.location.origin + window.location.pathname;
      const result = await createSession({
        amount,
        feeHead: payModal.feeHead,
        academicYear: payModal.academicYear || "",
        returnUrl,
        phone: studentData?.phone || studentData?.mobile || "",
        studentId: studentData?.id || studentData?.uid || "",
        studentEmail: studentData?.email || "",
        studentName: studentData?.displayName || studentData?.studentName || studentData?.name || "",
        programme: studentData?.programme || "UG",
        batch: studentData?.batch || "2026-2030",
        department: studentData?.department || "",
        regNo: studentData?.regNo || studentData?.examNumber || "",
      });

      const { paymentUrl, orderId } = result.data;
      if (orderId) {
        localStorage.setItem("pending_student_fee_order_id", orderId);
      }
      setPayModal({ ...payModal, open: false });
      ignoreBeforeUnloadRef.current = true;
      window.location.href = paymentUrl;
    } catch (err) {
      console.error("Payment session error:", err);
      const msg = err.code === "unavailable"
        ? "Payment gateway is temporarily down. Please try again in a few minutes."
        : err.code === "unauthenticated"
          ? "Your session has expired. Please log in again."
          : err.message || "Payment could not be initiated. Please try again.";
      setError(msg);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="space-y-8 no-print">
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] max-w-md animate-in slide-in-from-right-2 fade-in duration-300 ${
          toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          toast.type === "error" ? "bg-red-50 border-red-200 text-red-800" :
          "bg-amber-50 border-amber-200 text-amber-800"
        } border-2 rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3`}>
          <div className={`p-1 rounded-full ${
            toast.type === "success" ? "bg-emerald-100" :
            toast.type === "error" ? "bg-red-100" : "bg-amber-100"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} className="text-emerald-600" /> :
             toast.type === "error" ? <Ban size={18} className="text-red-600" /> :
             <AlertCircle size={18} className="text-amber-600" />}
          </div>
          <p className="text-sm font-semibold flex-1">{toast.message}</p>
          <button onClick={() => setToast(null)} className="p-1 hover:bg-black/5 rounded-lg shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Fee</p>
          <p className="text-2xl md:text-3xl font-black text-[#120c7a] mt-2">{formatCurrency(totalFee)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Paid</p>
          <p className="text-2xl md:text-3xl font-black text-emerald-600 mt-2">{formatCurrency(totalPaid)}</p>
        </div>
        <div className={`rounded-2xl shadow-lg border p-6 ${pending > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <AlertCircle size={14} className={pending > 0 ? 'text-red-500' : 'text-emerald-500'} />
            <span className={pending > 0 ? 'text-red-600' : 'text-emerald-600'}>Pending Dues</span>
          </p>
          <p className={`text-2xl md:text-3xl font-black mt-2 ${pending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(pending)}
          </p>
        </div>
      </div>

      {/* Alert banner if an expired transport pass has pending dues */}
      {expiredTransportDues.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl shadow-sm flex items-start gap-3">
          <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-amber-900">
              Outstanding Transport Dues from Expired Pass ({expiredTransportDues.length})
            </h4>
            <p className="text-xs font-medium text-amber-800 mt-0.5">
              Your previous boarding pass validity has expired, but the term fee remains due until paid. You can clear this balance directly from the Fee Structure table below.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-6 py-3 flex items-center gap-3">
            <Wallet size={20} className="text-white" />
            <h2 className="text-white font-bold text-lg">Fee Structure</h2>
            {visibleYear ? (
              <span className="ml-auto text-[10px] font-bold bg-white/15 text-white px-2.5 py-1 rounded-full uppercase tracking-widest">{visibleYear} only</span>
            ) : null}
          </div>
          {visibleYear && targetYear && yearStart(visibleYear) < yearStart(targetYear) ? (
            <p className="px-6 pt-3 text-[11px] font-semibold text-amber-600">
              Showing {visibleYear} dues only — clear them to unlock {targetYear}.
            </p>
          ) : null}
          {visibleFeeConfigs.length === 0 ? (
            <div className="py-12 text-center">
              <IndianRupee size={36} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-400">No fee structure configured.</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Academic Year</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Sem</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Fee Head</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Amount</th>
                    <th className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedFeeConfigs.flatMap((yearGroup) => {
                    const totalYearRows = yearGroup.semGroups.reduce((s, sg) => s + sg.rows.length + (sg.rows.length > 1 ? 1 : 0), 0);
                    let yearRowIdx = 0;
                    return yearGroup.semGroups.flatMap((semGroup) => {
                      const isFirstYearRow = yearRowIdx === 0;
                      
                      // Calculate semester totals & payments
                      let semTotal = 0;
                      let semPaid = 0;
                      semGroup.rows.forEach(r => {
                        const headAmt = Number(r.amount) || 0;
                        const rawPaid = paidForHead(r);
                        semTotal += headAmt;
                        semPaid += Math.min(headAmt, rawPaid);
                      });
                      const semRemaining = Math.max(0, semTotal - semPaid);

                      const rows = semGroup.rows.map((cfg, idx) => {
                        const paidForThisHead = paidForHead(cfg);
                        const remainingForThisHead = Math.max(0, Number(cfg.amount) - paidForThisHead);
                        const isFullyPaid = remainingForThisHead === 0;
                        const isPartiallyPaid = paidForThisHead > 0 && remainingForThisHead > 0;

                        const tr = (
                          <tr key={cfg.id || idx} className="hover:bg-slate-50 transition-colors">
                            {isFirstYearRow && idx === 0 ? (
                              <td className="px-4 py-3 text-xs font-bold text-slate-600 align-top border border-slate-200" rowSpan={totalYearRows}>{yearGroup.academicYear}</td>
                            ) : null}
                            {idx === 0 ? (
                              <td className="px-4 py-3 text-xs font-bold text-slate-600 align-top border border-slate-200" rowSpan={semGroup.rows.length}>{semGroup.semester}</td>
                            ) : null}
                            <td
                              className={`px-4 py-3 text-sm font-bold border border-slate-200 transition-all ${
                                isFullyPaid
                                  ? "text-slate-400 cursor-default"
                                  : "text-slate-700 cursor-pointer hover:text-[#120c7a] hover:bg-blue-50/30"
                              }`}
                              onClick={() => {
                                if (!isFullyPaid) {
                                  setPayModal({ open: true, feeHead: cfg.head || 'Fee', academicYear: cfg.academicYear || '', amount: String(remainingForThisHead), maxAmount: remainingForThisHead });
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{cfg.head || 'Fee'}</span>
                                {cfg.isOpeningDue && (
                                  <span className="inline-flex items-center text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    Previous Year Due ({cfg.academicYear})
                                  </span>
                                )}
                                {cfg._transport && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                    <Bus size={10} />
                                    {cfg.routeName || 'Transport'}
                                  </span>
                                )}
                                {cfg.isReleasedWithDue && (
                                  <span className="inline-flex items-center text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    Seat Released • Balance Due
                                  </span>
                                )}
                                {cfg.isExpired && !cfg.isReleasedWithDue && !isFullyPaid && (
                                  <span className="inline-flex items-center text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                    Pass Expired • Due Pending
                                  </span>
                                )}
                                {cfg.isExpired && isFullyPaid && (
                                  <span className="inline-flex items-center text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                    Expired Pass (Settled)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td
                              className={`px-4 py-3 text-right text-sm font-black border border-slate-200 transition-all ${
                                isFullyPaid
                                  ? "text-emerald-600 cursor-default font-bold"
                                  : "text-slate-700 cursor-pointer hover:text-[#120c7a] hover:bg-blue-50/30"
                              }`}
                              onClick={() => {
                                if (!isFullyPaid) {
                                  setPayModal({ open: true, feeHead: cfg.head || 'Fee', academicYear: cfg.academicYear || '', amount: String(remainingForThisHead), maxAmount: remainingForThisHead });
                                }
                              }}
                            >
                              {isFullyPaid ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-black text-[#120c7a]">{formatCurrency(cfg.amount)}</span>
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">Paid</span>
                                </div>
                              ) : isPartiallyPaid ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-black text-amber-600">{formatCurrency(remainingForThisHead)} <span className="text-[9px] font-bold text-amber-600 uppercase">Due</span></span>
                                  <span className="text-[9px] text-slate-400 font-semibold">Total: {formatCurrency(cfg.amount)} (Paid: {formatCurrency(paidForThisHead)})</span>
                                </div>
                              ) : (
                                formatCurrency(cfg.amount)
                              )}
                            </td>
                            <td className="px-3 py-3 text-center border border-slate-200">
                              {isFullyPaid ? null : (
                                <input
                                  type="checkbox"
                                  checked={selectedHeads.some(s => s.id === cfg.id)}
                                  onChange={(e) => handleToggleHead(cfg, remainingForThisHead, yearGroup.academicYear, semGroup.semester, e.target.checked)}
                                  className="w-4 h-4 text-[#120c7a] rounded border-slate-300 focus:ring-2 focus:ring-blue-500 cursor-pointer accent-[#120c7a]"
                                  title={`Select ${cfg.head} (Due: ${formatCurrency(remainingForThisHead)})`}
                                />
                              )}
                            </td>
                          </tr>
                        );
                        return tr;
                      });
                      if (semGroup.rows.length > 1) {
                        const isSemFullyPaid = semRemaining === 0;
                        const isSemPartiallyPaid = semPaid > 0 && semRemaining > 0;
                        rows.push(
                          <tr key={`sem-total-${yearGroup.key}-${semGroup.key}`} className="bg-blue-50/50">
                            <td className="px-4 py-3 text-[10px] font-bold text-blue-600 text-right border border-slate-200">Sem Total</td>
                            <td className="px-4 py-3 border border-slate-200" />
                            <td className="px-4 py-3 text-right text-xs font-black text-blue-700 border border-slate-200">
                              {isSemFullyPaid ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-black text-emerald-700">{formatCurrency(semTotal)}</span>
                                  <span className="text-emerald-600 text-[10px] font-bold">Paid</span>
                                </div>
                              ) : isSemPartiallyPaid ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-black text-blue-700">{formatCurrency(semRemaining)} <span className="text-[9px] font-bold text-blue-600 uppercase">Due</span></span>
                                  <span className="text-[9px] text-blue-400 font-semibold">Total: {formatCurrency(semTotal)} (Paid: {formatCurrency(semPaid)})</span>
                                </div>
                              ) : (
                                formatCurrency(semTotal)
                              )}
                            </td>
                            <td className="border border-slate-200" />
                          </tr>
                        );
                      }
                      yearRowIdx += semGroup.rows.length;
                      return rows;
                    });
                  })}
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-sm font-black text-slate-800 border border-slate-200">Outstanding Total</td>
                    <td className="px-4 py-3 text-right text-sm font-black text-[#120c7a] border border-slate-200">
                      {pending === 0 ? (
                        <span className="text-emerald-600">All Fees Paid</span>
                      ) : totalPaid > 0 ? (
                        <div className="flex flex-col items-end">
                          <span>{formatCurrency(pending)}</span>
                          <span className="text-[9px] text-slate-400 font-semibold">Total Config: {formatCurrency(totalFee)}</span>
                        </div>
                      ) : (
                        formatCurrency(pending)
                      )}
                    </td>
                    <td className="border border-slate-200" />
                  </tr>
                </tbody>
              </table>
              </div>

              {/* Selected Heads Checkout / Partial Payment Card */}
              {selectedHeads.length > 0 && (
                <div className="mt-6 bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-slate-50 border-2 border-[#120c7a]/20 rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#120c7a] text-white flex items-center justify-center shadow-md">
                        <IndianRupee size={16} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 text-sm">Pay Selected Dues ({selectedHeads.length} Selected)</h4>
                        <p className="text-[11px] text-slate-500 font-medium">Select one or more fee heads to pay together with custom partial payment</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedHeads([]); setCustomPayAmount(""); }}
                      className="text-xs font-bold text-slate-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Clear Selection
                    </button>
                  </div>

                  {/* Selected heads list & amount adjustment */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Paying Amount (₹)
                      </label>
                      <div className="relative">
                        <IndianRupee size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          value={customPayAmount}
                          onChange={(e) => {
                            let val = e.target.value;
                            const maxDue = selectedHeads.reduce((s, h) => s + h.due, 0);
                            if (val !== "") {
                              const num = Number(val);
                              if (maxDue > 0 && num > maxDue) {
                                val = String(maxDue);
                                setError(`Amount cannot exceed selected dues of ${formatCurrency(maxDue)}`);
                              } else {
                                setError("");
                              }
                            }
                            setCustomPayAmount(val);
                          }}
                          min="1"
                          max={selectedHeads.reduce((s, h) => s + h.due, 0) || undefined}
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] transition-all text-base"
                          placeholder="Enter amount to pay"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Total Due of Selected Heads: <span className="font-bold text-slate-700">{formatCurrency(selectedHeads.reduce((s, h) => s + h.due, 0))}</span>
                      </p>
                    </div>

                    <div className="flex items-end gap-2.5">
                      <button
                        type="button"
                        onClick={handlePrintDueDemandBill}
                        className="py-3 px-4 bg-white border-2 border-[#120c7a] text-[#120c7a] hover:bg-blue-50/50 text-xs sm:text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                        title="Print official single sheet demand voucher for selected dues"
                      >
                        <Printer size={16} />
                        <span className="hidden sm:inline">Print Due Bill (Single Sheet)</span>
                        <span className="sm:hidden">Print Bill</span>
                      </button>
                      <button
                        onClick={handleMultiHeadPay}
                        disabled={processing || !customPayAmount || Number(customPayAmount) <= 0}
                        className="flex-1 py-3 bg-[#120c7a] text-white text-sm font-black rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#120c7a]/25 cursor-pointer"
                      >
                        {processing ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
                        Pay {customPayAmount ? formatCurrency(Number(customPayAmount)) : ""} via HDFC SmartGateway
                      </button>
                    </div>
                  </div>

                  {/* Allocation breakdown preview */}
                  {computedAllocations.length > 0 && (
                    <div className="bg-white/80 border border-blue-200/80 rounded-xl p-3.5 space-y-2">
                      <p className="text-xs font-extrabold text-blue-900 flex items-center justify-between border-b border-blue-100 pb-1.5">
                        <span>Allocation across checked heads:</span>
                        <span className="text-emerald-700 font-mono">Paying: {formatCurrency(Number(customPayAmount) || 0)}</span>
                      </p>
                      <div className="space-y-1.5">
                        {computedAllocations.map((alloc, idx) => (
                          <div key={alloc.id || idx} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50/60 px-3 py-1.5 rounded-lg border border-slate-100">
                            <span className="font-semibold">{idx + 1}. {alloc.head} (Due: {formatCurrency(alloc.due)}):</span>
                            <span className="font-mono text-right">
                              <span className="text-emerald-700 font-bold">{formatCurrency(alloc.allocatedAmount)}</span>
                              {alloc.balanceDueAfter > 0 ? (
                                <span className="text-amber-600 font-bold ml-2 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px]">
                                  {formatCurrency(alloc.balanceDueAfter)} will remain Due
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-bold ml-2 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                                  Fully Settled ✓
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Receipt size={20} className="text-white" />
              <h2 className="text-white font-bold text-lg">Payment History</h2>
            </div>
            {selectedHistoryPayments.length > 0 && (
              <button
                type="button"
                onClick={handlePrintConsolidatedHistory}
                className="px-4 py-1.5 bg-white text-[#120c7a] hover:bg-blue-50 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Print consolidated receipt for selected payments on single sheet"
              >
                <Printer size={14} />
                <span>Print Consolidated Receipt ({selectedHistoryPayments.length} Selected)</span>
              </button>
            )}
          </div>
          {allHistoryPayments.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt size={36} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-400">No payments recorded.</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={
                          allHistoryPayments.filter(isSuccessfulPayment).length > 0 &&
                          selectedHistoryPayments.length === allHistoryPayments.filter(isSuccessfulPayment).length
                        }
                        onChange={(e) => handleSelectAllHistoryPayments(e.target.checked)}
                        className="w-4 h-4 text-[#120c7a] rounded border-slate-300 focus:ring-2 focus:ring-blue-500 cursor-pointer accent-[#120c7a]"
                        title="Select All Paid Receipts"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Receipt / Order</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Head</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allHistoryPayments.map((p, i) => {
                    const isPaid = isSuccessfulPayment(p);
                    const st = isPaid ? PAYMENT_STATUS.SUCCESS : (PAYMENT_STATUS[p.status] || PAYMENT_STATUS.PENDING);
                    const effDate = getEffectivePaymentDate(p);
                    const isAppPayment = Boolean(
                      p._source === "Application" ||
                      p.isApplicationFee === true ||
                      p.source === "admission_enquiry" ||
                      (typeof p.id === "string" && p.id.startsWith("enq_pay_")) ||
                      (typeof p.receiptNo === "string" && p.receiptNo.startsWith("REC-APP-")) ||
                      (typeof p.orderId === "string" && p.orderId.startsWith("APP "))
                    );
                    const isNetkampus = Boolean(
                      p.isLegacySettlement ||
                      p.settlementSource === "Netkampus" ||
                      (p.mode || "").toLowerCase().includes("netkampus") ||
                      (p.remarks || "").toLowerCase().includes("netkampus")
                    );
                    const pKey = p.id || p.orderId || p.receiptNo;
                    return (
                      <tr key={p.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 text-center">
                          {isPaid && !isNetkampus ? (
                            <input
                              type="checkbox"
                              checked={selectedHistoryPayments.includes(pKey)}
                              onChange={() => handleToggleSelectHistoryPayment(pKey)}
                              className="w-4 h-4 text-[#120c7a] rounded border-slate-300 focus:ring-2 focus:ring-blue-500 cursor-pointer accent-[#120c7a]"
                              title="Select for Consolidated Print"
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-600">
                          <span className="block">{formatDate(effDate)}</span>
                          {effDate && <span className="text-[10px] text-slate-400">{formatTime(effDate)}</span>}
                        </td>
                        <td className="px-3 py-3">
                          {isNetkampus ? (
                            <div>
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-[10px] font-black inline-block">
                                Settled by Netkampus
                              </span>
                              {(p.refNo || p.transactionId) && (
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                  Txn: {p.refNo || p.transactionId}
                                </span>
                              )}
                            </div>
                          ) : (
                            <>
                              <span className="text-xs font-mono font-bold text-slate-700 block">{normalizeStandardReceiptNo(p.receiptNo || p.orderId, p.academicYear, p.paymentDate || p.createdAt, studentData?.regNo || studentData?.examNumber) || '-'}</span>
                              {p.gatewayResponse?.rrn && (
                                <span className="text-[10px] text-slate-400 font-mono">RRN: {p.gatewayResponse.rrn}</span>
                              )}
                              {isAppPayment && (
                                <span className="text-[9px] font-bold text-blue-500 block">Application</span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-600">{p.feeHead || '-'}</td>
                        <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                          {isPaid
                            ? formatCurrency(p.chargedAmount || p.amount)
                            : formatCurrency(p.amount)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.status === "PENDING" ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.bg} ${st.color} ${st.border} border inline-flex items-center gap-1`}>
                                <Clock size={10} />
                                {st.label}
                              </span>
                              <button
                                onClick={() => verifyPaymentOnReturn(p.orderId)}
                                className="p-1 hover:bg-amber-100 rounded text-slate-500 hover:text-amber-700 transition-all flex items-center justify-center hover:rotate-180 duration-300"
                                title="Verify Status"
                              >
                                <RefreshCw size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isNetkampus ? "bg-purple-50 text-purple-700 border-purple-200 border" : `${st.bg} ${st.color} ${st.border} border`}`}>
                                {isNetkampus ? "Settled by Netkampus" : st.label}
                              </span>
                              {isPaid && !isNetkampus && (
                                <button
                                  onClick={() => setReceiptModal({ open: true, payment: p })}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-[#120c7a] transition-all"
                                  title="Print Receipt"
                                >
                                  <Receipt size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {payModal.open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => { if (!processing) setPayModal({ ...payModal, open: false }); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-800">Pay Fee</h3>
              <button
                onClick={() => { if (!processing) setPayModal({ ...payModal, open: false }); }}
                disabled={processing}
                className="p-2 hover:bg-zinc-100 rounded-xl disabled:opacity-30"
              ><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Fee Head{payModal.academicYear ? ` • ${payModal.academicYear}` : ""}</p>
                <p className="text-lg font-black text-zinc-800 mt-1">{payModal.feeHead}</p>
                <div className="mt-3 pt-3 border-t border-blue-100/50">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Amount to Pay</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <IndianRupee size={18} className="text-zinc-700" />
                    <input
                      type="number"
                      min={1}
                      max={payModal.maxAmount}
                      value={payModal.amount}
                      onChange={e => setPayModal({ ...payModal, amount: e.target.value })}
                      disabled={processing}
                      className="w-40 bg-transparent text-3xl font-black text-zinc-800 outline-none disabled:opacity-50"
                    />
                    <span className="text-sm text-zinc-400">/ {formatCurrency(payModal.maxAmount)}</span>
                  </div>
                  {Number(payModal.amount) > payModal.maxAmount && (
                    <p className="text-xs font-bold text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> Cannot exceed {formatCurrency(payModal.maxAmount)}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-start gap-2">
                  <Banknote size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-amber-700">HDFC SmartGateway</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Secure payment via HDFC Bank. You will be redirected to the payment page.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold text-red-700">{error}</p>
                </div>
              )}

              {processing && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex items-start gap-2 animate-pulse">
                  <Loader2 size={14} className="text-[#120c7a] mt-0.5 shrink-0 animate-spin" />
                  <div>
                    <p className="text-xs font-bold text-[#120c7a]">Contacting HDFC Bank...</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">
                      Please do not close or refresh this page. We are securely preparing your checkout session.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
              <button
                onClick={() => { if (!processing) setPayModal({ ...payModal, open: false }); }}
                disabled={processing}
                className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl disabled:opacity-30"
              >Cancel</button>
              <button
                onClick={handlePayClick}
                disabled={processing}
                className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#120c7a]/20 transition-all"
              >
                {processing ? (
                  <><Loader2 size={16} className="animate-spin" /> Processing...</>
                ) : (
                  <><ArrowRight size={16} /> Pay {formatCurrency(Number(payModal.amount) || 0)}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Status Modal */}
      {statusModal.open && (() => {
        const resolvedFeeHead = payments.find(p => p.orderId === statusModal.orderId)?.feeHead || statusModal.feeHead || "Fee Payment";
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
              <div className={`p-8 text-center ${
                statusModal.success
                  ? 'bg-gradient-to-b from-emerald-50 to-white'
                  : statusModal.error?.toLowerCase().includes("pending")
                    ? 'bg-gradient-to-b from-amber-50 to-white'
                    : 'bg-gradient-to-b from-red-50 to-white'
              }`}>
                <div className="flex justify-center mb-4">
                  {statusModal.success ? (
                    <div className="p-3 bg-emerald-100 rounded-full animate-bounce">
                      <CheckCircle2 size={48} className="text-emerald-600" />
                    </div>
                  ) : statusModal.error?.toLowerCase().includes("pending") ? (
                    <div className="p-3 bg-amber-100 rounded-full animate-pulse">
                      <Clock size={48} className="text-amber-600" />
                    </div>
                  ) : (
                    <div className="p-3 bg-red-100 rounded-full">
                      <AlertCircle size={48} className="text-red-600" />
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-800">
                  {statusModal.success ? "Payment Successful!" : statusModal.error?.toLowerCase().includes("pending") ? "Payment Pending" : "Payment Failed"}
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  {statusModal.success ? "Thank you! Your payment has been received." : statusModal.error || "Something went wrong during transaction validation."}
                </p>

                <div className="mt-6 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">Order ID</span>
                    <span className="font-mono font-bold text-slate-700">{statusModal.orderId}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">Fee Head</span>
                    <span className="font-bold text-slate-700">{resolvedFeeHead}</span>
                  </div>
                  {statusModal.success && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-bold">Amount Paid</span>
                      <span className="font-black text-slate-800">{formatCurrency(statusModal.amount)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex justify-center gap-3 bg-slate-50">
                {statusModal.success && (
                  <button
                    onClick={() => {
                      const pay = payments.find(p => p.orderId === statusModal.orderId) || {
                        orderId: statusModal.orderId,
                        feeHead: resolvedFeeHead,
                        amount: statusModal.amount,
                        chargedAmount: statusModal.amount,
                        createdAt: { toDate: () => new Date() },
                        status: "SUCCESS"
                      };
                      setReceiptModal({ open: true, payment: pay });
                      setStatusModal({ ...statusModal, open: false });
                    }}
                    className="px-5 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20 transition-all"
                  >
                    <Receipt size={14} /> View Receipt
                  </button>
                )}
                <button
                  onClick={() => setStatusModal({ ...statusModal, open: false })}
                  className="px-5 py-2.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-300 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Official Voucher Receipt Modal */}
      <OfficialFeeReceiptModal
        open={receiptModal.open}
        onClose={() => setReceiptModal({ open: false, payment: null })}
        payment={receiptModal.payment}
        studentData={studentData}
      />

      {/* Fullscreen Secure Payment Processing Overlay */}
      {processing && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl z-[999] flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-300">
          <div className="max-w-md w-full space-y-8">
            {/* Animated Secure Brand Glow & Rings */}
            <div className="relative flex items-center justify-center h-28 w-28 mx-auto">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#120c7a]/30 to-violet-500/30 blur-xl animate-pulse" />
              {/* Outer brand ring */}
              <div className="absolute inset-0 rounded-full border-4 border-slate-900 border-t-[#120c7a] border-r-violet-600 animate-spin duration-[1200ms]" />
              {/* Inner counter-rotating ring */}
              <div className="absolute inset-2 rounded-full border-2 border-slate-900 border-t-violet-400 border-l-[#120c7a] animate-spin duration-[800ms]" style={{ animationDirection: "reverse" }} />
              {/* Glowing center chip */}
              <div className="h-16 w-16 bg-white/95 rounded-full shadow-2xl relative z-10 flex items-center justify-center border border-[#120c7a]/15">
                <IndianRupee className="h-7 w-7 text-[#120c7a] animate-pulse" />
              </div>
            </div>

            {/* Glassmorphic progress box */}
            <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md space-y-5 shadow-2xl relative overflow-hidden">
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white tracking-wide">Connecting HDFC Gateway</h3>
                <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider animate-pulse min-h-[16px]">
                  {([
                    "Initiating secure connection...",
                    "Creating transaction session...",
                    "Verifying gateway handshake...",
                    "Acquiring checkout token...",
                    "Redirecting to HDFC Bank..."
                  ])[processingStep] || "Processing redirect..."}
                </p>
              </div>

              {/* Glowing progress line */}
              <div className="w-full bg-slate-900/60 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-[#120c7a] via-violet-500 to-indigo-400 h-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" 
                  style={{ width: `${(processingStep + 1) * 20}%` }}
                />
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
                <span>Secured 256-bit Connection</span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5">
              <Loader2 size={12} className="text-yellow-400 animate-spin" />
              <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider animate-pulse">
                Do not refresh, go back, or close this window
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
