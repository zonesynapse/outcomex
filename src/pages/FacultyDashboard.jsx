import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, getDocs, query, where, deleteDoc, updateDoc, deleteField } from "firebase/firestore";
import {
  BookOpen, Clock, Eye, Loader2, AlertCircle, Edit2, CheckCircle2,
  FileText, School, GraduationCap, Calendar, CalendarCheck2,
  Search, X, Sparkles, Plus, RefreshCw, Users, PenLine, Trash2, Layers,
  Lock, Unlock
} from "lucide-react";

import Layout from "../components/Layout";
import { auth, db } from "../firebase";
import { fetchAllCourseNamesMap, getCourseName } from "../utils/courseUtils";
import { getAttendanceRecords, parseSubjectField, isWrittenTestQp, formatQPSetDisplay, formatProgrammeKey, sanitizeKey } from "../lib/utils";
import { getQuestionPaperHTML } from "../utils/questionPaperUtils";
import { typesetMath } from "../utils/mathJaxUtils";
import { useRegulations } from "../hooks/useRegulations";

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

const getQPWorkflowStatus = (qp) => {
  if (!qp) return { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", icon: Clock };
  const st = qp.status;

  if (st === 'draft') {
    return { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", icon: Clock };
  }
  if (st === 'recorrected') {
    return { label: "Returned for Recorrection", bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle };
  }
  if (st === 'approved_by_hod' || st === 'approved_by_coe' || st === 'approved') {
    return { label: "Approved by HOD", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 };
  }
  if (st === 'forwarded') {
    if (qp.ac_approved) {
      return { label: "Pending HOD Review", bg: "bg-purple-100", text: "text-purple-700", icon: Clock };
    }
    return { label: "Pending Academic Coordinator Review", bg: "bg-blue-100", text: "text-blue-700", icon: Clock };
  }
  return { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", icon: Clock };
};

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const { getRegulationForBatch } = useRegulations();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [facultyName, setFacultyName] = useState("");
  const [facultyDept, setFacultyDept] = useState("");

  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignedGroups, setAssignedGroups] = useState([]);

  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingQps, setPendingQps] = useState([]);
  const [allMasterQps, setAllMasterQps] = useState([]);
  const [statusTab, setStatusTab] = useState("all");
  const [semesterTab, setSemesterTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const isExamTimeReached = useCallback((examDateStr, startTimeStr, sessionStr) => {
    if (!examDateStr) return false;

    const now = new Date();

    const parseIsoOrFormattedDate = (str) => {
      if (!str) return null;
      const s = String(str).trim();

      // 1. Try ISO date pattern YYYY-MM-DD
      const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        return {
          yr: parseInt(isoMatch[1], 10),
          mo: parseInt(isoMatch[2], 10),
          dy: parseInt(isoMatch[3], 10),
        };
      }

      // 2. Try DD-MM-YYYY or DD/MM/YYYY
      const dmyMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmyMatch) {
        return {
          yr: parseInt(dmyMatch[3], 10),
          mo: parseInt(dmyMatch[2], 10),
          dy: parseInt(dmyMatch[1], 10),
        };
      }

      // 3. Try named month e.g. "01 Sep 2026" or "Sep 01 2026"
      const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const sLower = s.toLowerCase();
      let month = 0;
      Object.keys(monthMap).forEach(m => { if (sLower.includes(m)) month = monthMap[m]; });

      const nums = s.match(/\d+/g);
      if (nums && nums.length >= 2) {
        const yr = parseInt(nums.find(n => n.length === 4) || '2026', 10);
        const rest = nums.filter(n => n !== String(yr));
        const dy = parseInt(rest[0] || '1', 10);
        const mo = month || parseInt(rest[1] || '1', 10);
        return { yr, mo, dy };
      }

      return null;
    };

    const parsed = parseIsoOrFormattedDate(examDateStr);
    if (!parsed || isNaN(parsed.yr) || isNaN(parsed.mo) || isNaN(parsed.dy)) return false;

    const { yr, mo, dy } = parsed;

    let hours = 9;
    let minutes = 30;

    if (startTimeStr) {
      const timeMatch = String(startTimeStr).match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        const m = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : '';
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        hours = h;
        minutes = m;
      }
    } else if (sessionStr === 'AN') {
      hours = 13;
      minutes = 30;
    }

    const examStartDateTime = new Date(yr, mo - 1, dy, hours, minutes, 0, 0);
    return now.getTime() >= examStartDateTime.getTime();
  }, []);

  const [timetableData, setTimetableData] = useState({});
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [academicEvents, setAcademicEvents] = useState({});
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [courseNames, setCourseNames] = useState({});
  const [courseBankNameMap, setCourseBankNameMap] = useState({});

  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [facultyAttendanceLoading, setFacultyAttendanceLoading] = useState(false);
  const [facultyAttendanceData, setFacultyAttendanceData] = useState({});
  const [facultyCourseEnrolments, setFacultyCourseEnrolments] = useState({});
  const [detailModal, setDetailModal] = useState({ open: false, title: '', students: [] });
  const [approvedStudentsList, setApprovedStudentsList] = useState([]);
  const [allStudentNames, setAllStudentNames] = useState({});
  const [codeOwners, setCodeOwners] = useState({});   // code → [uid, ...]
  const [facultyNames, setFacultyNames] = useState({}); // uid → display name
  const [draftActivities, setDraftActivities] = useState([]);

  const [showQPModal, setShowQPModal] = useState(false);
  const [selectedQP, setSelectedQP] = useState(null);
  const [fullQPForModal, setFullQPForModal] = useState(null);
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [facultySignatureForQP, setFacultySignatureForQP] = useState("");

  // Fetch draft activities for current user
  useEffect(() => {
    if (!currentUid) return;
    const entriesRef = collection(db, "activity_entries");
    const unsub = onSnapshot(entriesRef, (snap) => {
      const drafts = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.submittedById === currentUid && data.status === "Draft") {
          drafts.push({
            id: d.id,
            ...data
          });
        }
      });
      drafts.sort((a, b) => {
        const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : new Date(a.date || a.createdAt || 0).getTime();
        const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : new Date(b.date || b.createdAt || 0).getTime();
        return tB - tA;
      });
      setDraftActivities(drafts);
    }, (err) => {
      console.warn("[FacultyDashboard] Error fetching activity drafts:", err);
    });
    return () => unsub();
  }, [currentUid]);

  const [qpSetterTasks, setQpSetterTasks] = useState([]);

  // Fetch QP Setter assignments for current user
  useEffect(() => {
    if (!currentUid) {
      setQpSetterTasks([]);
      return;
    }
    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      const myTasks = [];
      const normFacultyName = (facultyName || '').trim().toLowerCase();

      snap.forEach(d => {
        const data = d.data();
        const assignments = data.assignments || {};
        Object.values(assignments).forEach(as => {
          if (!as || typeof as !== 'object') return;
          const setterUid = String(as.setterUid || '').trim();
          const setterName = String(as.setterName || '').trim().toLowerCase();

          const isMyUid = setterUid && setterUid === currentUid;
          const isMyName = normFacultyName && setterName && setterName === normFacultyName;
          const hasExamDate = as.examDate && String(as.examDate).trim().length > 0;

          if ((isMyUid || isMyName) && hasExamDate) {
            myTasks.push({
              docId: d.id,
              batch: data.batch || '',
              academicYear: data.academicYear || '',
              semester: data.semester || '',
              examId: data.examId || '',
              examName: data.examName || '',
              ...as
            });
          }
        });
      });

      // Sort by toDate (deadline) ascending, then examDate
      myTasks.sort((a, b) => {
        const tA = a.toDate || a.examDate || '9999-99-99';
        const tB = b.toDate || b.examDate || '9999-99-99';
        return tA.localeCompare(tB);
      });

      setQpSetterTasks(myTasks);
    }, (err) => {
      console.warn("[FacultyDashboard] Error fetching qp_setter_assignments:", err);
    });
    return () => unsub();
  }, [currentUid, facultyName]);

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
      }
      return assignedGroups;
    }
    const normClean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return assignedGroups.filter(g =>
      activeSemesters.some(as => {
        // Programme check (flexible: UG, BE, B_E, B.E., B.Tech, etc.)
        if (as.programme) {
          const cfgProg = normClean(as.programme);
          const groupProg = normClean(g.progKey);
          const progMatch = cfgProg === groupProg || cfgProg.includes(groupProg) || groupProg.includes(cfgProg) ||
            (cfgProg === 'ug' && (groupProg.includes('be') || groupProg.includes('btech'))) ||
            (groupProg === 'ug' && (cfgProg.includes('be') || cfgProg.includes('btech')));
          if (!progMatch) return false;
        }

        // Academic Year check (flexible: 2025-2026 vs 2025-26)
        if (as.academicYear) {
          const cfgAy = normClean(as.academicYear);
          const groupAy = normClean(g.academicYear);
          const ayMatch = cfgAy === groupAy || cfgAy.includes(groupAy) || groupAy.includes(cfgAy);
          if (!ayMatch) return false;
        }

        // Batch check (flexible: 2024-2028 vs 2024-28 vs 24 Batch)
        const configBatches = Array.isArray(as.batch) ? as.batch : (as.batch ? [as.batch] : []);
        if (configBatches.length > 0) {
          const groupBatch = normClean(g.batch);
          const batchMatch = configBatches.some(b => {
            const cb = normClean(b);
            return cb === groupBatch || cb.includes(groupBatch) || groupBatch.includes(cb);
          });
          if (!batchMatch) return false;
        }

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
        const legacyCompositeKey = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${semNum}`;
        try {
          let snap = await getDoc(doc(db, 'timetable_allocations', compositeKey));
          if (!snap.exists() && legacyCompositeKey !== compositeKey) {
            snap = await getDoc(doc(db, 'timetable_allocations', legacyCompositeKey));
          }
          if (!snap.exists() && g.sections && g.sections.length > 0) {
            for (const sec of g.sections) {
              const secKey = `${compositeKey}_${sanitizeKey(sec)}`;
              const secSnap = await getDoc(doc(db, 'timetable_allocations', secKey));
              if (secSnap.exists()) {
                snap = secSnap;
                break;
              }
              const legacySecKey = `${legacyCompositeKey}_${sanitizeKey(sec)}`;
              if (legacySecKey !== secKey) {
                const legacySecSnap = await getDoc(doc(db, 'timetable_allocations', legacySecKey));
                if (legacySecSnap.exists()) {
                  snap = legacySecSnap;
                  break;
                }
              }
            }
          }
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
        const namesMap = await fetchAllCourseNamesMap();
        setCourseNames(namesMap);
      } catch (e) {
        console.error("Failed to fetch course names:", e);
      }
    };
    fetchCourses();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snap) => {
      const nameMap = {};
      const codeToCanonical = {};
      snap.forEach(d => {
        const data = d.data() || {};
        const rawCode = String(data.code || data.subjectCode || data.courseCode || "").trim();
        const name = String(data.name || data.courseName || data.subjectName || "").trim();
        const normCode = String(rawCode).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (rawCode && normCode) {
          codeToCanonical[normCode] = rawCode;
        }
        if (name && rawCode) {
          const normName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          nameMap[normName] = rawCode;
          if (data.department) {
            const cleanD = sanitizeKey(data.department);
            nameMap[`${cleanD}_${normName}`] = rawCode;
          }
        }
      });
      setCourseBankNameMap({ nameMap, codeToCanonical });
    }, (err) => {
      console.warn("[FacultyDashboard] Error listening to courses (CourseBank):", err);
    });
    return () => unsub();
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
      const enrolResults = {};
      // Use batch-level prefixes so we fetch ALL attendance docs for the batch,
      // not just the faculty's own subject codes — needed for substitute detection
      const batchPrefixes = [];
      for (const g of visibleGroups) {
        const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;
        const prefix1 = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_`;
        const prefix2 = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_`;
        if (!batchPrefixes.includes(prefix1)) batchPrefixes.push(prefix1);
        if (!batchPrefixes.includes(prefix2)) batchPrefixes.push(prefix2);
        // Legacy prefixes: Attendance.jsx local sanitizeKey doesn't replace spaces/slashes
        const lp1 = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${semNum}_`;
        const lp2 = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${g.semester}_`;
        if (lp1 !== prefix1 && !batchPrefixes.includes(lp1)) batchPrefixes.push(lp1);
        if (lp2 !== prefix2 && !batchPrefixes.includes(lp2)) batchPrefixes.push(lp2);
      }
      try {
        const [allSnap, enrolSnap] = await Promise.all([
          getDocs(collection(db, 'attendance')),
          getDocs(collection(db, 'course_enrolments'))
        ]);
        allSnap.forEach(d => {
          if (batchPrefixes.some(p => d.id.startsWith(p))) {
            results[d.id] = d.data();
          }
        });
        enrolSnap.forEach(d => {
          if (batchPrefixes.some(p => d.id.startsWith(p))) {
            enrolResults[d.id] = d.data();
          }
        });
      } catch (e) { console.warn('[FacultyDashboard] Fetch error:', e); }
      if (!cancelled) {
        setFacultyAttendanceData(results);
        setFacultyCourseEnrolments(enrolResults);
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

  // Appraisal Scorecard States
  const [userAppraisal, setUserAppraisal] = useState(null);
  const [showAppraisalScorecardModal, setShowAppraisalScorecardModal] = useState(false);

  useEffect(() => {
    if (!currentUid) return;
    const q = query(
      collection(db, "faculty_appraisals"),
      where("facultyUid", "==", currentUid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      let found = null;
      snapshot.forEach((d) => {
        const data = d.data();
        // Prefer appraisals with HOD validation
        if (data.hodValidation && (data.status === "HOD_Approved" || data.status === "Approved")) {
          found = { id: d.id, ...data };
        }
      });
      setUserAppraisal(found);
    }, (err) => console.error("Error loading user appraisal validation:", err));
    return unsub;
  }, [currentUid]);

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
              sections: [],
              codes: []
            };
          }

          if (sectionExtracted && !groups[groupKey].sections.includes(sectionExtracted)) {
            groups[groupKey].sections.push(sectionExtracted);
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

  // Fetch faculty names for UIDs
  useEffect(() => {
    const fetchNames = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const map = {};
        snap.forEach(d => {
          const data = d.data();
          map[d.id] = data.facultyName || data.displayName || data.email || d.id;
        });
        setFacultyNames(map);
      } catch (e) { console.warn('Failed to fetch faculty names:', e); }
    };
    fetchNames();
  }, []);

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
        Object.entries(data).forEach(([compositeKey, docData]) => {
          if (!docData || typeof docData !== 'object') return;

          // Check if docData itself is a single flat QP object
          const isFlatDoc = docData.subject || docData.subject_code || docData.parts || docData.assignment_config || docData.qpaper_name;

          if (isFlatDoc) {
            all.push({
              ...docData,
              id: docData.id || docData.qpId || 'Exam',
              compositeKey,
              _isFlatDoc: true
            });
          } else {
            // Otherwise, iterate through field keys where value is a nested QP object
            Object.entries(docData).forEach(([vId, qp]) => {
              if (qp && typeof qp === 'object' && !Array.isArray(qp)) {
                // Must be a valid QP object (has subject/parts/assignment_config/status/created_by/etc)
                if (qp.subject || qp.subject_code || qp.parts || qp.assignment_config || qp.status || qp.created_by) {
                  all.push({ ...qp, id: vId, compositeKey, _isFlatDoc: false });
                }
              }
            });
          }
        });

        const myAssignedCodes = new Set((visibleGroups || []).flatMap(g => (g.codes || []).map(c => String(c).trim().toLowerCase())));

        const pending = all
          .filter((qp) => {
            if (!qp || typeof qp !== 'object') return false;
            const status = String(qp.status || "draft").toLowerCase();
            const createdBy = qp.created_by;
            const forwardedBy = qp.forwarded_by;
            const forwardedTo = qp.forwarded_to;

            const isOwnedByMe = createdBy === currentUid;
            const parsedQpSubj = parseSubjectField(qp.subject);
            const qpSubject = String(parsedQpSubj.code || qp.subject_code || '').trim().toLowerCase();
            const isAssignedToMe = myAssignedCodes.size > 0 && qpSubject && myAssignedCodes.has(qpSubject);

            // Drafts: owned by me OR (no created_by AND subject is assigned to me)
            const isMyDraft = status === "draft" && (isOwnedByMe || (!createdBy && isAssignedToMe));

            // Awaiting HOD Review: status forwarded AND (forwarded by me OR created by me)
            const isAwaitingHODReview = status === "forwarded" && (forwardedBy === currentUid || (isOwnedByMe && !forwardedBy));

            // Sent back for recorrection: status recorrected AND (forwarded to me OR created by me OR forwarded by me)
            const isSentBackForRecorrection = status === "recorrected" && (forwardedTo === currentUid || isOwnedByMe || forwardedBy === currentUid);

            // Approved by HOD: status approved_by_hod AND owned by me
            const isApprovedByHOD = status === "approved_by_hod" && isOwnedByMe;

            // Published by COE: status approved_by_coe AND (owned by me OR forwarded by me)
            const isPublishedByCOE = status === "approved_by_coe" && (isOwnedByMe || forwardedBy === currentUid);

            return isMyDraft || isAwaitingHODReview || isSentBackForRecorrection || isApprovedByHOD || isPublishedByCOE;
          })
          .sort((a, b) => {
            const at = new Date(a.updated_at || a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.updated_at || b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });

        setAllMasterQps(all);
        setPendingQps(pending);
        setPendingLoading(false);
      },
      () => {
        setAllMasterQps([]);
        setPendingQps([]);
        setPendingLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid, visibleGroups]);

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

  const canEditQp = (qp) => {
    if (!qp) return false;
    const s = String(qp.status || '').toLowerCase().trim();
    return s === 'draft' || s === 'recorrected' || s === 'revoked' || s === 'rejected';
  };

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
      result = result.filter(t => {
        const p = parseSubjectField(t.subject);
        const subjCode = p.code || t.subject || '';
        const subjName = p.name || t.subject_name || '';
        return subjCode.toLowerCase().includes(q) ||
          subjName.toLowerCase().includes(q) ||
          (t.exam_name || t.qpaper_name || "").toLowerCase().includes(q);
      });
    }
    return result;
  }, [baseQps, statusTab, searchTerm]);

  const totalDraftCount = useMemo(() => pendingQps.filter(q => q.status === 'draft').length, [pendingQps]);
  const totalForwardedCount = useMemo(() => pendingQps.filter(q => q.status === 'forwarded').length, [pendingQps]);
  const totalApprovedCount = useMemo(() => pendingQps.filter(q => q.status === 'approved_by_hod').length, [pendingQps]);

  const [deletingQp, setDeletingQp] = useState("");

  const handleDeleteQp = async (qp) => {
    const p = parseSubjectField(qp.subject);
    const label = `${p.code || qp.subject || ""}${qp.exam_name ? ` — ${qp.exam_name}` : ""}`;
    if (!window.confirm(`Delete question paper "${label}"?\nThis cannot be undone.`)) return;
    setDeletingQp(`${qp.compositeKey}-${qp.id}`);
    try {
      if (qp._isFlatDoc) {
        await deleteDoc(doc(db, "generated_qps", qp.compositeKey));
      } else {
        await updateDoc(doc(db, "generated_qps", qp.compositeKey), {
          [qp.id]: deleteField()
        });
      }
      alert("Question paper deleted successfully.");
    } catch (err) {
      console.error("Error deleting QP:", err);
      alert("Failed to delete question paper.");
    } finally {
      setDeletingQp("");
    }
  };
  const totalRecorrectCount = useMemo(() => pendingQps.filter(q => q.status === 'recorrected').length, [pendingQps]);

  // QP modal — fetch COs & signature when opening a paper for preview
  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setFullQPForModal(null);
        return;
      }
      setFullQPForModal({ ...selectedQP });
      const savedCos = selectedQP.course_outcomes || selectedQP.courseOutcomes;
      if (Array.isArray(savedCos) && savedCos.length > 0) {
        setModalCourseOutcomes(savedCos);
      }
      // Try to get/refresh CO descriptions — mirrors QPG's 3-level fallback:
      // 1. course_outcomes collection  2. alt doc ID keys  3. courses (CourseBank)
      const sanitizeKeyStrict = (k) => k ? String(k).replace(/[.#$[\]/ ]/g, '_') : '';
      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const parsedSubj = parseSubjectField(selectedQP.subject);
        const subjCode = parsedSubj.code || selectedQP.subject || '';
        const deptKey = sanitizeKey(selectedQP.department);
        const regKey = sanitizeKey(regulation);
        const subjKey = sanitizeKey(subjCode);
        const ayKey = sanitizeKey(selectedQP.academic_year);
        let fetchedCOs = [];

        // Level 1: primary course_outcomes doc
        try {
          const coDocId = `${deptKey}_${regKey}_${subjKey}_${ayKey}`;
          const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
          if (coSnap.exists()) {
            const data = coSnap.data();
            fetchedCOs = Object.entries(data)
              .filter(([k]) => k.toUpperCase().startsWith('CO'))
              .map(([code, val]) => ({ code: code.toUpperCase(), description: typeof val === 'object' && val !== null ? val.description : val }))
              .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
          }
        } catch (e) { /* ignore */ }

        const hasPlaceholder = fetchedCOs.length > 0 && fetchedCOs.every(co => {
          const d = (co.description || '').trim();
          return !d || d.toUpperCase() === co.code.toUpperCase();
        });

        // Level 2: try alternative course_outcomes doc ID keys
        if (fetchedCOs.length === 0 || hasPlaceholder) {
          const altKeys = [
            `${deptKey}_${regKey}_${subjKey}`,
            `${deptKey}_${subjKey}_${ayKey}`,
            `${regKey}_${subjKey}`,
            `${subjKey}`
          ];
          for (const key of altKeys) {
            try {
              const altSnap = await getDoc(doc(db, 'course_outcomes', key));
              if (altSnap.exists()) {
                const altData = altSnap.data();
                const altCOs = Object.entries(altData)
                  .filter(([k]) => k.toUpperCase().startsWith('CO'))
                  .map(([code, val]) => ({ code: code.toUpperCase(), description: typeof val === 'object' && val !== null ? val.description : val }))
                  .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
                if (altCOs.length > 0) { fetchedCOs = altCOs; break; }
              }
            } catch (_) { /* skip */ }
          }
        }

        const hasPlaceholder2 = fetchedCOs.length > 0 && fetchedCOs.every(co => {
          const d = (co.description || '').trim();
          return !d || d.toUpperCase() === co.code.toUpperCase();
        });

        // Level 3: courses collection (CourseBank) — has real CO descriptions
        if (fetchedCOs.length === 0 || hasPlaceholder2) {
          const fbDeptStrict = sanitizeKeyStrict(selectedQP.department);
          const fbSubjStrict = sanitizeKeyStrict(subjCode);
          const fbRegStrict = sanitizeKeyStrict(regulation);
          const courseKeyCandidates = [
            `${progKey}_${fbDeptStrict}_${fbRegStrict}_${fbSubjStrict}`,
            `${progKey}_${deptKey}_${regKey}_${subjKey}`,
            `${progKey}_${fbDeptStrict}_${regKey}_${fbSubjStrict}`,
            `${progKey}_${deptKey}_${fbRegStrict}_${fbSubjStrict}`,
            `${progKey}_Overall_${fbRegStrict}_${fbSubjStrict}`,
            `${progKey}_Overall_${regKey}_${subjKey}`,
          ];
          try {
            for (const key of courseKeyCandidates) {
              try {
                const cSnap = await getDoc(doc(db, 'courses', key));
                if (cSnap.exists()) {
                  const bd = cSnap.data();
                  if (bd.co && Array.isArray(bd.co)) {
                    fetchedCOs = bd.co.map(c => ({ code: c.id, description: c.description || '' }))
                      .sort((a, b) => (parseInt(String(a.code || '').replace(/\D/g, ''), 10) || 0) - (parseInt(String(b.code || '').replace(/\D/g, ''), 10) || 0));
                    break;
                  }
                }
              } catch (_) { /* skip invalid keys */ }
            }
          } catch (e) { /* ignore */ }
        }

        // Only overwrite saved COs if fetched COs have REAL descriptions (not just placeholders matching code names)
        if (fetchedCOs.length > 0) {
          const fetchedHasRealDescs = fetchedCOs.some(co => {
            const d = (co.description || '').trim();
            return d && d.toUpperCase() !== co.code.toUpperCase();
          });
          if (fetchedHasRealDescs) {
            setModalCourseOutcomes(fetchedCOs);
          }
        }
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

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    const acSig = qp?.ac_signature_url || '';
    const hodSig = qp?.hod_signature_url || '';
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, hodSig, null, null, '', acSig);
  }, [modalCourseOutcomes, facultySignatureForQP]);

  useEffect(() => {
    if (!showQPModal || !(fullQPForModal || selectedQP)) return;
    const container = document.querySelector('.qp-print-wrapper');
    typesetMath(container);
  }, [showQPModal, fullQPForModal, selectedQP]);

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

  const attendanceTasks = useMemo(() => {
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normClean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    visibleGroups.forEach(g => {
      // Find specific semester config for this group with flexible formatting match
      const as = semesterConfigs.find(cfg => {
        if (cfg.programme) {
          const cfgProg = normClean(cfg.programme);
          const groupProg = normClean(g.progKey);
          const progMatch = cfgProg === groupProg || cfgProg.includes(groupProg) || groupProg.includes(cfgProg) ||
            (cfgProg === 'ug' && (groupProg.includes('be') || groupProg.includes('btech'))) ||
            (groupProg === 'ug' && (cfgProg.includes('be') || cfgProg.includes('btech')));
          if (!progMatch) return false;
        }

        if (cfg.academicYear) {
          const cfgAy = normClean(cfg.academicYear);
          const groupAy = normClean(g.academicYear);
          const ayMatch = cfgAy === groupAy || cfgAy.includes(groupAy) || groupAy.includes(cfgAy);
          if (!ayMatch) return false;
        }

        const configBatches = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
        if (configBatches.length > 0) {
          const groupBatch = normClean(g.batch);
          const batchMatch = configBatches.some(b => {
            const cb = normClean(b);
            return cb === groupBatch || cb.includes(groupBatch) || groupBatch.includes(cb);
          });
          if (!batchMatch) return false;
        }

        const semNumMatch = String(g.semester).match(/\d+/);
        const semNum = semNumMatch ? parseInt(semNumMatch[0], 10) : NaN;
        if (isNaN(semNum)) return true;

        const isGroupOdd = semNum % 2 !== 0;
        const isConfigOdd = String(cfg.semesterType || 'Odd').toLowerCase() === 'odd';
        return isGroupOdd === isConfigOdd;
      });

      let semStart, semEnd;
      if (as && as.startDate && as.endDate) {
        semStart = new Date(as.startDate + 'T00:00:00');
        semEnd = new Date(as.endDate + 'T00:00:00');
      } else {
        semStart = new Date(today);
        semStart.setDate(today.getDate() - 30);
        semEnd = new Date(today);
      }

      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      // Start date of window: max of (30 days ago, semStart)
      let checkStart = new Date(today);
      checkStart.setDate(today.getDate() - 30);
      if (semStart > checkStart) {
        checkStart = new Date(semStart);
      }

      // End date of window: min of (yesterday, semEnd)
      let checkEnd = new Date(yesterday);
      if (semEnd < checkEnd) {
        checkEnd = new Date(semEnd);
      }

      if (checkStart > checkEnd) return;

      const checkDates = [];
      let cursor = new Date(checkStart);
      while (cursor <= checkEnd) {
        checkDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      checkDates.forEach(date => {
        const dateStr = formatDateKey(date);

        // 1. Holiday Check: Skip if the date is configured as a Holiday in the Academic Calendar
        const isHoliday = academicEvents[dateStr]?.some(e => e.type === 'Holiday');
        if (isHoliday) return;

        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        // Sundays are not working days — TimetableCreation only configures Mon-Sat,
        // so no faculty timetable exists for Sunday. Skip to stay consistent with the
        // timetable and avoid spurious "missed attendance" entries for Sundays.
        if (dayName === 'Sunday') return;
        const semNum = String(g.semester).match(/\d+/)?.[0] || g.semester;

        // Robust timetable lookup matching
        let tt = null;
        const cleanDept = normClean(g.department);
        const cleanBatch = normClean(g.batch);
        const cleanProg = normClean(g.progKey);
        for (const [k, ttData] of Object.entries(timetableData || {})) {
          const cleanK = normClean(k);
          if ((cleanK.includes(cleanProg) || cleanProg.includes('ug')) && cleanK.includes(cleanDept) && cleanK.includes(cleanBatch) && cleanK.includes(String(semNum))) {
            tt = ttData;
            break;
          }
        }

        const daySchedule = tt?.facultyEntries?.[dayName] || {};
        const currentSec = g.section || (g.sections && g.sections.length > 0 ? g.sections[0] : '');

        if (tt && Object.keys(daySchedule).length > 0) {
          // Timetable-based: check each scheduled period/subject
          Object.entries(daySchedule).forEach(([period, entries]) => {
            entries.forEach(entry => {
              const parts = String(entry).split('|');
              const code = parts[0] || '';
              if (!code) return;

              // Robust Attendance Document Matcher across all attendance collections
              const cleanCode = normClean(code);
              const cleanSec = normClean(currentSec);

              let recordsMap = {};
              for (const [dId, aData] of Object.entries(facultyAttendanceData || {})) {
                const cleanDId = normClean(dId);
                if (!cleanDId.includes(cleanCode)) continue;
                if (cleanDept && !cleanDId.includes(cleanDept) && !cleanDept.includes(cleanDId)) continue;
                if (cleanSec && !cleanDId.includes(cleanSec) && dId.includes('_Sec-')) continue;

                const recs = getAttendanceRecords(aData);
                if (recs && typeof recs === 'object') {
                  Object.assign(recordsMap, recs);
                }
              }

              const recordKey = `${dateStr}_P${period}`;
              let rec = recordsMap[recordKey];
              let recordFound = !!rec;

              // 1. Direct record: if it exists (even if marked by substitute or self), attendance was done
              if (rec) {
                recordFound = true;
              } else {
                // 2. No direct record — check if a substitute marked a different subject for same group/period/section
                const groupPrefixNum = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_`;
                const groupPrefixFull = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_`;
                const legacyGroupPrefixNum = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${semNum}_`;
                const legacyGroupPrefixFull = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${g.semester}_`;
                const secSuffix = currentSec ? `_${sanitizeKey(currentSec)}` : '';
                for (const [dId, aData] of Object.entries(facultyAttendanceData || {})) {
                  if (!getAttendanceRecords(aData)?.[recordKey]) continue;
                  const matchedPrefix = dId.startsWith(groupPrefixNum) ? groupPrefixNum : (dId.startsWith(groupPrefixFull) ? groupPrefixFull : (dId.startsWith(legacyGroupPrefixNum) ? legacyGroupPrefixNum : (dId.startsWith(legacyGroupPrefixFull) ? legacyGroupPrefixFull : null)));
                  if (!matchedPrefix) continue;
                  if (currentSec) {
                    if (!dId.endsWith(secSuffix)) continue;
                  } else {
                    if (dId.includes('_Sec-')) continue;
                  }
                  let rest = dId.slice(matchedPrefix.length);
                  if (secSuffix && rest.endsWith(secSuffix)) rest = rest.slice(0, rest.length - secSuffix.length);
                  if (rest && rest !== code) {
                    recordFound = true;
                    break;
                  }
                }
              }

              if (!recordFound) {
                tasks.push({
                  type: 'missed',
                  date: dateStr,
                  period: parseInt(period),
                  code,
                  progKey: g.progKey,
                  department: g.department,
                  batch: g.batch,
                  academicYear: g.academicYear,
                  semester: g.semester,
                  section: g.section || '',
                  subjectName: getCourseName(courseNames, code, g.department, g.progKey) || '',
                  batchLabel: `${formatAssignmentDisplay(g.progKey, g.department)} ${g.batch} Sem ${g.semester}${g.section ? ` (${g.section})` : ''}`,
                  dayName,
                  groupKey: `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`
                });
              }
            });
          });
        } else {
          // No timetable — check only today + yesterday per subject (can't determine full schedule)
          const isTodayOrYesterday = (
            formatDateKey(date) === formatDateKey(today) ||
            formatDateKey(date) === formatDateKey(yesterday)
          );
          if (!isTodayOrYesterday) return;

          const groupPrefixNum = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_`;
          const groupPrefixFull = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_`;
          const legacyGroupPrefixNum = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${semNum}_`;
          const legacyGroupPrefixFull = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${g.semester}_`;
          const secSuffix = currentSec ? `_${sanitizeKey(currentSec)}` : '';

          for (const code of (g.codes || [])) {
            const cleanCode = normClean(code);
            const cleanSec = normClean(currentSec);

            let hasAnyRecord = false;

            // Direct match: same subject's attendance doc
            for (const [dId, aData] of Object.entries(facultyAttendanceData || {})) {
              const cleanDId = normClean(dId);
              if (!cleanDId.includes(cleanCode)) continue;
              if (cleanDept && !cleanDId.includes(cleanDept) && !cleanDept.includes(cleanDId)) continue;
              if (cleanSec && !cleanDId.includes(cleanSec) && dId.includes('_Sec-')) continue;

              const recs = getAttendanceRecords(aData);
              if (!recs || typeof recs !== 'object') continue;
              const datePrefix = `${dateStr}_P`;
              for (const rk of Object.keys(recs)) {
                if (rk.startsWith(datePrefix)) { hasAnyRecord = true; break; }
              }
              if (hasAnyRecord) break;
            }

            // Substitute: another subject marked for same group/section
            if (!hasAnyRecord) {
              for (const [dId, aData] of Object.entries(facultyAttendanceData || {})) {
                const matchedPrefix = dId.startsWith(groupPrefixNum) ? groupPrefixNum : (dId.startsWith(groupPrefixFull) ? groupPrefixFull : (dId.startsWith(legacyGroupPrefixNum) ? legacyGroupPrefixNum : (dId.startsWith(legacyGroupPrefixFull) ? legacyGroupPrefixFull : null)));
                if (!matchedPrefix) continue;
                if (currentSec) {
                  if (!dId.endsWith(secSuffix)) continue;
                } else {
                  if (dId.includes('_Sec-')) continue;
                }
                let rest = dId.slice(matchedPrefix.length);
                if (secSuffix && rest.endsWith(secSuffix)) rest = rest.slice(0, rest.length - secSuffix.length);
                if (rest && normClean(rest) !== cleanCode) {
                  const recs = getAttendanceRecords(aData);
                  if (!recs || typeof recs !== 'object') continue;
                  const datePrefix = `${dateStr}_P`;
                  for (const rk of Object.keys(recs)) {
                    if (rk.startsWith(datePrefix)) { hasAnyRecord = true; break; }
                  }
                  if (hasAnyRecord) break;
                }
              }
            }

            if (!hasAnyRecord) {
              tasks.push({
                type: 'missed',
                date: dateStr,
                period: 0,
                code,
                progKey: g.progKey,
                department: g.department,
                batch: g.batch,
                academicYear: g.academicYear,
                semester: g.semester,
                section: g.section || '',
                subjectName: getCourseName(courseNames, code, g.department, g.progKey) || '',
                batchLabel: `${formatAssignmentDisplay(g.progKey, g.department)} ${g.batch} Sem ${g.semester}${g.section ? ` (${g.section})` : ''}`,
                dayName,
                groupKey: `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}`
              });
            }
          }
        }
      });
    });

    tasks.sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
    return tasks;
  }, [visibleGroups, timetableData, facultyAttendanceData, courseNames, semesterConfigs, currentUid, academicEvents]);
  const missedCount = useMemo(() => attendanceTasks.length, [attendanceTasks]);

  const qpSetterTaskCards = useMemo(() => {
    const todayStr = formatDateKey(new Date());
    const normBatch = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return qpSetterTasks
      .filter((task) => {
        if (!task.examDate || String(task.examDate).trim().length === 0) return false;

        // Auto-hide task card 2 days after the submission window end date (toDate + 2 days)
        if (task.toDate) {
          const match = String(task.toDate).match(/(\d{4})-(\d{2})-(\d{2})/);
          if (match) {
            const endDate = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 23, 59, 59, 999);
            const hideAfterDate = new Date(endDate);
            hideAfterDate.setDate(hideAfterDate.getDate() + 2);
            const now = new Date();
            if (now.getTime() > hideAfterDate.getTime()) {
              return false;
            }
          }
        }

        return true;
      })
      .map(task => {
        const rawCode = String(task.code || '').trim().toUpperCase();
        // Resolve to CourseBank canonical code using subject name when available.
        // This ensures tasks saved with old/legacy codes (e.g. CS342) display the
        // current CourseBank code (e.g. CCS342) and navigate QPG correctly.
        const taskName = String(task.name || '').trim();
        const normTaskName = taskName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const codeFromName = (normTaskName && courseBankNameMap?.nameMap?.[normTaskName]) || '';
        // Also try resolving by code directly from CourseBank (handles cases where
        // CourseBank has updated code but the assignment still stores the old one).
        const normRawCode = rawCode.replace(/[^A-Z0-9]/g, '');
        const codeFromCode = (courseBankNameMap?.codeToCanonical?.[normRawCode]) || '';
        const canonicalCode = codeFromName || codeFromCode || '';
        const code = canonicalCode || rawCode;

        // Count generated sets by this faculty for this subject code — ONLY written test papers count
        // Match against both old (rawCode) and canonical (canonicalCode) to catch all saved QPs.
        const generatedSets = (baseQps || []).filter(qp => {
          const parsedQp = parseSubjectField(qp.subject);
          const qpCode = String(parsedQp.code || qp.subject_code || '').trim().toUpperCase();
          const isMyPaper = qp.created_by === currentUid || !qp.created_by;
          if (!isMyPaper) return false;
          if (canonicalCode) {
            if (qpCode !== rawCode && qpCode !== canonicalCode) return false;
          } else {
            if (qpCode !== rawCode) return false;
          }
          const isWrittenTest = isWrittenTestQp(qp);
          return isWrittenTest;
        });

        const requiredSets = parseInt(task.numSets, 10) || 1;
        const createdCount = generatedSets.length;

        // Determine which set numbers have already been created by this faculty for this subject,
        // so the "Create Question Paper" button auto-opens the next not-yet-created set (e.g. Set 2 after Set 1).
        const createdSetNumbers = [...new Set(generatedSets.map(qp => {
          const raw = String((qp && qp.qp_set) || (qp && qp.setNumber) || '');
          const m = raw.match(/\d+/);
          return m ? parseInt(m[0], 10) : 1;
        }))];
        createdSetNumbers.sort((a, b) => a - b);
        let nextSetNum = requiredSets + 1;
        for (let i = 1; i <= requiredSets; i++) {
          if (!createdSetNumbers.includes(i)) { nextSetNum = i; break; }
        }
        const nextSetLabel = `Set ${nextSetNum}`;

        const isDone = createdCount >= requiredSets;
        const isOverdue = !isDone && task.toDate && task.toDate < todayStr;
        const isDueSoon = !isDone && task.toDate && task.toDate >= todayStr;

        // Derive progKey/department from assignedGroups by fuzzy-matching batch+semester+code,
        // then fall back to the first department recorded on the assignment itself.
        // Check both old and canonical code since subject_assignments may use either.
        const matchingGroup = assignedGroups.find(g =>
          (normBatch(g.batch) === normBatch(task.batch) ||
            normBatch(g.batch).includes(normBatch(task.batch)) ||
            normBatch(task.batch).includes(normBatch(g.batch))) &&
          String(g.semester) === String(task.semester) &&
          (g.codes || []).some(c => {
            const cNorm = String(c).trim().toUpperCase();
            if (canonicalCode) {
              return cNorm === rawCode || cNorm === canonicalCode;
            }
            return cNorm === rawCode;
          })
        );
        const excelFirstDept = Array.isArray(task.departments) && task.departments.length > 0 ? task.departments[0] : null;

        return {
          ...task,
          code,
          rawCode,
          createdCount,
          requiredSets,
          nextSetNum,
          nextSetLabel,
          isDone,
          isOverdue,
          isDueSoon,
          progKey: (matchingGroup?.progKey || excelFirstDept?.progKey || excelFirstDept?.prog || ''),
          department: (matchingGroup?.department || excelFirstDept?.dept || '')
        };
      })
      // Deduplicate by course code — prefer the card carrying the most complete navigation info
      // (progKey + department + academicYear + semester + examDate), so the "Create Question Paper"
      // button always opens QPG with valid auto-selectable parameters.
      .reduce((acc, task) => {
        const dedupCode = String(task.code || '').trim().toUpperCase();
        const score = (t) =>
          ((t.progKey ? 1 : 0) + (t.department ? 1 : 0)) * 100 +
          ((t.academicYear && String(t.academicYear).trim()) ? 1 : 0) * 10 +
          ((t.semester && String(t.semester).trim()) ? 1 : 0) * 10 +
          ((t.examDate && String(t.examDate).trim()) ? 1 : 0);
        const existing = acc.find(a => String(a.code || '').trim().toUpperCase() === dedupCode);
        if (!existing || score(task) > score(existing)) {
          acc = acc.filter(a => String(a.code || '').trim().toUpperCase() !== dedupCode);
          acc.push(task);
        }
        return acc;
      }, [])
      .sort((a, b) => {
        const ka = String(a.code || '').toUpperCase();
        const kb = String(b.code || '').toUpperCase();
        if (ka !== kb) return ka.localeCompare(kb);
        return String(b.academicYear || '').localeCompare(String(a.academicYear || ''));
      });
  }, [qpSetterTasks, baseQps, currentUid, assignedGroups, courseBankNameMap]);

  const statsCards = [
    { label: "Assigned Subjects", value: assignedCount, icon: BookOpen, color: "indigo" },
    { label: "QP Tasks", value: qpSetterTaskCards.filter(t => !t.isDone).length, icon: PenLine, color: "indigo" },
    { label: "Drafts", value: totalDraftCount, icon: FileText, color: "slate" },
    { label: "Pending Review", value: totalForwardedCount, icon: Clock, color: "blue" },
    { label: "Approved", value: totalApprovedCount, icon: CheckCircle2, color: "emerald" },
    { label: "Missed Attendance", value: missedCount, icon: AlertCircle, color: "amber" },
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
      const legacyCompositeKey = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${semNum}`;
      const tt = timetableData[compositeKey] || timetableData[legacyCompositeKey];
      if (!tt || !tt.periodsPerDay) {
        if (tt) console.warn(`TT for ${compositeKey}: missing periodsPerDay`);
        return;
      }
      const tpl = tt.template || tt;
      const lunchAfter = parseInt(tpl.lunchAfterPeriod, 10) || 0;
      const lunchDur = parseInt(tpl.lunchDuration, 10) || 0;
      const brks = Array.isArray(tpl.breaks) ? tpl.breaks : [];
      const periodsPerDay = parseInt(tt.periodsPerDay, 10) || 0;
      const workingDays = parseInt(tt.workingDays || tpl.workingDays || 5, 10) || 5;

      const periodTimes = getPeriodTimes(tpl.startTime, periodsPerDay, tpl.periodDurations, brks, lunchAfter, lunchDur);
      const periodTimesStr = periodTimes.map(pt => `${pt.start}-${pt.end}`).join(';');
      const templateKey = `${periodsPerDay}|${workingDays}|${periodTimesStr}`;

      if (!groups[templateKey]) {
        const columns = [];
        for (let i = 1; i <= periodsPerDay; i++) {
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
          periodsPerDay,
          workingDays,
          periodTimes,
          columns,
          entries: []
        };
      }

      if (!groups[templateKey].entries.some(e => e.compositeKey === compositeKey)) {
        groups[templateKey].entries.push({ group: g, compositeKey, tt });
      }
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
      const legacyCompositeKey = `${g.progKey}_${(g.department || '').replace(/[.#$[\]]/g, '_')}_${(g.batch || '').replace(/[.#$[\]]/g, '_')}_${(g.academicYear || '').replace(/[.#$[\]]/g, '_')}_${semNum}`;
      const tt = timetableData[compositeKey] || timetableData[legacyCompositeKey];
      const daySchedule = tt?.facultyEntries?.[dayName] || {};
      Object.entries(daySchedule).forEach(([period, entries]) => {
        entries.forEach(entry => {
          const parts = String(entry).split('|');
          const code = parts[0] || '';
          const currentSec = g.section || (g.sections && g.sections.length > 0 ? g.sections[0] : '');
          const sectionSuffix = currentSec ? `_${sanitizeKey(currentSec)}` : '';
          const exactAttDocIdNum = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_${code}${sectionSuffix}`;
          const baseAttDocIdNum = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_${code}`;
          const exactAttDocIdFull = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_${code}${sectionSuffix}`;
          const baseAttDocIdFull = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_${code}`;
          // Legacy keys: Attendance.jsx local sanitizeKey preserved spaces, so old docs have spaces
          const oldSan = (s) => (s || '').replace(/[.#$[\]]/g, '_');
          const legacySecSuffix = currentSec ? `_${oldSan(currentSec)}` : '';
          const legacyAttDocIdNum = `${g.progKey}_${oldSan(g.department)}_${oldSan(g.batch)}_${oldSan(g.academicYear)}_${semNum}_${code}${legacySecSuffix}`;
          const legacyBaseAttDocIdNum = `${g.progKey}_${oldSan(g.department)}_${oldSan(g.batch)}_${oldSan(g.academicYear)}_${semNum}_${code}`;
          const legacyAttDocIdFull = `${g.progKey}_${oldSan(g.department)}_${oldSan(g.batch)}_${oldSan(g.academicYear)}_${g.semester}_${code}${legacySecSuffix}`;
          const legacyBaseAttDocIdFull = `${g.progKey}_${oldSan(g.department)}_${oldSan(g.batch)}_${oldSan(g.academicYear)}_${g.semester}_${code}`;

          const attData = facultyAttendanceData[exactAttDocIdNum] || facultyAttendanceData[baseAttDocIdNum] || facultyAttendanceData[exactAttDocIdFull] || facultyAttendanceData[baseAttDocIdFull]
            || facultyAttendanceData[legacyAttDocIdNum] || facultyAttendanceData[legacyBaseAttDocIdNum] || facultyAttendanceData[legacyAttDocIdFull] || facultyAttendanceData[legacyBaseAttDocIdFull];
          const recordKey = `${attendanceDate}_P${period}`;
          const recordsMap = getAttendanceRecords(attData);
          let rec = recordsMap[recordKey];
          let subFound = false;
          let subSubjectCode = '';
          let subFacultyName = '';

          // 1. Direct record exists for this scheduled subject & section
          if (rec) {
            subSubjectCode = code;
            if (rec.markedBy && rec.markedBy !== currentUid) {
              subFound = true;
              subFacultyName = facultyNames[rec.markedBy] || rec.markedBy;
            }
          } else {
            // 2. Scheduled subject has no record. Check if another subject was taught
            // to THIS EXACT group (programme, department, batch, academicYear, semester, section)
            const groupPrefixNum = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_`;
            const groupPrefixFull = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${g.semester}_`;
            const secSuffix = currentSec ? `_${sanitizeKey(currentSec)}` : '';
            // Legacy prefixes: old Attendance.jsx preserved spaces
            const legacyGroupPrefixNum = `${g.progKey}_${oldSan(g.department)}_${oldSan(g.batch)}_${oldSan(g.academicYear)}_${semNum}_`;
            const legacyGroupPrefixFull = `${g.progKey}_${oldSan(g.department)}_${oldSan(g.batch)}_${oldSan(g.academicYear)}_${g.semester}_`;
            const legacySecSuffix = currentSec ? `_${oldSan(currentSec)}` : '';

            for (const [dId, aData] of Object.entries(facultyAttendanceData)) {
              const aRecords = getAttendanceRecords(aData);
              if (!aRecords?.[recordKey]) continue;

              let matchedPrefix = dId.startsWith(groupPrefixNum) ? groupPrefixNum : (dId.startsWith(groupPrefixFull) ? groupPrefixFull : null);
              if (!matchedPrefix) matchedPrefix = dId.startsWith(legacyGroupPrefixNum) ? legacyGroupPrefixNum : (dId.startsWith(legacyGroupPrefixFull) ? legacyGroupPrefixFull : null);
              if (!matchedPrefix) continue;

              // Must match the exact section
              const effectiveSecSuffix = (matchedPrefix === legacyGroupPrefixNum || matchedPrefix === legacyGroupPrefixFull) ? legacySecSuffix : secSuffix;
              if (currentSec) {
                if (!dId.endsWith(effectiveSecSuffix)) continue;
              } else {
                if (dId.includes('_Sec-')) continue;
              }

              // Extract substitute subject code
              let rest = dId.slice(matchedPrefix.length);
              if (effectiveSecSuffix && rest.endsWith(effectiveSecSuffix)) {
                rest = rest.slice(0, rest.length - effectiveSecSuffix.length);
              }
              const subCode = rest;

              if (subCode && subCode !== code) {
                rec = aRecords[recordKey];
                subFound = true;
                subSubjectCode = subCode;
                const markerUid = rec.markedBy;
                if (markerUid) {
                  subFacultyName = facultyNames[markerUid] || markerUid;
                }
                if (!subFacultyName) {
                  const uids = codeOwners[subSubjectCode] || [];
                  const otherUids = uids.filter(u => u !== currentUid);
                  if (otherUids.length > 0) {
                    subFacultyName = facultyNames[otherUids[0]] || otherUids[0];
                  }
                }
                break;
              }
            }
          }

          if (subSubjectCode && subSubjectCode !== code && !subFacultyName) {
            const uids = codeOwners[subSubjectCode] || [];
            const otherUids = uids.filter(uid => uid !== currentUid);
            if (otherUids.length > 0) {
              subFacultyName = facultyNames[otherUids[0]] || otherUids[0];
            }
          }

          const batchLabel = `${formatAssignmentDisplay(g.progKey, g.department)} ${g.batch} Sem ${g.semester}${g.section ? ` (${g.section})` : ''}`;

          if (rec) {
            const isEvent = rec?.isEvent || false;
            const eventName = rec?.eventName || '';
            const enrolDocId = `${g.progKey}_${sanitizeKey(g.department)}_${sanitizeKey(g.batch)}_${sanitizeKey(g.academicYear)}_${semNum}_${sanitizeKey(subSubjectCode || code)}`;
            const enrolData = facultyCourseEnrolments[enrolDocId];
            const enrolledKeys = enrolData ? new Set(Object.keys(enrolData).filter(k => enrolData[k])) : null;

            const stuMap = rec.students || {};
            const e2 = Object.entries(stuMap).filter(([reg]) => {
              if (!enrolledKeys) return true;
              return enrolledKeys.has(reg);
            });
            const present = e2.filter(([, h]) => {
              const storedStatus = typeof h === 'object' && h !== null ? h.status : undefined;
              return storedStatus ? (storedStatus === 'P' || storedStatus === 'OD') : (getH(h) > 0);
            });
            const absent = e2.filter(([, h]) => {
              const storedStatus = typeof h === 'object' && h !== null ? h.status : undefined;
              return storedStatus ? (storedStatus === 'A') : (getH(h) === 0);
            });
            const od = e2.filter(([, h]) => {
              const storedStatus = typeof h === 'object' && h !== null ? h.status : undefined;
              return storedStatus ? (storedStatus === 'OD') : (getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));
            });

            rows.push({
              period, hasRecord: true, code, batchLabel, subFound,
              presentCount: present.length,
              absentCount: absent.length,
              odCount: od.length,
              presentStudents: present.map(([r]) => r),
              absentStudents: absent.map(([r]) => r),
              odStudents: od.map(([r]) => r),
              subjectName: isEvent ? eventName : (getCourseName(courseNames, code, g.department, g.progKey) || ''),
              subSubjectCode, subFacultyName,
              isEvent,
            });
          } else {
            rows.push({
              period, hasRecord: false, code, batchLabel, subFound,
              presentCount: 0, absentCount: 0, odCount: 0,
              presentStudents: [], absentStudents: [], odStudents: [],
              subjectName: getCourseName(courseNames, code, g.department, g.progKey) || '',
              subSubjectCode, subFacultyName,
              isEvent: false,
            });
          }
        });
      });
    });
    rows.sort((a, b) => Number(a.period) - Number(b.period));
    return rows;
  }, [visibleGroups, timetableData, facultyAttendanceData, facultyCourseEnrolments, attendanceDate, courseNames, codeOwners, facultyNames, currentUid]);

  const attendanceDateEvents = useMemo(() => academicEvents[attendanceDate] || [], [academicEvents, attendanceDate]);
  const attendanceDateIsHoliday = useMemo(() => attendanceDateEvents.some(e => e.type === 'Holiday'), [attendanceDateEvents]);
  const attendanceDateOutsideSemester = useMemo(() => {
    if (!semesterConfigs.length) return false;
    const selected = new Date(attendanceDate + 'T00:00:00');
    return !semesterConfigs.some(cfg => {
      if (!cfg.startDate || !cfg.endDate) return false;
      const s = new Date(cfg.startDate + 'T00:00:00');
      const e = new Date(cfg.endDate + 'T00:00:00');
      return selected >= s && selected <= e;
    });
  }, [semesterConfigs, attendanceDate]);

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  return (
    <Layout title="Faculty Dashboard">
      <div className="w-full p-4 md:p-8 space-y-8 font-sans">

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
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

        {/* Question Paper Setter Tasks Section */}
        {qpSetterTaskCards.length > 0 && (
          <div className="bg-white rounded-3xl border border-indigo-100 shadow-xl p-6 mb-8 relative overflow-hidden font-sans">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 text-[#120c7a] border border-indigo-200/80 shadow-sm">
                  <PenLine size={22} className="text-indigo-700" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                    Question Paper Setter Tasks
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-[#120c7a] border border-indigo-200">
                      {qpSetterTaskCards.filter(t => !t.isDone).length} Pending
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    You have been assigned as QP Setter for the following subjects in IA Schedule / Exam Cell
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {qpSetterTaskCards.map((task, idx) => {
                const pendingSets = task.requiredSets - task.createdCount;
                return (
                  <div
                    key={`${task.docId}_${task.code}_${idx}`}
                    className={`rounded-2xl border p-5 transition-all duration-200 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md ${task.isDone
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : task.isOverdue
                        ? 'bg-red-50/30 border-red-200'
                        : 'bg-gradient-to-br from-white to-indigo-50/30 border-indigo-200/80 hover:border-indigo-400'
                      }`}
                  >
                    <div>
                      {/* Top Header & Status */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="px-3 py-1 rounded-lg bg-[#120c7a] text-white text-xs font-black tracking-wider uppercase shadow-xs">
                          {task.code}
                        </span>
                        {task.isDone ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 size={13} /> Completed ({task.createdCount}/{task.requiredSets} Sets)
                          </span>
                        ) : task.isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 animate-pulse">
                            <AlertCircle size={13} /> Overdue ({task.createdCount}/{task.requiredSets} Sets)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            <Clock size={13} /> Action Needed ({task.createdCount}/{task.requiredSets} Sets)
                          </span>
                        )}
                      </div>

                      {/* Course Name */}
                      <h4 className="text-xs font-bold text-slate-800 leading-snug mb-2 break-words" title={task.name}>
                        {task.name}
                      </h4>

                      {/* Batch & Semester Info */}
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-3 flex-wrap">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          Batch: {task.batch}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          Sem {task.semester}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {task.academicYear}
                        </span>
                      </div>

                      {/* Departments Chip */}
                      {Array.isArray(task.departments) && task.departments.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Depts:</span>
                          {task.departments.map((d, dIdx) => (
                            <span key={dIdx} className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-800 rounded-md border border-indigo-200/60">
                              {d.progKey ? `${d.progKey} ` : ''}{(d.dept || '').replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Submission Window & Exam Date */}
                      <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-500">Submission Window:</span>
                          <span className="font-bold text-slate-800">
                            {task.fromDate || '---'} → <span className={task.isOverdue ? "text-red-600 font-extrabold" : "text-slate-800"}>{task.toDate || '---'}</span>
                          </span>
                        </div>
                        {task.examDate && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                            <span className="font-semibold text-slate-500">Exam Date:</span>
                            <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/60">
                              {task.examDate} {task.examName ? `(${task.examName})` : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Allocated QP Status & Time-Lock Banner */}
                      {(() => {
                        const allocatedQP = allMasterQps.find((q) => {
                          if (!q || !q.allocated || !q.allocatedTo) return false;
                          const targetCode = String(task.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          const qSubjCode = String(q.allocatedTo.subjectCode || parseSubjectField(q.subject).code || q.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          return targetCode === qSubjCode;
                        });

                        if (!allocatedQP) return null;

                        const isTimeReached = isExamTimeReached(
                          allocatedQP.allocatedTo?.examDate || task.examDate,
                          allocatedQP.allocatedTo?.startTime || task.startTime,
                          allocatedQP.allocatedTo?.session || task.session
                        );

                        return isTimeReached ? (
                          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 space-y-1.5 mt-3 shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                                <Unlock size={14} className="text-emerald-600 shrink-0" />
                                Official Paper: {allocatedQP.exam_name || allocatedQP.qpaper_name} ({formatQPSetDisplay(allocatedQP)})
                              </span>
                              <button
                                onClick={() => { setSelectedQP(allocatedQP); setShowQPModal(true); }}
                                className="text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg shadow-2xs transition-all cursor-pointer shrink-0"
                              >
                                View Paper
                              </button>
                            </div>
                            <p className="text-[10px] font-semibold text-emerald-800 leading-snug">
                              🔓 Exam Cell has chosen this paper for the examination on {allocatedQP.allocatedTo?.examDate} at {allocatedQP.allocatedTo?.startTime || '09:30 AM'}.
                            </p>
                          </div>
                        ) : (
                          <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 space-y-1.5 mt-3 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-black text-amber-950">
                              <Lock size={14} className="text-amber-600 shrink-0" />
                              <span>Official Question Paper Allocated by Exam Cell</span>
                            </div>
                            <p className="text-[10px] font-semibold text-amber-900 leading-snug">
                              🔒 Paper selection is time-locked. It will be revealed automatically on{' '}
                              <strong className="font-black text-amber-950">{allocatedQP.allocatedTo?.examDate || task.examDate}</strong> at{' '}
                              <strong className="font-black text-amber-950">{allocatedQP.allocatedTo?.startTime || '09:30 AM'}</strong> (Exam Start Time).
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => {
                          const firstDept = Array.isArray(task.departments) && task.departments[0] ? task.departments[0] : null;
                          const taskProgKey = task.progKey || (firstDept ? firstDept.progKey || firstDept.prog : '') || '';
                          const taskDept = task.department || (firstDept ? firstDept.dept : '') || '';
                          const taskSec = task.section || (Array.isArray(task.sections) && task.sections[0] ? task.sections[0] : '');
                          const taskExam = task.examName || task.examId || task.exam || '';
                          // Always pass the intended set so QPG never defaults back to Set 1 and
                          // overwrites an already-saved Set 1 when the user clicks again after saving.
                          const nextSet = `&set=${encodeURIComponent(task.nextSetLabel)}`;
                          navigate(`/question-paper-generator?code=${encodeURIComponent(task.code || '')}&batch=${encodeURIComponent(task.batch || '')}&sem=${encodeURIComponent(task.semester || '')}&prog=${encodeURIComponent(taskProgKey)}&dept=${encodeURIComponent(taskDept)}&ay=${encodeURIComponent(task.academicYear || '')}${taskSec ? `&sec=${encodeURIComponent(taskSec)}` : ''}${taskExam ? `&exam=${encodeURIComponent(taskExam)}` : ''}${nextSet}`);
                        }}
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer ${task.isDone
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                          : 'bg-[#120c7a] hover:bg-[#100b6e] text-white shadow-indigo-200'
                          }`}
                      >
                        <Sparkles size={15} />
                        {task.isDone ? 'Generate Additional Set' : `Create Question Paper (${pendingSets} Left)`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Draft Activities Section */}
        {draftActivities.length > 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900">Draft Activities</h2>
                  <p className="text-xs text-zinc-400 font-medium">Activities saved as draft — click the edit icon to resume entry</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold border border-amber-200">
                {draftActivities.length} Saved {draftActivities.length === 1 ? "Draft" : "Drafts"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {draftActivities.map((act) => (
                <div
                  key={act.id}
                  className="bg-zinc-50/80 border border-zinc-200/80 rounded-2xl p-4 flex items-start justify-between gap-3 hover:border-indigo-300 hover:bg-white hover:shadow-md transition-all group"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#120c7a] to-indigo-800 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
                        {act.activityCode}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">
                          {act.title || act.activityName || `Activity ${act.activityCode}`}
                        </p>
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                          {act.category || "Activity"} • {act.date || act.month || "Draft"}
                        </span>
                      </div>
                    </div>

                    {act.description && (
                      <p className="text-[11px] text-zinc-500 line-clamp-1">{act.description}</p>
                    )}
                  </div>

                  {/* Resume Edit Button */}
                  <button
                    onClick={() => navigate(`/activities/${act.activityCode}/edit/${act.id}`)}
                    className="p-2.5 rounded-xl bg-indigo-50 text-[#120c7a] hover:bg-[#120c7a] hover:text-white transition-all shadow-sm shrink-0 flex items-center gap-1.5 font-extrabold text-xs cursor-pointer border border-indigo-200/60"
                    title="Edit and Resume Activity Entry"
                  >
                    <Edit2 size={15} />
                    <span className="hidden sm:inline">Resume</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Appraisal Validation Scorecard Widget */}
        {userAppraisal && (
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden mb-8 animate-fadeIn">
            <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black tracking-widest uppercase w-fit">
                  <Award size={12} className="text-amber-300" /> HR Appraisal Scorecard
                </div>
                <h3 className="text-base font-bold">Your performance appraisal validation is complete</h3>
                <p className="text-emerald-100 text-xs font-medium">HOD has completed your self-appraisal form validation and scorecard verification.</p>
              </div>

              <div className="flex items-center gap-4 shrink-0 col-span-1">
                <div className="text-right">
                  <span className="block text-[9px] font-black text-emerald-200 uppercase tracking-wider">Secured Total Score</span>
                  <div className="text-3xl font-black text-amber-300">
                    {userAppraisal.hodValidation.totalScore} <span className="text-xs text-emerald-200 font-semibold">/ 100</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowAppraisalScorecardModal(true)}
                  className="px-5 py-2.5 bg-white text-[#120c7a] hover:bg-zinc-50 rounded-xl text-xs font-black transition-all shadow-lg cursor-pointer"
                >
                  View Scorecard Breakdown
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appraisal Scorecard Details Modal */}
        {showAppraisalScorecardModal && userAppraisal && (
          <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">

              <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3">
                  <Award className="text-yellow-400" size={24} />
                  <div>
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                      Validated Performance Appraisal Scorecard
                    </h4>
                    <p className="text-base font-bold truncate mt-0.5">
                      Session: {userAppraisal.academicYear} • Verified by HOD ({userAppraisal.hodValidation.validatedBy})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAppraisalScorecardModal(false)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 md:p-8 space-y-6">

                {/* Part 1 Scorecard Table */}
                <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
                  <div className="bg-[#120c7a]/5 px-5 py-3 border-b border-zinc-200 font-extrabold text-xs text-[#120c7a] uppercase tracking-wider">
                    Part One Evaluation (Academic & Feedback)
                  </div>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                        <th className="p-3 w-12 text-center">S.No</th>
                        <th className="p-3">KRA</th>
                        <th className="p-3">Particulars Details</th>
                        <th className="p-3 w-28 text-center">Max Marks</th>
                        <th className="p-3 w-28 text-center">Auto Calculated</th>
                        <th className="p-3 w-28 text-center">Final Verified</th>
                        <th className="p-3">HOD Verification Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {(userAppraisal.hodValidation.scorecard?.part1 || []).map((row) => (
                        <tr key={row.id}>
                          <td className="p-3 text-center font-bold text-slate-500">{row.sNo}</td>
                          <td className="p-3 font-semibold text-slate-700">{row.kra}</td>
                          <td className="p-3 text-zinc-650">
                            <div>{row.particulars}</div>
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mt-1 inline-block uppercase">
                              Value: {row.value}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-zinc-500">{row.maxMarks}</td>
                          <td className="p-3 text-center font-black text-slate-650">{row.calculatedMarks}</td>
                          <td className="p-3 text-center font-black text-indigo-900 text-sm bg-indigo-50/20">{row.securedMarks}</td>
                          <td className="p-3 text-zinc-600 font-medium italic">{row.remarks || "No comments"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Part 2 Scorecard Table */}
                <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
                  <div className="bg-[#120c7a]/5 px-5 py-3 border-b border-zinc-200 font-extrabold text-xs text-[#120c7a] uppercase tracking-wider">
                    Part Two Evaluation (Self & Institutional Development)
                  </div>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                        <th className="p-3 w-12 text-center">S.No</th>
                        <th className="p-3">KRA</th>
                        <th className="p-3">Particulars Details</th>
                        <th className="p-3 w-28 text-center">Max Marks</th>
                        <th className="p-3 w-28 text-center">Auto Calculated</th>
                        <th className="p-3 w-28 text-center">Final Verified</th>
                        <th className="p-3">HOD Verification Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {(userAppraisal.hodValidation.scorecard?.part2 || []).map((row) => (
                        <tr key={row.id}>
                          <td className="p-3 text-center font-bold text-slate-500">{row.sNo}</td>
                          <td className="p-3 font-semibold text-slate-700">{row.kra}</td>
                          <td className="p-3 text-zinc-650">
                            <div>{row.particulars}</div>
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mt-1 inline-block uppercase">
                              Value: {row.value}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-zinc-500">{row.maxMarks}</td>
                          <td className="p-3 text-center font-black text-slate-650">{row.calculatedMarks}</td>
                          <td className="p-3 text-center font-black text-indigo-900 text-sm bg-indigo-50/20">{row.securedMarks}</td>
                          <td className="p-3 text-zinc-600 font-medium italic">{row.remarks || "No comments"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Score Summary Box */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block font-serif">Validated Appraisal Score Sheet</span>
                    <p className="text-xs text-slate-300">Auto-validation calculated based on institutional criteria parameters configured by HR.</p>
                  </div>

                  <div className="text-right">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Final Verified Total Marks</span>
                    <div className="text-3xl font-black text-amber-300">
                      {userAppraisal.hodValidation.totalScore} <span className="text-base font-semibold text-slate-400">/ 100</span>
                    </div>
                  </div>
                </div>

              </div>

              <div className="bg-zinc-50 border-t border-zinc-150 p-4 flex justify-end">
                <button
                  onClick={() => setShowAppraisalScorecardModal(false)}
                  className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Close Scorecard
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Assigned Subjects + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-8">
          {/* Assigned Subjects */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <BookOpen size={20} className="text-[#120c7a]" />
                Assigned Subjects
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{assignedCount}</span>
              </h2>
            </div>
            {assignmentsLoading ? (
              <div className="flex-1 flex items-center justify-center py-16 text-zinc-400 gap-3">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-semibold">Loading assignments...</span>
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                  <BookOpen size={28} />
                </div>
                <p className="text-lg font-bold text-zinc-700">No subjects assigned yet</p>
                <p className="text-sm text-zinc-400 mt-1">Contact your HOD to get subject assignments.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto min-h-0 max-h-[550px]">
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
                          {(g.codes || []).map((code) => {
                            const normCode = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                            const resolvedCode = (normCode && courseBankNameMap?.codeToCanonical?.[normCode]) || code;
                            const cName = getCourseName(courseNames, resolvedCode, g.department, g.progKey) || getCourseName(courseNames, code, g.department, g.progKey);
                            return (
                              <span key={code}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-100">
                                <span>{resolvedCode}</span>
                                {cName && <span className="text-indigo-400 font-medium">— {cName}</span>}
                              </span>
                            );
                          })}
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

          {/* Missed Attendance */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <CalendarCheck2 size={20} className="text-[#120c7a]" />
                Missed Attendance
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{missedCount}</span>
              </h2>
            </div>
            {pendingLoading ? (
              <div className="flex-1 flex items-center justify-center py-16 text-zinc-400 gap-3">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-semibold">Checking attendance...</span>
              </div>
            ) : missedCount === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={28} />
                </div>
                <p className="text-lg font-bold text-zinc-700">All caught up!</p>
                <p className="text-sm text-zinc-400 mt-1">No missed attendance or pending tasks.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto min-h-0 max-h-[550px]">
                {/* Attendance tasks */}
                {attendanceTasks.map((task, idx) => {
                  const dateParts = task.date?.split('-') || ['00', '00', '00'];
                  const displayDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : task.date || '—';
                  const normAttCode = String(task.code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                  const resolvedAttCode = (normAttCode && courseBankNameMap?.codeToCanonical?.[normAttCode]) || task.code;
                  return (
                    <div key={`att-${idx}`} className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-zinc-800">{resolvedAttCode || task.code || '—'}</span>
                            {task.subjectName || (normAttCode && courseBankNameMap?.codeToCanonical?.[normAttCode]) && <span className="text-xs font-semibold text-zinc-600 leading-snug">— {normAttCode || '—'}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-bold border border-amber-200">
                              <AlertCircle size={10} /> Missed
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              {displayDate}{task.period > 0 ? ` — P${task.period}` : ''}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                              {task.dayName}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 text-zinc-600 px-2 py-0.5 text-[10px] font-bold border border-zinc-200">
                              {task.batchLabel}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate(`/attendance?prog=${task.progKey}&dept=${task.department}&batch=${task.batch}&ay=${task.academicYear}&sem=${task.semester}&subject=${task.code}&date=${task.date}${task.period > 0 ? `&period=${task.period}` : ''}&section=${task.section}`)}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#120c7a]/5 text-[#120c7a] text-xs font-bold hover:bg-[#120c7a]/10 transition-all"
                        >
                          <Edit2 size={14} />
                          Mark Now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ QP Recorrection ═══ */}
        {recorrectCount > 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <AlertCircle size={20} className="text-amber-600" />
                QP Recorrection
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{recorrectCount}</span>
              </h2>
            </div>
            <div className="divide-y divide-zinc-100 max-h-[350px] overflow-y-auto">
              {pendingQps.filter(q => q.status === 'recorrected').map((qp) => (
                <div key={`recorrect-${qp.compositeKey}-${qp.id}`}
                  className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-zinc-800">{(() => { const p = parseSubjectField(qp.subject); return p.code || qp.subject; })()}</span>
                        {(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })() && (
                          <>
                            <span className="text-[10px] text-zinc-300">•</span>
                            <span className="text-xs font-semibold text-zinc-600 leading-snug">{(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })()}</span>
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
                      onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}&set=${encodeURIComponent(formatQPSetDisplay(qp))}`)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#120c7a] text-white text-xs font-bold hover:bg-[#0f0a66] transition-all shadow-sm active:scale-95"
                    >
                      <Edit2 size={14} />
                      Fix & Re-forward
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              {(() => {
                const semMinDate = semesterConfigs.reduce((min, cfg) => {
                  if (!cfg.startDate) return min;
                  return !min || cfg.startDate < min ? cfg.startDate : min;
                }, null);
                return (
                  <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                    min={semMinDate || undefined}
                    max={new Date().toISOString().split('T')[0]}
                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-white/15 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 [color-scheme:dark]" />
                );
              })()}
              <span className="text-[11px] font-bold text-blue-200 bg-white/10 px-2.5 py-1.5 rounded-lg">
                {new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              {attendanceDateOutsideSemester && (
                <span className="text-[10px] font-bold text-rose-300 bg-rose-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-rose-400/30">
                  <AlertCircle size={12} /> Outside Semester Range
                </span>
              )}
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
          ) : attendanceDateIsHoliday ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <Calendar size={28} />
              </div>
              <p className="text-lg font-bold text-rose-700">Holiday</p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {attendanceDateEvents.filter(e => e.type === 'Holiday').map(ev => (
                  <span key={ev.id} className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 text-xs font-bold rounded-full border border-rose-200">
                    {ev.title}
                  </span>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mt-2">No classes — Academic Calendar holiday.</p>
            </div>
          ) : attendanceDateOutsideSemester ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={28} />
              </div>
              <p className="text-lg font-bold text-rose-700">Outside Semester Range</p>
              <p className="text-xs text-zinc-400 mt-2">This date is not within any configured semester period. Attendance cannot be marked.</p>
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
                          {row.isEvent ? (
                            <>
                              <span className="text-xs font-semibold text-amber-700">- (Event)</span>
                              {row.subjectName && <span className="text-[10px] text-amber-500 font-medium truncate max-w-[180px]">{row.subjectName}</span>}
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-semibold text-zinc-800">{row.code}</span>
                              {row.subjectName && <span className="text-[10px] text-zinc-400 truncate max-w-[180px]">{row.subjectName}</span>}
                            </>
                          )}
                          {row.subFound && !row.isEvent && (
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
                const stat = getQPWorkflowStatus(qp);
                const StatusIcon = stat.icon;
                return (
                  <div key={`${qp.compositeKey}-${qp.id}`}
                    className="px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-bold text-zinc-800">{(() => { const p = parseSubjectField(qp.subject); return p.code || qp.subject; })()}</span>
                          {(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })() && (
                            <>
                              <span className="text-[10px] text-zinc-300">•</span>
                              <span className="text-xs font-semibold text-zinc-600 leading-snug">{(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })()}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 rounded-lg ${stat.bg} ${stat.text} px-2 py-0.5 text-[10px] font-bold border border-transparent`}>
                            <StatusIcon size={10} /> {stat.label}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold border border-blue-100">
                            <FileText size={10} /> {qp.exam_name || qp.qpaper_name} ({formatQPSetDisplay(qp)})
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
                          {qp.allocated && qp.allocatedTo && (
                            (() => {
                              const timeReached = isExamTimeReached(
                                qp.allocatedTo.examDate,
                                qp.allocatedTo.startTime,
                                qp.allocatedTo.session
                              );
                              return timeReached ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 text-emerald-950 px-2 py-0.5 text-[10px] font-black border border-emerald-300">
                                  <Unlock size={10} className="text-emerald-700" /> Allocated & Released ({qp.allocatedTo.examDate})
                                </span>
                              ) : null;
                            })()
                          )}
                        </div>
                        {qp.status === 'forwarded' && (
                          <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-zinc-700 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 w-fit">
                            <span className="text-zinc-500 font-semibold">Current Status Level:</span>
                            {qp.ac_approved ? (
                              <span className="text-purple-700 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
                                Waiting for HOD Approval
                              </span>
                            ) : (
                              <span className="text-blue-700 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                                Waiting for Academic Coordinator Review
                              </span>
                            )}
                          </div>
                        )}
                        {qp.status === 'approved_by_hod' && (
                          <div className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3 py-1.5 w-fit">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            <span>Approved by HOD & Workflow Completed</span>
                          </div>
                        )}
                        {qp.status === 'recorrected' && qp.hod_comments && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">{qp.hod_comments}</p>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
                          className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-all shadow-sm active:scale-95"
                          title="Open"
                        >
                          <Eye size={16} />
                        </button>
                        {canEditQp(qp) && (
                          <button
                            onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}&set=${encodeURIComponent(formatQPSetDisplay(qp))}`)}
                            className="p-2 rounded-lg bg-[#120c7a]/10 border border-[#120c7a]/20 text-[#120c7a] hover:bg-[#120c7a]/20 transition-all shadow-sm active:scale-95"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {canEditQp(qp) && (
                          <button
                            onClick={() => handleDeleteQp(qp)}
                            disabled={deletingQp === `${qp.compositeKey}-${qp.id}`}
                            className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete"
                          >
                            {deletingQp === `${qp.compositeKey}-${qp.id}` ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* QP Review Modal (Read-Only) */}
      {showQPModal && selectedQP && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-[#120c7a]/10 p-2.5 rounded-xl text-[#120c7a]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">
                    {(() => {
                      const examName = (selectedQP.exam_name || '').trim();
                      const qpaperName = (selectedQP.qpaper_name || '').trim();
                      const label = examName || qpaperName || 'Question Paper';
                      return `${label} (${formatQPSetDisplay(selectedQP)})`;
                    })()}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {(() => { const p = parseSubjectField(selectedQP.subject); return p.code || selectedQP.subject; })()} &middot; {(() => { const p = parseSubjectField(selectedQP.subject); return p.name || selectedQP.subject_name; })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEditQp(selectedQP) && (
                  <button
                    onClick={() => { setShowQPModal(false); navigate(`/question-paper-generator?id=${selectedQP.id}&compositeKey=${selectedQP.compositeKey}&set=${encodeURIComponent(formatQPSetDisplay(selectedQP))}`); }}
                    className="inline-flex items-center gap-2 bg-[#120c7a] hover:bg-[#0f0a66] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    <Edit2 size={16} /> Edit Paper
                  </button>
                )}
                <button onClick={() => { setShowQPModal(false); setSelectedQP(null); }}
                  className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              <style>{`
                .qp-print-wrapper { font-family: 'Times New Roman', serif !important; font-size: 12px !important; }
                .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; font-size: 12px; }
                .qp-print-wrapper .logo-img { max-width: 100%; width: 754px !important; height: 60px !important; object-fit: contain; }
                .qp-print-wrapper p { margin: 0 0 5px 0; }
              `}</style>
              {selectedQP.allocated && !isExamTimeReached(selectedQP.allocatedTo?.examDate, selectedQP.allocatedTo?.startTime, selectedQP.allocatedTo?.session) && selectedQP.created_by !== currentUid ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white rounded-2xl p-8 border border-amber-200 shadow-sm max-w-xl mx-auto my-12">
                  <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto border border-amber-300">
                    <Lock size={32} />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-slate-900">Question Paper Time-Locked</h4>
                    <p className="text-sm font-semibold text-amber-900 mt-1 max-w-md mx-auto">
                      This official examination paper has been allocated by the Exam Cell for the exam on{' '}
                      <span className="font-black underline">{selectedQP.allocatedTo?.examDate}</span> at{' '}
                      <span className="font-black underline">{selectedQP.allocatedTo?.startTime || '09:30 AM'}</span>.
                    </p>
                    <p className="text-xs text-slate-500 mt-3 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      🔒 Paper contents will be automatically unlocked and viewable on the exam date at start time.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white shadow-xl mx-auto qp-print-wrapper rounded-xl"
                  style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}>
                  <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(fullQPForModal || selectedQP) }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
