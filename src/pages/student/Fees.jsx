import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db, auth, functions } from "../../firebase";
import { doc, getDoc, collection, getDocs, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import {
  IndianRupee, AlertCircle, Loader2, Wallet, Receipt, X, CheckCircle2,
  ArrowRight, ExternalLink, Clock, RefreshCw, Banknote, Copy, Check,
  Ban, ShieldAlert,
} from "lucide-react";
import { formatBatchDisplay, formatProgrammeKey, formatDepartmentDisplay, sanitizeKey } from "../../lib/utils";

const PAYMENT_STATUS = {
  PENDING: { label: "Pending", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  SUCCESS: { label: "Paid", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  FAILED: { label: "Failed", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
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
            collected.push({
              id: pId,
              status: "SUCCESS",
              feeHead: p.feeCategory || p.feeHead || p.head || "Application Fee",
              amount: amt,
              chargedAmount: amt,
              paymentDate: dateVal,
              createdAt: dateVal,
              mode: p.paymentMode || p.mode || "cash",
              receiptNo: `APP ${data.applicationNo || data.enquiryId || docId}`,
              orderId: `APP ${data.applicationNo || data.enquiryId || docId}`,
              _source: "Application",
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
          collected.push({
            id: pId,
            status: "SUCCESS",
            feeHead: data.feeCategory || "Application Fee",
            amount: amt,
            chargedAmount: amt,
            paymentDate: dateVal,
            createdAt: dateVal,
            mode: data.paymentMode || "cash",
            receiptNo: `APP ${data.applicationNo || data.enquiryId || docId}`,
            orderId: `APP ${data.applicationNo || data.enquiryId || docId}`,
            _source: "Application",
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
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [seatCategory, setSeatCategory] = useState("");
  const [studentStage, setStudentStage] = useState("");
  const [transportStages, setTransportStages] = useState([]);
  const [statusModal, setStatusModal] = useState({ open: false, success: false, orderId: "", amount: 0, feeHead: "", error: "", tampered: false, duplicate: false });
  const [receiptModal, setReceiptModal] = useState({ open: false, payment: null });
  const ignoreBeforeUnloadRef = useRef(false);

  const verifyPaymentOnReturn = useCallback(async (orderId) => {
    try {
      const verifyFn = httpsCallable(functions, "verifyPayment");
      const result = await verifyFn({ orderId });
      const data = result.data;
      if (data.success) {
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
    }
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

  // Load seatCategory from _student_data or _profile_data or enquiries (reactive)
  useEffect(() => {
    if (!studentData) return;
    const getQuota = (obj) => obj?.seatCategory || obj?.quotaAskedFor || obj?.quota || obj?.studentCategory || "";
    const reg = studentData.regNo || studentData.examNumber || "";
    const appNo = studentData.applicationNo || studentData.enquiryId || studentData._profile_data?.applicationNo || "";

    (async () => {
      let foundQuota = getQuota(studentData) || getQuota(studentData._profile_data);
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
                if (!foundStage) foundStage = extra.transportStage || "";
              }
            }
          }
        } catch (_) {}
      }

      // If still missing, check enquiries collection
      if (!foundQuota) {
        const lookupKeys = [appNo, reg, studentData.id, studentData.uid, studentData._docId].filter(Boolean);
        for (const k of lookupKeys) {
          try {
            const q1 = await getDocs(query(collection(db, "enquiries"), where("applicationNo", "==", k)));
            if (!q1.empty) {
              const d = q1.docs[0].data();
              foundQuota = getQuota(d);
              if (foundQuota) break;
            }
            const q2 = await getDocs(query(collection(db, "enquiries"), where("enquiryId", "==", k)));
            if (!q2.empty) {
              const d = q2.docs[0].data();
              foundQuota = getQuota(d);
              if (foundQuota) break;
            }
          } catch (_) {}
        }
      }

      if (foundQuota) setSeatCategory(foundQuota);
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

        feeSnap.forEach((d) => {
          const data = d.data();
          const normDataProg = formatProgrammeKey(data.programme);
          const normDataDept = (data.department || "").replace(/[_.\s]/g, '').toLowerCase();
          const normDataBatch = (data.batch || "").trim().toLowerCase();

          const isProgMatch = normDataProg && normDataProg === normStudentProg;
          const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
          const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;
          const isQuotaMatch = isQuotaApplicable(data.quota, resolvedQuota);

          if (isProgMatch && isDeptMatch && isBatchMatch && isQuotaMatch) {
            matchedConfigs.push({ id: d.id, ...data });
          }
        });

        // Deduplicate & prioritize quota-specific configs over generic configs per (academicYear + semester + head)
        const configMap = new Map();
        matchedConfigs.forEach((c) => {
          const key = `${c.academicYear || ''}_${c.semester || ''}_${normHead(c.head)}`;
          const existing = configMap.get(key);
          if (!existing) {
            configMap.set(key, c);
          } else {
            const existingMatchesExact = isQuotaMatchExact(existing.quota, resolvedQuota);
            const currentMatchesExact = isQuotaMatchExact(c.quota, resolvedQuota);

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

        const configs = Array.from(configMap.values());

        // Transport fee: match the student's transport stage to a configured stage
        if (studentStage && transportStages.length) {
          const stageMatch = transportStages.find(t => String(t.stageNo).trim() === String(studentStage).trim());
          if (stageMatch && Number(stageMatch.fee)) {
            configs.push({
              id: `transport_${stageMatch.id}`,
              head: "Transport Fee",
              academicYear: "—",
              semester: "All",
              amount: Number(stageMatch.fee),
              _transport: true
            });
          }
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const groupedFeeConfigs = useMemo(() => {
    const sorted = [...feeConfigs].sort((a, b) => {
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
  }, [feeConfigs]);

  const totalFee = useMemo(() => {
    return feeConfigs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }, [feeConfigs]);

  const isSuccessfulPayment = (p) => {
    if (!p) return false;
    if (p.status === "FAILED" || p.status === "CANCELLED" || p.status === "cancelled") return false;
    return p.status === "SUCCESS" || p.status === "active" || p.status === undefined || p.status === null;
  };

  const totalPaid = useMemo(() => {
    return [...payments, ...appPayments]
      .filter((p) => isSuccessfulPayment(p))
      .reduce((s, p) => s + (Number(p.chargedAmount || p.amount) || 0), 0);
  }, [payments, appPayments]);

  const pending = Math.max(0, totalFee - totalPaid);

  // Determine the FIRST academic year per fee head — application-time payments only reduce that year's head
  const yearStart = (y) => Number(String(y || '').match(/^\d{4}/)?.[0] || 99999);
  const normHead = (s) => {
    const str = String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
    if (!str) return '';
    if (str.includes('application') || str.includes('app fee') || str.includes('consortium') || str.includes('registration') || str.includes('enquiry')) return 'application fee';
    if (str.includes('admission')) return 'admission fee';
    if (str.includes('caution')) return 'caution deposit';
    if (str.includes('tuition')) return 'tuition fee';
    if (str.includes('other')) return 'other fee';
    if (str.includes('transport')) return 'transport fee';
    if (str.includes('hostel')) return 'hostel fee';
    return str;
  };

  // A config is the "first year" instance of its head when it's the only config for that head,
  // or when all same-headed configs share the same year, or when it's the chronologically earliest year.
  const isFirstYearConfig = (cfg) => {
    const nh = normHead(cfg.head);
    const siblings = feeConfigs.filter((c) => normHead(c.head) === nh);
    if (siblings.length <= 1) return true;
    const distinctYears = [...new Set(siblings.map((c) => String(c.academicYear || '').trim()))];
    if (distinctYears.length <= 1) return true;
    return yearStart(cfg.academicYear) === Math.min(...siblings.map((c) => yearStart(c.academicYear)));
  };

  const paidForHead = (cfg) => {
    const nh = normHead(cfg.head);
    // Portal payments count against every matching head
    const portalPaid = payments
      .filter((p) => isSuccessfulPayment(p) && normHead(p.feeHead) === nh)
      .reduce((s, p) => s + (Number(p.chargedAmount || p.amount) || 0), 0);
    // Application payments ONLY reduce the FIRST academic year's config for that head
    if (isFirstYearConfig(cfg)) {
      const appPaid = appPayments
        .filter((p) => isSuccessfulPayment(p) && normHead(p.feeHead) === nh)
        .reduce((s, p) => s + (Number(p.chargedAmount || p.amount) || 0), 0);
      return portalPaid + appPaid;
    }
    return portalPaid;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (ts) => {
    if (!ts) return "-";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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
        returnUrl,
        phone: studentData?.phone || "",
      });

      const { paymentUrl, orderId } = result.data;
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-6 py-3 flex items-center gap-3">
            <Wallet size={20} className="text-white" />
            <h2 className="text-white font-bold text-lg">Fee Structure</h2>
          </div>
          {feeConfigs.length === 0 ? (
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
                                  setPayModal({ open: true, feeHead: cfg.head || 'Fee', amount: String(remainingForThisHead), maxAmount: remainingForThisHead });
                                }
                              }}
                            >{cfg.head || 'Fee'}</td>
                            <td
                              className={`px-4 py-3 text-right text-sm font-black border border-slate-200 transition-all ${
                                isFullyPaid
                                  ? "text-emerald-600 cursor-default font-bold"
                                  : "text-slate-700 cursor-pointer hover:text-[#120c7a] hover:bg-blue-50/30"
                              }`}
                              onClick={() => {
                                if (!isFullyPaid) {
                                  setPayModal({ open: true, feeHead: cfg.head || 'Fee', amount: String(remainingForThisHead), maxAmount: remainingForThisHead });
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
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-6 py-3 flex items-center gap-3">
            <Receipt size={20} className="text-white" />
            <h2 className="text-white font-bold text-lg">Payment History</h2>
          </div>
          {payments.length === 0 && appPayments.length === 0 ? (
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
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Receipt / Order</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Head</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...payments, ...appPayments]
                    .sort((a, b) => {
                      const da = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                      const db2 = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                      return db2 - da;
                    })
                    .map((p, i) => {
                    const isPaid = isSuccessfulPayment(p);
                    const st = isPaid ? PAYMENT_STATUS.SUCCESS : (PAYMENT_STATUS[p.status] || PAYMENT_STATUS.PENDING);
                    return (
                      <tr key={p.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 text-xs font-bold text-slate-600">
                          <span className="block">{formatDate(p.createdAt)}</span>
                          {p.createdAt && <span className="text-[10px] text-slate-400">{formatTime(p.createdAt)}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono font-bold text-slate-700 block">{p.receiptNo || p.orderId || '-'}</span>
                          {p.gatewayResponse?.rrn && (
                            <span className="text-[10px] text-slate-400 font-mono">RRN: {p.gatewayResponse.rrn}</span>
                          )}
                          {p._source === "Application" && (
                            <span className="text-[9px] font-bold text-blue-500">Application</span>
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
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.bg} ${st.color} ${st.border} border`}>
                                {st.label}
                              </span>
                              {isPaid && (
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
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Fee Head</p>
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

      {/* Receipt Modal */}
      {receiptModal.open && receiptModal.payment && (() => {
        const p = receiptModal.payment;
        const resolvedName = p.studentName || studentData?.name || auth.currentUser?.displayName || "Student";
        const resolvedEmail = p.studentEmail || studentData?.email || auth.currentUser?.email || "";
        const resolvedReg = studentData?.regNo || studentData?.admissionNo || "—";
        const resolvedDept = studentData?.department ? formatDepartmentDisplay(studentData.department, studentData.programme) : "—";
        const txId = p.gatewayResponse?.txnId || p.gatewayResponse?.epgTxnId || "—";
        const rrn = p.gatewayResponse?.rrn || "—";
        const authCode = p.gatewayResponse?.authCode || "—";

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200" id="receipt-modal-backdrop" onClick={() => setReceiptModal({ open: false, payment: null })}>
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-receipt, #printable-receipt * {
                  visibility: visible !important;
                }
                #printable-receipt {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  margin: 0;
                  padding: 20px;
                  box-shadow: none !important;
                  border: none !important;
                }
                #receipt-modal-backdrop {
                  background: none !important;
                  backdrop-filter: none !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transform animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between no-print">
                <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                  <Receipt className="text-[#120c7a]" size={20} />
                  <span>Payment Receipt</span>
                </h3>
                <button
                  onClick={() => setReceiptModal({ open: false, payment: null })}
                  className="p-2 hover:bg-zinc-100 rounded-xl"
                ><X size={18} /></button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 space-y-8">
                {/* Print Content Wrapper */}
                <div id="printable-receipt" className="bg-white p-4 md:p-6 border border-slate-200 rounded-2xl shadow-sm space-y-5 md:space-y-6 relative overflow-hidden">
                  {/* Centered Watermark Stamp */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                    <span className="text-emerald-500/[0.04] font-black text-6xl md:text-8xl uppercase tracking-[0.25em] -rotate-12 border-8 border-emerald-500/[0.04] rounded-3xl px-8 py-4">
                      PAID
                    </span>
                  </div>

                  {/* Receipt Header */}
                  <div className="flex flex-col items-center text-center border-b border-slate-100 pb-5 md:pb-6 relative z-10">
                    <img src="/logo.png" className="h-14 md:h-16 w-auto object-contain mb-2 md:mb-3" alt="Logo" />
                    <div>
                      <h4 className="font-black text-slate-800 text-base md:text-lg uppercase tracking-wide">Fee Receipt</h4>
                      <p className="text-xs md:text-sm text-slate-400">Official Fee Receipt | HDFC SmartGateway secure payment</p>
                      <p className="text-[10px] md:text-xs text-slate-400 mt-1 font-semibold">Receipt Date: {formatDate(p.createdAt)} {p.createdAt && formatTime(p.createdAt)}</p>
                    </div>
                  </div>

                  {/* Student & Transaction Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 md:gap-y-0 md:gap-x-8 text-xs md:text-sm relative z-10">
                    <div className="space-y-0.5">
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] md:text-xs">Student Details</p>
                      <p className="font-bold text-slate-800 mt-1">{resolvedName}</p>
                      <p className="text-slate-500 break-all">{resolvedEmail}</p>
                      <p className="text-slate-500">Reg/Adm No: {resolvedReg}</p>
                      <p className="text-slate-500 leading-tight">Dept: {resolvedDept}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] md:text-xs">Receipt Information</p>
                      <p className="font-bold text-slate-800 mt-1 break-all">Receipt No: <span className="font-mono">{p.receiptNo || p.orderId}</span></p>
                      <p className="text-slate-500">Mode: <span className="font-semibold capitalize">{p.mode ? (p.mode === "online" ? "Online (SmartGateway)" : p.mode) : "Online (SmartGateway)"}</span></p>
                      <p className="text-slate-500 break-all">Txn ID: <span className="font-mono">{txId}</span></p>
                      {rrn && rrn !== "—" && <p className="text-slate-500 break-all">Bank RRN: <span className="font-mono">{rrn}</span></p>}
                    </div>
                  </div>

                  {/* Fee Item Table */}
                  <div className="mt-4 md:mt-6 border border-slate-200 rounded-xl overflow-hidden relative z-10">
                    <table className="w-full text-xs md:text-sm table-fixed">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold text-[10px] md:text-xs">
                          <th className="px-3 py-2.5 md:px-4 md:py-3 text-left w-1/2">Fee Item</th>
                          <th className="px-3 py-2.5 md:px-4 md:py-3 text-left w-1/3">Mode</th>
                          <th className="px-3 py-2.5 md:px-4 md:py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 text-[11px] md:text-sm">
                        <tr>
                          <td className="px-3 py-3 md:px-4 md:py-4 font-bold break-words">{p.feeHead || "Semester Fee"}</td>
                          <td className="px-3 py-3 md:px-4 md:py-4 font-semibold text-slate-400 break-words">{p.mode ? (p.mode === "online" ? "Online (SmartGateway)" : p.mode.charAt(0).toUpperCase() + p.mode.slice(1)) : "Online (SmartGateway)"}</td>
                          <td className="px-3 py-3 md:px-4 md:py-4 text-right font-black text-slate-800">
                            {formatCurrency(p.chargedAmount || p.amount)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/50 font-black text-slate-800 text-xs md:text-base">
                          <td colSpan={2} className="px-3 py-2.5 md:px-4 md:py-3 text-right">Total Paid</td>
                          <td className="px-3 py-2.5 md:px-4 md:py-3 text-right text-[#120c7a] font-black">
                            {formatCurrency(p.chargedAmount || p.amount)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Verification footer */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col md:flex-row md:items-center justify-between gap-2 relative z-10">
                    <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-400">
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span>Computer generated receipt. No signature required.</span>
                    </div>
                    {authCode && authCode !== "—" && (
                      <span className="text-[10px] md:text-xs font-mono text-slate-400 font-bold break-all">AUTH CODE: {authCode}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50 no-print">
                <button
                  onClick={() => setReceiptModal({ open: false, payment: null })}
                  className="px-5 py-2.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl"
                >Close</button>
                <button
                  onClick={() => window.print()}
                  className="px-6 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20 transition-all"
                >
                  Print Receipt
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
