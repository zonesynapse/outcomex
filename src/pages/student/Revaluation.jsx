import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth, functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRegulations } from "../../hooks/useRegulations";
import {
  FileCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  IndianRupee,
  X,
  Send,
  Ban,
  Plus,
  Trash2,
  CreditCard,
  ShieldCheck,
  Check,
  Edit2,
  RotateCcw,
  Lock,
  FileText,
  Upload
} from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const formatDepartment = (dept, programme) => {
  let raw = (dept || '').trim();
  if (!raw && programme) raw = programme.trim();
  if (!raw) return '—';

  raw = raw
    .replace(/\bB_E_\b/gi, 'B.E.')
    .replace(/\bB_Tech_\b/gi, 'B.Tech.')
    .replace(/\bM_E_\b/gi, 'M.E.')
    .replace(/\bM_Tech_\b/gi, 'M.Tech.')
    .replace(/\bM_B_A_\b/gi, 'M.B.A.')
    .replace(/\bM_C_A_\b/gi, 'M.C.A.')
    .replace(/\bPh_D_\b/gi, 'Ph.D.');

  raw = raw.replace(/([A-Za-z])_([A-Za-z])/g, '$1.$2.');
  raw = raw.replace(/_/g, ' ');
  return raw.replace(/\s+/g, ' ').trim();
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '19.09.2026';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }
  return dateStr;
};

const STATUS_STYLES = {
  Applied: 'bg-amber-100 text-amber-800 border-amber-200',
  'Submitted to HOD': 'bg-blue-100 text-blue-800 border-blue-200',
  'Recommended by HOD': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  Verified: 'bg-blue-100 text-blue-800 border-blue-200',
  'Payment Confirmed': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Revaluation In Progress': 'bg-purple-100 text-purple-800 border-purple-200',
  'Result Published': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Revoked by HOD': 'bg-amber-100 text-amber-800 border-amber-300',
  Closed: 'bg-slate-100 text-slate-600 border-slate-200',
  Rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  Cancelled: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

const DEFAULT_ANNA_GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'RA', 'SA', 'AB'];

export default function Revaluation() {
  const [currentUser, setCurrentUser] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Revaluation settings & pricing state
  const [config, setConfig] = useState({
    feePerSubject: 400,
    isOpen: true,
    instructions: '',
    fromDate: '',
    toDate: '',
    examMonthYear: 'APR/MAY 2026'
  });

  const { getRegulationForBatch } = useRegulations();
  const [regulationName, setRegulationName] = useState('');
  const [regulationGrades, setRegulationGrades] = useState(DEFAULT_ANNA_GRADES);

  // Subject Table Rows State (Populated strictly from student's photocopy applications)
  const [subjectRows, setSubjectRows] = useState([]);
  const [photocopyAppliedSubjects, setPhotocopyAppliedSubjects] = useState([]);
  const [hasAutoLoadedPhotocopy, setHasAutoLoadedPhotocopy] = useState(false);
  const [editingAppId, setEditingAppId] = useState(null);

  const [payModal, setPayModal] = useState({ open: false, appDocId: null, subjects: [], amount: 0 });
  const [initiatingPay, setInitiatingPay] = useState(false);
  const [verifyingPay, setVerifyingPay] = useState(false);
  const [verifyingOrderId, setVerifyingOrderId] = useState('');

  const [applications, setApplications] = useState([]);
  const [selectedAppModal, setSelectedAppModal] = useState({ open: false, app: null });
  const [actioningId, setActioningId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  // Payment Verification on Return from Exam Cell Gateway
  const verifyPaymentOnReturn = useCallback(async (orderId, targetAppId = null) => {
    setVerifyingPay(true);
    setVerifyingOrderId(orderId);

    const safetyTimer = setTimeout(() => {
      setVerifyingPay(false);
    }, 10000);

    try {
      const verifyFn = httpsCallable(functions, "verifyExamCellPayment");
      const result = await verifyFn({ orderId, appId: targetAppId });
      const data = result.data || {};

      let isSuccess = data.success || data.status === 'SUCCESS' || ['CHARGED', 'SUCCESS', 'PAID', 'COMPLETED', 'CAPTURED', 'SETTLED'].includes((data.hdfcStatus || '').toUpperCase());

      if (!isSuccess && orderId) {
        try {
          const payDocSnap = await getDoc(doc(db, "exam_cell_payments", orderId));
          if (payDocSnap.exists()) {
            const pData = payDocSnap.data();
            const hdfcStat = (pData.hdfcStatus || pData.status || '').toUpperCase();
            if (['CHARGED', 'SUCCESS', 'PAID', 'COMPLETED', 'CAPTURED', 'SETTLED'].includes(hdfcStat)) {
              isSuccess = true;
            }
          }
        } catch (e) {
          console.error("Direct check on exam_cell_payments error:", e);
        }
      }

      if (isSuccess) {
        if (targetAppId) {
          try {
            await updateDoc(doc(db, "revaluation_applications", targetAppId), {
              orderId,
              paymentStatus: "Paid",
              status: "Submitted to HOD",
              billAttached: true,
              paidAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.error("Client update error on revaluation_applications:", e);
          }
        }
        showToast(`Exam Cell Payment Successful! Amount ₹${data.amount || 500} paid. Electronic bill attached.`, 'success');
      } else {
        showToast(`Payment status: ${data.status || 'Pending'}. Order ID: ${orderId}`, 'error');
      }
    } catch (err) {
      console.error("Verify exam cell payment error:", err);
      showToast("Payment status verified.", "info");
    } finally {
      clearTimeout(safetyTimer);
      setVerifyingPay(false);
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

  // Auto-verify pending applications that have orderId on load
  useEffect(() => {
    if (!applications || applications.length === 0) return;
    const pendingWithOrder = applications.filter(a => a.orderId && a.paymentStatus !== 'Paid');
    if (pendingWithOrder.length > 0) {
      pendingWithOrder.forEach(app => {
        verifyPaymentOnReturn(app.orderId, app.id);
      });
    }
  }, [applications, verifyPaymentOnReturn]);

  const handleRefreshAppStatus = async (app) => {
    let targetOrderId = app.orderId;

    if (!targetOrderId) {
      setVerifyingPay(true);
      setVerifyingOrderId(app.id);
      try {
        const pRef = collection(db, "exam_cell_payments");
        
        let q = query(pRef, where("appId", "==", app.id));
        let pSnap = await getDocs(q);

        if (!pSnap.empty) {
          const foundDoc = pSnap.docs[0].data();
          targetOrderId = pSnap.docs[0].id || foundDoc.orderId;
        } else {
          if (currentUser?.uid) {
            const qUid = query(pRef, where("uid", "==", currentUser.uid));
            const pSnapUid = await getDocs(qUid);
            if (!pSnapUid.empty) {
              const sorted = pSnapUid.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => (d.category || "").toLowerCase().includes("revaluation") || d.appId === app.id);
              if (sorted.length > 0) {
                targetOrderId = sorted[0].id || sorted[0].orderId;
              }
            }
          }

          if (!targetOrderId) {
            const studentReg = studentData?.regNo || studentData?.registerNo || studentData?.registerNumber || app.regNo || '';
            if (studentReg) {
              const q2 = query(pRef, where("regNo", "==", studentReg));
              const pSnap2 = await getDocs(q2);
              if (!pSnap2.empty) {
                const sorted = pSnap2.docs
                  .map(d => ({ id: d.id, ...d.data() }))
                  .filter(d => (d.category || "").toLowerCase().includes("revaluation") || d.appId === app.id);
                if (sorted.length > 0) {
                  targetOrderId = sorted[0].id || sorted[0].orderId;
                }
              }
            }
          }
        }

        if (targetOrderId) {
          await updateDoc(doc(db, "revaluation_applications", app.id), {
            orderId: targetOrderId
          });
        }
      } catch (err) {
        console.error("Error retrieving orderId for application:", err);
      }
    }

    if (targetOrderId) {
      await verifyPaymentOnReturn(targetOrderId, app.id);
    } else {
      showToast("No payment session found for this application. Please click 'Pay Now' to initiate payment.", "error");
      setVerifyingPay(false);
      setVerifyingOrderId(null);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setCurrentUser(user);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setStudentData(snap.data());
      } catch (err) { console.error(err); }
      setLoading(false);
    });
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Revaluation window config & fee from Exam Cell (subscribed in real-time)
  useEffect(() => {
    const unsubConfigs = onSnapshot(collection(db, 'exam_fee_configurations'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

      const activeRevalConfig = list.find(c =>
        c.status === 'Active' &&
        (c.category === 'Revaluation' || c.category === 'Revaluation & Verification') &&
        (c.fees?.revaluationFee || c.fees?.fee || c.fees?.revaluation)
      );

      if (activeRevalConfig) {
        const feeVal = Number(activeRevalConfig.fees?.revaluationFee) ||
          Number(activeRevalConfig.fees?.fee) ||
          Number(activeRevalConfig.fees?.revaluation) || 400;
        setConfig(prev => ({ ...prev, feePerSubject: feeVal }));
      }
    }, () => { });

    const unsubSettings = onSnapshot(doc(db, 'exam_cell_settings', 'revaluation'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        setConfig(prev => ({
          ...prev,
          feePerSubject: d.feePerSubject ? Number(d.feePerSubject) : prev.feePerSubject,
          isOpen: d.isOpen !== false,
          instructions: d.instructions || prev.instructions,
          fromDate: d.fromDate || '',
          toDate: d.toDate || '',
          examMonthYear: d.examMonthYear || prev.examMonthYear,
        }));
      }
    }, () => { });

    return () => {
      unsubConfigs();
      unsubSettings();
    };
  }, []);

  // Fetch student regulation & grade configuration dynamically
  useEffect(() => {
    if (!studentData?.programme || !studentData?.batch) return;
    const reg = getRegulationForBatch(studentData.programme, studentData.batch);
    if (reg) {
      setRegulationName(reg);
      const fetchGrades = async () => {
        try {
          const docId = sanitizeKey(reg);
          let snap = await getDoc(doc(db, 'grade_configs', docId));
          if (!snap.exists()) snap = await getDoc(doc(db, 'grade_configs', reg));
          if (snap.exists()) {
            const data = snap.data() || {};
            const list = Array.isArray(data)
              ? data
              : (data.value && Array.isArray(data.value) ? data.value : Object.values(data));
            const parsed = list
              .map(g => (typeof g === 'string' ? g : g.grade))
              .filter(Boolean);
            if (parsed.length > 0) {
              const fullList = [...parsed];
              ['U', 'RA', 'AB', 'SA'].forEach(fg => {
                if (!fullList.includes(fg)) fullList.push(fg);
              });
              setRegulationGrades(fullList);
            }
          }
        } catch (err) {
          console.error('Error fetching regulation grades:', err);
        }
      };
      fetchGrades();
    }
  }, [studentData, getRegulationForBatch]);

  // Filter paid/submitted applications (exclude un-paid 'Payment Pending' or 'Cancelled')
  const paidApplications = useMemo(() => {
    return applications.filter(a => (a.paymentStatus === 'Paid' || (a.status && a.status !== 'Payment Pending')) && a.status !== 'Cancelled');
  }, [applications]);

  // Active applications for history table display (includes pending payment, excludes Cancelled)
  const activeApplications = useMemo(() => {
    return applications.filter(a => a.status !== 'Cancelled');
  }, [applications]);

  // Set of subject codes already applied in previous revaluation applications
  const previouslyAppliedSubjectCodes = useMemo(() => {
    const set = new Set();
    paidApplications.forEach(a => {
      if (a.status !== 'Rejected' && a.id !== editingAppId) {
        if (Array.isArray(a.subjects)) {
          a.subjects.forEach(s => {
            const code = String(s.subjectCode || s.code || '').replace(/\s+/g, '').toUpperCase();
            if (code) set.add(code);
          });
        }
      }
    });
    return set;
  }, [paidApplications, editingAppId]);

  // Automatically fetch student's applied photocopy subjects from Photocopy.jsx (photocopy_applications)
  useEffect(() => {
    if (!studentData) return;
    const studentKeys = [
      studentData.regNo,
      studentData.reg,
      studentData.admissionNo,
      studentData.admNo,
      studentData.uid,
      auth.currentUser?.uid,
      auth.currentUser?.email
    ].filter(Boolean).map(k => String(k).trim().toLowerCase());

    const unsub = onSnapshot(collection(db, "photocopy_applications"), (snap) => {
      const extractedSubjects = [];
      const seenCodes = new Set();

      snap.forEach(d => {
        const data = d.data();
        const matches = studentKeys.some(sk =>
          String(data.regNo || '').trim().toLowerCase() === sk ||
          String(data.studentUid || '').trim().toLowerCase() === sk ||
          String(data.email || '').trim().toLowerCase() === sk
        );

        if (matches && Array.isArray(data.subjects)) {
          data.subjects.forEach(s => {
            const cleanCode = String(s.subjectCode || s.code || '').replace(/\s+/g, '').toUpperCase();
            if (cleanCode && !seenCodes.has(cleanCode)) {
              seenCodes.add(cleanCode);
              const isAlreadyApplied = previouslyAppliedSubjectCodes.has(cleanCode);
              extractedSubjects.push({
                id: cleanCode || (Date.now() + Math.random()),
                semesterNo: s.semesterNo || s.semester || "",
                subjectCode: cleanCode,
                subjectTitle: s.subjectTitle || s.name || s.subjectName || "",
                grade: s.grade || "U",
                result: s.result || "Fail",
                fee: config.feePerSubject || 400,
                selected: !isAlreadyApplied,
                alreadyApplied: isAlreadyApplied,
                fileData: null,
                fileName: null,
                fileSize: null
              });
            }
          });
        }
      });

      if (extractedSubjects.length > 0) {
        setPhotocopyAppliedSubjects(extractedSubjects);
      }
    });

    return () => unsub();
  }, [studentData, config.feePerSubject, previouslyAppliedSubjectCodes]);

  // Auto-prefill subject rows from photocopy applications on load & continuously sync alreadyApplied status
  useEffect(() => {
    if (!editingAppId && photocopyAppliedSubjects.length > 0) {
      setSubjectRows(prev => {
        const baseList = prev.length > 0 ? prev : photocopyAppliedSubjects;
        return baseList.map(r => {
          const cleanCode = String(r.subjectCode || '').replace(/\s+/g, '').toUpperCase();
          const isAlreadyApplied = Boolean(r.alreadyApplied || (cleanCode && previouslyAppliedSubjectCodes.has(cleanCode)));
          return {
            ...r,
            alreadyApplied: isAlreadyApplied,
            selected: isAlreadyApplied ? false : Boolean(r.selected && !isAlreadyApplied)
          };
        });
      });
      setHasAutoLoadedPhotocopy(true);
    }
  }, [photocopyAppliedSubjects, editingAppId, previouslyAppliedSubjectCodes]);

  // Window status evaluate
  const windowStatus = useMemo(() => {
    if (config.isOpen === false) return { open: false, label: 'Applications Closed' };
    const today = new Date().toISOString().slice(0, 10);
    if (config.fromDate && today < config.fromDate) {
      return { open: false, label: `Opens on ${formatDisplayDate(config.fromDate)}` };
    }
    if (config.toDate && today > config.toDate) {
      return { open: false, label: `Closed on ${formatDisplayDate(config.toDate)}` };
    }
    return { open: true, label: 'Applications Open' };
  }, [config.isOpen, config.fromDate, config.toDate]);

  // Subscribed Student Applications
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'revaluation_applications'), where('studentUid', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

      list.sort((a, b) => {
        const at = a.appliedAt?.toMillis ? a.appliedAt.toMillis() : new Date(a.appliedAt || 0).getTime();
        const bt = b.appliedAt?.toMillis ? b.appliedAt.toMillis() : new Date(b.appliedAt || 0).getTime();
        return bt - at;
      });

      setApplications(list);

      // Check if there is an active revoked application needing editing
      const revoked = list.find(a => a.status === 'Revoked by HOD' || a.status === 'Revoked by Exam Cell');
      if (revoked && !editingAppId) {
        setEditingAppId(revoked.id);
        if (Array.isArray(revoked.subjects) && revoked.subjects.length > 0) {
          setSubjectRows(revoked.subjects.map((s, idx) => ({
            id: idx + 1,
            semesterNo: s.semesterNo || '',
            subjectCode: s.subjectCode || '',
            subjectTitle: s.subjectTitle || '',
            grade: s.grade || 'U',
            result: s.result || 'Fail',
            fee: config.feePerSubject || 400
          })));
        }
      }
    }, () => {
      if (studentData) {
        const regVal = studentData.regNo || studentData.reg || studentData.admissionNo;
        if (regVal) {
          onSnapshot(collection(db, 'revaluation_applications'), (snap) => {
            const list = [];
            snap.forEach(d => {
              const data = d.data();
              if (data.regNo === regVal || data.studentUid === currentUser.uid || data.email === currentUser.email) {
                list.push({ id: d.id, ...data });
              }
            });
            list.sort((a, b) => {
              const at = a.appliedAt?.toMillis ? a.appliedAt.toMillis() : new Date(a.appliedAt || 0).getTime();
              const bt = b.appliedAt?.toMillis ? b.appliedAt.toMillis() : new Date(b.appliedAt || 0).getTime();
              return bt - at;
            });
            setApplications(list);
          });
        }
      }
    });

    return () => unsub();
  }, [currentUser, studentData, editingAppId, config.feePerSubject]);

  // Quota calculation (Max 5 subjects)
  const pricePerRow = config.feePerSubject || 400;
  const maxQuota = 5;

  const totalPreviouslyAppliedCount = useMemo(() => {
    return paidApplications
      .filter(a => a.status !== 'Rejected' && a.id !== editingAppId)
      .reduce((sum, a) => sum + (a.subjectCount || (a.subjects ? a.subjects.length : 0)), 0);
  }, [paidApplications, editingAppId]);

  const remainingQuota = Math.max(0, maxQuota - totalPreviouslyAppliedCount);
  const isQuotaReached = remainingQuota <= 0;

  const selectedRows = useMemo(() => {
    return subjectRows.filter(r => {
      const cleanCode = String(r.subjectCode || '').replace(/\s+/g, '').toUpperCase();
      const isAlready = r.alreadyApplied || (cleanCode && previouslyAppliedSubjectCodes.has(cleanCode));
      return r.selected && !isAlready;
    });
  }, [subjectRows, previouslyAppliedSubjectCodes]);

  const totalApplicationFee = useMemo(() => {
    return selectedRows.length * pricePerRow;
  }, [selectedRows.length, pricePerRow]);

  const handleToggleSelectRow = (id) => {
    setSubjectRows(prev => {
      const target = prev.find(r => r.id === id);
      if (!target) return prev;

      const cleanCode = String(target.subjectCode || '').replace(/\s+/g, '').toUpperCase();
      const isAlready = target.alreadyApplied || (cleanCode && previouslyAppliedSubjectCodes.has(cleanCode));

      if (isAlready) {
        showToast(`Subject ${target.subjectCode} has already been submitted for revaluation in a previous application.`, 'error');
        return prev;
      }

      if (!target.selected) {
        const currentlySelectedNew = prev.filter(r => {
          const cCode = String(r.subjectCode || '').replace(/\s+/g, '').toUpperCase();
          const isApp = r.alreadyApplied || (cCode && previouslyAppliedSubjectCodes.has(cCode));
          return r.selected && !isApp;
        }).length;
        if (totalPreviouslyAppliedCount + currentlySelectedNew + 1 > maxQuota) {
          showToast(`Revaluation limit reached! You can select at most 5 subjects in total across all applications (Remaining quota: ${remainingQuota}).`, 'error');
          return prev;
        }
      }

      return prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r);
    });
  };

  const handleFileUpload = (id, file) => {
    if (!file) return;
    const maxBytes = 60 * 1024; // 60KB limit
    if (file.size > maxBytes) {
      showToast(`File "${file.name}" (${(file.size / 1024).toFixed(1)}KB) exceeds the 60KB limit! Please upload a file under 60KB.`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSubjectRows(prev => prev.map(r => {
        if (r.id !== id) return r;
        return {
          ...r,
          fileData: reader.result,
          fileName: file.name,
          fileSize: file.size
        };
      }));
      showToast(`File "${file.name}" (${(file.size / 1024).toFixed(1)}KB) uploaded successfully!`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = (id) => {
    setSubjectRows(prev => prev.map(r => r.id === id ? { ...r, fileData: null, fileName: null, fileSize: null } : r));
    showToast('Uploaded file removed.', 'info');
  };

  const handleRowChange = (id, field, value) => {
    setSubjectRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      let val = value;
      if (field === 'subjectCode') {
        val = String(value).replace(/\s+/g, '').toUpperCase();
      }
      return { ...r, [field]: val };
    }));
  };

  const handleStartPayment = async (appDocId, feeAmt) => {
    setInitiatingPay(true);
    try {
      const createSessionFn = httpsCallable(functions, "createExamCellPaymentSession");
      const returnUrl = window.location.origin + window.location.pathname;
      const res = await createSessionFn({
        amount: Number(feeAmt),
        category: 'Revaluation Application',
        appId: appDocId,
        returnUrl,
      });

      if (res.data?.paymentUrl) {
        if (res.data.orderId && appDocId) {
          try {
            await updateDoc(doc(db, 'revaluation_applications', appDocId), {
              orderId: res.data.orderId,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.error("Error saving orderId to revaluation_applications:", err);
          }
        }
        window.location.href = res.data.paymentUrl;
        return;
      } else {
        showToast("Gateway response did not contain a valid payment URL.", "error");
      }
    } catch (err) {
      console.error("Initiate exam cell payment error:", err);
      showToast("Payment Gateway Error: " + err.message, "error");
    }
    setInitiatingPay(false);
  };

  // Submit revaluation application
  const handleSubmitApplication = async (e) => {
    e.preventDefault();
    if (!currentUser || !studentData) return;

    if (!windowStatus.open) {
      showToast(`Revaluation applications are closed (${windowStatus.label}).`, 'error');
      return;
    }

    const regNoVal = studentData.regNo || studentData.reg || studentData.admissionNo || studentData.admNo;
    if (!regNoVal) {
      showToast('Student Register Number is missing in your profile. Please contact administrator.', 'error');
      return;
    }

    const validRows = subjectRows.filter(r => r.selected && !r.alreadyApplied && r.subjectCode.trim());
    if (validRows.length === 0) {
      showToast('Please select at least one subject for revaluation using the checkbox.', 'error');
      return;
    }

    const missingUploadRow = validRows.find(r => !r.fileData);
    if (missingUploadRow) {
      showToast(`Upload file (Max 60KB) is mandatory for selected subject ${missingUploadRow.subjectCode || ''}.`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (editingAppId) {
        await updateDoc(doc(db, 'revaluation_applications', editingAppId), {
          subjects: validRows.map(r => ({
            semesterNo: r.semesterNo || '',
            subjectCode: r.subjectCode || '',
            subjectTitle: r.subjectTitle || '',
            grade: r.grade || 'U',
            result: r.result || 'Fail',
            fee: pricePerRow,
            fileName: r.fileName || null,
            fileData: r.fileData || null,
            fileSize: r.fileSize || null
          })),
          subjectCount: validRows.length,
          feeAmount: validRows.length * pricePerRow,
          status: 'Submitted to HOD',
          revokeReason: null,
          updatedAt: serverTimestamp(),
        });
        showToast('Application details updated & re-submitted to HOD!', 'success');
        setEditingAppId(null);
        setSubmitting(false);
        return;
      }

      const docRef = await addDoc(collection(db, 'revaluation_applications'), {
        studentUid: currentUser.uid,
        studentName: studentData.displayName || studentData.studentName || studentData.name || currentUser.email,
        regNo: regNoVal,
        email: currentUser.email || '',
        programme: studentData.programme || '',
        department: studentData.department || '',
        batch: studentData.batch || '',
        regulation: regulationName || '',
        subjects: validRows.map(r => ({
          semesterNo: r.semesterNo || '',
          subjectCode: r.subjectCode || '',
          subjectTitle: r.subjectTitle || '',
          grade: r.grade || 'U',
          result: r.result || 'Fail',
          fee: pricePerRow,
          fileName: r.fileName || null,
          fileData: r.fileData || null,
          fileSize: r.fileSize || null
        })),
        subjectCount: validRows.length,
        feeAmount: totalApplicationFee,
        paymentStatus: 'Pending',
        status: 'Payment Pending',
        billAttached: false,
        appliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showToast(`Application created! Connecting to Exam Cell Payment Gateway...`, 'success');

      setSubjectRows([
        { id: Date.now(), semesterNo: '', subjectCode: '', subjectTitle: '', grade: 'U', result: 'Fail', fee: pricePerRow }
      ]);
      setSubmitting(false);

      await handleStartPayment(docRef.id, totalApplicationFee);

    } catch (err) {
      console.error('Submission error:', err);
      showToast('Failed to submit application: ' + err.message, 'error');
      setSubmitting(false);
    }
  };

  const handleCancelApp = async (app) => {
    if (!app?.id) return;
    if (!window.confirm(`Cancel revaluation application?`)) return;

    try {
      await updateDoc(doc(db, 'revaluation_applications', app.id), {
        status: 'Cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast('Revaluation application cancelled.', 'success');
    } catch (err) {
      console.error('Cancel revaluation error:', err);
      showToast('Failed to cancel application.', 'error');
    }
  };

  const handleSubmitToHod = async (app) => {
    if (!app?.id) return;
    setActioningId(app.id);
    try {
      await updateDoc(doc(db, 'revaluation_applications', app.id), {
        status: 'Submitted to HOD',
        updatedAt: serverTimestamp(),
      });
      showToast('Revaluation application successfully submitted to HOD!', 'success');
      if (editingAppId === app.id) setEditingAppId(null);
    } catch (err) {
      console.error('Submit to HOD error:', err);
      showToast('Failed to submit to HOD: ' + err.message, 'error');
    }
    setActioningId(null);
  };

  const handleLoadRevokedApp = (app) => {
    if (!app || !Array.isArray(app.subjects)) return;
    setEditingAppId(app.id);
    setSubjectRows(app.subjects.map((s, idx) => ({
      id: idx + 1,
      semesterNo: s.semesterNo || '',
      subjectCode: s.subjectCode || '',
      subjectTitle: s.subjectTitle || '',
      grade: s.grade || 'U',
      result: s.result || 'Fail',
      fee: config.feePerSubject || 400,
      selected: true,
      alreadyApplied: false,
      fileName: s.fileName || null,
      fileData: s.fileData || null,
      fileSize: s.fileSize || null
    })));
    showToast('Loaded revoked application for editing.', 'info');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="animate-spin text-[#120c7a]" size={36} />
        <p className="text-sm font-bold text-slate-400">Loading revaluation services...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 font-sans">

      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-6 right-6 z-[250] px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white transition-all animate-in slide-in-from-top-5 ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}>
          {toast.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          {toast.message}
        </div>
      )}

      {/* Payment Verification Banner */}
      {verifyingPay && (
        <div className="bg-indigo-900 text-white p-5 rounded-3xl shadow-xl flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-amber-300 shrink-0" size={24} />
            <div>
              <h4 className="font-bold text-sm text-amber-300">Verifying Exam Cell Payment Session...</h4>
              <p className="text-xs text-indigo-200 mt-0.5">Order ID: {verifyingOrderId}. Fetching gateway response...</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-indigo-400/10 blur-2xl"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
              <FileCheck size={32} />
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest text-indigo-300 uppercase block">
                CONTROLLER OF EXAMINATIONS • OBE PORTAL
              </span>
              <h1 className="text-xl md:text-2xl font-black text-white mt-0.5">
                Application for Revaluation of Answer Scripts
              </h1>
              <p className="text-xs text-indigo-200 mt-1 max-w-xl leading-relaxed">
                Submit requests for official revaluation of End Semester Examination answer scripts directly to the Exam Cell.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className={`px-4 py-2 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 shadow-sm ${windowStatus.open ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300' : 'bg-rose-500/20 border-rose-400/30 text-rose-300'
              }`}>
              <Clock size={14} />
              {windowStatus.label}
            </div>

            <div className="px-4 py-2 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm">
              <IndianRupee size={14} />
              <span>₹{config.feePerSubject || 400} / Subject</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Application Form Container */}
      {!windowStatus.open ? (
        <div className="bg-white rounded-3xl border-2 border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
            <Lock size={28} />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-bold text-slate-800">Answer Script Revaluation Applications Closed</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Answer script revaluation applications are currently closed ({windowStatus.label}). Please contact the Exam Cell for the schedule and announcements.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitApplication} className="space-y-8">

          {/* Authentic Instruction to Candidates Card (Image 1 Parity) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText size={18} className="text-[#120c7a]" />
                INSTRUCTION TO CANDIDATES
              </h2>

            </div>

            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 font-medium leading-relaxed">
              <li>
                Revaluation Fee: <strong className="text-slate-900 font-extrabold">Rs.{config.feePerSubject || 400}/-</strong> per answer script, payable only through the Institute's official portal/payment gateway.
              </li>
              <li>
                Last Date: The application shall be submitted to the Controller of Examinations, CKCET, on or before <strong className="text-[#120c7a] font-extrabold">{formatDisplayDate(config.toDate)}</strong>.
              </li>
              <li>
                Photocopy Verification: The photocopy of the answer script shall be verified by the concerned Subject Expert/Faculty Member who handled the course. If the script merits higher marks, the Subject Expert may recommend Revaluation.
              </li>
              <li>
                Incomplete Applications: Incomplete, defective, or incorrect applications shall be rejected. The fee paid shall neither be refunded nor adjusted against any other fee.
              </li>
              <li>
                No Late Applications: Applications received after the due date shall not be entertained.
              </li>
              <li>
                No application will be accepted beyond the due date prescribed.
              </li>
              <li>
                HoD Verification: The HoD shall verify the Payment Status, Subject Expert’s recommendation and ensure the correctness of the Subject Code and Subject Title before recommending the application.
              </li>
            </ol>
          </div>

          {/* Candidate Details Card (Image 1 Parity) */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-100/70 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">CANDIDATE DETAILS (AUTO-FETCHED)</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-200 flex items-center gap-1">
                <ShieldCheck size={12} /> Verified Profile
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm border-collapse">
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50/50">
                    <td className="w-12 px-6 py-4 font-bold text-slate-400 border-r border-slate-100 text-center">1.</td>
                    <td className="w-56 sm:w-64 px-4 py-4 font-bold text-slate-700 border-r border-slate-100">Name</td>
                    <td className="px-6 py-4 font-extrabold text-[#120c7a] text-sm">
                      {studentData?.displayName || studentData?.studentName || studentData?.name || '—'}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="w-12 px-6 py-4 font-bold text-slate-400 border-r border-slate-100 text-center">2.</td>
                    <td className="w-56 sm:w-64 px-4 py-4 font-bold text-slate-700 border-r border-slate-100">Register Number</td>
                    <td className="px-6 py-4 font-extrabold text-slate-900 font-mono text-sm">
                      {studentData?.regNo || studentData?.reg || studentData?.admissionNo || '—'}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="w-12 px-6 py-4 font-bold text-slate-400 border-r border-slate-100 text-center">3.</td>
                    <td className="w-56 sm:w-64 px-4 py-4 font-bold text-slate-700 border-r border-slate-100">Department</td>
                    <td className="px-6 py-4 font-bold text-slate-800 text-sm">
                      {formatDepartment(studentData?.department, studentData?.programme)}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="w-12 px-6 py-4 font-bold text-slate-400 border-r border-slate-100 text-center">4.</td>
                    <td className="w-56 sm:w-64 px-4 py-4 font-bold text-slate-700 border-r border-slate-100">Month & Year of Examination</td>
                    <td className="px-6 py-4 font-bold text-slate-800 text-sm">
                      {config.examMonthYear || 'APR/MAY 2026'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Eligible Answer Scripts & Subject Details Card (Image 2 Parity) */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">

            {/* Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-blue-900 p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck size={20} className="text-indigo-300" />
                  <h2 className="text-lg font-bold text-white">Eligible Answer Scripts & Subject Details</h2>
                </div>
                <p className="text-xs text-indigo-200 mt-0.5">
                  Applied: {totalPreviouslyAppliedCount + selectedRows.length}/{maxQuota} subjects | Remaining Quota: {Math.max(0, remainingQuota - selectedRows.length)} subject(s)
                </p>
              </div>

              <div className="px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-extrabold shrink-0">
                ₹{pricePerRow} / SUBJECT
              </div>
            </div>

            {/* Subject Table */}
            <div className="p-6 space-y-6">
              {isQuotaReached && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs font-bold text-amber-900">
                  <AlertCircle size={18} className="shrink-0 text-amber-600" />
                  <span>You have reached the maximum allowed limit of 5 subjects for revaluation across your applications.</span>
                </div>
              )}

              {subjectRows.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">No Eligible Photocopy Answer Scripts Found</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      Answer script revaluation is strictly available only for subjects where you have previously applied and obtained a Photocopy. No eligible photocopy subjects were found for your account.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-extrabold text-[11px] tracking-wider uppercase">
                        <th className="p-3.5 w-24 text-center">Semester No.</th>
                        <th className="p-3.5 w-36">Subject Code</th>
                        <th className="p-3.5">Subject Title</th>
                        <th className="p-3.5 w-24 text-center">Grade</th>
                        <th className="p-3.5 w-24 text-center">Result</th>
                        <th className="p-3.5 w-24 text-center">Price (₹)</th>
                        <th className="p-3.5 w-48 text-center">Upload (Max 60KB)</th>
                        <th className="p-3.5 w-24 text-center">Select</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white font-semibold">
                      {subjectRows.map((r) => {
                        const cleanCode = String(r.subjectCode || '').replace(/\s+/g, '').toUpperCase();
                        const isAlreadyApplied = Boolean(r.alreadyApplied || (cleanCode && previouslyAppliedSubjectCodes.has(cleanCode)));
                        const isRowSelected = Boolean(r.selected && !isAlreadyApplied);

                        return (
                          <tr key={r.id} className={`hover:bg-slate-50/70 ${isAlreadyApplied ? 'bg-slate-100/50' : ''}`}>
                            <td className="p-3 text-center font-bold text-slate-700">
                              {r.semesterNo || '—'}
                            </td>
                            <td className="p-3">
                              <span className="font-mono font-extrabold text-[#120c7a] bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs">
                                {cleanCode || '—'}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-slate-800 uppercase">
                              {r.subjectTitle || '—'}
                            </td>
                            <td className="p-3 text-center">
                              <span className="font-black text-slate-700 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg text-xs">
                                {r.grade || 'U'}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-black px-2 py-1 rounded-lg text-xs border ${r.result === 'Pass' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                {r.result || 'Fail'}
                              </span>
                            </td>
                            <td className="p-3 text-center font-extrabold text-slate-900">
                              ₹{pricePerRow}
                            </td>
                            {/* Upload Answer Script Column (Limit 60KB) */}
                            <td className="p-3 text-center">
                              {r.fileName ? (
                                <div className="inline-flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-xl text-[11px] font-bold">
                                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  <span className="truncate max-w-[90px]" title={r.fileName}>{r.fileName}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFile(r.id)}
                                    className="text-rose-500 hover:text-rose-700 ml-0.5 cursor-pointer"
                                    title="Remove file"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ) : (
                                <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isRowSelected ? 'bg-indigo-50 text-[#120c7a] border-indigo-200 hover:bg-indigo-100' : 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed'
                                  }`}>
                                  <Upload size={14} />
                                  <span>Upload (&lt;60KB)</span>
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    className="hidden"
                                    disabled={!isRowSelected}
                                    onChange={(e) => handleFileUpload(r.id, e.target.files[0])}
                                  />
                                </label>
                              )}
                            </td>
                            {/* Checkbox Select Column */}
                            <td className="p-3 text-center">
                              {isAlreadyApplied ? (
                                <span className="px-2.5 py-1 bg-slate-200 text-slate-600 text-[10px] font-extrabold rounded-lg border border-slate-300">
                                  Already Applied
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isRowSelected}
                                  onChange={() => handleToggleSelectRow(r.id)}
                                  className="w-5 h-5 accent-[#120c7a] rounded border-slate-300 cursor-pointer"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-xs font-bold text-slate-500">
                  Selected <span className="text-[#120c7a] font-black">{selectedRows.length}</span> subject(s) for revaluation
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <div className="px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-black">
                    TOTAL FEE: <span className="text-[#120c7a] text-sm font-extrabold">₹{totalApplicationFee}</span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || selectedRows.length === 0}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
                    Pay ₹{totalApplicationFee}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Submitted Applications History Table */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Revaluation Applications History</h2>
            <p className="text-xs text-slate-500 mt-0.5">Track revaluation progress and recommendations from HOD & Exam Cell.</p>
          </div>
          <span className="px-3 py-1 bg-indigo-50 text-[#120c7a] text-xs font-bold rounded-full border border-indigo-100">
            {activeApplications.length} Applications
          </span>
        </div>

        {activeApplications.length === 0 ? (
          <p className="text-sm font-bold text-slate-400 text-center p-8">
            No revaluation applications submitted yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <th className="p-3.5">Applied Date</th>
                  <th className="p-3.5">Subjects</th>
                  <th className="p-3.5 text-center">Count</th>
                  <th className="p-3.5 text-center">Fee Paid</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-semibold">
                {activeApplications.map((app) => {
                  const dateStr = app.appliedAt?.seconds
                    ? new Date(app.appliedAt.seconds * 1000).toLocaleDateString()
                    : 'Recent';

                  const isPaid = app.paymentStatus === 'Paid';

                  return (
                    <tr key={app.id} className="hover:bg-slate-50/50">
                      <td className="p-3.5 font-mono text-slate-600">{dateStr}</td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {Array.isArray(app.subjects)
                          ? app.subjects.map(s => s.subjectCode || s.code).join(', ')
                          : '—'}
                      </td>
                      <td className="p-3.5 text-center font-extrabold text-slate-700">
                        {app.subjectCount || (app.subjects ? app.subjects.length : 0)}
                      </td>
                      <td className="p-3.5 text-center font-extrabold text-[#120c7a]">
                        ₹{app.feeAmount || 0}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${STATUS_STYLES[app.status] || 'bg-slate-100 text-slate-700'}`}>
                          {app.status || 'Applied'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAppModal({ open: true, app })}
                            className="px-3 py-1 bg-indigo-50 text-[#120c7a] hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            View
                          </button>

                          {/* Submit to HOD: ONLY shown when paymentStatus === 'Paid' */}
                          {isPaid && app.status !== 'Submitted to HOD' && app.status !== 'Recommended by HOD' && app.status !== 'Approved' && (
                            <button
                              type="button"
                              onClick={() => handleSubmitToHod(app)}
                              disabled={actioningId === app.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                            >
                              {actioningId === app.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit to HOD
                            </button>
                          )}

                          {/* Revoked by HOD option */}
                          {app.status === 'Revoked by HOD' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleLoadRevokedApp(app)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitToHod(app)}
                                disabled={actioningId === app.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                              >
                                Submit to HOD
                              </button>
                            </div>
                          )}

                          {/* Unpaid / Pending Payment Controls: Pay Now, Refresh Status & Cancel */}
                          {!isPaid && app.status !== 'Revoked by HOD' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartPayment(app.id, app.feeAmount)}
                                disabled={initiatingPay}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                              >
                                Pay Now
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRefreshAppStatus(app)}
                                disabled={verifyingPay && (verifyingOrderId === app.orderId || verifyingOrderId === app.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 cursor-pointer disabled:opacity-50"
                                title="Refresh payment status from HDFC Gateway"
                              >
                                {verifyingPay && (verifyingOrderId === app.orderId || verifyingOrderId === app.id) ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <RotateCcw size={12} />
                                )}
                                Refresh Status
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelApp(app)}
                                className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Application Details Modal */}
      {selectedAppModal.open && selectedAppModal.app && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Revaluation Application Details</h3>
                <p className="text-xs text-slate-500">Reg No: {selectedAppModal.app.regNo}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppModal({ open: false, app: null })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block font-bold">Student Name</span>
                  <span className="font-bold text-slate-900">{selectedAppModal.app.studentName}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block font-bold">Department</span>
                  <span className="font-bold text-slate-900">{selectedAppModal.app.department || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block font-bold">Status</span>
                  <span className="font-bold text-[#120c7a]">{selectedAppModal.app.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block font-bold">Total Fee</span>
                  <span className="font-bold text-emerald-700">₹{selectedAppModal.app.feeAmount}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2 uppercase text-[11px]">Applied Subjects</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <th className="p-2.5">Sem</th>
                        <th className="p-2.5">Subject Code</th>
                        <th className="p-2.5">Subject Title</th>
                        <th className="p-2.5 text-center">Grade</th>
                        <th className="p-2.5 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {Array.isArray(selectedAppModal.app.subjects) && selectedAppModal.app.subjects.map((s, i) => (
                        <tr key={i}>
                          <td className="p-2.5 font-bold">{s.semesterNo || '—'}</td>
                          <td className="p-2.5 font-mono font-bold text-[#120c7a]">{s.subjectCode}</td>
                          <td className="p-2.5">{s.subjectTitle || '—'}</td>
                          <td className="p-2.5 text-center font-bold">{s.grade || '—'}</td>
                          <td className="p-2.5 text-center font-bold">{s.result || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedAppModal.app.revokeReason && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-1">
                  <span className="font-bold text-xs uppercase block text-amber-800">Revoke / Return Reason</span>
                  <p className="text-xs leading-relaxed">{selectedAppModal.app.revokeReason}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAppModal({ open: false, app: null })}
                className="px-5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
