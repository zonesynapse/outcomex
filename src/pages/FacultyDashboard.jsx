import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, getDocs } from "firebase/firestore";
import {
  BookOpen, Clock, Eye, Loader2, AlertCircle, Edit2, CheckCircle2,
  FileText, School, GraduationCap, Calendar, CalendarCheck2,
  Search, X, Sparkles, Plus, RefreshCw, Users
} from "lucide-react";

import Layout from "../components/Layout";
import { auth, db } from "../firebase";

const progPrefixMap = [
  { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
  { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
  { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
  { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
  { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
  { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
  { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
];

const formatProgDisplay = (prog) => {
  if (prog === 'B_E') return 'B.E.';
  if (prog === 'B_Tech') return 'B.Tech.';
  if (prog === 'M_E') return 'M.E.';
  if (prog === 'M_Tech') return 'M.Tech.';
  return prog;
};

const cleanDept = (dept) => {
  if (!dept) return '';
  let result = dept;
  let foundPrefix = false;
  for (const { key, display } of progPrefixMap) {
    const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
    if (regex.test(result)) {
      result = result.replace(regex, display + ' ');
      foundPrefix = true;
      break;
    }
  }
  return { clean: result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim(), foundPrefix };
};

const formatAssignmentDisplay = (progKey, deptKey) => {
  const { clean } = cleanDept(deptKey);
  return `${formatProgDisplay(progKey)} ${clean}`.trim();
};

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  return new Date(1970, 0, 1, parseInt(parts[0], 10), parseInt(parts[1], 10), 0);
}

function formatTime(date) {
  if (!date) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function getPeriodTimes(startTime, periodsPerDay, periodDurations, breaks, lunchAfterPeriod, lunchDuration) {
  if (!startTime || !periodsPerDay) return [];
  const pd = periodDurations || {};
  const brks = Array.isArray(breaks) ? breaks : [];
  const lunchAfter = parseInt(lunchAfterPeriod, 10) || 0;
  const lunchDur = parseInt(lunchDuration, 10) || 0;
  const times = [];
  let current = parseTimeToDate(startTime);
  for (let i = 1; i <= periodsPerDay; i++) {
    const dur = parseInt(pd[i], 10) || 0;
    const startStr = formatTime(current);
    if (dur > 0) {
      const end = new Date(current.getTime() + dur * 60 * 1000);
      times.push({ start: startStr, end: formatTime(end), isBreak: false });
      current = end;
    } else {
      times.push({ start: startStr, end: startStr, isBreak: true });
    }
    brks.forEach(br => {
      const after = parseInt(br.after, 10) || 0;
      const bdur = parseInt(br.duration, 10) || 0;
      if (after === i && bdur > 0) {
        current = new Date(current.getTime() + bdur * 60 * 1000);
      }
    });
    if (lunchAfter === i && lunchDur > 0) {
      current = new Date(current.getTime() + lunchDur * 60 * 1000);
    }
  }
  return times;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const EVENT_STYLES = {
  Holiday: { bg: 'bg-red-100 text-red-700 border-red-300' },
  Exam: { bg: 'bg-amber-100 text-amber-700 border-amber-300' },
  Event: { bg: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  Academic: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
};
const getEventStyle = (type) => EVENT_STYLES[type]?.bg || 'bg-zinc-100 text-zinc-700 border-zinc-300';

const statusConfig = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", icon: Clock },
  forwarded: { label: "Pending HOD Review", bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
  approved_by_hod: { label: "Approved by HOD", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  recorrected: { label: "Recorrect", bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle },
};

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [facultyName, setFacultyName] = useState("");
  const [facultyDept, setFacultyDept] = useState("");

  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignedGroups, setAssignedGroups] = useState([]);

  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingQps, setPendingQps] = useState([]);
  const [statusTab, setStatusTab] = useState("all");
  const [semesterTab, setSemesterTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [timetableData, setTimetableData] = useState({});
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [academicEvents, setAcademicEvents] = useState({});
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [courseNames, setCourseNames] = useState({});

  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [facultyAttendanceLoading, setFacultyAttendanceLoading] = useState(false);
  const [facultyAttendanceData, setFacultyAttendanceData] = useState({});
  const [detailModal, setDetailModal] = useState({ open: false, title: '', students: [] });
  const [approvedStudentsList, setApprovedStudentsList] = useState([]);
  const [allStudentNames, setAllStudentNames] = useState({});
  const [codeOwners, setCodeOwners] = useState({});   // code → [uid, ...]
  const [facultyNames, setFacultyNames] = useState({}); // uid → display name

  const sanitizeKey = (key) => {
    if (!key) return '';
    return String(key).replace(/[.#$[\]]/g, '_');
  };

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const activeSemesters = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return semesterConfigs.filter(cfg => {
      if (!cfg.startDate || !cfg.endDate) return false;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const end = new Date(cfg.endDate + 'T00:00:00');
      return today >= start && today <= end;
    });
  }, [semesterConfigs]);

  const visibleGroups = useMemo(() => {
    if (activeSemesters.length === 0) {
      if (semesterConfigs.length > 0) {
        console.warn('[FacultyDashboard] No active semesters match today. Configure semester_config with dates covering today.');
        return [];
      }
      return assignedGroups;
    }
    return assignedGroups.filter(g =>
      activeSemesters.some(as => {
        const configBatches = Array.isArray(as.batch) ? as.batch : (as.batch ? [as.batch] : []);
        const isBatchMatch = configBatches.some(b =>
          String(b) === String(g.batch)
        );
        if (!isBatchMatch) return false;

        const semNumMatch = String(g.semester).match(/\d+/);
        const semNum = semNumMatch ? parseInt(semNumMatch[0], 10) : NaN;
        if (isNaN(semNum)) return true;

        const isGroupOdd = semNum % 2 !== 0;
        const isConfigOdd = String(as.semesterType || 'Odd').toLowerCase() === 'odd';
        return isGroupOdd === isConfigOdd;
      })
    );
  }, [assignedGroups, activeSemesters, semesterConfigs]);

  useEffect(() => {
    if (!visibleGroups.length) {
      setTimetableData({});
      return;
    }
    setLoadingTimetable(true);
    let cancelled = false;
    const fetchTimetables = async () => {
      const results = {};
      await Promise.all(visibleGroups.map(async (g) => {
        const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;
        const compositeKey = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`;
        try {
          const snap = await getDoc(doc(db, 'timetable_allocations', compositeKey));
          if (snap.exists()) {
            const data = snap.data();
            const filterByFacultySubjects = {};
            const subAlloc = data.subjectAllocation || {};
            const facultyCodes = (g.codes || []).map(c => c.trim().toLowerCase());
            Object.entries(subAlloc).forEach(([day, periods]) => {
              Object.entries(periods || {}).forEach(([period, entries]) => {
                const arr = Array.isArray(entries) ? entries : [entries];
                arr.forEach(entry => {
                  const parts = String(entry || '').split('|');
                  const code = parts[0].trim().toLowerCase();
                  const span = parseInt(parts[1], 10) || 1;
                  if (code && facultyCodes.includes(code)) {
                    for (let p = parseInt(period), end = p + span; p < end; p++) {
                      const pStr = String(p);
                      if (!filterByFacultySubjects[day]) filterByFacultySubjects[day] = {};
                      if (!filterByFacultySubjects[day][pStr]) filterByFacultySubjects[day][pStr] = [];
                      const entryToPush = p === parseInt(period) ? entry : `${parts[0]}|1`;
                      if (!filterByFacultySubjects[day][pStr].includes(entryToPush)) {
                        filterByFacultySubjects[day][pStr].push(entryToPush);
                      }
                    }
                  }
                });
              });
            });
            results[compositeKey] = {
              template: data,
              subjectAllocation: data.subjectAllocation || {},
              facultyEntries: filterByFacultySubjects,
              periodsPerDay: parseInt(data.periodsPerDay, 10) || 0,
              workingDays: parseInt(data.workingDays, 10) || 0
            };
          }
        } catch (err) {
          console.error(`Failed to fetch timetable for ${compositeKey}:`, err);
        }
      }));
      if (!cancelled) {
        setTimetableData(results);
        setLoadingTimetable(false);
      }
    };
    fetchTimetables();
    return () => { cancelled = true; };
  }, [visibleGroups]);

  useEffect(() => {
    const eventsRef = collection(db, 'academic_calendar_events');
    const unsub = onSnapshot(eventsRef, (snap) => {
      const dateMap = {};
      snap.forEach(doc => {
        const ev = { id: doc.id, ...doc.data() };
        const start = new Date(ev.fromDate);
        const end = new Date(ev.toDate);
        if (!ev.fromDate || !ev.toDate || isNaN(start.getTime()) || isNaN(end.getTime())) return;
        let cursor = new Date(start);
        while (cursor <= end) {
          const dStr = formatDateKey(cursor);
          if (!dateMap[dStr]) dateMap[dStr] = [];
          dateMap[dStr].push(ev);
          cursor.setDate(cursor.getDate() + 1);
        }
      });
      setAcademicEvents(dateMap);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snap = await getDocs(collection(db, 'courses'));
        const names = {};
        snap.forEach(d => {
          const data = d.data();
          if (data.code && data.name) {
            names[data.code] = data.name;
          } else if (data.name && d.id.includes('_')) {
            const code = d.id.split('_').pop();
            names[code] = data.name;
          } else {
            Object.values(data).forEach(deptCourses => {
              if (deptCourses && typeof deptCourses === 'object') {
                Object.values(deptCourses).forEach(regCourses => {
                  if (regCourses && typeof regCourses === 'object') {
                    Object.entries(regCourses).forEach(([courseCode, courseData]) => {
                      if (courseData && courseData.name) names[courseCode] = courseData.name;
                    });
                  }
                });
              }
            });
          }
        });
        setCourseNames(names);
      } catch (e) {
        console.error("Failed to fetch course names:", e);
      }
    };
    fetchCourses();
  }, []);

  useEffect(() => {
    if (!currentUid || visibleGroups.length === 0) {
      setFacultyAttendanceData({});
      return;
    }
    setFacultyAttendanceLoading(true);
    let cancelled = false;
    const fetchAttendance = async () => {
      const results = {};
      // Use batch-level prefixes so we fetch ALL attendance docs for the batch,
      // not just the faculty's own subject codes — needed for substitute detection
      const batchPrefixes = [];
      for (const g of visibleGroups) {
        const prefix = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_`;
        if (!batchPrefixes.some(p => p === prefix)) {
          batchPrefixes.push(prefix);
        }
      }
      try {
        const allSnap = await getDocs(collection(db, 'attendance'));
        allSnap.forEach(d => {
          if (batchPrefixes.some(p => d.id.startsWith(p))) {
            results[d.id] = d.data();
          }
        });
      } catch (e) { console.warn('[FacultyDashboard] Attendance fetch error:', e); }
      if (!cancelled) {
        setFacultyAttendanceData(results);
        setFacultyAttendanceLoading(false);
      }
    };
    fetchAttendance();
    return () => { cancelled = true; };
  }, [currentUid, visibleGroups]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      const configs = [];
      snap.forEach(doc => {
        configs.push({ id: doc.id, ...doc.data() });
      });
      setSemesterConfigs(configs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const map = {};
      snap.forEach(d => {
        const d2 = d.data();
        if (d2.reg && d2.name) map[d2.reg] = d2.name;
      });
      setAllStudentNames(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchApproved = async () => {
      try {
        const snap = await getDocs(collection(db, 'approved_admissions'));
        const list = [];
        snap.forEach(d => {
          const d2 = d.data();
          if (d2.reg && d2.name) list.push({ reg: d2.reg, name: d2.name });
        });
        setApprovedStudentsList(list);
      } catch (e) { console.warn('[FacultyDashboard] Failed to fetch approved admissions:', e); }
    };
    fetchApproved();
  }, []);

  const studentNamesMap = useMemo(() => {
    const map = { ...allStudentNames };
    approvedStudentsList.forEach(s => { if (!map[s.reg]) map[s.reg] = s.name; });
    return map;
  }, [approvedStudentsList, allStudentNames]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setFacultyName(d.facultyName || d.displayName || d.email || "Faculty");
            setFacultyDept(d.department || "");
          }
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setAssignedGroups([]);
      setAssignmentsLoading(false);
      return;
    }

    setAssignmentsLoading(true);
    const assignmentsRef = collection(db, "subject_assignments");
    const unsub = onSnapshot(
      assignmentsRef,
      (snapshot) => {
        const groups = {};

        const tempCodeOwners = {};

        snapshot.forEach((doc) => {
          const idParts = doc.id.split('_');
          if (idParts.length < 5) return;

          let sectionExtracted = '';
          let semKey = idParts.pop();
          if (!/^\d+$/.test(semKey) && idParts.length >= 5) {
            sectionExtracted = semKey;
            semKey = idParts.pop();
          }
          const ayKey = idParts.pop();
          const batchKey = idParts.pop();
          let progKeyExtracted = idParts[0];
          let deptStartIdx = 1;
          if (['B', 'M'].includes(idParts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(idParts[1])) {
            progKeyExtracted = `${idParts[0]}_${idParts[1]}`;
            deptStartIdx = 2;
          }
          let deptKey = idParts.slice(deptStartIdx).join('_');
          if (deptKey.startsWith('_')) deptKey = deptKey.slice(1);

          const facultyData = doc.data();
          // Build codeOwners from ALL UIDs, not just currentUid
          Object.entries(facultyData || {}).forEach(([uid, codes]) => {
            if (uid === '_meta' || uid.startsWith('_')) return;
            const arr = Array.isArray(codes) ? codes : [];
            arr.forEach(code => {
              if (!tempCodeOwners[code]) tempCodeOwners[code] = [];
              if (!tempCodeOwners[code].includes(uid)) tempCodeOwners[code].push(uid);
            });
          });

          const codes = facultyData?.[currentUid];
          if (!Array.isArray(codes) || codes.length === 0) return;

          const groupKey = `${progKeyExtracted}|||${deptKey}|||${batchKey}|||${ayKey}|||${semKey}`;
          if (!groups[groupKey]) {
            groups[groupKey] = {
              progKey: progKeyExtracted,
              department: deptKey,
              batch: batchKey,
              academicYear: ayKey,
              semester: semKey,
              codes: []
            };
          }

          codes.forEach((code) => {
            if (!groups[groupKey].codes.includes(code)) groups[groupKey].codes.push(code);
          });
        });

        setCodeOwners(tempCodeOwners);

        const grouped = Object.values(groups)
          .map((g) => ({
            ...g,
            codes: (g.codes || []).slice().sort((a, b) => String(a).localeCompare(String(b)))
          }))
          .sort((a, b) => {
            const ap = String(a.progKey || "");
            const bp = String(b.progKey || "");
            if (ap !== bp) return ap.localeCompare(bp);
            const ad = String(a.department || "");
            const bd = String(b.department || "");
            if (ad !== bd) return ad.localeCompare(bd);
            const aa = String(a.academicYear || "");
            const ba = String(b.academicYear || "");
            if (aa !== ba) return aa.localeCompare(ba);
            const as = parseInt(a.semester, 10) || 0;
            const bs = parseInt(b.semester, 10) || 0;
            return as - bs;
          });

        setAssignedGroups(grouped);
        setAssignmentsLoading(false);
      },
      () => {
        setAssignedGroups([]);
        setAssignmentsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid]);

  // Fetch faculty names for codeOwners UIDs
  useEffect(() => {
    const allUids = new Set(Object.values(codeOwners).flat());
    const currentKeys = new Set(Object.keys(facultyNames));
    const missingUids = [...allUids].filter(uid => !currentKeys.has(uid) && uid !== currentUid);
    if (missingUids.length === 0) return;
    const fetchNames = async () => {
      const map = { ...facultyNames };
      try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach(d => {
          if (missingUids.includes(d.id)) {
            const data = d.data();
            map[d.id] = data.facultyName || data.displayName || data.email || d.id;
          }
        });
      } catch (e) { console.warn('Failed to fetch faculty names:', e); }
      setFacultyNames(map);
    };
    fetchNames();
  }, [codeOwners, currentUid]);

  useEffect(() => {
    if (!currentUid) {
      setPendingQps([]);
      setPendingLoading(false);
      return;
    }

    setPendingLoading(true);
    const qpRef = collection(db, "generated_qps");
    const unsub = onSnapshot(
      qpRef,
      (snapshot) => {
        const data = {}; snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });

        const pending = all
          .filter((qp) => {
            const status = String(qp?.status || "draft").toLowerCase();
            const isOwnedByMe = qp?.created_by === currentUid;

            const isMyDraft = status === "draft" && isOwnedByMe;
            const isMyDraftLegacy = status === "draft" && !qp?.created_by;

            const isAwaitingHODReview = status === "forwarded" && qp?.forwarded_by === currentUid;
            const isSentBackForRecorrection = status === "recorrected" && qp?.forwarded_to === currentUid;
            const isApprovedByHOD = status === "approved_by_hod" && isOwnedByMe;

            return isMyDraft || isMyDraftLegacy || isAwaitingHODReview || isSentBackForRecorrection || isApprovedByHOD;
          })
          .sort((a, b) => {
            const at = new Date(a.updated_at || a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.updated_at || b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });

        setPendingQps(pending);
        setPendingLoading(false);
      },
      () => {
        setPendingQps([]);
        setPendingLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid]);

  const assignedCount = useMemo(() => {
    return (visibleGroups || []).reduce((sum, g) => sum + (g.codes?.length || 0), 0);
  }, [visibleGroups]);

  const isInCurrentActiveSemester = useCallback((qp) => {
    const norm = (v) => String(v || "").trim().toLowerCase();
    return activeSemesters.some(as => {
      const configBatches = Array.isArray(as.batch) ? as.batch : (as.batch ? [as.batch] : []);
      const batchMatch = configBatches.some(b => norm(b) === norm(qp.batch));
      if (!batchMatch) return false;

      const semNumMatch = String(qp.semester || "").match(/\d+/);
      const semNum = semNumMatch ? parseInt(semNumMatch[0], 10) : NaN;
      if (isNaN(semNum)) return true;

      const isQpOdd = semNum % 2 !== 0;
      const isConfigOdd = String(as.semesterType || 'Odd').toLowerCase() === 'odd';
      return isQpOdd === isConfigOdd;
    });
  }, [activeSemesters]);

  const currentSemesterQps = useMemo(() => {
    return pendingQps.filter(q => isInCurrentActiveSemester(q));
  }, [pendingQps, isInCurrentActiveSemester]);

  const baseQps = useMemo(() => {
    return semesterTab === "current" ? currentSemesterQps : pendingQps;
  }, [pendingQps, currentSemesterQps, semesterTab]);

  const draftCount = useMemo(() => baseQps.filter(q => q.status === 'draft').length, [baseQps]);
  const forwardedCount = useMemo(() => baseQps.filter(q => q.status === 'forwarded').length, [baseQps]);
  const approvedCount = useMemo(() => baseQps.filter(q => q.status === 'approved_by_hod').length, [baseQps]);
  const recorrectCount = useMemo(() => baseQps.filter(q => q.status === 'recorrected').length, [baseQps]);

  const filteredQps = useMemo(() => {
    let result = baseQps;
    if (statusTab !== 'all') result = result.filter(q => q.status === statusTab);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(t =>
        (t.subject || "").toLowerCase().includes(q) ||
        (t.subject_name || "").toLowerCase().includes(q) ||
        (t.exam_name || t.qpaper_name || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [baseQps, statusTab, searchTerm]);

  const totalDraftCount = useMemo(() => pendingQps.filter(q => q.status === 'draft').length, [pendingQps]);
  const totalForwardedCount = useMemo(() => pendingQps.filter(q => q.status === 'forwarded').length, [pendingQps]);
  const totalApprovedCount = useMemo(() => pendingQps.filter(q => q.status === 'approved_by_hod').length, [pendingQps]);
  const totalRecorrectCount = useMemo(() => pendingQps.filter(q => q.status === 'recorrected').length, [pendingQps]);

  const statsCards = [
    { label: "Assigned Subjects", value: assignedCount, icon: BookOpen, color: "indigo" },
    { label: "Drafts", value: totalDraftCount, icon: FileText, color: "slate" },
    { label: "Pending Review", value: totalForwardedCount, icon: Clock, color: "blue" },
    { label: "Approved", value: totalApprovedCount, icon: CheckCircle2, color: "emerald" },
    { label: "Recorrection", value: totalRecorrectCount, icon: AlertCircle, color: "amber" },
  ];

  const colorMap = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", gradient: "from-indigo-500" },
    slate: { bg: "bg-slate-50", text: "text-slate-600", iconBg: "bg-slate-100", gradient: "from-slate-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", gradient: "from-blue-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", gradient: "from-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", gradient: "from-amber-500" },
  };

  const timetableGroups = useMemo(() => {
    const groups = {};
    visibleGroups.forEach(g => {
      const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;
      const compositeKey = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`;
      const tt = timetableData[compositeKey];
      if (!tt || !tt.periodsPerDay) {
        if (tt) console.warn(`TT for ${compositeKey}: missing periodsPerDay`);
        return;
      }
      const tpl = tt.template || tt;
      const lunchAfter = parseInt(tpl.lunchAfterPeriod, 10) || 0;
      const lunchDur = parseInt(tpl.lunchDuration, 10) || 0;
      const brks = Array.isArray(tpl.breaks) ? tpl.breaks : [];
      const templateKey = [
        tt.periodsPerDay, tt.workingDays, tpl.startTime || '',
        JSON.stringify(tpl.periodDurations || {}),
        lunchAfter, lunchDur, JSON.stringify(brks)
      ].join('|');
      const periodTimes = getPeriodTimes(tpl.startTime, tt.periodsPerDay, tpl.periodDurations, brks, lunchAfter, lunchDur);
      if (!groups[templateKey]) {
        const columns = [];
        for (let i = 1; i <= parseInt(tt.periodsPerDay, 10); i++) {
          columns.push({ type: 'period', num: i });
          const brk = brks.find(b => parseInt(b.after, 10) === i);
          if (brk && parseInt(brk.duration, 10) > 0) {
            columns.push({ type: 'break', duration: parseInt(brk.duration, 10) });
          }
          if (lunchAfter === i && lunchDur > 0) {
            columns.push({ type: 'lunch', duration: lunchDur });
          }
        }
        groups[templateKey] = {
          periodsPerDay: tt.periodsPerDay, workingDays: tt.workingDays,
          periodTimes, columns,
          entries: []
        };
      }
      groups[templateKey].entries.push({ group: g, compositeKey, tt });
      const feCount = Object.values(tt.facultyEntries || {}).reduce((s, d) => s + Object.keys(d).length, 0);
      if (feCount === 0) console.warn(`TT for ${compositeKey}: codes=${g.codes}, SUBJ_ALLOC=${JSON.stringify(Object.keys(tt.subjectAllocation || {}))}`);
    });
    return Object.values(groups);
  }, [timetableData, visibleGroups]);

  const tabs = [
    { key: "all", label: "All Papers", count: baseQps.length },
    { key: "draft", label: "Drafts", count: draftCount },
    { key: "forwarded", label: "Pending Review", count: forwardedCount },
    { key: "approved_by_hod", label: "Approved", count: approvedCount },
    { key: "recorrected", label: "Recorrection", count: recorrectCount },
  ];

  const facultyAttendanceRows = useMemo(() => {
    const getH = (v) => (typeof v === 'object' && v !== null ? (v.hours ?? 0) : (v ?? 0));
    const rows = [];
    const dateObj = new Date(attendanceDate + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    visibleGroups.forEach(g => {
      const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;
      const compositeKey = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`;
      const tt = timetableData[compositeKey];
      const daySchedule = tt?.facultyEntries?.[dayName] || {};
      Object.entries(daySchedule).forEach(([period, entries]) => {
        entries.forEach(entry => {
          const parts = String(entry).split('|');
          const code = parts[0] || '';
          const baseAttDocId = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_${code}`;
          const attData = facultyAttendanceData[baseAttDocId] || Object.entries(facultyAttendanceData).find(([k]) => k.startsWith(baseAttDocId + '_'))?.[1];
          const recordKey = `${attendanceDate}_P${period}`;
          let rec = attData?.records?.[recordKey];
          let subFound = false;
          let subSubjectCode = '';
          let subFacultyName = '';
          if (!rec) {
            for (const [dId, aData] of Object.entries(facultyAttendanceData)) {
              const r = aData?.records?.[recordKey];
              if (r) {
                rec = r;
                subFound = true;
                if (dId.startsWith(baseAttDocId + '_') || dId === baseAttDocId) {
                  subFound = false;
                } else {
                  const subPrefix = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_`;
                  if (dId.startsWith(subPrefix)) {
                    let rest = dId.slice(subPrefix.length);
                    const secIdx = rest.indexOf('_Sec-');
                    if (secIdx !== -1) rest = rest.slice(0, secIdx);
                    subSubjectCode = rest;
                  }
                }
                break;
              }
            }
          }
          if (rec && rec.markedBy && rec.markedBy !== currentUid) {
            subFound = true;
            if (!subSubjectCode) subSubjectCode = code;
            subFacultyName = facultyNames[rec.markedBy] || rec.markedBy;
          }
          if (subSubjectCode && subSubjectCode !== code && !subFacultyName) {
            const uids = codeOwners[subSubjectCode] || [];
            const otherUids = uids.filter(uid => uid !== currentUid);
            if (otherUids.length > 0) {
              subFacultyName = facultyNames[otherUids[0]] || otherUids[0];
            }
          }
          const batchLabel = `${formatAssignmentDisplay(g.progKey, g.department)} ${g.batch} Sem ${g.semester}`;
          if (rec) {
            const stuMap = rec.students || {};
            const e2 = Object.entries(stuMap);
            rows.push({
              period, hasRecord: true, code, batchLabel, subFound,
              presentCount: e2.filter(([, h]) => getH(h) > 0).length,
              absentCount: e2.filter(([, h]) => getH(h) === 0).length,
              odCount: e2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1)).length,
              presentStudents: e2.filter(([, h]) => getH(h) > 0).map(([r]) => r),
              absentStudents: e2.filter(([, h]) => getH(h) === 0).map(([r]) => r),
              odStudents: e2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1)).map(([r]) => r),
              subjectName: courseNames[code] || '',
              subSubjectCode, subFacultyName,
            });
          } else {
            rows.push({
              period, hasRecord: false, code, batchLabel, subFound,
              presentCount: 0, absentCount: 0, odCount: 0,
              presentStudents: [], absentStudents: [], odStudents: [],
              subjectName: courseNames[code] || '',
              subSubjectCode, subFacultyName,
            });
          }
        });
      });
    });
    rows.sort((a, b) => Number(a.period) - Number(b.period));
    return rows;
  }, [visibleGroups, timetableData, facultyAttendanceData, attendanceDate, courseNames, codeOwners, facultyNames, currentUid]);

  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const currentWeekDates = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  return (
    <Layout title="Faculty Dashboard">
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
                    Welcome, {facultyName.split(" ")[0] || "Faculty"}
                  </h1>
                  <p className="text-blue-200 text-sm">{facultyDept || "Faculty Dashboard"}</p>
                </div>
              </div>
              <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                {assignedCount > 0 ? (
                  <>You have <strong>{assignedCount}</strong> subject{assignedCount > 1 ? "s" : ""} assigned across {visibleGroups.length} batch{visibleGroups.length > 1 ? "es" : ""}.</>
                ) : (
                  "No subjects assigned yet. Contact your HOD for assignments."
                )}
              </p>
            </div>
            <button
              onClick={() => navigate("/question-paper-generator")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10 shrink-0"
            >
              <Plus size={16} />
              New Question Paper
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {statsCards.map((s) => {
            const c = colorMap[s.color];
            const Icon = s.icon;
            return (
              <div key={s.label}
                className={`relative bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                    <Icon size={20} className={c.text} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-zinc-900 tracking-tight">{s.value}</p>
                <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{s.label}</p>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
              </div>
            );
          })}
        </div>

        {/* Assigned Subjects + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Assigned Subjects */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <BookOpen size={20} className="text-[#120c7a]" />
                Assigned Subjects
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{assignedCount}</span>
              </h2>
            </div>
            {assignmentsLoading ? (
              <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-semibold">Loading assignments...</span>
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                  <BookOpen size={28} />
                </div>
                <p className="text-lg font-bold text-zinc-700">No subjects assigned yet</p>
                <p className="text-sm text-zinc-400 mt-1">Contact your HOD to get subject assignments.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {visibleGroups.map((g) => (
                  <div key={`${g.progKey}-${g.department}-${g.batch}-${g.academicYear}-${g.semester}`}
                    className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-zinc-800">{formatAssignmentDisplay(g.progKey, g.department)}</span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                            <GraduationCap size={10} /> {g.batch}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            Sem {g.semester}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            {g.academicYear}
                          </span>
                          {(g.codes || []).map((code) => (
                            <span key={code}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-100">
                              <span>{code}</span>
                              {courseNames[code] && <span className="text-indigo-400 font-medium">— {courseNames[code]}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/question-paper-generator?batch=${g.batch}&dept=${g.department}&prog=${g.progKey}&ay=${g.academicYear}&sem=${g.semester}`)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#120c7a]/5 text-[#120c7a] text-xs font-bold hover:bg-[#120c7a]/10 transition-all"
                      >
                        <FileText size={14} />
                        Create QP
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <CheckCircle2 size={20} className="text-[#120c7a]" />
                Tasks
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{recorrectCount}</span>
              </h2>
            </div>
            {pendingLoading ? (
              <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-semibold">Loading tasks...</span>
              </div>
            ) : recorrectCount === 0 ? (
              <div className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={28} />
                </div>
                <p className="text-lg font-bold text-zinc-700">No pending tasks</p>
                <p className="text-sm text-zinc-400 mt-1">All caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {pendingQps.filter(q => q.status === 'recorrected').map((qp) => (
                  <div key={`task-${qp.compositeKey}-${qp.id}`}
                    className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-bold text-zinc-800">{qp.subject}</span>
                          {qp.subject_name && (
                            <>
                              <span className="text-[10px] text-zinc-300">•</span>
                              <span className="text-xs text-zinc-500 truncate">{qp.subject_name}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-bold border border-red-200">
                            <AlertCircle size={10} /> Recorrection
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                            <FileText size={10} /> {qp.exam_name || qp.qpaper_name}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            {qp.batch || "-"}
                          </span>
                        </div>
                        {qp.hod_comments && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">{qp.hod_comments}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}`)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm active:scale-95"
                      >
                        <Edit2 size={14} />
                        Fix & Re-forward
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Attendance Status ═══ */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 px-5 md:px-7 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                <CalendarCheck2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">Attendance Status</h2>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">My Classes Today</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-white/15 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 [color-scheme:dark]" />
              <span className="text-[11px] font-bold text-blue-200 bg-white/10 px-2.5 py-1.5 rounded-lg">
                {new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              <button onClick={() => navigate("/attendance")}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold rounded-xl transition-all backdrop-blur-sm border border-white/20">
                Go to Attendance
              </button>
            </div>
          </div>

          {facultyAttendanceLoading ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-zinc-400 font-medium">Checking attendance records...</p>
            </div>
          ) : facultyAttendanceRows.length === 0 ? (
            <div className="p-8 text-center">
              <CalendarCheck2 size={36} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No classes scheduled for today</p>
              <p className="text-xs text-zinc-300 mt-1">Your timetable or attendance records for this date will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 w-16">Period</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Subject</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Batch</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">Present</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">Absent</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">OD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {facultyAttendanceRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-center font-black text-indigo-700">P{row.period}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-zinc-800">{row.code}</span>
                          {row.subjectName && <span className="text-[10px] text-zinc-400 truncate max-w-[180px]">{row.subjectName}</span>}
                          {row.subFound && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-amber-600 font-bold">
                              <span className="inline-block px-1.5 py-0.5 bg-amber-50 rounded border border-amber-200">Sub</span>
                              {row.subFacultyName && <span>by {row.subFacultyName}</span>}
                              {row.subSubjectCode && row.subSubjectCode !== row.code && <span>({row.subSubjectCode})</span>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600">{row.batchLabel}</td>
                      {row.hasRecord ? (
                        <>
                          <td className="px-4 py-3 text-xs text-center">
                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.code} — Present`, students: row.presentStudents })}
                              className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">{row.presentCount}</button>
                          </td>
                          <td className="px-4 py-3 text-xs text-center">
                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.code} — Absent`, students: row.absentStudents })}
                              className="inline-block px-2.5 py-1 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200 hover:bg-rose-100 transition cursor-pointer">{row.absentCount}</button>
                          </td>
                          <td className="px-4 py-3 text-xs text-center">
                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.code} — OD`, students: row.odStudents })}
                              className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200 hover:bg-blue-100 transition cursor-pointer">{row.odCount}</button>
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-xs text-center" colSpan={3}>
                          {row.subFound ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 text-[11px] font-bold rounded-full border border-indigo-200">Sub</span>
                              <span className="text-[10px] text-indigo-500 font-semibold">{row.subSubjectCode}</span>
                              {row.subFacultyName && <span className="text-[10px] text-indigo-400">by {row.subFacultyName}</span>}
                            </div>
                          ) : (
                            <span className="inline-block px-3 py-1 bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full border border-amber-200">Not entered</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══ Detail Modal ═══ */}
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

        {/* My Timetable */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-8 overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Calendar size={20} className="text-[#120c7a]" />
              My Timetable
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{timetableGroups.length}</span>
            </h2>
          </div>
          {loadingTimetable ? (
            <div className="flex items-center justify-center py-12 text-zinc-400 gap-3">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm font-semibold">Loading timetable...</span>
            </div>
          ) : timetableGroups.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar size={32} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-base font-bold text-zinc-500">No timetable allocated yet</p>
              <p className="text-sm text-zinc-400 mt-1">Your timetable will appear here once allocated.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {timetableGroups.map((tg, tgIdx) => (
                <div key={`ttg-${tgIdx}`} className="px-6 py-5">
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    {tg.entries.map((e, ei) => (
                      <span key={ei} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#120c7a] to-[#1a12a8] text-white px-3.5 py-1.5 text-[10px] font-bold shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {formatAssignmentDisplay(e.group.progKey, e.group.department)} {e.group.batch} <span className="text-indigo-300">•</span> Sem {e.group.semester}
                      </span>
                    ))}
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-zinc-200 shadow-lg">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-gradient-to-r from-[#0f0a66] via-[#120c7a] to-[#1a12a8]">
                          <th className="px-4 py-3.5 text-left text-[10px] font-black text-white uppercase tracking-widest border-b border-white/15 w-28 shadow-inner">Day</th>
                          {tg.columns.map((col, ci) => {
                            if (col.type === 'break') {
                              return <th key={ci} className="px-2 py-3.5 text-center text-[9px] font-bold uppercase border-b border-white/15 border-r border-r-white/10 bg-slate-400/20 whitespace-nowrap tracking-wider text-slate-500">⏸ Break {col.duration}m</th>;
                            }
                            if (col.type === 'lunch') {
                              return <th key={ci} className="px-2 py-3.5 text-center text-[9px] font-bold uppercase border-b border-white/15 border-r border-r-white/10 bg-amber-400/15 whitespace-nowrap tracking-wider text-amber-500">🍽 Lunch {col.duration}m</th>;
                            }
                            const pt = tg.periodTimes[col.num - 1];
                            return (
                              <th key={ci} className="px-2 py-3.5 text-center text-[10px] font-black text-white uppercase border-b border-white/15 border-r border-r-white/10 whitespace-nowrap tracking-widest">
                                {pt ? `${pt.start} - ${pt.end}` : `P${col.num}`}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.slice(0, tg.workingDays).map((day, idx) => {
                          const dayDate = currentWeekDates[idx];
                          const dateKey = formatDateKey(dayDate);
                          const events = academicEvents[dateKey] || [];
                          const isToday = dateKey === todayKey;
                          const hasEvent = events.length > 0;
                          const rowClass = hasEvent
                            ? 'bg-gradient-to-r from-red-50 via-rose-50 to-red-50'
                            : isToday
                              ? 'bg-gradient-to-r from-blue-50 via-indigo-50/40 to-blue-50'
                              : idx % 2 === 0
                                ? 'bg-white hover:bg-blue-50/40'
                                : 'bg-zinc-50/50 hover:bg-blue-50/40';
                          const dayCellClass = hasEvent
                            ? 'border-b border-red-200 border-r border-r-red-200'
                            : isToday
                              ? 'border-b border-blue-200 border-r border-r-blue-200'
                              : 'border-b border-zinc-200 border-r border-r-zinc-150';
                          return (
                            <tr key={day} className={`transition-all duration-150 ${rowClass}`}>
                              <td className={`px-3 py-3.5 font-bold ${dayCellClass}`}>
                                <div className="flex flex-col items-start gap-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-black ${hasEvent ? 'text-red-700' : isToday ? 'text-[#120c7a]' : 'text-zinc-800'}`}>{day.slice(0, 3)}</span>
                                    {dayDate && <span className={`text-[10px] font-bold ${hasEvent ? 'text-red-500' : 'text-zinc-400'}`}>{dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                                    {isToday && <span className="text-[9px] font-black text-white bg-gradient-to-r from-[#120c7a] to-[#1a12a8] px-2.5 py-0.5 rounded-md shadow-sm">Today</span>}
                                  </div>
                                  {events.map(ev => (
                                    <span key={ev.id} className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-lg px-2 py-0.5 border shadow-sm ${getEventStyle(ev.type)}`}>
                                      {ev.type === 'Holiday' ? '🎉' : ev.type === 'Exam' ? '📝' : '📌'}{ev.title}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              {(() => {
                                const cells = [];
                                let ci = 0;
                                while (ci < tg.columns.length) {
                                  const col = tg.columns[ci];
                                  if (col.type === 'break') {
                                    cells.push(
                                      <td key={ci} className="px-2 py-4 text-center border-b border-zinc-100 border-r border-r-zinc-100 bg-slate-100/60">
                                        <div className="flex flex-col items-center gap-1">
                                          <span className="text-[10px] font-semibold text-slate-500 tracking-wide">Break</span>
                                        </div>
                                      </td>
                                    );
                                    ci++;
                                    continue;
                                  }
                                  if (col.type === 'lunch') {
                                    cells.push(
                                      <td key={ci} className="px-2 py-4 text-center border-b border-zinc-100 border-r border-r-zinc-100 bg-amber-50/60">
                                        <div className="flex flex-col items-center gap-1">
                                          <span className="text-[10px] font-semibold text-amber-600 tracking-wide">Lunch</span>
                                        </div>
                                      </td>
                                    );
                                    ci++;
                                    continue;
                                  }
                                  const pNum = String(col.num);
                                  let maxSpan = 1;
                                  const cellEntries = [];
                                  tg.entries.forEach(e => {
                                    const facultyEntries = e.tt.facultyEntries?.[day]?.[pNum] || [];
                                    const batchLabel = `${formatAssignmentDisplay(e.group.progKey, e.group.department)} ${e.group.batch}`;
                                    facultyEntries.forEach(entry => {
                                      const parts = String(entry).split('|');
                                      const code = parts[0] || '';
                                      const span = parseInt(parts[1], 10) || 1;
                                      if (span > maxSpan) maxSpan = span;
                                      cellEntries.push({ code, batchLabel, span });
                                    });
                                  });
                                  let actualSpan = 1;
                                  if (maxSpan > 1) {
                                    for (let s = 1; s < maxSpan; s++) {
                                      const nextIdx = ci + s;
                                      if (nextIdx < tg.columns.length && tg.columns[nextIdx].type === 'period') {
                                        actualSpan = s + 1;
                                      } else break;
                                    }
                                  }
                                  cells.push(
                                    <td key={ci} colSpan={actualSpan} className={`px-2 py-2.5 text-center border-b border-zinc-200 border-r border-r-zinc-100 ${cellEntries.length > 0 ? 'bg-gradient-to-b from-[#120c7a]/[0.04] via-indigo-50/40 to-white' : ''}`}>
                                      {cellEntries.length > 0 ? (
                                        <div className="flex flex-col gap-1.5 items-center">
                                          {cellEntries.map((ce, ci2) => (
                                            <span key={ci2} className="inline-flex flex-col items-center text-[11px] font-bold text-[#120c7a] bg-white px-3 py-1.5 rounded-xl border-2 border-[#120c7a]/15 shadow-md hover:shadow-lg hover:border-[#120c7a]/30 transition-all duration-150 min-w-[70px]">
                                              <span className="font-black">{ce.code}{ce.span > 1 ? <span className="text-[9px] text-indigo-400 ml-0.5 font-bold">({ce.span}p)</span> : ''}</span>
                                              {ce.batchLabel && <span className="text-[7px] text-zinc-400 font-bold mt-0.5 leading-tight text-center">{ce.batchLabel}</span>}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-zinc-300 select-none text-sm">—</span>
                                      )}
                                    </td>
                                  );
                                  ci += actualSpan;
                                }
                                return cells;
                              })()}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Question Papers */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <FileText size={20} className="text-[#120c7a]" />
                My Question Papers
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">{baseQps.length}</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-48 pl-8 pr-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-semibold outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all placeholder:text-zinc-400"
                    placeholder="Search papers..." />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                      <X size={12} className="text-zinc-400" />
                    </button>
                  )}
                </div>
                <button onClick={() => navigate("/question-paper-generator")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm">
                  <Plus size={14} /> New Paper
                </button>
              </div>
            </div>

            {/* Semester filter */}
            <div className="flex gap-1.5 mt-4 mb-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider self-center mr-1">Semester:</span>
              {[
                { key: "all", label: "All Semesters" },
                { key: "current", label: "Current Semester", badge: currentSemesterQps.length },
              ].map(sf => (
                <button key={sf.key} onClick={() => setSemesterTab(sf.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${semesterTab === sf.key
                      ? "bg-indigo-100 text-indigo-700 shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    }`}>
                  {sf.label}
                  {sf.badge > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${semesterTab === sf.key ? "bg-indigo-200 text-indigo-700" : "bg-zinc-200 text-zinc-600"}`}>
                      {sf.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-1 overflow-x-auto">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setStatusTab(tab.key)}
                  className={`relative px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${statusTab === tab.key
                      ? "bg-[#120c7a] text-white shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    }`}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${statusTab === tab.key ? "bg-white/20 text-white" : "bg-zinc-200 text-zinc-600"
                      }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {pendingLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm font-semibold">Loading question papers...</span>
            </div>
          ) : baseQps.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={28} />
              </div>
              <p className="text-lg font-bold text-zinc-700">No question papers yet</p>
              <p className="text-sm text-zinc-400 mt-1 max-w-sm mx-auto">
                Create your first question paper using the QP Generator.
              </p>
              <button onClick={() => navigate("/question-paper-generator")}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f0a66] transition-all shadow-sm">
                <Plus size={16} /> Create Question Paper
              </button>
            </div>
          ) : filteredQps.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-lg font-bold text-zinc-500">No matching papers</p>
              <p className="text-sm text-zinc-400 mt-1">Try a different search or filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredQps.map((qp) => {
                const stat = statusConfig[qp.status] || statusConfig.draft;
                const StatusIcon = stat.icon;
                return (
                  <div key={`${qp.compositeKey}-${qp.id}`}
                    className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-bold text-zinc-800">{qp.subject}</span>
                          {qp.subject_name && (
                            <>
                              <span className="text-[10px] text-zinc-300">•</span>
                              <span className="text-xs text-zinc-500 truncate">{qp.subject_name}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 rounded-lg ${stat.bg} ${stat.text} px-2 py-0.5 text-[10px] font-bold border border-transparent`}>
                            <StatusIcon size={10} /> {stat.label}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                            <FileText size={10} /> {qp.exam_name || qp.qpaper_name}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            <GraduationCap size={10} /> {qp.batch || "-"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            Sem {qp.semester || "-"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                            {qp.academic_year || "-"}
                          </span>
                        </div>
                        {qp.status === 'recorrected' && qp.hod_comments && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">{qp.hod_comments}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}`)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm active:scale-95"
                      >
                        {qp.status === 'recorrected' ? <Edit2 size={14} /> : <Eye size={14} />}
                        {qp.status === 'recorrected' ? 'Edit' : 'Open'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
