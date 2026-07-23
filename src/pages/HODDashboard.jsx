import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, onSnapshot, getDocs, setDoc } from "firebase/firestore";
import {
  Eye, Loader2, ClipboardList, User, X, FileText, CheckCircle2, Edit2,
  Clock, BookOpen, TrendingUp, Search, Filter, School, ChevronRight,
  Sparkles, BarChart3, ArrowUpRight, Zap, Bell, AlertCircle, Calendar,
  Users, GraduationCap, CalendarCheck2, AlertTriangle, RefreshCw
} from "lucide-react";

import Layout from "../components/Layout";
import { auth, db } from "../firebase";
import { fetchAllCourseNamesMap, getCourseName } from "../utils/courseUtils";
import { getQuestionPaperHTML } from '../utils/questionPaperUtils';
import { useRegulations } from "../hooks/useRegulations";
import { sanitizeKey, formatProgrammeKey } from "../lib/utils";

function bsKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]/]/g, '_');
}

const colorMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", border: "border-blue-200", gradient: "from-blue-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-200", gradient: "from-amber-500" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200", gradient: "from-emerald-500" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-200", gradient: "from-violet-500" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-200", gradient: "from-rose-500" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", border: "border-indigo-200", gradient: "from-indigo-500" },
};

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

export default function HODDashboard() {
  const navigate = useNavigate();
  const { getRegulationForBatch } = useRegulations();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [hodName, setHodName] = useState("");
  const [hodLoading, setHodLoading] = useState(true);

  const [usersMap, setUsersMap] = useState({});
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasks, setTasks] = useState([]);

  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [currentHodSignature, setCurrentHodSignature] = useState('');
  const [facultySignatureForQP, setFacultySignatureForQP] = useState('');
  const [selectedQPHodSignature, setSelectedQPHodSignature] = useState('');
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [fullQPForModal, setFullQPForModal] = useState(null);
  const [ciaConfigs, setCiaConfigs] = useState({});
  const [showRecorrectModal, setShowRecorrectModal] = useState(false);
  const [recorrectComments, setRecorrectComments] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [hodDepartment, setHodDepartment] = useState("");
  const [hodProgramme, setHodProgramme] = useState("");
  const [deptMetadata, setDeptMetadata] = useState({});
  const [approvedStudentsList, setApprovedStudentsList] = useState([]);
  const [allStudentNames, setAllStudentNames] = useState({});
  const [attendanceOverview, setAttendanceOverview] = useState({});
  const [attendanceOverviewLoading, setAttendanceOverviewLoading] = useState(false);
  const [subjectNamesMap, setSubjectNamesMap] = useState({});
  const [timetableAllocation, setTimetableAllocation] = useState({});
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [sectionAllotmentPopup, setSectionAllotmentPopup] = useState({ open: false });
  const [sectionConfigs, setSectionConfigs] = useState({});
  const [sectionAssignments, setSectionAssignments] = useState({});
  const [savingSection, setSavingSection] = useState(false);
  const [deptMetadataLoaded, setDeptMetadataLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [batchStrengthModal, setBatchStrengthModal] = useState({ open: false });
  const [sectionStudents, setSectionStudents] = useState([]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  useEffect(() => {
    const ciaRef = collection(db, 'cia_configs');
    const unsubscribe = onSnapshot(ciaRef, (snapshot) => {
      if (snapshot.exists) {
        const data = {};
        snapshot.forEach(d => { data[d.id] = d.data(); });
        setCiaConfigs(data);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then(snap => {
          if (snap.exists()) {
            const ud = snap.data();
            console.log('[HODDashboard] User doc fields:', Object.keys(ud).join(', '), '| Full:', ud);
            setCurrentHodSignature(ud.signatureUrl || '');
            setHodName(ud.facultyName || ud.displayName || ud.email || "HOD");
            setHodDepartment(ud.department || ud.assignedDepartment || ud.departmentName || ud.dept || ud.deptName || ud.facultyDepartment || ud.departmentCode || "");
            setHodProgramme(ud.programme || "");
          }
          setHodLoading(false);
        });
      } else {
        setCurrentHodSignature('');
        setHodName("");
        setHodLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsub = onSnapshot(
      usersRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        setUsersMap(data || {});
      },
      () => setUsersMap({})
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    const qpRef = collection(db, "generated_qps");
    const unsub = onSnapshot(
      qpRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });
        const forwarded = all
          .filter((qp) => qp?.status === "forwarded" && qp?.forwarded_to === currentUid)
          .sort((a, b) => {
            const at = new Date(a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });
        setTasks(forwarded);
        setTasksLoading(false);
      },
      () => { setTasks([]); setTasksLoading(false); }
    );
    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!hodDepartment) {
      setApprovedStudentsList([]);
      return;
    }
    setStudentsLoading(true);
    const hodNorm = sanitizeKey(hodDepartment).toLowerCase().replace(/[_ ]+/g, '');
    const unsub = onSnapshot(
      collection(db, 'approved_admissions'),
      (snap) => {
        const all = [];
        snap.forEach(docSnap => {
          const docId = docSnap.id;
          const data = docSnap.data();
          // 1) Try _meta.department first
          let deptMatch = false;
          if (data._meta?.department) {
            const metaDept = sanitizeKey(data._meta.department).toLowerCase().replace(/[_ ]+/g, '');
            deptMatch = metaDept === hodNorm || metaDept.includes(hodNorm) || hodNorm.includes(metaDept);
          }
          // 2) Fall back to doc ID: {batch}_{progKey}_{deptKey} where deptKey can span multiple segments
          if (!deptMatch) {
            const parts = docId.split('_');
            if (parts.length > 1) {
              // Try matching the full composite after batch against the HOD dept name
              const batchMatch2 = docId.match(/(\d{4}-\d{4})/);
              if (batchMatch2) {
                const afterBatch = docId.slice(docId.indexOf(batchMatch2[1]) + batchMatch2[1].length + 1);
                const normComposite = afterBatch.toLowerCase().replace(/[_ ]+/g, '');
                deptMatch = normComposite === hodNorm || normComposite.includes(hodNorm) || hodNorm.includes(normComposite);
              } else {
                // Fallback: last segment only
                const lastPart = parts[parts.length - 1].toLowerCase();
                deptMatch = lastPart === hodNorm || lastPart.includes(hodNorm) || hodNorm.includes(lastPart);
              }
            }
          }
          if (!deptMatch) return;

          // Extract batch from doc ID (first segment with dash)
          let batch = "";
          const batchMatch = docId.match(/(\d{4}-\d{4})/);
          if (batchMatch) batch = batchMatch[1];

          Object.entries(data).forEach(([key, val]) => {
            if (key === '_order' || key.startsWith('_')) return;
            all.push({ reg: key, name: val, batch, docId });
          });
        });
        all.sort((a, b) => a.reg.localeCompare(b.reg));
        setApprovedStudentsList(all);
        setStudentsLoading(false);
      },
      () => { setApprovedStudentsList([]); setStudentsLoading(false); }
    );
    return () => unsub();
  }, [hodDepartment]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const map = {};
      snap.forEach(docSnap => {
        const data = docSnap.data();
        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
          if (name && typeof name === 'string') map[key] = name;
        });
      });
      setAllStudentNames(map);
    }, () => setAllStudentNames({}));
    return () => unsub();
  }, []);

  // Fetch section-assigned students per batch for this dept
  useEffect(() => {
    if (!hodDepartment) { setSectionStudents([]); return; }
    const hodNorm = sanitizeKey(hodDepartment).toLowerCase().replace(/[_ ]+/g, '');
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
        const docId = docSnap.id;
        const data = docSnap.data();
        // 1) Try _meta.department first (most reliable)
        let deptMatch = false;
        if (data._meta?.department) {
          const metaDept = sanitizeKey(data._meta.department).toLowerCase().replace(/[_ ]+/g, '');
          deptMatch = metaDept === hodNorm || metaDept.includes(hodNorm) || hodNorm.includes(metaDept);
        }
        // 2) Fall back to doc ID parsing: {batch}_{progKey}_{deptKey}[_section]
        if (!deptMatch) {
          const parts = docId.split('_');
          // Find batch (contains a dash like 2024-2028)
          const batchIdx = parts.findIndex(p => /\d{4}-\d{4}/.test(p));
          if (batchIdx >= 0) {
            // deptKey is the part right before the batch or after progKey
            // But since progKey can be multi-part (B_Tech), dept is the last part before batch
            // Actually in {batch}_{progKey}_{deptKey}, batch is FIRST
            // So: parts[0] = batch, rest is {progKey}_{deptKey}[_section]
            // deptKey = second-to-last segment (or last if no section)
            const afterBatch = parts.slice(1);
            // Remove section suffix if present (last part starts with Sec-)
            const coreParts = afterBatch.length > 0 && afterBatch[afterBatch.length - 1].match(/^Sec-/)
              ? afterBatch.slice(0, -1)
              : afterBatch;
            // deptKey is the last part of core
            if (coreParts.length > 0) {
              const lastPart = coreParts[coreParts.length - 1].toLowerCase();
              deptMatch = lastPart === hodNorm || lastPart.includes(hodNorm) || hodNorm.includes(lastPart);
            }
          }
        }
        if (!deptMatch) return;

        // Extract batch from doc ID
        let batch = "";
        const batchMatch = docId.match(/(\d{4}-\d{4})/);
        if (batchMatch) batch = batchMatch[1];

        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
          if (name && typeof name === 'string') list.push({ reg: key, name, batch, docId });
        });
      });
      setSectionStudents(list);
    }, () => setSectionStudents([]));
    return () => unsub();
  }, [hodDepartment]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      const configs = [];
      snap.forEach(d => { configs.push({ id: d.id, ...d.data() }); });
      setSemesterConfigs(configs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'department_metadata'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setDeptMetadata(data);
      setDeptMetadataLoaded(true);
    });
    return () => unsub();
  }, []);

  // ─── Attendance Overview ───
  useEffect(() => {
    if (!currentUid || !deptMetadataLoaded) {
      setAttendanceOverview({});
      setAttendanceOverviewLoading(false);
      return;
    }
    setAttendanceOverviewLoading(true);

    let cancelled = false;

    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    const currentAy = month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    // Build valid dept keys: both sanitized name AND code from deptMetadata
    const stripDegreePrefix = (s) => s.replace(/^(B\.? ?Tech|M\.? ?Tech|B\.?E\.?|M\.?E\.?|B\.?Sc|M\.?Sc|Ph\.?D)\s+/i, '').trim();
    const hodNorm = hodDepartment ? stripDegreePrefix(hodDepartment) : '';
    const validDeptKeys = new Set();
    if (hodDepartment) {
      validDeptKeys.add(sanitizeKey(hodDepartment).toLowerCase());
      validDeptKeys.add(sanitizeKey(hodNorm).toLowerCase());
      Object.values(deptMetadata).forEach(depts => {
        Object.entries(depts).forEach(([name, code]) => {
          if (name === hodDepartment || name === hodNorm || code === hodDepartment || code === hodNorm ||
            sanitizeKey(name).toLowerCase() === sanitizeKey(hodNorm).toLowerCase() ||
            code.toLowerCase() === hodNorm.toLowerCase()) {
            validDeptKeys.add(sanitizeKey(name).toLowerCase());
            validDeptKeys.add(sanitizeKey(code).toLowerCase());
          }
        });
      });
    }

    const unsub = onSnapshot(collection(db, "subject_assignments"), async (snap) => {
      const allAssignments = [];

      snap.forEach(d => {
        const parts = d.id.split('_');
        const yearIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
        if (yearIdx < 2) return;

        const batchKey = parts[yearIdx];
        const ayKey = parts[yearIdx + 1];
        const semNum = parts[yearIdx + 2];
        const secSuffix = parts.slice(yearIdx + 3).join('_');

        const combinedBeforeBatch = parts.slice(0, yearIdx).join('_');
        let progKey = '';
        let deptFromDoc = '';

        // Strategy 1: use hodProgramme (from user doc) as the known programme key
        if (hodProgramme && combinedBeforeBatch.startsWith(hodProgramme + '_')) {
          progKey = hodProgramme;
          deptFromDoc = combinedBeforeBatch.slice(hodProgramme.length + 1);
        }

        // Strategy 2: try matching against deptMetadata
        if (!progKey) {
          for (const [pk, depts] of Object.entries(deptMetadata)) {
            if (!combinedBeforeBatch.startsWith(pk + '_')) continue;
            const deptCandidate = combinedBeforeBatch.slice(pk.length + 1);
            for (const [deptName, deptCode] of Object.entries(depts)) {
              if (sanitizeKey(deptName) === deptCandidate || deptCode === deptCandidate) {
                progKey = pk;
                deptFromDoc = deptCandidate;
                break;
              }
            }
            if (progKey) break;
          }
        }

        // Strategy 3: try all programme keys from deptMetadata and match dept by name/code
        if (!progKey) {
          for (const [pk, depts] of Object.entries(deptMetadata)) {
            if (!combinedBeforeBatch.startsWith(pk + '_')) continue;
            progKey = pk;
            deptFromDoc = combinedBeforeBatch.slice(pk.length + 1);
            break;
          }
        }

        // Strategy 4: fallback — old parsing (single-word dept names only)
        if (!progKey) {
          deptFromDoc = parts[yearIdx - 1];
          progKey = parts.slice(0, yearIdx - 1).join('_');
        }

        const data = d.data();

        Object.entries(data).forEach(([uid, codes]) => {
          if (Array.isArray(codes)) {
            codes.forEach(code => {
              allAssignments.push({ uid, subjectCode: code, batch: batchKey, ay: ayKey, sem: semNum, section: secSuffix, progKey, attDeptKey: deptFromDoc });
            });
          }
        });
      });

      // Filter by department using validDeptKeys (name + code matching)
      let deptFiltered = allAssignments;
      if (validDeptKeys.size > 0) {
        const hodDirectKey = hodNorm ? sanitizeKey(hodNorm).toLowerCase() : '';
        deptFiltered = allAssignments.filter(a => {
          const normKey = sanitizeKey(a.attDeptKey.trim()).toLowerCase();
          return validDeptKeys.has(normKey) || (hodDirectKey && normKey === hodDirectKey);
        });
      }

      console.log('[AttendanceOverview] hodProgramme:', hodProgramme, '| hodDept:', hodDepartment, '| validDeptKeys:', [...validDeptKeys], '| allAssignments:', allAssignments.length, '| deptFiltered:', deptFiltered.length);

      let filtered = deptFiltered.filter(a => a.ay === currentAy);
      if (filtered.length === 0 && deptFiltered.length > 0) {
        filtered = deptFiltered;
      }

      const seen = new Set();
      const unique = [];
      filtered.forEach(a => {
        const key = `${a.batch}_${a.subjectCode}_${a.sem}_${a.section}`;
        if (!seen.has(key)) { seen.add(key); unique.push(a); }
      });

      const attDocPromises = unique.map(async (a) => {
        const sectionSuffix = a.section ? `_${sanitizeKey(a.section)}` : "";
        const attDocId = `${a.progKey}_${a.attDeptKey}_${sanitizeKey(a.batch)}_${sanitizeKey(a.ay)}_${a.sem}_${a.subjectCode}${sectionSuffix}`;
        let attRecords = {};
        try {
          const attSnap = await getDoc(doc(db, "attendance", attDocId));
          if (attSnap.exists()) {
            attRecords = attSnap.data()?.records || {};
          }
        } catch { /* skip */ }
        return { ...a, attRecords, facultyUid: a.uid, attDocId };
      });

      const syllabusPromise = (async () => {
        try {
          return await fetchAllCourseNamesMap();
        } catch (e) {
          console.warn('[AttendanceOverview] course names fetch error:', e);
          return {};
        }
      })();

      const [results, nameMap] = await Promise.all([Promise.all(attDocPromises), syllabusPromise]);

      if (cancelled) return;

      const grouped = {};
      results.forEach(r => {
        if (!grouped[r.batch]) grouped[r.batch] = [];
        grouped[r.batch].push(r);
      });

      setSubjectNamesMap(nameMap);
      setAttendanceOverview(grouped);
      setAttendanceOverviewLoading(false);
    }, () => { if (!cancelled) { setAttendanceOverview({}); setAttendanceOverviewLoading(false); } });
    return () => { cancelled = true; unsub(); };
  }, [hodDepartment, hodProgramme, currentUid, deptMetadata, deptMetadataLoaded]);

  // ─── Fetch timetable allocation for each batch ───
  useEffect(() => {
    if (Object.keys(attendanceOverview).length === 0) { setTimetableAllocation({}); return; }
    const fetchTimetables = async () => {
      const newMap = {};
      for (const [batch, items] of Object.entries(attendanceOverview)) {
        const first = items[0];
        if (!first) continue;
        const ttKey = `${first.progKey}_${first.attDeptKey}_${sanitizeKey(first.batch)}_${sanitizeKey(first.ay)}_${first.sem}`;
        console.log('[Timetable] Looking up key:', ttKey, '| batch:', batch, '| progKey:', first.progKey, '| deptKey:', first.attDeptKey);
        try {
          const snap = await getDoc(doc(db, 'timetable_allocations', ttKey));
          if (snap.exists()) {
            const data = snap.data();
            console.log('[Timetable] Found for', batch, '| subjectAllocation:', data.subjectAllocation);
            newMap[batch] = data.subjectAllocation || {};
          } else {
            console.log('[Timetable] No doc found for key:', ttKey);
          }
        } catch (e) { console.warn('[Timetable] fetch error for', ttKey, e); }
      }
      console.log('[Timetable] Final timetableAllocation:', newMap);
      setTimetableAllocation(newMap);
    };
    fetchTimetables();
  }, [attendanceOverview]);

  const resolvedAttendanceOverview = useMemo(() => {
    const resolved = {};
    Object.entries(attendanceOverview).forEach(([batch, items]) => {
      resolved[batch] = items.map(item => ({
        ...item,
        facultyName: item.facultyUid
          ? (usersMap[item.facultyUid]?.facultyName || usersMap[item.facultyUid]?.displayName || usersMap[item.facultyUid]?.email || item.facultyUid)
          : item.facultyUid,
        subjectName: getCourseName(subjectNamesMap, item.subjectCode, hodDepartment, hodProgramme) || ""
      }));
    });
    return resolved;
  }, [attendanceOverview, usersMap, subjectNamesMap, hodDepartment, hodProgramme]);

  const activeSemesters = useMemo(() => {
    const selected = new Date(attendanceDate + 'T00:00:00');
    return semesterConfigs.filter(cfg => {
      if (!cfg.startDate || !cfg.endDate) return false;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const end = new Date(cfg.endDate + 'T00:00:00');
      return selected >= start && selected <= end;
    });
  }, [semesterConfigs, attendanceDate]);

  const availablePeriods = useMemo(() => Array.from({ length: 8 }, (_, i) => String(i + 1)), []);

  const [detailModal, setDetailModal] = useState({ open: false, title: '', students: [] });

  const batchStrength = useMemo(() => {
    // Only include batches that have an ACTIVE semester_config (today within startDate→endDate)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeBatches = new Set();
    semesterConfigs.forEach(cfg => {
      if (!cfg.startDate || !cfg.endDate) return;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const end = new Date(cfg.endDate + 'T00:00:00');
      if (today < start || today > end) return; // skip expired/future configs
      const batches = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
      batches.forEach(b => activeBatches.add(b));
    });
    if (activeBatches.size === 0) return [];

    const counts = {};
    // Approved (not yet section-assigned)
    approvedStudentsList.forEach(s => {
      if (!activeBatches.has(s.batch)) return;
      if (!counts[s.batch]) counts[s.batch] = { batch: s.batch, approved: 0, sectionAssigned: 0, total: 0 };
      counts[s.batch].approved++;
      counts[s.batch].total++;
    });
    // Already section-assigned
    sectionStudents.forEach(s => {
      if (!activeBatches.has(s.batch)) return;
      if (!counts[s.batch]) counts[s.batch] = { batch: s.batch, approved: 0, sectionAssigned: 0, total: 0 };
      counts[s.batch].sectionAssigned++;
      counts[s.batch].total++;
    });
    return Object.values(counts).sort((a, b) => a.batch.localeCompare(b.batch));
  }, [approvedStudentsList, sectionStudents, semesterConfigs]);

  const studentNamesMap = useMemo(() => {
    const map = {};
    Object.assign(map, allStudentNames);
    approvedStudentsList.forEach(s => { if (!map[s.reg]) map[s.reg] = s.name; });
    return map;
  }, [approvedStudentsList, allStudentNames]);

  const attendanceWithPeriods = useMemo(() => {
    const getH = (v) => (typeof v === 'object' && v !== null ? (v.hours ?? 0) : (v ?? 0));
    const result = {};
    const dayName = new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    Object.entries(resolvedAttendanceOverview).forEach(([batch, items]) => {
      const rows = [];
      const daySchedule = (timetableAllocation[batch] || {})[dayName];
      if (daySchedule) {
        const processedPeriods = new Set();
        Object.entries(daySchedule).forEach(([period, rawEntries]) => {
          processedPeriods.add(period);
          const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

          // Collect record information for each entry in this period
          const entryRecords = entries.map(entry => {
            const code = String(entry || '').split('|')[0].trim();
            if (!code) return null;
            const item = items.find(i => i.subjectCode.toLowerCase() === code.toLowerCase());
            const recordKey = `${attendanceDate}_P${period}`;

            let rec = item?.attRecords?.[recordKey];
            let actualItem = item;
            let substituteFaculty = '';
            let substituteSubjectCode = '';

            if (rec) {
              if (rec.markedBy && item?.facultyUid && rec.markedBy !== item.facultyUid) {
                substituteFaculty = usersMap[rec.markedBy]?.facultyName || usersMap[rec.markedBy]?.displayName || rec.markedBy;
              }
            } else {
              // Scheduled subject has no record for this period.
              // Check if ANY OTHER subject in items has an attendance record for this period,
              // excluding subjects that are explicitly scheduled as their own entry in this period
              const scheduledCodesInPeriod = new Set(entries.map(e => String(e || '').split('|')[0].trim().toLowerCase()));
              const currentSubjectCodeLower = (item?.subjectCode || code).toLowerCase();
              const subMatch = items.find(i => {
                if (!i.attRecords?.[recordKey]) return false;
                const sCode = (i.subjectCode || '').toLowerCase();
                if (scheduledCodesInPeriod.has(sCode) && sCode !== currentSubjectCodeLower) return false;
                return true;
              });
              if (subMatch) {
                rec = subMatch.attRecords[recordKey];
                actualItem = subMatch;
                if (subMatch.subjectCode !== (item?.subjectCode || code)) {
                  substituteSubjectCode = subMatch.subjectCode;
                }
                const markerUid = rec.markedBy || subMatch.facultyUid;
                if (markerUid && item?.facultyUid && markerUid !== item.facultyUid) {
                  substituteFaculty = usersMap[markerUid]?.facultyName || usersMap[markerUid]?.displayName || subMatch.facultyName || markerUid;
                } else if (subMatch.facultyName && item?.facultyName && subMatch.facultyName !== item.facultyName) {
                  substituteFaculty = subMatch.facultyName;
                } else if (markerUid) {
                  substituteFaculty = usersMap[markerUid]?.facultyName || usersMap[markerUid]?.displayName || markerUid;
                }
              }
            }

            const stuMap = rec?.students || {};
            const entries2 = Object.entries(stuMap);
            const present = entries2.filter(([, h]) => getH(h) > 0);
            const absent = entries2.filter(([, h]) => getH(h) === 0);
            const od = entries2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));

            return {
              entry, code, item, rec, actualItem,
              substituteFaculty, substituteSubjectCode,
              present, absent, od
            };
          }).filter(Boolean);

          // Deduplicate present students among multiple scheduled subjects in the same period (e.g. historical merged data)
          const activeRecords = entryRecords.filter(er => er.rec && er.present.length > 0);
          if (activeRecords.length > 1) {
            for (let i = 0; i < activeRecords.length; i++) {
              for (let j = i + 1; j < activeRecords.length; j++) {
                const a = activeRecords[i];
                const b = activeRecords[j];

                const setA = new Set(a.present.map(([reg]) => reg));
                const setB = new Set(b.present.map(([reg]) => reg));
                const overlap = [...setA].filter(reg => setB.has(reg));

                if (overlap.length > 0) {
                  if (a.present.length < b.present.length) {
                    // 'a' has fewer marked students, meaning 'a''s students were merged into 'b'.
                    // Remove overlapping students from 'b'
                    const overlapSet = new Set(overlap);
                    b.present = b.present.filter(([reg]) => !overlapSet.has(reg));
                  } else if (b.present.length < a.present.length) {
                    // 'b' has fewer marked students, meaning 'b''s students were merged into 'a'.
                    // Remove overlapping students from 'a'
                    const overlapSet = new Set(overlap);
                    a.present = a.present.filter(([reg]) => !overlapSet.has(reg));
                  } else {
                    // Equal lengths (e.g. both 60 because both saved merged data):
                    // Split overlap between 'a' (first scheduled) and 'b' (second scheduled)
                    const half = Math.floor(overlap.length / 2);
                    const removeForA = new Set(overlap.slice(half));
                    const removeForB = new Set(overlap.slice(0, half));
                    a.present = a.present.filter(([reg]) => !removeForA.has(reg));
                    b.present = b.present.filter(([reg]) => !removeForB.has(reg));
                  }
                }
              }
            }
          }

          // Build row output
          entryRecords.forEach(er => {
            const {
              entry, code, item, rec, actualItem,
              substituteFaculty, substituteSubjectCode,
              present, absent, od
            } = er;

            const subjectCode = item?.subjectCode || code;
            const subjectName = item?.subjectName || actualItem?.subjectName || "";
            const facultyName = item?.facultyName || "—";
            const section = item?.section || actualItem?.section || "";

            if (rec) {
              rows.push({
                period, hasRecord: true,
                subjectCode, subjectName,
                section, facultyName,
                presentCount: present.length, absentCount: absent.length, odCount: od.length,
                presentStudents: present, absentStudents: absent, odStudents: od,
                substituteFaculty, substituteSubjectCode,
              });
            } else {
              rows.push({
                period, hasRecord: false,
                subjectCode, subjectName,
                section, facultyName,
                presentCount: 0, absentCount: 0, odCount: 0,
                presentStudents: [], absentStudents: [], odStudents: [],
                substituteFaculty: '', substituteSubjectCode: '',
              });
            }
          });
        });

        // Include any extra periods recorded on this date that were NOT in daySchedule
        items.forEach(item => {
          const recordKeys = Object.keys(item.attRecords || {});
          recordKeys.forEach(rk => {
            const m = rk.match(/^(\d{4}-\d{2}-\d{2})_P(\d+)$/);
            if (m && m[1] === attendanceDate) {
              const p = m[2];
              if (!processedPeriods.has(p)) {
                processedPeriods.add(p);
                const rec = item.attRecords[rk];
                const stuMap = rec?.students || {};
                const entries2 = Object.entries(stuMap);
                const present = entries2.filter(([, h]) => getH(h) > 0);
                const absent = entries2.filter(([, h]) => getH(h) === 0);
                const od = entries2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));
                let substituteFaculty = '';
                if (rec.markedBy && item.facultyUid && rec.markedBy !== item.facultyUid) {
                  substituteFaculty = usersMap[rec.markedBy]?.facultyName || usersMap[rec.markedBy]?.displayName || rec.markedBy;
                }
                rows.push({
                  period: p, hasRecord: true,
                  subjectCode: item.subjectCode, subjectName: item.subjectName,
                  section: item.section, facultyName: item.facultyName,
                  presentCount: present.length, absentCount: absent.length, odCount: od.length,
                  presentStudents: present, absentStudents: absent, odStudents: od,
                  substituteFaculty, substituteSubjectCode: '',
                });
              }
            }
          });
        });
      } else {
        items.forEach(item => {
          const recordKeys = Object.keys(item.attRecords || {});
          const matchedPeriods = recordKeys
            .map(rk => { const m = rk.match(/^(\d{4}-\d{2}-\d{2})_P(\d+)$/); return m && m[1] === attendanceDate ? m[2] : null; })
            .filter(Boolean);
          if (matchedPeriods.length > 0) {
            matchedPeriods.forEach(p => {
              const recordKey = `${attendanceDate}_P${p}`;
              const rec = item.attRecords[recordKey];
              const stuMap = rec?.students || {};
              const entries2 = Object.entries(stuMap);
              const present = entries2.filter(([, h]) => getH(h) > 0);
              const absent = entries2.filter(([, h]) => getH(h) === 0);
              const od = entries2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));
              let substituteFaculty = '';
              if (rec && rec.markedBy && item.facultyUid && rec.markedBy !== item.facultyUid) {
                substituteFaculty = usersMap[rec.markedBy]?.facultyName || usersMap[rec.markedBy]?.displayName || rec.markedBy;
              }
              rows.push({
                period: p, hasRecord: true,
                subjectCode: item.subjectCode, subjectName: item.subjectName,
                section: item.section, facultyName: item.facultyName,
                presentCount: present.length, absentCount: absent.length, odCount: od.length,
                presentStudents: present, absentStudents: absent, odStudents: od,
                substituteFaculty, substituteSubjectCode: '',
              });
            });
          } else {
            rows.push({
              period: '?', hasRecord: false,
              subjectCode: item.subjectCode, subjectName: item.subjectName,
              section: item.section, facultyName: item.facultyName,
              presentCount: 0, absentCount: 0, odCount: 0,
              presentStudents: [], absentStudents: [], odStudents: [],
              substituteFaculty: '', substituteSubjectCode: '',
            });
          }
        });
      }
      rows.sort((a, b) => {
        if (a.period === '?') return 1;
        if (b.period === '?') return -1;
        return Number(a.period) - Number(b.period);
      });
      result[batch] = { items: rows, section: items[0]?.section || '', sem: items[0]?.sem || '', hasTimetable: !!timetableAllocation[batch] };
    });
    if (activeSemesters.length > 0) {
      const filtered = {};
      Object.entries(result).forEach(([batchKey, data]) => {
        const hasActive = activeSemesters.some(as => {
          const configBatches = Array.isArray(as.batch) ? as.batch : (as.batch ? [as.batch] : []);
          return configBatches.some(b => {
            const bStr = String(b || '');
            return bStr.split('-')[0] === String(batchKey || '').split('-')[0] &&
              bStr.slice(-2) === String(batchKey || '').slice(-2);
          });
        });
        if (hasActive) filtered[batchKey] = data;
      });
      return filtered;
    }
    return result;
  }, [resolvedAttendanceOverview, attendanceDate, availablePeriods, timetableAllocation, activeSemesters, usersMap]);

  const taskCount = useMemo(() => tasks.length, [tasks]);

  const todayStr = useMemo(() => new Date().toDateString(), []);
  const reviewedToday = useMemo(() => tasks.filter(t => t.approved_at && new Date(t.approved_at).toDateString() === todayStr).length, [tasks, todayStr]);
  const weekAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; }, []);
  const reviewedThisWeek = useMemo(() => tasks.filter(t => t.approved_at && new Date(t.approved_at) >= weekAgo).length, [tasks, weekAgo]);

  const batchOptions = useMemo(() => {
    return [...new Set(tasks.map(t => t.batch).filter(Boolean))].sort();
  }, [tasks]);
  const semesterOptions = useMemo(() => {
    return [...new Set(tasks.map(t => t.semester).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        (t.subject || "").toLowerCase().includes(q) ||
        (t.subject_name || "").toLowerCase().includes(q) ||
        (resolveForwardedByName(t.forwarded_by) || "").toLowerCase().includes(q) ||
        (resolveExamDisplay(t) || "").toLowerCase().includes(q)
      );
    }
    if (filterBatch) result = result.filter(t => t.batch === filterBatch);
    if (filterSemester) result = result.filter(t => t.semester === filterSemester);
    return result;
  }, [tasks, searchQuery, filterBatch, filterSemester]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setSelectedQPHodSignature('');
        setFullQPForModal(null);
        return;
      }

      // Full data already in selectedQP (parent doc stores full payload)
      setFullQPForModal({ ...selectedQP });

      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const coDocId = `${sanitizeKey(selectedQP.department)}_${sanitizeKey(regulation)}_${sanitizeKey(selectedQP.subject)}_${sanitizeKey(selectedQP.academic_year)}`;
        const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
        if (coSnap.exists()) {
          const data = coSnap.data();
          const loadedCOs = Object.entries(data)
            .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
            .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
          setModalCourseOutcomes(loadedCOs);
        }
      }
      if (selectedQP.forwarded_by) {
        const snap = await getDoc(doc(db, 'users', selectedQP.forwarded_by));
        if (snap.exists()) setFacultySignatureForQP(snap.data().signatureUrl || '');
      }
      setSelectedQPHodSignature(selectedQP.hod_signature_url || '');
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();
    const qpSet = (qp.qp_set || "").toString().trim();
    let display = examName;
    if (!display) {
      if (qpaperName && ciaConfigs && ciaConfigs[qpaperName] && ciaConfigs[qpaperName].examName) {
        display = ciaConfigs[qpaperName].examName;
      } else {
        display = qpaperName;
      }
    }
    if (qpSet && qpSet !== "Set 1") {
      display = `${display} (${qpSet})`;
    }
    return display || '-';
  };

  const resolveForwardedByName = (uid) => {
    if (!uid) return "-";
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || uid;
  };

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs);
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs]);

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
          hod_comments: recorrectComments.trim(),
          hod_signature_url: null,
          updated_at: now
        }
      }, { merge: true });
      showToast("Question paper sent back for recorrection.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
    } catch (error) {
      console.error("Error recorrecting paper:", error);
      showToast("Failed to send paper back for recorrection.", "error");
    }
  };

  const handleApproveByHOD = async () => {
    if (!selectedQP) return;
    if (!currentHodSignature) {
      showToast("Please upload your digital signature in your profile before approving.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey);
      const now = new Date().toISOString();
      await setDoc(qpRef, {
        [selectedQP.id]: {
          status: 'approved_by_hod',
          hod_signature_url: currentHodSignature,
          approved_at: now,
          forwarded_to: null,
          hod_comments: null,
          updated_at: now
        }
      }, { merge: true });
      showToast("Question paper approved and forwarded to COE.", "success");
      setShowQPModal(false);
    } catch (error) {
      console.error("Error approving paper:", error);
      showToast("Failed to approve question paper.", "error");
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const statsCards = [
    { key: "sectionAllotment", label: "Section Allotment", value: approvedStudentsList.length, icon: Users, color: "amber", onClick: () => setSectionAllotmentPopup({ open: true }) },
    { key: "studentStrength", label: "Student Strength", value: Object.values(batchStrength).reduce((s, b) => s + b.total, 0) || approvedStudentsList.length, icon: GraduationCap, color: "blue", onClick: () => setBatchStrengthModal({ open: true }) },
    { key: "today", label: "Reviewed Today", value: reviewedToday, icon: TrendingUp, color: "emerald" },
    { key: "week", label: "This Week", value: reviewedThisWeek, icon: BarChart3, color: "violet" },
    { key: "total", label: "Total QP Tasks", value: tasks.length + reviewedThisWeek, icon: BookOpen, color: "indigo" },
  ];

  const dateStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, []);

  return (
    <Layout title="HOD Dashboard">
      {toast.show && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-3 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border ${toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
            }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-white/10">
                  <School size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                    {hodLoading ? (
                      <span className="inline-block w-48 h-7 rounded-lg bg-white/10 animate-pulse" />
                    ) : (
                      <>{greeting}, {hodName.split(" ")[0]}</>
                    )}
                  </h1>
                  <p className="text-blue-200 text-sm">{dateStr}</p>
                </div>
              </div>
              <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                {taskCount > 0
                  ? `You have <strong>${taskCount}</strong> question paper${taskCount > 1 ? "s" : ""} awaiting your review.`
                  : "All caught up! No question papers pending your review."}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate("/co_configuration")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <Zap size={16} />
                <span className="hidden sm:inline">CO Config</span>
              </button>
              <button onClick={() => navigate("/qp-generator")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <FileText size={16} />
                <span className="hidden sm:inline">QP Generator</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
          {statsCards.map((s) => {
            const c = colorMap[s.color];
            const Icon = s.icon;
            return (
              <div key={s.key}
                className={`relative bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${s.onClick ? 'cursor-pointer' : ''}`}
                onClick={s.onClick || undefined}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                    <Icon size={20} className={c.text} />
                  </div>
                  <ArrowUpRight size={16} className="text-zinc-300" />
                </div>
                <p className="text-2xl font-bold text-zinc-900 tracking-tight">{s.value}</p>
                <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{s.label}</p>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
              </div>
            );
          })}
        </div>

        {/* Search & Filter */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardList size={20} className="text-[#120c7a]" />
              Forwarded Question Papers
              {taskCount > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{taskCount}</span>
              )}
            </h2>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${showFilters ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                }`}>
              <Filter size={14} /> Filters
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10 transition-all">
                <Search size={18} className="text-zinc-400" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  placeholder="Search by subject, faculty, or exam..." />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                    <X size={14} className="text-zinc-400" />
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="px-4 pb-4 border-t border-zinc-100 pt-4">
                <div className="flex flex-wrap gap-3">
                  <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a]">
                    <option value="">All Batches</option>
                    {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a]">
                    <option value="">All Semesters</option>
                    {semesterOptions.map((s) => <option key={s} value={s}>Sem {s}</option>)}
                  </select>
                  {(filterBatch || filterSemester) && (
                    <button onClick={() => { setFilterBatch(""); setFilterSemester(""); }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-2">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Task Cards or Empty State */}
        {tasksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-zinc-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 rounded bg-zinc-200" />
                      <div className="h-3 w-32 rounded bg-zinc-100" />
                    </div>
                  </div>
                  <div className="h-8 w-20 rounded-xl bg-zinc-200" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={32} />
            </div>
            <h3 className="text-xl font-bold text-zinc-900">
              {searchQuery || filterBatch || filterSemester ? "No matching papers" : "All caught up!"}
            </h3>
            <p className="text-sm text-zinc-500 mt-1.5 max-w-sm mx-auto">
              {searchQuery || filterBatch || filterSemester
                ? "Try adjusting your search or filters."
                : "No question papers are currently forwarded to you for review. You'll see them here as they come in."}
            </p>
            {(searchQuery || filterBatch || filterSemester) && (
              <button onClick={() => { setSearchQuery(""); setFilterBatch(""); setFilterSemester(""); }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:border-[#120c7a] hover:text-[#120c7a] transition-all">
                <X size={16} /> Clear Filters
              </button>
            )}
            {!searchQuery && !filterBatch && !filterSemester && taskCount === 0 && (
              <button onClick={() => navigate("/qp-generator")}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f0a66] transition-all shadow-sm">
                <FileText size={16} /> Go to QP Generator
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((qp, idx) => {
              const name = resolveForwardedByName(qp.forwarded_by);
              const initial = (name || "?").charAt(0).toUpperCase();
              const examDisplay = resolveExamDisplay(qp);
              const sentTime = timeAgo(qp.forwarded_at || qp.saved_at);
              const colorIdx = Math.abs((qp.subject || "").length) % 6;
              const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
              const dotColor = dotColors[colorIdx];

              return (
                <div key={`${qp.compositeKey}-${qp.id}`}
                  className="group bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#120c7a]/10 text-[#120c7a] flex items-center justify-center text-sm font-bold shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-zinc-900 truncate">{name}</span>
                            <span className="text-[10px] text-zinc-400">•</span>
                            <span className="text-[11px] text-zinc-500">{sentTime}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-sm font-bold text-zinc-800 truncate">{qp.subject}</span>
                            {qp.subject_name && (
                              <>
                                <span className="text-[10px] text-zinc-400">•</span>
                                <span className="text-[11px] text-zinc-500 truncate">{qp.subject_name}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                              <BookOpen size={10} /> {examDisplay}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              <Calendar size={10} /> {qp.batch || "-"}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              Sem {qp.semester || "-"}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              {qp.academic_year || "-"}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                            <span className="text-[10px] text-amber-600 font-semibold">Pending review</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm hover:shadow-md active:scale-95">
                        <Eye size={15} /> Review
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400 font-medium">
          <ClipboardList size={14} />
          Papers forwarded to you by faculty appear here as tasks.
        </div>

        {/* ═══ Attendance Overview ═══ */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 px-5 md:px-7 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                <CalendarCheck2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">Attendance Status</h2>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">Current Academic Year</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-white/15 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 [color-scheme:dark]" />
              <span className="text-[11px] font-bold text-blue-200 bg-white/10 px-2.5 py-1.5 rounded-lg">
                {new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              {attendanceOverviewLoading && <RefreshCw size={16} className="text-white/60 animate-spin" />}
              <button onClick={() => navigate("/attendance")}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold rounded-xl transition-all backdrop-blur-sm border border-white/20">
                Go to Attendance
              </button>
            </div>
          </div>

          {attendanceOverviewLoading ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-zinc-400 font-medium">Checking attendance records...</p>
            </div>
          ) : Object.keys(attendanceWithPeriods).length === 0 ? (
            <div className="p-8 text-center">
              <CalendarCheck2 size={36} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No subject assignments found</p>
              <p className="text-xs text-zinc-300 mt-1">No subjects allocated for your department in the current academic year.</p>
            </div>
          ) : (
            <div>
              <div className="divide-y divide-zinc-100">
                {Object.entries(attendanceWithPeriods).sort().map(([batch, batchData]) => {
                  const { items: rows, section: sec, sem, hasTimetable } = batchData;
                  const totalSubjects = [...new Set(rows.map(r => r.subjectCode))].length;
                  const markedCount = rows.filter(r => r.hasRecord).length;
                  const totalCount = rows.length;
                  const pendingCount = totalCount - markedCount;
                  return (
                    <div key={batch} className="p-5 md:p-6">
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <h3 className="text-sm font-black text-zinc-800">{batch}</h3>
                        {sem && <span className="px-2 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-full border border-violet-100">Sem {sem}</span>}
                        {sec && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-bold rounded-full border border-sky-100">{sec}</span>}
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100">{totalSubjects} subjects</span>
                        {markedCount > 0 && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">{markedCount} entered</span>}
                        {pendingCount > 0 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full border border-amber-200">{pendingCount} pending</span>}
                        {!hasTimetable && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-200">No timetable</span>}
                      </div>
                      {rows.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">No attendance recorded for {attendanceDate}.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-zinc-100">
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 w-12">Period</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Subject Code</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Subject Name</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Faculty</th>
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">Present</th>
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">Absent</th>
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">OD</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {(() => {
                                const periodGroups = {};
                                rows.forEach((row, idx) => {
                                  if (!periodGroups[row.period]) periodGroups[row.period] = [];
                                  periodGroups[row.period].push({ ...row, _idx: idx });
                                });
                                return Object.entries(periodGroups).sort(([a], [b]) => {
                                  if (a === '?') return 1;
                                  if (b === '?') return -1;
                                  return Number(a) - Number(b);
                                }).map(([, group]) => (
                                  group.map((row, gIdx) => (
                                    <tr key={row._idx} className="hover:bg-zinc-50/50 transition-colors">
                                      {gIdx === 0 ? (
                                        <td className={`px-3 py-2.5 text-xs text-center font-black border-b border-zinc-100 ${row.period === '?' ? 'text-amber-500' : 'text-indigo-700'}`} rowSpan={group.length}>{row.period === '?' ? '—' : `P${row.period}`}</td>
                                      ) : null}
                                      <td className="px-3 py-2.5 text-xs font-semibold text-zinc-800">{row.subjectCode}</td>
                                      <td className="px-3 py-2.5 text-xs text-zinc-600 max-w-[200px] truncate" title={row.substituteSubjectCode ? `${row.subjectName} (entered under ${row.substituteSubjectCode})` : row.subjectName || ""}>
                                        {row.subjectName || "—"}
                                        {row.substituteSubjectCode && <span className="ml-1 text-[9px] text-amber-600 font-bold italic">(sub: {row.substituteSubjectCode})</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs text-zinc-600 max-w-[160px] truncate" title={row.substituteFaculty ? `${row.facultyName} (sub: ${row.substituteFaculty})` : row.facultyName}>
                                        <span>{row.facultyName}</span>
                                        {row.substituteFaculty && <span className="ml-1 text-[9px] text-amber-600 font-bold italic">(sub: {row.substituteFaculty})</span>}
                                      </td>
                                      {row.hasRecord ? (
                                        <>
                                          <td className="px-3 py-2.5 text-xs text-center">
                                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.subjectCode} — Present`, students: row.presentStudents.map(([r]) => r) })}
                                              className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">{row.presentCount}</button>
                                          </td>
                                          <td className="px-3 py-2.5 text-xs text-center">
                                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.subjectCode} — Absent`, students: row.absentStudents.map(([r]) => r) })}
                                              className="inline-block px-2 py-0.5 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200 hover:bg-rose-100 transition cursor-pointer">{row.absentCount}</button>
                                          </td>
                                          <td className="px-3 py-2.5 text-xs text-center">
                                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.subjectCode} — OD`, students: row.odStudents.map(([r]) => r) })}
                                              className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200 hover:bg-blue-100 transition cursor-pointer">{row.odCount}</button>
                                          </td>
                                        </>
                                      ) : (
                                        <td className="px-3 py-2.5 text-xs text-center" colSpan={3}>
                                          <span className="inline-block px-3 py-1 bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full border border-amber-200">Pending</span>
                                        </td>
                                      )}
                                    </tr>
                                  ))
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Attendance Detail Modal ═══ */}
      {detailModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setDetailModal({ open: false, title: '', students: [] })}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <h3 className="text-sm font-black text-zinc-800">{detailModal.title}</h3>
              <button onClick={() => setDetailModal({ open: false, title: '', students: [] })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition"><X size={16} className="text-zinc-400" /></button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {detailModal.students.length === 0 ? (
                <p className="text-xs text-zinc-400 italic text-center py-4">No students</p>
              ) : (
                <div className="space-y-1.5">
                  {detailModal.students.map((reg, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200">
                      <span className="text-[11px] font-bold text-zinc-700 min-w-[80px]">{studentNamesMap[reg] || reg}</span>
                      {studentNamesMap[reg] && <span className="text-[10px] text-zinc-400">({reg})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-100 text-right">
              <button onClick={() => setDetailModal({ open: false, title: '', students: [] })} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-700 rounded-xl transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* QP Review Modal */}
      {showQPModal && selectedQP && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-[#120c7a]/10 p-2.5 rounded-xl text-[#120c7a]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">{resolveExamDisplay(selectedQP)}</h3>
                  <p className="text-xs text-zinc-500">{selectedQP.subject} &middot; {selectedQP.subject_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleApproveByHOD}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <CheckCircle2 size={16} /> Forward to COE
                </button>
                <button onClick={() => setShowRecorrectModal(true)}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <Edit2 size={16} /> Recorrect
                </button>
                <button onClick={() => setShowQPModal(false)}
                  className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              <style>{`
                .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                .qp-print-wrapper .logo-img { max-width: 100%; height: 70px !important; }
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

      {/* Section Allotment Popup */}
      {sectionAllotmentPopup.open && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Section Allotment</h3>
                  <p className="text-xs text-zinc-500">
                    {hodDepartment ? `${hodDepartment} department` : ""} &middot; {approvedStudentsList.length} student{approvedStudentsList.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSectionAllotmentPopup({ open: false }); setSectionAssignments({}); }}
                className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {studentsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-zinc-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : approvedStudentsList.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                    <Users size={28} />
                  </div>
                  <h4 className="text-lg font-bold text-zinc-700">No students yet</h4>
                  <p className="text-sm text-zinc-400 mt-1">
                    Students approved by the principal will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">#</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Student Name</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Register No</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Batch</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Section</th>
                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {approvedStudentsList.map((s, i) => {
                        const parts = s.docId.split('_');
                        const progKey = parts[1] || "";
                        const batchKey = parts[0] || "";
                        const configDocId = `${progKey}_${bsKey(hodDepartment)}_${batchKey}`;
                        const cfg = sectionConfigs[configDocId];
                        const numSections = cfg?.numSections || 0;
                        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                        const sections = Array.from({ length: numSections }, (_, si) => `Sec-${letters[si]}`);
                        const selected = sectionAssignments[`${s.docId}-${s.reg}`] || "";

                        return (
                          <tr key={`${s.docId}-${s.reg}`} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-zinc-500">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-zinc-900">{s.name}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.reg}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.batch}</td>
                            <td className="px-4 py-3">
                              {numSections > 0 ? (
                                <select
                                  value={selected}
                                  onChange={(e) => setSectionAssignments(prev => ({ ...prev, [`${s.docId}-${s.reg}`]: e.target.value }))}
                                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                                >
                                  <option value="">-- Select --</option>
                                  {sections.map(sec => (
                                    <option key={sec} value={sec}>{sec}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-zinc-400 italic">No sections configured</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={async () => {
                                  const sec = sectionAssignments[`${s.docId}-${s.reg}`];
                                  if (!sec) { showToast("Please select a section", "error"); return; }
                                  setSavingSection(true);
                                  try {
                                    const currentSnap = await getDoc(doc(db, 'approved_admissions', s.docId));
                                    if (!currentSnap.exists()) { showToast("Student doc not found", "error"); setSavingSection(false); return; }
                                    const currentData = currentSnap.data();
                                    const { [s.reg]: studentVal, ...rest } = currentData;
                                    const newOrder = (currentData._order || []).filter(r => r !== s.reg);
                                    await setDoc(doc(db, 'approved_admissions', s.docId), { ...rest, _order: newOrder });

                                    const secDocId = `${s.docId}_${sanitizeKey(sec)}`;
                                    const secSnap = await getDoc(doc(db, 'students', secDocId));
                                    const secData = secSnap.exists() ? secSnap.data() : {};
                                    const secOrder = secData._order || [];
                                    if (!secData[s.reg]) secOrder.push(s.reg);
                                    const joiningAY = currentData._joiningAY || {};
                                    const secJoiningAY = secData._joiningAY || {};
                                    await setDoc(doc(db, 'students', secDocId), {
                                      ...secData,
                                      [s.reg]: studentVal,
                                      _order: secOrder,
                                      _joiningAY: { ...secJoiningAY, [s.reg]: joiningAY[s.reg] || "" }
                                    });

                                    // Write to student_index for dual-ID lookup
                                    const now = new Date().toISOString();
                                    await setDoc(doc(db, 'student_index', s.reg), {
                                      canonicalId: s.reg,
                                      admissionNo: s.reg,
                                      regNo: "",
                                      name: s.name,
                                      studentDocId: secDocId,
                                      batch: s.batch,
                                      _createdAt: now,
                                      _updatedAt: now
                                    });

                                    // Update section-level mapping for bulk lookup in MarkEntry
                                    const sectionIndexRef = doc(db, 'student_section_index', secDocId);
                                    const sectionIndexSnap = await getDoc(sectionIndexRef);
                                    const sectionIndexData = sectionIndexSnap.exists() ? sectionIndexSnap.data() : {};
                                    await setDoc(sectionIndexRef, {
                                      ...sectionIndexData,
                                      [s.reg]: { admissionNo: s.reg, regNo: "", name: s.name },
                                      _updatedAt: now
                                    });

                                    setSectionAssignments(prev => { const n = { ...prev }; delete n[`${s.docId}-${s.reg}`]; return n; });
                                    showToast(`${s.name} assigned to ${sec}`, "success");
                                  } catch (err) {
                                    console.error("Section assignment error:", err);
                                    showToast("Failed to assign section", "error");
                                  } finally {
                                    setSavingSection(false);
                                  }
                                }}
                                disabled={savingSection || !sectionAssignments[`${s.docId}-${s.reg}`]}
                                className="px-3 py-1.5 rounded-lg bg-[#120c7a] text-white text-[11px] font-bold hover:bg-[#0f0a66] transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="bg-zinc-50 px-6 py-3 border-t border-zinc-200 flex justify-between items-center">
              <span className="text-xs text-zinc-400">{approvedStudentsList.length} student{approvedStudentsList.length !== 1 ? "s" : ""} found</span>
              <button onClick={() => { setSectionAllotmentPopup({ open: false }); setSectionAssignments({}); }}
                className="px-4 py-2 rounded-xl bg-zinc-200 text-zinc-700 text-xs font-bold hover:bg-zinc-300 transition-all active:scale-95">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Strength Modal */}
      {batchStrengthModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setBatchStrengthModal({ open: false })}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <GraduationCap size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-800">Student Strength</h3>
                  <p className="text-[11px] text-zinc-500">{hodDepartment}</p>
                </div>
              </div>
              <button onClick={() => setBatchStrengthModal({ open: false })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition"><X size={16} className="text-zinc-400" /></button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {batchStrength.length === 0 ? (
                <p className="text-xs text-zinc-400 italic text-center py-8">No student data available</p>
              ) : (
                <div>
                  {/* Total summary */}
                  <div className="text-center mb-5">
                    <p className="text-4xl font-black text-indigo-700">{batchStrength.reduce((s, b) => s + b.total, 0)}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Total Students</p>
                    <div className="flex items-center justify-center gap-4 mt-2">
                      <span className="text-[11px] font-bold text-emerald-600">{batchStrength.reduce((s, b) => s + b.sectionAssigned, 0)} assigned</span>
                      <span className="text-[11px] font-bold text-amber-600">{batchStrength.reduce((s, b) => s + b.approved, 0)} unassigned</span>
                    </div>
                  </div>

                  {/* Chart */}
                  {(() => {
                    const maxVal = Math.max(...batchStrength.map(b => b.total), 1);
                    const MAX_BAR_H = 140;
                    const barColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
                    const borderColors = ['border-indigo-600', 'border-emerald-600', 'border-violet-600', 'border-amber-600', 'border-rose-600', 'border-cyan-600'];
                    return (
                      <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                        <div className="flex items-end justify-around gap-3" style={{ height: `${MAX_BAR_H + 52}px` }}>
                          {batchStrength.map((b, i) => {
                            const barH = Math.max((b.total / maxVal) * MAX_BAR_H, 6);
                            return (
                              <div key={b.batch} className="flex flex-col items-center flex-1 min-w-0">
                                <span className="text-lg font-black text-zinc-800 mb-1">{b.total}</span>
                                <div
                                  className={`w-full max-w-[56px] rounded-t-xl ${barColors[i % barColors.length]} border-b-4 ${borderColors[i % borderColors.length]} shadow-md`}
                                  style={{ height: `${barH}px` }}
                                />
                                <span className="text-[10px] font-bold text-zinc-600 text-center leading-tight mt-2">{b.batch}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-100 text-right">
              <button onClick={() => setBatchStrengthModal({ open: false })} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-700 rounded-xl transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Recorrect Modal */}
      {showRecorrectModal && (
        <div className="fixed inset-0 bg-black/60 z-[190] flex items-center justify-center p-4 backdrop-blur-sm">
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
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <textarea value={recorrectComments} onChange={(e) => setRecorrectComments(e.target.value)}
                className="w-full h-36 p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none text-sm"
                placeholder="Enter your suggestions/corrections for the faculty..." />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowRecorrectModal(false); setRecorrectComments(""); }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleRecorrect} disabled={!recorrectComments.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
                  Send for Recorrection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
