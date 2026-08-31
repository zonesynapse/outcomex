import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import {
  FileText, Eye, X, CheckCircle2, Edit2, Loader2, Search, Landmark,
  Clock, CalendarCheck2, ShieldCheck, Sparkles, ArrowLeft, BookOpen,
  Download, Link2, Unlock, Calendar
} from "lucide-react";
import Layout from "../../components/Layout";
import { auth, db } from "../../firebase";
import { getQuestionPaperHTML, buildQuestionPaperPrintShell } from "../../utils/questionPaperUtils";
import { useRegulations } from "../../hooks/useRegulations";
import { sanitizeKey, formatProgrammeKey, parseSubjectField, formatQPSetDisplay, formatDepartmentDisplay } from "../../lib/utils";
import { typesetMath } from "../../utils/mathJaxUtils";

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const fmtDate = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(value); }
};

const normCodeKey = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

const formatDeptBadge = (raw) => {
  if (!raw) return "";
  if (typeof raw === "object" && raw !== null) {
    const prog = raw.prog || raw.progKey || "";
    const dept = raw.dept || raw.deptKey || raw.department || "";
    if (dept) return formatDepartmentDisplay(dept, prog);
    return formatDepartmentDisplay(raw.department || "", prog);
  }
  return formatDepartmentDisplay(String(raw), "");
};

const extractDeptFromCompositeKey = (key) => {
  if (!key) return "";
  const parts = key.split("_");
  // compositeKey patterns:
  //  departments doc: "B_E_Computer_Science_and_Engineering" (no year)
  //  syllabus_data doc: "B_E_CSE_R2021"  / qp doc: "B_E_CSE_2024_01" — first two parts are prog when B/M prefix.
  // For qp composites we conservatively take the 3rd+ dept tokens when available.
  if (parts.length >= 3 && ["B", "M"].includes(parts[0]) && ["E", "Tech", "Sc", "Com"].includes(parts[1])) {
    const deptTokens = parts.slice(2);
    // strip trailing year/semester numbers
    while (deptTokens.length > 0 && /^\d/.test(deptTokens[deptTokens.length - 1])) deptTokens.pop();
    if (deptTokens.length > 0) return deptTokens.join("_");
  }
  return parts[0] || "";
};

const flattenQps = (data) => {
  const all = [];
  Object.entries(data || {}).forEach(([compositeKey, docData]) => {
    const isFlat = !!(docData && typeof docData === 'object' && (docData.subject || docData.subject_code || docData.parts || docData.assignment_config || docData.qpaper_name));
    const deptFromKey = formatDeptBadge(extractDeptFromCompositeKey(compositeKey));
    if (isFlat) {
      all.push({ ...docData, id: compositeKey, compositeKey, department: docData.department || deptFromKey });
    } else {
      Object.entries(docData || {}).forEach(([id, qp]) => {
        all.push({ ...(qp || {}), id, compositeKey, department: qp.department || deptFromKey });
      });
    }
  });
  return all;
};

export default function ExamCellQPReview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getRegulationForBatch } = useRegulations();

  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [coeName, setCoeName] = useState("");
  const [coeSignature, setCoeSignature] = useState("");
  const [usersMap, setUsersMap] = useState({});
  const [ciaConfigs, setCiaConfigs] = useState({});
  const [rawQps, setRawQps] = useState({});
  const [allQps, setAllQps] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "pending");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [fullQPForModal, setFullQPForModal] = useState(null);
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [facultySignatureForQP, setFacultySignatureForQP] = useState("");
  const [selectedQPHodSignature, setSelectedQPHodSignature] = useState("");

  const [showRecorrectModal, setShowRecorrectModal] = useState(false);
  const [recorrectComments, setRecorrectComments] = useState("");

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const [scheduleDocs, setScheduleDocs] = useState([]);
  const [allocModal, setAllocModal] = useState({ open: false, qp: null });
  const [allocating, setAllocating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const ud = snap.data();
          setCoeSignature(ud.signatureUrl || "");
          setCoeName(ud.facultyName || ud.displayName || ud.email || "COE");
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setUsersMap(data);
    }, () => setUsersMap({}));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cia_configs"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setCiaConfigs(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "generated_qps"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setAllQps(flattenQps(data));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const data = d.data();
        if (!data?.assignments) return;
        Object.entries(data.assignments).forEach(([code, as]) => {
          if (!as?.examDate) return;
          const depts = (as.departments && as.departments.length > 0)
            ? as.departments
            : (data.departments && data.departments.length > 0 ? data.departments : []);
          docs.push({
            docId: d.id,
            code,
            name: as.name || "",
            departments: depts,
            examDate: as.examDate,
            startTime: as.startTime || "",
            endTime: as.endTime || "",
            slot: as.slot || as.session || "",
            batch: data.batch || "",
            semester: data.semester || "",
            academicYear: data.academicYear || "",
            examName: data.examName || data.examId || "",
            setterName: as.setterName || "",
            setterUid: as.setterUid || ""
          });
        });
      });
      setScheduleDocs(docs);
    }, () => setScheduleDocs([]));
    return () => unsub();
  }, []);

  const [syllabusCodeMap, setSyllabusCodeMap] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      const map = {};
      snap.forEach(d => {
        const deptRaw = (() => {
          // parseSyllabusDocId: [prog, dept..., regKey] — e.g. "B_E_CSE_R2021" → dept "CSE"
          const parts = d.id.split("_");
          if (parts.length < 3) return "";
          let progTake = 1;
          if (["B", "M"].includes(parts[0]) && ["E", "Tech", "Sc", "Com"].includes(parts[1])) progTake = 2;
          const deptTokens = parts.slice(progTake, parts.length - 1);
          return deptTokens.join("_");
        })();
        const raw = d.data() || {};
        const semKeys = Object.keys(raw).filter(k => !k.startsWith("_"));
        const toArray = (v) => Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);
        semKeys.forEach(sk => {
          toArray(raw[sk]).forEach(sub => {
            const c = normCodeKey(sub?.code || sub?.subjectCode || sub?.courseCode || "");
            if (!c) return;
            if (!map[c]) map[c] = new Set();
            if (deptRaw) map[c].add(deptRaw);
          });
        });
      });
      const out = {};
      Object.keys(map).forEach(k => { out[k] = Array.from(map[k]); });
      setSyllabusCodeMap(out);
    }, () => setSyllabusCodeMap({}));
    return () => unsub();
  }, []);

  const [courseBankDeptMap, setCourseBankDeptMap] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snap) => {
      const map = {};
      snap.forEach(d => {
        const data = d.data() || {};
        const hasDirectFields = data.code || data.programme;
        if (hasDirectFields) {
          const c = normCodeKey(data.code || "");
          if (!c) return;
          const dept = data.department || "";
          const prog = data.programme || "";
          if (dept) {
            if (!map[c]) map[c] = [];
            map[c].push({ dept, prog });
          }
        } else {
          Object.entries(data).forEach(([deptK, deptVal]) => {
            if (!deptVal || typeof deptVal !== "object") return;
            Object.entries(deptVal).forEach(([regK, regVal]) => {
              if (!regVal || typeof regVal !== "object") return;
              Object.entries(regVal).forEach(([codeK]) => {
                const c = normCodeKey(codeK);
                if (!c) return;
                if (!map[c]) map[c] = [];
                map[c].push({ dept: deptK, prog: "" });
              });
            });
          });
        }
      });
      setCourseBankDeptMap(map);
    }, () => setCourseBankDeptMap({}));
    return () => unsub();
  }, []);

  const pendingQps = useMemo(() =>
    allQps.filter(q => q?.status === "approved_by_hod")
      .sort((a, b) => new Date(b.forwarded_at || b.updated_at || b.saved_at || 0) - new Date(a.forwarded_at || a.updated_at || a.saved_at || 0)),
    [allQps]);

  const publishedQps = useMemo(() =>
    allQps.filter(q => q?.status === "approved_by_coe")
      .sort((a, b) => new Date(b.coe_approved_at || b.updated_at || 0) - new Date(a.coe_approved_at || a.updated_at || 0)),
    [allQps]);

  const resolveName = (uid) => {
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || (uid ? uid.slice(0, 6) : "-");
  };

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();
    const setLabel = formatQPSetDisplay(qp);
    let display = examName;
    if (!display) {
      if (qpaperName && ciaConfigs && ciaConfigs[qpaperName] && ciaConfigs[qpaperName].examName) {
        display = ciaConfigs[qpaperName].examName;
      } else {
        display = qpaperName;
      }
    }
    return `${display} (${setLabel})`;
  };

  const filteredPending = useMemo(() => {
    let result = pendingQps;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        (p.subject || "").toLowerCase().includes(q) ||
        (p.subject_name || "").toLowerCase().includes(q) ||
        (resolveName(p.forwarded_by) || "").toLowerCase().includes(q) ||
        (resolveExamDisplay(p) || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [pendingQps, searchQuery]);

  const filteredPublished = useMemo(() => {
    let result = publishedQps;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        (p.subject || "").toLowerCase().includes(q) ||
        (p.subject_name || "").toLowerCase().includes(q) ||
        (resolveName(p.forwarded_by) || "").toLowerCase().includes(q) ||
        (resolveExamDisplay(p) || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [publishedQps, searchQuery]);

  const awaitingAllocation = useMemo(() =>
    filteredPublished.filter(q => !q.allocated),
    [filteredPublished]);

  const allocatedQps = useMemo(() =>
    filteredPublished.filter(q => q.allocated),
    [filteredPublished]);

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, selectedQP?.hod_signature_url || "", ciaConfigs, null, coeSignature);
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQP, ciaConfigs, coeSignature]);

  const handleDownloadAllocatedQP = async (qp) => {
    try {
      if (!qp) return;

      // Resolve Course Outcomes (fresh Firestore fetch, fall back to embedded config)
      let coList = [];
      try {
        const embedded = Array.isArray(qp.course_outcomes) ? qp.course_outcomes
          : (Array.isArray(qp.courseOutcomes) ? qp.courseOutcomes : []);
        coList = embedded;
      } catch (e) { coList = []; }

      const progKey = formatProgrammeKey(qp.programme);
      const regulation = getRegulationForBatch(progKey, qp.batch);
      if (regulation) {
        const coDocId = `${sanitizeKey(qp.department)}_${sanitizeKey(regulation)}_${sanitizeKey(qp.subject)}_${sanitizeKey(qp.academic_year)}`;
        try {
          const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
          if (coSnap.exists()) {
            const data = coSnap.data();
            coList = Object.entries(data)
              .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
              .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
          }
        } catch (e) { /* ignore */ }
      }

      // Resolve subject faculty signature
      let facultySig = qp.faculty_signature_url || qp.facultySignatureUrl || '';
      if (!facultySig && qp.forwarded_by) {
        try {
          const snap = await getDoc(doc(db, 'users', qp.forwarded_by));
          if (snap.exists()) facultySig = snap.data().signatureUrl || '';
        } catch (e) { /* ignore */ }
      }

      const content = getQuestionPaperHTML(
        qp,
        coList,
        facultySig,
        qp.hod_signature_url || qp.hodSignatureUrl || '',
        ciaConfigs,
        null,
        qp.coe_signature_url || coeSignature
      );

      const w = window.open('', '_blank', 'width=900,height=1200');
      if (!w) { showToast('Please allow popups to download the PDF.', 'error'); return; }
      w.document.write(buildQuestionPaperPrintShell(content, qp.qpaper_name || 'Question Paper'));
      w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 1200);
    } catch (err) {
      console.error('QP download failed:', err);
      showToast('QP download failed. Please try again.', 'error');
    }
  };

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setFullQPForModal(null);
        return;
      }
      setFullQPForModal({ ...selectedQP });

      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const coDocId = `${sanitizeKey(selectedQP.department)}_${sanitizeKey(regulation)}_${sanitizeKey(selectedQP.subject)}_${sanitizeKey(selectedQP.academic_year)}`;
        try {
          const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
          if (coSnap.exists()) {
            const data = coSnap.data();
            const loadedCOs = Object.entries(data)
              .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
              .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
            setModalCourseOutcomes(loadedCOs);
          }
        } catch (e) { /* ignore */ }
      }
      if (selectedQP.forwarded_by) {
        try {
          const snap = await getDoc(doc(db, 'users', selectedQP.forwarded_by));
          if (snap.exists()) setFacultySignatureForQP(snap.data().signatureUrl || '');
        } catch (e) { /* ignore */ }
      }
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  // Typeset MathJax whenever the QP review modal opens
  useEffect(() => {
    if (!showQPModal || !(fullQPForModal || selectedQP)) return;
    const container = document.querySelector('.qp-print-wrapper');
    typesetMath(container);
  }, [showQPModal, fullQPForModal, selectedQP]);

  const handleApproveByCOE = async () => {
    if (!selectedQP) return;
    if (!coeSignature) {
      showToast("Please upload your digital signature in your profile before approving.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey);
      const now = new Date().toISOString();
      await setDoc(qpRef, {
        [selectedQP.id]: {
          status: 'approved_by_coe',
          coe_signature_url: coeSignature,
          coe_approved_by: coeName,
          coe_approved_at: now,
          coe_comments: null,
          forwarded_to: null,
          updated_at: now
        }
      }, { merge: true });
      showToast("Question paper approved and published by the Exam Cell.", "success");
      setShowQPModal(false);
      setSelectedQP(null);
    } catch (error) {
      console.error("Error approving paper:", error);
      showToast("Failed to approve question paper.", "error");
    }
  };

  const handleRecorrect = async () => {
    if (!selectedQP || !recorrectComments.trim()) {
      showToast("Please provide comments for recorrection.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey);
      const now = new Date().toISOString();
      await setDoc(qpRef, {
        [selectedQP.id]: {
          status: 'recorrected',
          forwarded_to: selectedQP.forwarded_by,
          forwarded_by: null,
          coe_comments: recorrectComments.trim(),
          coe_signature_url: null,
          updated_at: now
        }
      }, { merge: true });
      showToast("Question paper sent back for recorrection.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
      setSelectedQP(null);
    } catch (error) {
      console.error("Error recorrecting paper:", error);
      showToast("Failed to send paper back for recorrection.", "error");
    }
  };

  const handleAllocateToExam = async (scheduleSlot) => {
    if (!allocModal.qp || !scheduleSlot) return;
    setAllocating(true);
    try {
      const qp = allocModal.qp;
      const qpRef = doc(db, 'generated_qps', qp.compositeKey);
      const now = new Date().toISOString();
      await setDoc(qpRef, {
        [qp.id]: {
          allocated: true,
          allocatedTo: {
            examDate: scheduleSlot.examDate,
            session: scheduleSlot.slot || "",
            startTime: scheduleSlot.startTime || "",
            endTime: scheduleSlot.endTime || "",
            subjectCode: scheduleSlot.code,
            batch: scheduleSlot.batch,
            semester: scheduleSlot.semester,
            academicYear: scheduleSlot.academicYear,
            examName: scheduleSlot.examName || "",
            allocatedBy: coeName,
            allocatedByUid: currentUid,
            allocatedAt: now
          },
          updated_at: now
        }
      }, { merge: true });
      showToast(`QP allocated to ${scheduleSlot.examDate} (${scheduleSlot.slot || "FN"}) successfully!`, "success");
      setAllocModal({ open: false, qp: null });
    } catch (error) {
      console.error("Error allocating QP:", error);
      showToast("Failed to allocate question paper.", "error");
    } finally {
      setAllocating(false);
    }
  };

  const matchedScheduleSlots = useMemo(() => {
    if (!allocModal.qp) return [];
    const qp = allocModal.qp;
    const parsedSubj = parseSubjectField(qp.subject);
    const qpSubjCode = (parsedSubj.code || qp.subject || "").toString().replace(/\s+/g, "").toUpperCase();
    const qpBatch = (qp.batch || "").toString().trim();
    const qpSem = (qp.semester || "").toString().trim();

    return scheduleDocs.filter(s => {
      const sCode = (s.code || "").toString().replace(/\s+/g, "").toUpperCase();
      const sBatch = (s.batch || "").toString().trim();
      const sSem = (s.semester || "").toString().trim();
      return sCode === qpSubjCode && sBatch === qpBatch && sSem === qpSem;
    }).sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)));
  }, [allocModal.qp, scheduleDocs]);

  const publishedBySubject = useMemo(() => {
    const groups = {};

    const normDeptKey = (d) => {
      if (!d) return "";
      return formatDeptBadge(d).toLowerCase().replace(/\s+/g, " ").trim();
    };
    const addDept = (grp, deptEntry) => {
      const raw = normDeptKey(deptEntry);
      if (!raw) return;
      const exists = grp.departments.some(d => normDeptKey(d) === raw);
      if (!exists) grp.departments.push(deptEntry);
    };
    const syllabusDeptsFor = (code) => {
      const c = normCodeKey(code);
      return syllabusCodeMap[c] || [];
    };
    const extractSemNum = (s) => {
      if (!s) return "";
      const str = String(s).trim();
      const m = str.match(/(\d+)/);
      return m ? m[1] : str;
    };
    const extractBatchStart = (b) => {
      if (!b) return "";
      const str = String(b).trim();
      const m = str.match(/(\d{4})/);
      return m ? m[1] : str;
    };
    const makeKey = (code, batch, sem) => {
      const c = (code || "").toString().replace(/\s+/g, "").toUpperCase();
      const b = extractBatchStart(batch);
      const s = extractSemNum(sem);
      return `${c}|${b}|${s}`;
    };

    // 1. Seed from scheduleDocs (qp_setter_assignments) — every scheduled subject
    scheduleDocs.forEach(s => {
      const code = (s.code || "").toString().replace(/\s+/g, "").toUpperCase();
      const key = makeKey(code, s.batch, s.semester);
      if (!groups[key]) {
        groups[key] = {
          code,
          name: s.name || "",
          batch: (s.batch || "").trim(),
          semester: (s.semester || "").trim(),
          departments: [],
          academicYear: (s.academicYear || "").trim(),
          courseType: "",
          examDate: s.examDate || "",
          startTime: s.startTime || "",
          endTime: s.endTime || "",
          slot: s.slot || s.session || "",
          examName: s.examName || "",
          setterName: s.setterName || "",
          setterUid: s.setterUid || "",
          qps: []
        };
      }
      if (s.departments && Array.isArray(s.departments)) {
        s.departments.forEach(d => addDept(groups[key], d));
      }
    });

    // 2. Merge published QPs into their matching scheduled groups
    filteredPublished.forEach(qp => {
      const parsedSubj = parseSubjectField(qp.subject);
      const code = (parsedSubj.code || qp.subject || "").toString().replace(/\s+/g, "").toUpperCase();
      const name = parsedSubj.name || qp.subject_name || "";
      const batch = (qp.batch || "").toString().trim();
      const sem = (qp.semester || "").toString().trim();
      const key = makeKey(code, batch, sem);
      if (!groups[key]) {
        groups[key] = {
          code, name, batch, semester: sem,
          departments: [],
          academicYear: qp.academic_year || "",
          courseType: qp.course_type || "",
          examDate: "",
          startTime: "",
          endTime: "",
          slot: "",
          examName: "",
          qps: []
        };
      }
      if (!groups[key].name && name) groups[key].name = name;
      if (!groups[key].courseType && qp.course_type) groups[key].courseType = qp.course_type;
      if (qp.department) addDept(groups[key], qp.department);
      groups[key].qps.push(qp);
    });

    // 3. Backfill empty dept groups from syllabus_data, then courses (CourseBank)
    Object.values(groups).forEach(g => {
      if (g.departments.length === 0) {
        syllabusDeptsFor(g.code).forEach(rawDeptKey => addDept(g, rawDeptKey));
      }
      if (g.departments.length === 0) {
        const bankEntries = courseBankDeptMap[normCodeKey(g.code)] || [];
        bankEntries.forEach(({ dept, prog }) => {
          if (dept) addDept(g, { dept, prog });
        });
      }
    });

    return Object.values(groups).sort((a, b) => {
      const deptA = normDeptKey(a.departments[0]);
      const deptB = normDeptKey(b.departments[0]);
      const deptCmp = deptA.localeCompare(deptB);
      if (deptCmp !== 0) return deptCmp;
      return a.code.localeCompare(b.code);
    });
  }, [filteredPublished, scheduleDocs, syllabusCodeMap, courseBankDeptMap]);

  const [pubSearchQuery, setPubSearchQuery] = useState("");
  const [selectedPubExamDateFilter, setSelectedPubExamDateFilter] = useState("ALL");

  const availablePublishedExamDates = useMemo(() => {
    const dateMap = new Map();
    publishedBySubject.forEach(group => {
      const firstQp = group.qps[0];
      const allocInfo = firstQp?.allocatedTo || group.qps.find(q => q.allocatedTo)?.allocatedTo || null;
      const matchedSlot = !allocInfo ? scheduleDocs.find(s => {
        const sCode = (s.code || "").replace(/\s+/g, "").toUpperCase();
        const sBatchYr = (s.batch || "").match(/(\d{4})/)?.[1] || (s.batch || "").trim();
        const sSemNum = (s.semester || "").match(/(\d+)/)?.[1] || (s.semester || "").trim();
        const gBatchYr = (group.batch || "").match(/(\d{4})/)?.[1] || group.batch;
        const gSemNum = (group.semester || "").match(/(\d+)/)?.[1] || group.semester;
        return sCode === group.code && sBatchYr === gBatchYr && sSemNum === gSemNum;
      }) : null;

      const rawDate = allocInfo?.examDate || matchedSlot?.examDate || group.examDate || "";
      if (rawDate) {
        const normDate = rawDate.trim();
        if (!dateMap.has(normDate)) {
          dateMap.set(normDate, { rawDate: normDate, displayDate: fmtDate(normDate), count: 0 });
        }
        dateMap.get(normDate).count += 1;
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [publishedBySubject, scheduleDocs]);

  const filteredPublishedSubjects = useMemo(() => {
    let result = publishedBySubject;

    if (selectedPubExamDateFilter !== "ALL") {
      result = result.filter(group => {
        const firstQp = group.qps[0];
        const allocInfo = firstQp?.allocatedTo || group.qps.find(q => q.allocatedTo)?.allocatedTo || null;
        const matchedSlot = !allocInfo ? scheduleDocs.find(s => {
          const sCode = (s.code || "").replace(/\s+/g, "").toUpperCase();
          const sBatchYr = (s.batch || "").match(/(\d{4})/)?.[1] || (s.batch || "").trim();
          const sSemNum = (s.semester || "").match(/(\d+)/)?.[1] || (s.semester || "").trim();
          const gBatchYr = (group.batch || "").match(/(\d{4})/)?.[1] || group.batch;
          const gSemNum = (group.semester || "").match(/(\d+)/)?.[1] || group.semester;
          return sCode === group.code && sBatchYr === gBatchYr && sSemNum === gSemNum;
        }) : null;

        const rawDate = allocInfo?.examDate || matchedSlot?.examDate || group.examDate || "";
        return rawDate.trim() === selectedPubExamDateFilter;
      });
    }

    if (pubSearchQuery.trim()) {
      const q = pubSearchQuery.trim().toLowerCase();
      result = result.filter(g => {
        const deptMatch = g.departments.some(d => formatDeptBadge(d).toLowerCase().includes(q));
        return g.code.toLowerCase().includes(q) ||
          g.name.toLowerCase().includes(q) ||
          deptMatch ||
          g.batch.toLowerCase().includes(q) ||
          g.semester.toLowerCase().includes(q);
      });
    }
    return result;
  }, [publishedBySubject, pubSearchQuery, selectedPubExamDateFilter, scheduleDocs]);

  const renderQpCard = (qp, published) => {
    const name = resolveName(published ? qp.coe_approved_by || qp.forwarded_by : qp.forwarded_by);
    const initial = (name || "?").charAt(0).toUpperCase();
    const colorIdx = Math.abs((qp.subject || "").length) % 6;
    const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
    const dotColor = dotColors[colorIdx];
    const examDisplay = resolveExamDisplay(qp);

    const parsedSubj = parseSubjectField(qp.subject);
    const subjCode = parsedSubj.code || qp.subject;
    const subjName = parsedSubj.name || qp.subject_name;

    const isAllocated = published && qp.allocated;
    const allocInfo = qp.allocatedTo;

    return (
      <div key={`${qp.compositeKey}-${qp.id}`}
        className={`group bg-white/60 rounded-2xl border p-4 hover:shadow-md hover:bg-white transition-all duration-200 ${isAllocated ? 'border-emerald-200' : 'border-zinc-150'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-full ${dotColor} text-white flex items-center justify-center text-xs font-black shrink-0`}>
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-zinc-800 truncate">{name}</span>
                <span className="text-[10px] text-zinc-300">•</span>
                <span className="text-[10px] text-zinc-400">{timeAgo(qp.updated_at || qp.approved_at || qp.forwarded_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs font-black text-zinc-800 truncate">{subjCode}</span>
                {subjName && (
                  <>
                    <span className="text-[10px] text-zinc-300">•</span>
                    <span className="text-[10px] text-zinc-600 truncate max-w-[200px] font-semibold">{subjName}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50/50 text-blue-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-blue-100/40">
                  {examDisplay}
                </span>
                <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">{qp.batch || "-"}</span>
                <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">Sem {qp.semester || "-"}</span>
                {published && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-emerald-100/40">
                    <ShieldCheck size={9} className="mr-0.5" /> COE APPROVED
                  </span>
                )}
                {isAllocated && allocInfo && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 text-violet-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-violet-100/40">
                    <Link2 size={9} /> {allocInfo.examDate} ({allocInfo.session || "FN"})
                  </span>
                )}
              </div>
              {isAllocated && allocInfo && (
                <p className="text-[10px] text-emerald-600 font-semibold mt-1.5">
                  Allocated by {allocInfo.allocatedBy} on {fmtDate(allocInfo.allocatedAt)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {published && !isAllocated && (
              <button
                onClick={() => setAllocModal({ open: true, qp })}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-extrabold transition-all shadow-sm cursor-pointer">
                <Link2 size={12} /> Allocate
              </button>
            )}
            {isAllocated && (
              <button
                onClick={() => handleDownloadAllocatedQP(qp)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#120c7a] hover:bg-[#0f0a66] text-white text-[11px] font-extrabold transition-all shadow-sm cursor-pointer">
                <Download size={12} /> Download
              </button>
            )}
            <button
              onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-white text-[11px] font-extrabold transition-all shadow-sm cursor-pointer ${published ? "bg-zinc-500 hover:bg-zinc-600" : "bg-[#120c7a] hover:bg-[#0f0a66]"}`}>
              <Eye size={12} /> {published ? "View" : "Review"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout title="Exam Cell — QP Final Review">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[300] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold animate-in slide-in-from-right ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
          {toast.message}
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/exam-cell")}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer">
                <ArrowLeft size={18} />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Landmark size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Question Paper Final Review</h1>
                <p className="text-sm text-blue-100/90 font-medium">Exam Cell — finalise HOD-approved papers or send back for corrections</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-2xl px-4 py-2">
              <ShieldCheck size={16} className="text-amber-300" />
              <div>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Signed in as</p>
                <p className="text-sm font-extrabold">{coeName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex bg-zinc-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => setActiveTab("review")}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${activeTab === "review" ? "bg-[#120c7a] text-white shadow" : "text-zinc-500 hover:text-zinc-800"}`}>
              Review Queue ({pendingQps.length})
            </button>
            <button
              onClick={() => setActiveTab("published")}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${activeTab === "published" ? "bg-[#120c7a] text-white shadow" : "text-zinc-500 hover:text-zinc-800"}`}>
              Published ({publishedQps.length})
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, faculty or exam..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold bg-zinc-50 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all"
            />
          </div>
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer">
              Clear search
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center gap-2 px-1">
          <Sparkles size={14} className="text-amber-500" />
          <p className="text-xs font-bold text-zinc-600">
            {activeTab === "review"
              ? `${filteredPending.length} paper${filteredPending.length !== 1 ? "s" : ""} waiting for COE final review. Approve to publish, or send back to faculty for recorrection.`
              : activeTab === "published" && awaitingAllocation.length > 0
                ? `${awaitingAllocation.length} paper${awaitingAllocation.length !== 1 ? "s" : ""} published but not yet allocated to an exam. ${allocatedQps.length} already allocated.`
                : `${filteredPublished.length} paper${filteredPublished.length !== 1 ? "s" : ""} published${allocatedQps.length > 0 ? ` (${allocatedQps.length} allocated)` : ""}.`}
          </p>
        </div>

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-zinc-100/50 rounded-2xl animate-pulse border border-zinc-200/50" />)}
          </div>
        ) : activeTab === "review" ? (
          filteredPending.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-sm font-black text-zinc-800">
                {searchQuery ? "No matching papers" : "All caught up!"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                {searchQuery
                  ? "Try adjusting your search query."
                  : "No question papers are waiting for your final review. Papers approved by HODs will appear here."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPending.map(qp => renderQpCard(qp, false))}
            </div>
          )
        ) : (
          filteredPublished.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-4">
                <BookOpen size={28} />
              </div>
              <h3 className="text-sm font-black text-zinc-800">No published papers yet</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                Papers you approve in the review queue will be listed here as published.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
              {/* Published Table Search & Date Filter Header */}
              <div className="px-6 pt-6 pb-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={15} />
                    <input
                      value={pubSearchQuery}
                      onChange={(e) => setPubSearchQuery(e.target.value)}
                      placeholder="Search course code, subject name, department, or batch..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold bg-zinc-50 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all"
                    />
                  </div>
                  <span className="text-xs font-extrabold text-zinc-400 shrink-0">
                    {filteredPublishedSubjects.length} Subject{filteredPublishedSubjects.length !== 1 ? "s" : ""} · {filteredPublished.length} Total QPs
                  </span>
                </div>

                {/* Dynamic Exam Date Filter Bar */}
                {availablePublishedExamDates.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-[#120c7a]" />
                        <span className="text-xs font-extrabold text-slate-800">Filter Published Exams by Schedule Date</span>
                      </div>
                      <span className="text-[10.5px] font-bold text-slate-500">
                        {availablePublishedExamDates.length} Exam Date{availablePublishedExamDates.length !== 1 ? 's' : ''} Available
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setSelectedPubExamDateFilter("ALL")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          selectedPubExamDateFilter === "ALL"
                            ? "bg-[#120c7a] text-white shadow-xs"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        📅 All Dates ({publishedBySubject.length} Subjects)
                      </button>
                      {availablePublishedExamDates.map((item) => {
                        const isSelected = selectedPubExamDateFilter === item.rawDate;
                        return (
                          <button
                            key={item.rawDate}
                            onClick={() => setSelectedPubExamDateFilter(item.rawDate)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? "bg-[#120c7a] text-white shadow-xs"
                                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            <span>📅 {item.displayDate}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.count} Subj
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Allocated Info Banner */}
              {allocatedQps.length > 0 && (
                <div className="mx-6 mb-4 flex items-center gap-2 px-4 py-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <p className="text-[11px] font-bold text-emerald-700">{allocatedQps.length} QP{allocatedQps.length !== 1 ? "s" : ""} allocated &amp; ready for download</p>
                  {awaitingAllocation.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      {awaitingAllocation.length} awaiting allocation
                    </span>
                  )}
                </div>
              )}

              {filteredPublishedSubjects.length === 0 ? (
                <div className="p-12 text-center">
                  <BookOpen size={36} className="text-zinc-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-zinc-600">{pubSearchQuery ? "No matching subjects" : "No published papers yet"}</p>
                  <p className="text-xs text-zinc-400 mt-1">{pubSearchQuery ? "Try adjusting your search." : "Papers you approve in the review queue will appear here."}</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <table className="w-full text-left border-collapse text-xs border border-slate-300 mx-6" style={{ width: "calc(100% - 3rem)" }}>
                    <thead>
                      <tr className="bg-slate-100/90 text-slate-800 font-extrabold uppercase text-[10px] tracking-wider">
                        <th className="p-3.5 border border-slate-300 rounded-tl-xl text-center" style={{ width: "13%" }}>Department</th>
                        <th className="p-3.5 border border-slate-300" style={{ width: "10%" }}>Course Code</th>
                        <th className="p-3.5 border border-slate-300" style={{ width: "18%" }}>Course Name</th>
                        <th className="p-3.5 border border-slate-300 text-center" style={{ width: "10%" }}>Batch / Sem</th>
                        <th className="p-3.5 border border-slate-300" style={{ width: "14%" }}>Exam Date &amp; Time</th>
                        <th className="p-3.5 border border-slate-300" style={{ width: "12%" }}>QP Setter</th>
                        <th className="p-3.5 border border-slate-300 rounded-tr-xl">Published Question Papers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {filteredPublishedSubjects.map((group, gIdx) => {
                        const allocatedCount = group.qps.filter(q => q.allocated).length;
                        const pendingCount = group.qps.length - allocatedCount;
                        const firstQp = group.qps[0];

                        const allocInfo = firstQp?.allocatedTo || group.qps.find(q => q.allocatedTo)?.allocatedTo || null;
                        const matchedSlot = !allocInfo ? scheduleDocs.find(s => {
                          const sCode = (s.code || "").replace(/\s+/g, "").toUpperCase();
                          const sBatchYr = (s.batch || "").match(/(\d{4})/)?.[1] || (s.batch || "").trim();
                          const sSemNum = (s.semester || "").match(/(\d+)/)?.[1] || (s.semester || "").trim();
                          const gBatchYr = (group.batch || "").match(/(\d{4})/)?.[1] || group.batch;
                          const gSemNum = (group.semester || "").match(/(\d+)/)?.[1] || group.semester;
                          return sCode === group.code && sBatchYr === gBatchYr && sSemNum === gSemNum;
                        }) : null;

                        const examDateRaw = allocInfo?.examDate || matchedSlot?.examDate || group.examDate || null;
                        const examDateDisplay = examDateRaw ? fmtDate(examDateRaw) : null;
                        const examSlot = allocInfo?.session || matchedSlot?.slot || matchedSlot?.session || group.slot || "";
                        const startTime = allocInfo?.startTime || matchedSlot?.startTime || group.startTime || "";
                        const endTime = allocInfo?.endTime || matchedSlot?.endTime || group.endTime || "";
                        const examTime = startTime && endTime
                          ? `${startTime} — ${endTime}`
                          : startTime || "";

                        return (
                          <tr key={`${group.code}_${group.batch}_${group.semester}_${gIdx}`} className="hover:bg-slate-50/50 transition-colors">
                            {/* Department */}
                            <td className="p-3.5 align-top border border-slate-200 bg-slate-50/40">
                              {group.departments.length > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  {group.departments.length > 1 && (
                                    <span className="inline-flex items-center text-[9px] font-black text-white bg-violet-600 border border-violet-700 px-2 py-0.5 rounded-md">
                                      COMMON
                                    </span>
                                  )}
                                  {group.departments.map((d, dIdx) => {
                                    const badgeLabel = formatDeptBadge(d);
                                    if (!badgeLabel) return null;
                                    const deptColors = [
                                      "text-sky-700 bg-sky-50 border-sky-200",
                                      "text-emerald-700 bg-emerald-50 border-emerald-200",
                                      "text-amber-700 bg-amber-50 border-amber-200",
                                      "text-violet-700 bg-violet-50 border-violet-200",
                                      "text-rose-700 bg-rose-50 border-rose-200",
                                      "text-indigo-700 bg-indigo-50 border-indigo-200",
                                    ];
                                    const colorClass = deptColors[dIdx % deptColors.length];
                                    return (
                                      <span key={`${group.code}_dept_${dIdx}`}
                                        className={`inline-flex items-center text-[9px] font-bold px-2 py-1 rounded-md border ${colorClass}`}>
                                        {badgeLabel}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="font-black text-slate-800 text-xs leading-snug block text-center">—</span>
                              )}
                            </td>

                            {/* Course Code */}
                            <td className="p-3.5 align-top border border-slate-200">
                              <span className="font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs tracking-tight">
                                {group.code}
                              </span>
                            </td>

                            {/* Course Name */}
                            <td className="p-3.5 align-top border border-slate-200">
                              <span className="font-bold text-slate-900 block leading-tight">{group.name || "—"}</span>
                              {group.courseType && (
                                <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md border text-indigo-700 bg-indigo-50 border-indigo-100 inline-block mt-1">
                                  {group.courseType}
                                </span>
                              )}
                            </td>

                            {/* Batch / Sem */}
                            <td className="p-3.5 align-top border border-slate-200 text-center">
                              <div className="space-y-1">
                                <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-2 py-0.5 text-[10px] font-extrabold border border-zinc-200/50 block">
                                  {group.batch || "—"}
                                </span>
                                <span className="inline-flex items-center rounded-md bg-blue-50/50 text-blue-700 px-2 py-0.5 text-[10px] font-extrabold border border-blue-100/40 block">
                                  Sem {group.semester || "—"}
                                </span>
                                {group.academicYear && (
                                  <span className="text-[9px] font-bold text-zinc-400 block">{group.academicYear}</span>
                                )}
                              </div>
                            </td>

                            {/* Exam Date & Time */}
                            <td className="p-3.5 align-top border border-slate-200">
                              {examDateDisplay ? (
                                <div className="space-y-1">
                                  <span className="font-black text-slate-800 text-xs block">{examDateDisplay}</span>
                                  {examTime && (
                                    <span className="text-[11px] font-bold text-zinc-600 block">{examTime}</span>
                                  )}
                                  {examSlot && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                      (examSlot || "").toUpperCase() === "AN"
                                        ? "bg-amber-100 text-amber-700 border border-amber-200"
                                        : "bg-blue-100 text-blue-700 border border-blue-200"
                                    }`}>
                                      <Clock size={9} className="mr-0.5" />
                                      {(examSlot || "FN").toUpperCase()} SESSION
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] font-semibold text-zinc-400">Not allocated yet</span>
                              )}
                            </td>

                            {/* QP Setter */}
                            <td className="p-3.5 align-top border border-slate-200">
                              {(() => {
                                const setter = matchedSlot?.setterName || group.setterName || "";
                                if (setter) {
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-6 h-6 rounded-full bg-[#120c7a] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                                        {(setter || "?").charAt(0).toUpperCase()}
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-800 leading-tight">{setter}</span>
                                    </div>
                                  );
                                }
                                return <span className="text-[10px] font-semibold text-zinc-400">—</span>;
                              })()}
                            </td>

                            {/* Published QPs — List */}
                            <td className="p-3.5 align-top border border-slate-200">
                              {group.qps.length === 0 ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-xl">
                                  NIL
                                </span>
                              ) : (<>
                              <div className="space-y-2">
                                {group.qps.map((qp, qIdx) => {
                                  const qpParsed = parseSubjectField(qp.subject);
                                  const setLabel = formatQPSetDisplay(qp);
                                  const examLabel = resolveExamDisplay(qp);
                                  const isAlloc = !!qp.allocated;
                                  const allocData = qp.allocatedTo;
                                  const submitter = resolveName(qp.forwarded_by);

                                  return (
                                    <div key={`${qp.compositeKey}-${qp.id}-${qIdx}`}
                                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isAlloc ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/40 border-amber-200'}`}>
                                      {/* Set badge */}
                                      <span className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg text-[10px] font-black ${
                                        isAlloc ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                      }`}>
                                        {setLabel}
                                      </span>

                                      {/* Info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11px] font-black text-zinc-800 truncate">{examLabel}</span>
                                        </div>
                                        {isAlloc && allocData && (
                                          <span className="text-[9px] font-bold text-emerald-600 block mt-0.5">
                                            Allocated → {fmtDate(allocData.examDate)} ({(allocData.session || "FN").toUpperCase()})
                                          </span>
                                        )}
                                        {!isAlloc && (
                                          <span className="text-[9px] font-bold text-amber-600 block mt-0.5">
                                            Awaiting allocation
                                          </span>
                                        )}
                                        <span className="text-[9px] text-zinc-400 font-medium block">
                                          by {submitter} · {timeAgo(qp.updated_at || qp.coe_approved_at)}
                                        </span>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex items-center gap-1 shrink-0">
                                        {!isAlloc && (
                                          <button
                                            onClick={() => setAllocModal({ open: true, qp })}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-extrabold transition-all shadow-sm cursor-pointer">
                                            <Link2 size={10} /> Allocate
                                          </button>
                                        )}
                                        {isAlloc && (
                                          <button
                                            onClick={() => handleDownloadAllocatedQP(qp)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#120c7a] hover:bg-[#0f0a66] text-white text-[10px] font-extrabold transition-all shadow-sm cursor-pointer">
                                            <Download size={10} /> Download
                                          </button>
                                        )}
                                        <button
                                          onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-500 hover:bg-zinc-600 text-white text-[10px] font-extrabold transition-all shadow-sm cursor-pointer">
                                          <Eye size={10} /> View
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Summary badge */}
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <span className="text-[9px] font-black text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                                  {group.qps.length} QP{group.qps.length !== 1 ? "s" : ""}
                                </span>
                                {allocatedCount > 0 && (
                                  <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                    {allocatedCount} Allocated
                                  </span>
                                )}
                                {pendingCount > 0 && (
                                  <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                    {pendingCount} Pending
                                  </span>
                                )}
                              </div>
                              </>)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* QP Review Modal */}
      {showQPModal && selectedQP && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#120c7a] to-indigo-900 px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 p-2.5 rounded-xl text-white">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-tight">{resolveExamDisplay(selectedQP)}</h3>
                  <p className="text-xs text-blue-200">
                    {(() => {
                      const p = parseSubjectField(selectedQP.subject);
                      const code = p.code || selectedQP.subject;
                      const name = p.name || selectedQP.subject_name;
                      return name ? `${code} · ${name}` : code;
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedQP.status === "approved_by_hod" && (
                  <>
                    <button onClick={handleApproveByCOE}
                      className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer">
                      <CheckCircle2 size={16} /> Approve &amp; Publish
                    </button>
                    <button onClick={() => setShowRecorrectModal(true)}
                      className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer">
                      <Edit2 size={16} /> Send Back
                    </button>
                  </>
                )}
                {selectedQP.status === "approved_by_coe" && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 px-3 py-1.5 rounded-xl text-xs font-extrabold">
                    <ShieldCheck size={14} /> PUBLISHED BY COE
                  </span>
                )}
                <button onClick={() => { setShowQPModal(false); setSelectedQP(null); }}
                  className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              <style>{`
                .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                .qp-print-wrapper .logo-img { max-width: 100%; width: 754px !important; height: 60px !important; object-fit: contain; }
                .qp-print-wrapper p { margin: 0 0 5px 0; }
              `}</style>
              <div className="bg-white shadow-xl mx-auto qp-print-wrapper rounded-xl"
                style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}>
                <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(fullQPForModal || selectedQP) }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recorrect Modal */}
      {showRecorrectModal && (
        <div className="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Send for Recorrection</h3>
                  <p className="text-xs text-zinc-500">Provide feedback to the faculty</p>
                </div>
              </div>
              <button onClick={() => setShowRecorrectModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <textarea value={recorrectComments} onChange={(e) => setRecorrectComments(e.target.value)}
                className="w-full h-36 p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none text-sm"
                placeholder="Enter your suggestions/corrections for the faculty..." />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowRecorrectModal(false); setRecorrectComments(""); }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer">
                  Cancel
                </button>
                <button onClick={handleRecorrect} disabled={!recorrectComments.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 cursor-pointer">
                  Send for Recorrection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QP Allocation Modal */}
      {allocModal.open && allocModal.qp && (
        <div className="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
                  <Link2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Allocate QP to Exam Schedule</h3>
                  <p className="text-xs text-zinc-500">
                    {(() => { const p = parseSubjectField(allocModal.qp.subject); return p.code || allocModal.qp.subject; })()} · {allocModal.qp.batch} · Sem {allocModal.qp.semester}
                  </p>
                </div>
              </div>
              <button onClick={() => setAllocModal({ open: false, qp: null })}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {matchedScheduleSlots.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar size={36} className="text-zinc-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-zinc-600">No matching exam schedule found</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                    No exam timetable entry found for this subject, batch, and semester. Create an IA schedule first in QP Setter Assignment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Select an exam slot:</p>
                  {matchedScheduleSlots.map((slot, idx) => (
                    <div key={idx}
                      className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-zinc-800">{fmtDate(slot.examDate)}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold ${(slot.slot || "").toUpperCase() === "AN" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                            {(slot.slot || "FN").toUpperCase()}
                          </span>
                          {slot.startTime && slot.endTime && (
                            <span className="text-[10px] text-zinc-400 font-medium">
                              {slot.startTime} — {slot.endTime}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 font-medium mt-0.5">{slot.examName || ""}</p>
                      </div>
                      <button
                        onClick={() => handleAllocateToExam(slot)}
                        disabled={allocating}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 cursor-pointer">
                        {allocating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        Allocate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50 shrink-0">
              <p className="text-[10px] text-zinc-400 font-medium text-center">
                After allocation, the question paper can be downloaded and printed. No QP can be downloaded before allocation.
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}