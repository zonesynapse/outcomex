import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, getDoc, getDocs, setDoc, onSnapshot, collection, deleteField, query, where, documentId } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  CalendarCheck2,
  ChevronDown,
  Search,
  Download,
  Users,
  AlertCircle,
  FileX,
  Save,
  Calendar,
  FileText,
  FileSpreadsheet,
  X,
  Minus
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { fetchAllCourseNamesMap, getCourseName } from "../utils/courseUtils";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay, getAttendanceRecords, parseStudentAttendanceVal, getAllCandidateAttendanceDocIds, prepareAttendancePayload, normalizeDateStr, smartMergeStudentsMap } from "../lib/utils";
import useUnsavedChanges from "../hooks/useUnsavedChanges";

// Local sanitizeKey — does NOT replace spaces/slashes (matches doc IDs created by HODRoleConfig, MarkEntry, etc.)
function sanitizeKey(key) {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
}

function extractPureDate(key) {
  if (!key) return '';
  const str = String(key).trim();
  const m = str.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
  if (m) return normalizeDateStr(m[1]);
  if (str.includes('_P')) return normalizeDateStr(str.slice(0, str.lastIndexOf('_P')));
  if (str.includes('_p')) return normalizeDateStr(str.slice(0, str.lastIndexOf('_p')));
  if (str.includes('_')) return normalizeDateStr(str.split('_')[0]);
  return normalizeDateStr(str);
}

// Helper functions (adapted from TimetableSetup.jsx)
function formatTime(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return new Date(1970, 0, 1, h, m, 0);
}

console.log('[Attendance] build r9 — module-level admissions bridge, per-run load log');

// Module-level approved_admissions bridge cache. Deliberately outside the
// component: async continuations here touch no per-run closures, so rapid
// filter changes / HMR swaps can never produce stale-scope ReferenceErrors.
let admissionsPairCache = null;
let admissionsPairPromise = null;
function ensureAdmissionsPairs() {
  if (admissionsPairCache) return Promise.resolve(admissionsPairCache);
  if (!admissionsPairPromise) {
    admissionsPairPromise = getDocs(collection(db, 'approved_admissions'))
      .then(snap => {
        const pairs = {};
        snap.forEach(d => {
          const a = d.data() || {};
          const r = a.regNo || a.reg || a.registerNo || a.register_number;
          const ad = a.admissionNo || a.admNo || a.adm_no || a.admission_no || a.examNo || a.applicationNo;
          const rx = String(r || '').trim(), ax = String(ad || '').trim();
          if (rx && ax && rx !== ax) { if (!pairs[ax]) pairs[ax] = rx; if (!pairs[rx]) pairs[rx] = ax; }
        });
        admissionsPairCache = pairs;
        return pairs;
      })
      .catch(e => {
        console.warn('[Attendance] approved_admissions index build failed:', e);
        admissionsPairPromise = null;
        return {};
      });
  }
  return admissionsPairPromise;
}

export default function Attendance() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  const [currentUid, setCurrentUid] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProgramme, setUserProgramme] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [facultyAssignPrefixes, setFacultyAssignPrefixes] = useState([]);

  // Only elevated roles (Admin/Principal) see ALL programmes/departments/subjects.
  // Any other role — including custom roles created in AdminRoleConfig (which default
  // to Faculty behavior) — is scoped to their own department & assigned subjects.
  const isElevatedRole = useMemo(() => userRole === 'Admin' || userRole === 'Principal', [userRole]);

  // Filter States
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [subjectContexts, setSubjectContexts] = useState([]); // Stores mapping contexts for subjects

  const [semesters, setSemesters] = useState([]);
  const [section, setSection] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState("");
  const [periods, setPeriods] = useState([]);
  const [totalConducted, setTotalConducted] = useState("");

  const [timetableConfig, setTimetableConfig] = useState(null);
  const [availablePeriodsWithTiming, setAvailablePeriodsWithTiming] = useState([]);
  // Real-time clock for period locking
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Get current user identity
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUid(user.uid);
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const userData = snap.data();
          setUserRole(userData.role);
          setUserProgramme(userData.programme || "");
          setUserDepartment(userData.department || "");
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid || !userRole) return;
    let unsubscribeAssignments = null;
    if (!isElevatedRole) {
      const assignmentsRef = collection(db, "subject_assignments");
      unsubscribeAssignments = onSnapshot(assignmentsRef, (assignSnap) => {
        const prefixes = [];
        assignSnap.forEach(d => {
          if (d.data()?.[currentUid]) {
            const yearMatch = d.id.match(/\d{4}-\d{4}/);
            if (yearMatch && yearMatch.index >= 2) {
              prefixes.push(d.id.slice(0, yearMatch.index - 1));
            }
          }
        });
        setFacultyAssignPrefixes(prefixes);
      }, (error) => {
        console.error('[Attendance] subject_assignments listener error:', error);
      });
    }
    return () => {
      if (unsubscribeAssignments) unsubscribeAssignments();
    };
  }, [currentUid, userRole, isElevatedRole]);

  // Data States
  const [attendanceData, setAttendanceData] = useState(null);
  const [students, setStudents] = useState([]);
  const [masterList, setMasterList] = useState({});
  const [sectionIndex, setSectionIndex] = useState({});
  const [idMapExtra, setIdMapExtra] = useState({});
  // Guards the fetchData pipeline: stale overlapping runs + safety timeout
  const fetchRunRef = useRef(0);
  const [facultyNames, setFacultyNames] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState(null); // { absent: [], od: [], notMarked: [] }
  const [searchTerm, setSearchTerm] = useState("");

  const idMap = useMemo(() => {
    const map = {};
    Object.entries(sectionIndex).forEach(([admNo, info]) => {
      if (typeof info === 'object' && info !== null) {
        if (info.regNo) {
          map[admNo] = info.regNo;
          map[info.regNo] = admNo;
        }
        if (info.admissionNo) {
          map[info.admissionNo] = info.regNo || admNo;
          if (info.regNo) map[info.regNo] = info.admissionNo;
        }
      }
    });
    // Extra pairs (master-list objects, approved_admissions) fill gaps only
    Object.entries(idMapExtra).forEach(([k, v]) => {
      if (v && !map[k]) map[k] = v;
    });
    return map;
  }, [sectionIndex, idMapExtra]);

  // Comprehensive alias set for every student in the roster
  const studentAliasesMap = useMemo(() => {
    const map = {};
    const normClean = str => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const addAlias = (canonical, val) => {
      if (!canonical || !val) return;
      const s = String(val).trim();
      if (!s) return;
      if (!map[canonical]) map[canonical] = new Set();
      map[canonical].add(s);
      map[canonical].add(s.toLowerCase());
      const clean = normClean(s);
      if (clean) map[canonical].add(clean);
      const numOnly = s.replace(/\D/g, '');
      if (numOnly) {
        map[canonical].add(numOnly);
        const withoutLeadingZeros = numOnly.replace(/^0+/, '');
        if (withoutLeadingZeros) map[canonical].add(withoutLeadingZeros);
      }
    };

    // 1. Seed with masterList keys and student properties
    Object.entries(masterList || {}).forEach(([key, val]) => {
      if (key.startsWith('_')) return;
      addAlias(key, key);
      if (val && typeof val === 'object') {
        const r = val.regNo || val.reg || val.registerNo || val.register_number || val.reg_no;
        const ad = val.admissionNo || val.admNo || val.adm_no || val.admission_no || val.examNo || val.applicationNo;
        const ro = val.rollNo || val.roll_no;
        const nm = val.name || val.studentName;
        if (r) addAlias(key, r);
        if (ad) addAlias(key, ad);
        if (ro) addAlias(key, ro);
        if (nm) addAlias(key, nm);
      }
      if (idMap[key]) addAlias(key, idMap[key]);
      if (idMapExtra[key]) addAlias(key, idMapExtra[key]);
    });

    // 2. Correlate with sectionIndex (e.g. admissionNo ↔ regNo)
    Object.entries(sectionIndex || {}).forEach(([admNo, info]) => {
      if (info && typeof info === 'object') {
        const r = info.regNo || info.reg;
        const ad = info.admissionNo || admNo;
        const ro = info.rollNo;
        const nm = info.name;
        Object.keys(map).forEach(canonical => {
          const set = map[canonical];
          if (
            set.has(String(admNo).trim()) ||
            set.has(normClean(admNo)) ||
            (r && (set.has(String(r).trim()) || set.has(normClean(r)))) ||
            (ad && (set.has(String(ad).trim()) || set.has(normClean(ad))))
          ) {
            if (r) addAlias(canonical, r);
            if (ad) addAlias(canonical, ad);
            if (ro) addAlias(canonical, ro);
            if (nm) addAlias(canonical, nm);
          }
        });
      }
    });

    return map;
  }, [masterList, idMap, idMapExtra, sectionIndex]);

  const getStudentData = useCallback((studentsMap, id) => {
    if (!studentsMap || !id) return undefined;

    let mapObj = studentsMap;
    if (typeof mapObj === 'string') {
      try { mapObj = JSON.parse(mapObj); } catch { return undefined; }
    }
    if (!mapObj || typeof mapObj !== 'object') return undefined;

    if (mapObj.students && typeof mapObj.students === 'object') {
      mapObj = mapObj.students;
    }

    const normClean = str => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const targetId = String(id).trim().toLowerCase();
    const targetClean = normClean(id);
    const altId = idMap[id] ? String(idMap[id]).trim().toLowerCase() : '';
    const altClean = idMap[id] ? normClean(idMap[id]) : '';

    const aliasSet = studentAliasesMap[id] || new Set([targetId, targetClean, altId, altClean].filter(Boolean));

    // Last-resort suffix match: record keys like "REG420725205001" vs roster
    // "420725205001" (affix difference ≤ 4 chars, ≥ 6-char overlap).
    const idTargets = [targetClean, altClean].filter(t => t && t.length >= 6);
    const endsWithIdMatch = (candidate) => {
      const c = normClean(candidate);
      if (!c || c.length < 6) return false;
      return idTargets.some(t => {
        if (c === t) return true;
        if (Math.abs(c.length - t.length) > 4) return false;
        return c.endsWith(t) || t.endsWith(c);
      });
    };

    // 1. If studentsMap is an Array: [ { reg, status }, ... ]
    if (Array.isArray(mapObj)) {
      const match = mapObj.find(item => {
        if (!item) return false;
        const itemReg = String(
          item.reg || item.regNo || item.registerNo || item.register_number ||
          item.reg_no || item.admNo || item.admissionNo || item.adm_no ||
          item.admission_no || item.studentId || item.student_id ||
          item.rollNo || item.roll_no || item.id || ''
        ).trim().toLowerCase();
        const itemClean = normClean(itemReg);
        const itemName = String(item.name || item.studentName || '').trim().toLowerCase();

        return itemReg === targetId || (altId && itemReg === altId) ||
          (targetClean && itemClean === targetClean) ||
          (altClean && itemClean === altClean) ||
          aliasSet.has(itemReg) || aliasSet.has(itemClean) ||
          endsWithIdMatch(itemReg) || endsWithIdMatch(itemClean) ||
          (itemName && aliasSet.has(itemName));
      });
      return match || undefined;
    }

    // 2. If studentsMap is an Object: { "420725104001": ... }
    if (typeof mapObj === 'object') {
      // Gather candidates in priority order, then prefer the first entry that
      // actually parses — skips null shells / junk so dual-ID copies resolve.
      const candidates = [];
      if (mapObj[id] !== undefined) candidates.push(mapObj[id]);
      if (idMap[id] && mapObj[idMap[id]] !== undefined && !candidates.includes(mapObj[idMap[id]])) candidates.push(mapObj[idMap[id]]);

      // Check all aliases
      for (const a of aliasSet) {
        if (mapObj[a] !== undefined && !candidates.includes(mapObj[a])) candidates.push(mapObj[a]);
      }
      for (const v of candidates) {
        if (v !== null && v !== undefined && parseStudentAttendanceVal(v) !== null) return v;
      }

      const keys = Object.keys(mapObj);
      const testKey = (k) => {
        const normK = String(k).trim().toLowerCase();
        const cleanK = normClean(k);
        return normK === targetId || (altId && normK === altId) ||
          (targetClean && cleanK === targetClean) ||
          (altClean && cleanK === altClean) ||
          aliasSet.has(normK) || aliasSet.has(cleanK) ||
          endsWithIdMatch(k);
      };
      const matchedKey = keys.find(testKey);
      if (matchedKey) {
        const v = mapObj[matchedKey];
        if (v !== null && v !== undefined && parseStudentAttendanceVal(v) !== null) return v;
        // Same key is a null/junk shell — scan remaining twin keys for a parseable one
        for (const k of keys) {
          if (k === matchedKey) continue;
          if (!testKey(k)) continue;
          const vv = mapObj[k];
          if (vv !== null && vv !== undefined && parseStudentAttendanceVal(vv) !== null) return vv;
        }
        return v;
      }
      if (candidates.length) return candidates[0];

      // Deep value check for object values containing regNo, admissionNo, or name
      for (const k of keys) {
        const val = mapObj[k];
        if (val && typeof val === 'object') {
          const r = String(val.regNo || val.reg || val.registerNo || '').trim().toLowerCase();
          const ad = String(val.admissionNo || val.admNo || '').trim().toLowerCase();
          const nm = String(val.name || val.studentName || '').trim().toLowerCase();
          if (
            (r && aliasSet.has(r)) ||
            (ad && aliasSet.has(ad)) ||
            (nm && aliasSet.has(nm))
          ) {
            return val;
          }
        }
      }
    }

    return undefined;
  }, [idMap, studentAliasesMap]);

  const findRecordForPeriod = useCallback((recordsObj, dateStr, periodVal) => {
    if (!recordsObj || !dateStr || !periodVal) return null;
    const normTargetDate = normalizeDateStr(dateStr);
    const targetP = String(periodVal).trim();
    const exactKey = `${normTargetDate}_P${targetP}`;
    if (recordsObj[exactKey]) return recordsObj[exactKey];
    if (recordsObj[`${dateStr}_P${periodVal}`]) return recordsObj[`${dateStr}_P${periodVal}`];

    const keys = Object.keys(recordsObj);
    const match = keys.find(k => {
      const kDate = extractPureDate(k);
      if (kDate !== normTargetDate && !k.startsWith(dateStr) && !k.startsWith(normTargetDate)) return false;
      const m = k.match(/_+[pP](\d+)/i) || k.match(/_(\d+)$/);
      if (m && String(parseInt(m[1], 10)) === targetP) return true;
      const rest = k.replace(kDate, '').replace(/^[_ -]+/, '').toLowerCase();
      return rest === `p${targetP}` || rest === targetP || rest === `period${targetP}` || rest === `p0${targetP}`;
    });

    return match ? recordsObj[match] : null;
  }, []);

  // Per-date record states
  const [recordDates, setRecordDates] = useState([]);
  const [currentRecordData, setCurrentRecordData] = useState(null);
  const [topicTaught, setTopicTaught] = useState("");
  const [teachingAid, setTeachingAid] = useState("");
  const [teachingMethodology, setTeachingMethodology] = useState("");

  // Event attendance fields (not counted toward subject)
  const [isEventAttendance, setIsEventAttendance] = useState(false);
  const [eventName, setEventName] = useState("");

  // Cross-subject period conflict detection
  const [periodConflict, setPeriodConflict] = useState(null); // { subjectCode, markedBy }

  // Record-vs-roster mismatch diagnostics (record exists but no roster IDs resolve)
  const [recordNotice, setRecordNotice] = useState(null); // { type: 'mismatch', recordKeys, rosterSample, date, period }
  // Enrolment-vs-namelist series divergence warning
  const [enrolWarn, setEnrolWarn] = useState(null); // { subject, count }
  // Namelist missing — roster rebuilt from attendance records
  const [rosterFallback, setRosterFallback] = useState(null); // { count }
  // Load pipeline diagnostics (shown when roster resolves empty)
  const [loadInfo, setLoadInfo] = useState(null);
  // Attendance source docs found for this class (doc ID + contained record keys)
  const [recordSources, setRecordSources] = useState([]);

  // Warn on accidental reload/close while marking attendance
  const isAttendanceDirty = useMemo(() => {
    return students.some(s => !!s.status) || !!topicTaught.trim();
  }, [students, topicTaught]);
  useUnsavedChanges(isAttendanceDirty);

  // Report states
  const [showReport, setShowReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showReportDataModal, setShowReportDataModal] = useState(false);
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportData, setReportData] = useState(null);
  const [searchParams] = useSearchParams();
  const urlSectionRef = useRef('');
  const urlDeptRef = useRef('');
  const urlSubjRef = useRef('');
  const urlPeriodRef = useRef('');

  useEffect(() => {
    const prog = searchParams.get('prog');
    const dept = searchParams.get('dept');
    const bat = searchParams.get('batch');
    const ay = searchParams.get('ay');
    const sem = searchParams.get('sem');
    const subj = searchParams.get('subject');
    const date = searchParams.get('date');
    const periodVal = searchParams.get('period');
    const sec = searchParams.get('section');
    urlSectionRef.current = sec || '';
    urlDeptRef.current = dept || '';
    urlSubjRef.current = subj || '';
    urlPeriodRef.current = periodVal || '';
    if (prog) setProgramme(prog);
    if (dept) setDepartment(dept);
    if (bat) setBatch(bat);
    if (ay) setAcademicYear(ay);
    if (sem) {
      const s = parseInt(sem, 10);
      setSemester(`${getOrdinal(s)} Semester`);
    }
    if (sec) setSection(sec);
    if (date) setAttendanceDate(date);
    if (periodVal) {
      setPeriod(periodVal);
      setPeriods(prev => [...new Set([...prev, periodVal])]);
    }
    if (subj && prog && dept && bat && ay && sem) {
      setSubject(JSON.stringify({ code: subj, batch: bat, ay, sem, section: sec || '', dept: sanitizeKey(dept), progKey: prog }));
    }
  }, []);

  const derivedProgs = useMemo(() => {
    if (!facultyAssignPrefixes.length) return [];
    const progs = new Set();
    Object.keys(PROGRAMME_DEPARTMENTS).forEach(prog => {
      const progKey = formatProgrammeKey(prog);
      if (facultyAssignPrefixes.some(p => p.startsWith(progKey))) {
        progs.add(progKey);
      }
    });
    return Array.from(progs);
  }, [facultyAssignPrefixes, PROGRAMME_DEPARTMENTS]);

  const filteredProgrammes = useMemo(() => {
    return Object.keys(PROGRAMME_DEPARTMENTS).filter(prog => {
      if (isElevatedRole) return true;
      const progKey = formatProgrammeKey(prog);
      if (userRole === 'HOD' && formatProgrammeKey(userProgramme) === progKey) return true;
      return derivedProgs.includes(progKey);
    });
  }, [userRole, userProgramme, derivedProgs, PROGRAMME_DEPARTMENTS, isElevatedRole]);

  const derivedDepts = useMemo(() => {
    if (!facultyAssignPrefixes.length || !programme) return [];
    const progKey = formatProgrammeKey(programme);
    const depts = new Set();
    facultyAssignPrefixes.forEach(prefix => {
      if (prefix.startsWith(progKey)) {
        depts.add(prefix.slice(progKey.length).trim());
      }
    });
    return Array.from(depts);
  }, [facultyAssignPrefixes, programme]);

  const filteredDepartments = useMemo(() => {
    const depts = PROGRAMME_DEPARTMENTS[formatProgrammeKey(programme)] || [];
    if (isElevatedRole) return depts;
    const progKey = formatProgrammeKey(programme);
    const allowedDepts = new Set();
    if (userRole === 'HOD' && formatProgrammeKey(userProgramme) === progKey && userDepartment) {
      allowedDepts.add(sanitizeKey(userDepartment).replace(/[_ ]+/g, ' ').trim());
    }
    const normalizedDepts = derivedDepts.map(d => d.replace(/[_ ]+/g, ' ').trim());
    normalizedDepts.forEach(d => allowedDepts.add(d));

    return depts.filter(dept => {
      const normDept = sanitizeKey(dept).replace(/[_ ]+/g, ' ').trim();
      return Array.from(allowedDepts).some(d => d === normDept || d.includes(normDept) || normDept.includes(d));
    });
  }, [programme, userRole, derivedDepts, userProgramme, userDepartment, PROGRAMME_DEPARTMENTS, isElevatedRole]);

  // Normalize department key (e.g. "B_E_Bio Medical Engineering" or "Computer_Science")
  // to display name (e.g. "B.E. Bio Medical Engineering" or "Computer Science")
  // once filteredDepartments has options, so the <select> value matches an option
  useEffect(() => {
    const rawDept = urlDeptRef.current;
    if (!rawDept || !programme) return;
    if (!filteredDepartments.length) return;
    const norm = s => s.replace(/[._ ]+/g, ' ').trim().toLowerCase();
    const match = filteredDepartments.find(d => norm(d) === norm(rawDept));
    if (match && match !== department) {
      setDepartment(match);
    }
  }, [filteredDepartments, programme]);

  const batches = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    const suffix = (s[(v - 20) % 10] || s[v] || s[0]);
    return n + suffix;
  };

  const aYears = useMemo(() => batch ? getAcademicYears(batch) : [], [batch]);

  const availableSections = useMemo(() => {
    if (!batch || !department || !programme) return [];
    const sections = new Set();

    const progKey = formatProgrammeKey(programme);
    const docId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}`;
    const cfg = sectionConfigs[docId];
    if (cfg && cfg.numSections) {
      const count = cfg.numSections;
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      for (let i = 0; i < count; i++) sections.add(`Sec-${letters[i]}`);
    }

    (subjectContexts || []).forEach(ctx => {
      if (ctx.section) sections.add(ctx.section);
    });

    if (section) sections.add(section);

    return Array.from(sections);
  }, [batch, department, programme, sectionConfigs, subjectContexts, section]);

  // Re-apply section from URL or auto-select single available section
  useEffect(() => {
    const sec = urlSectionRef.current;
    if (sec && availableSections.length > 0 && availableSections.includes(sec) && section !== sec) {
      setSection(sec);
    } else if (!section && availableSections.length === 1) {
      setSection(availableSections[0]);
    }
  }, [availableSections, programme, department, batch]);

  useEffect(() => {
    if (batch && academicYear) {
      const years = getAcademicYears(batch);
      const index = years.indexOf(academicYear);
      if (index >= 0) {
        const sem1 = (index * 2) + 1;
        const sem2 = (index * 2) + 2;
        const allSems = [sem1, sem2];
        setSemesters(allSems.map(num => `${getOrdinal(num)} Semester`));
      } else setSemesters([]);
    } else setSemesters([]);
  }, [batch, academicYear]);

  // Listen for section configurations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const configs = {};
      snap.forEach(docSnap => {
        configs[docSnap.id] = docSnap.data();
      });
      setSectionConfigs(configs);
    }, (error) => {
      console.warn('[Attendance] batch_sections listener error:', error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      const configs = [];
      snap.forEach(d => { configs.push({ id: d.id, ...d.data() }); });
      setSemesterConfigs(configs);
    }, (error) => {
      console.warn('[Attendance] semester_config listener error:', error);
    });
    return () => unsub();
  }, []);

  // Listen to users collection for faculty name resolution
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const map = {};
      snap.forEach(d => {
        const u = d.data();
        map[d.id] = u.facultyName || u.displayName || u.name || u.email || '';
      });
      setFacultyNames(map);
    }, (error) => {
      console.warn('[Attendance] users listener error:', error);
    });
    return () => unsub();
  }, []);

  const dateRangeInfo = useMemo(() => {
    if (!semesterConfigs.length) return { blocked: false, msg: '' };
    const selected = new Date(attendanceDate + 'T00:00:00');
    let minDate = null;
    let maxDate = null;
    let inRange = false;
    semesterConfigs.forEach(cfg => {
      if (!cfg.startDate || !cfg.endDate) return;
      const s = new Date(cfg.startDate + 'T00:00:00');
      const e = new Date(cfg.endDate + 'T00:00:00');
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
      if (selected >= s && selected <= e) inRange = true;
    });
    // If existing records exist on this date (e.g. July classes), never block viewing or updating
    const recs = getAttendanceRecords(attendanceData);
    const normDate = normalizeDateStr(attendanceDate);
    const hasRecordOnDate = Object.keys(recs).some(k => extractPureDate(k) === normDate);
    if (inRange || hasRecordOnDate) return { blocked: false, msg: '', minDate, maxDate };
    if (selected < minDate) {
      // Allow marking/viewing July classes before semester config start date with an advisory
      return { blocked: false, advisory: true, msg: 'Note: This date is before configured semester start date.', minDate, maxDate };
    }
    if (selected > maxDate) return { blocked: true, msg: 'This date is after the semester end date. Attendance cannot be marked after the semester ends.', minDate, maxDate };
    return { blocked: false, msg: '', minDate, maxDate };
  }, [semesterConfigs, attendanceDate, attendanceData]);

  // New Logic: Fetch subjects based on Programme and Department assignments
  useEffect(() => {
    if (!programme || !department || !currentUid || !userRole) return;

    const progKey = formatProgrammeKey(programme);
    const deptKey = sanitizeKey(department);
    const prefix = `${progKey}_${deptKey}_`;
    const assignmentsRef = collection(db, "subject_assignments");

    const unsubscribe = onSnapshot(assignmentsRef, async (snapshot) => {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const contexts = [];
      const batchesToFetchSyllabus = new Set();

      snapshot.docs.forEach(doc => {
        if (!doc.id.startsWith(prefix)) return;
        const remaining = doc.id.slice(prefix.length);
        const parts = remaining.split('_');
        let batch = parts[0];
        let ay = parts[1];
        let sem = parts[2];
        let secSuffix = '';

        const secPart = parts.find(p => /^Sec/i.test(p) || /^Section/i.test(p));
        if (secPart) {
          secSuffix = secPart;
        }

        // Prefer first 3 parts for batch/ay/sem (handles Sec parts in middle)
        const numericParts = parts.filter(p => /^\d{4}/.test(p) || /^\d+$/.test(p));
        if (numericParts.length >= 3) {
          batch = numericParts[0];
          ay = numericParts[1];
          sem = numericParts[2];
        }

        const data = doc.data();

        Object.entries(data).forEach(([uid, codes]) => {
          if (!isElevatedRole && uid !== currentUid) return;
          if (Array.isArray(codes)) {
            codes.forEach(code => {
              contexts.push({ code, batch, ay, sem, section: secSuffix, uid, dept: deptKey, progKey });
              if (batch) batchesToFetchSyllabus.add(batch);
            });
          }
        });
      });

      // Filter by active semester configs if available and non-empty
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeSemConfigs = semesterConfigs.filter(cfg => {
        if (!cfg.startDate || !cfg.endDate) return false;
        const start = new Date(cfg.startDate + 'T00:00:00');
        const end = new Date(cfg.endDate + 'T00:00:00');
        return today >= start && today <= end;
      });

      let filteredContexts = contexts;
      if (activeSemConfigs.length > 0) {
        const matched = contexts.filter(ctx => {
          return activeSemConfigs.some(cfg => {
            const batches = Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch];
            const batchMatch = batches.some(b => String(b) === String(ctx.batch));
            if (!batchMatch) return false;

            const semNumMatch = String(ctx.sem).match(/\d+/);
            const semNum = semNumMatch ? parseInt(semNumMatch[0], 10) : NaN;
            if (isNaN(semNum)) return true;

            const isContextOdd = semNum % 2 !== 0;
            const isConfigOdd = String(cfg.semesterType || 'Odd').toLowerCase() === 'odd';
            return cfg.programme === ctx.progKey
              && cfg.academicYear === ctx.ay
              && isContextOdd === isConfigOdd;
          });
        });
        // Safety Fallback: Use matched active contexts if present, otherwise fall back to all contexts
        if (matched.length > 0) {
          filteredContexts = matched;
        }
      }

      setSubjectContexts(filteredContexts);

      // Helper to build dropdown items synchronously or with course names map
      const buildItems = (map) => {
        const uniqueSubjectAssignments = [];
        const seenAssignments = new Set();
        filteredContexts.forEach(ctx => {
          const assignmentIdentifier = `${ctx.code}-${ctx.batch}-${ctx.ay}-${ctx.sem}-${ctx.section}`;
          if (!seenAssignments.has(assignmentIdentifier)) {
            const cName = map ? getCourseName(map, ctx.code, ctx.dept, ctx.progKey) : '';
            uniqueSubjectAssignments.push({
              value: JSON.stringify({ code: ctx.code, batch: ctx.batch, ay: ctx.ay, sem: ctx.sem, section: ctx.section, dept: ctx.dept, progKey: ctx.progKey }),
              text: cName ? `${ctx.code} - ${cName}${ctx.section ? ` (${ctx.section})` : ''}` : `${ctx.code}${ctx.section ? ` (${ctx.section})` : ''}`,
              code: ctx.code
            });
            seenAssignments.add(assignmentIdentifier);
          }
        });
        return uniqueSubjectAssignments;
      };

      const initialItems = buildItems(null);
      setSubjects(initialItems);

      // Auto-select subject from URL searchParams ONCE if provided and available
      const urlSubj = urlSubjRef.current;
      if (urlSubj && initialItems.length > 0) {
        const normSubj = norm(urlSubj);
        const match = initialItems.find(item => norm(item.code) === normSubj || norm(item.value).includes(normSubj));
        if (match) {
          urlSubjRef.current = '';
          handleSubjectChange(match.value, true);
        }
      }

      // Fetch course names in background and enrich labels asynchronously
      fetchAllCourseNamesMap()
        .then(namesMap => {
          const enrichedItems = buildItems(namesMap);
          setSubjects(enrichedItems);
          if (urlSubjRef.current && enrichedItems.length > 0) {
            const normSubj = norm(urlSubjRef.current);
            const match = enrichedItems.find(item => norm(item.code) === normSubj || norm(item.value).includes(normSubj));
            if (match) {
              urlSubjRef.current = '';
              handleSubjectChange(match.value, true);
            }
          }
        })
        .catch(e => {
          console.warn("[Attendance] Failed to fetch course names map:", e);
        });
    }, (error) => {
      console.warn('[Attendance] subject_assignments listener error:', error);
    });

    return () => unsubscribe();
  }, [programme, department, currentUid, userRole, getRegulationForBatch, getOrdinal, formatBatchDisplay, semesterConfigs, isElevatedRole]);

  const handleSubjectChange = (val, keepPeriods = false) => {
    setReportFromDate("");
    setReportToDate("");
    setReportData(null);
    if (!val) {
      setSubject("");
      setBatch("");
      setAcademicYear("");
      setSemester("");
      setSection("");
      setPeriods([]);
      setTopicTaught("");
      setTeachingAid("");
      setTeachingMethodology("");
      setIsEventAttendance(false);
      setEventName("");
      return;
    }
    setSubject(val);
    const selectedCtx = JSON.parse(val);
    setBatch(selectedCtx.batch);
    setAcademicYear(selectedCtx.ay);
    setSemester(`${getOrdinal(parseInt(selectedCtx.sem))} Semester`);
    setSection(selectedCtx.section || "");
    if (!keepPeriods) setPeriods([]);
    setIsEventAttendance(false);
    setEventName("");
  };

  const computePeriodStart = useCallback((i, config) => {
    if (!config || !config.startTime) return null;
    const start = parseTimeToDate(config.startTime);
    if (!start) return null;
    const t = new Date(start);
    for (let j = 1; j < i; j++) {
      const pd = parseInt(config.periodDurations[j] || 0, 10) || 0;
      t.setMinutes(t.getMinutes() + pd);
      (config.breaks || []).forEach(br => {
        const after = parseInt(br.after || 0, 10) || 0;
        const dur = parseInt(br.duration || 0, 10) || 0;
        if (after === j) t.setMinutes(t.getMinutes() + dur);
      });
      if (parseInt(config.lunchAfterPeriod || 0, 10) === j) t.setMinutes(t.getMinutes() + (parseInt(config.lunchDuration || 0, 10) || 0));
    }
    return t;
  }, []);

  const lockedPeriods = useMemo(() => {
    if (!timetableConfig || !attendanceDate) return new Set();
    const locked = new Set();
    const today = attendanceDate === new Date().toISOString().split('T')[0];
    if (!today) return locked;
    const periodsPerDay = parseInt(timetableConfig.periodsPerDay, 10) || 0;
    for (let i = 1; i <= periodsPerDay; i++) {
      const start = computePeriodStart(i, timetableConfig);
      if (!start) continue;
      const periodStartToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), start.getHours(), start.getMinutes(), 0);
      if (periodStartToday > now) locked.add(String(i));
    }
    const recordsObj = getAttendanceRecords(attendanceData);
    if (Object.keys(recordsObj).length > 0) {
      const todayPrefix = `${attendanceDate}_P`;
      locked.forEach(pVal => {
        if (recordsObj[`${todayPrefix}${pVal}`]) locked.delete(pVal);
      });
    }
    return locked;
  }, [timetableConfig, attendanceDate, now, computePeriodStart, attendanceData]);

  // The selected periods' record that actually holds student markings.
  // Empty record shells AND shells with zero parseable entries never trigger
  // false badges/locks.
  const markedPeriodRec = useMemo(() => {
    if (!periods.length) return null;
    const recs = getAttendanceRecords(attendanceData);
    const found = periods
      .map(p => findRecordForPeriod(recs, attendanceDate, p))
      .find(r => {
        const st = r?.students;
        if (!st) return false;
        const vals = Array.isArray(st) ? st : Object.values(st);
        if (vals.length === 0) return false;
        return vals.some(v => v !== null && v !== undefined && parseStudentAttendanceVal(v) !== null);
      });
    return found || null;
  }, [periods, attendanceData, attendanceDate, findRecordForPeriod]);

  useEffect(() => {
    const fetchTimetableConfig = async () => {
      if (!programme || !department || !batch || !academicYear || !semester) {
        setTimetableConfig(null);
        setAvailablePeriodsWithTiming(
          Array.from({ length: 8 }, (_, i) => ({
            value: String(i + 1),
            label: `Period ${i + 1}`
          }))
        );
        return;
      }

      const progKey = formatProgrammeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const ayKey = sanitizeKey(academicYear);
      const semNum = String(semester).match(/\d+/)?.[0] || "1";
      const compositeKey = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}`;
      const legacyCompositeKey = `${progKey}_${department.replace(/[.#$[\]]/g, '_')}_${batch.replace(/[.#$[\]]/g, '_')}_${academicYear.replace(/[.#$[\]]/g, '_')}_${semNum}`;

      try {
        let allocationSnap = await getDoc(doc(db, "timetable_allocations", compositeKey));
        if (!allocationSnap.exists() && legacyCompositeKey !== compositeKey) {
          allocationSnap = await getDoc(doc(db, "timetable_allocations", legacyCompositeKey));
        }
        if (allocationSnap.exists()) {
          const allocationData = allocationSnap.data();
          setTimetableConfig(allocationData);

          const periods = [];
          const periodsPerDay = Math.min(parseInt(allocationData.periodsPerDay, 10) || 8, 8);
          for (let i = 1; i <= periodsPerDay; i++) {
            const start = computePeriodStart(i, allocationData);
            const dur = parseInt(allocationData.periodDurations?.[i] || 0, 10) || 0;
            if (start && dur > 0) {
              const end = new Date(start);
              end.setMinutes(end.getMinutes() + dur);
              periods.push({
                value: String(i),
                label: `Period ${i} (${formatTime(start)} - ${formatTime(end)})`
              });
            } else {
              periods.push({
                value: String(i),
                label: `Period ${i} (Duration not set)`
              });
            }
          }
          setAvailablePeriodsWithTiming(periods);
        } else {
          setTimetableConfig(null);
          // Fallback to default periods 1-8 when no timetable exists
          setAvailablePeriodsWithTiming(
            Array.from({ length: 8 }, (_, i) => ({
              value: String(i + 1),
              label: `Period ${i + 1}`
            }))
          );
        }
      } catch (err) {
        console.error("Error fetching timetable config:", err);
        setTimetableConfig(null);
        setAvailablePeriodsWithTiming(
          Array.from({ length: 8 }, (_, i) => ({
            value: String(i + 1),
            label: `Period ${i + 1}`
          }))
        );
      }
    };
    fetchTimetableConfig();
  }, [department, batch, academicYear, semester]);

  // Populate available periods with timing — merged with fallback so dropdown is never empty
  useEffect(() => {
    if (!subject) {
      setAvailablePeriodsWithTiming([]);
      return;
    }
    // No timetable config yet → default 1-8 (was wrongly cleared to [] before)
    if (!timetableConfig) {
      setAvailablePeriodsWithTiming(
        Array.from({ length: 8 }, (_, i) => ({
          value: String(i + 1),
          label: `Period ${i + 1}`,
        }))
      );
      return;
    }
    const periodsList = timetableConfig.periods || [];
    // Legacy schema (periodsPerDay) — fetch effect already set it, but after dept switch prev may be [] 
    if (!periodsList.length) {
      setAvailablePeriodsWithTiming(prev => {
        if (prev.length) return prev;
        const n = Math.min(parseInt(timetableConfig.periodsPerDay, 10) || 8, 8);
        return Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: `Period ${i + 1}` }));
      });
      return;
    }

    let current = parseTimeToDate(timetableConfig.startTime || "09:00 AM");
    const activePeriods = [];
    let periodSeq = 0;
    const maxP = Math.min(parseInt(timetableConfig.periodsPerDay, 10) || 8, 8);
    periodsList.forEach((pObj) => {
      const duration = pObj.duration || 45;
      const pStart = current ? new Date(current) : null;
      const pEnd = pStart ? new Date(pStart.getTime() + duration * 60000) : null;
      if (current) current = pEnd;
      if (!pObj.isBreak) {
        periodSeq++;
        if (periodSeq <= maxP) {
          const pNum = String((pObj.periodNumber && Number(pObj.periodNumber) <= maxP) ? pObj.periodNumber : periodSeq);
          const timingStr = pStart && pEnd ? ` (${formatTime(pStart)} - ${formatTime(pEnd)})` : '';
          activePeriods.push({
            value: pNum,
            label: `Period ${pNum}${timingStr}`,
            timing: timingStr,
          });
        }
      }
    });
    if (activePeriods.length) setAvailablePeriodsWithTiming(activePeriods);
  }, [subject, timetableConfig]);

  // Fetch Attendance Data and Student List for selected filters
  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) {
      setAttendanceData(null);
      setStudents([]);
      setMasterList({});
      setRecordDates([]);
      setCurrentRecordData(null);
      setRecordNotice(null);
      setEnrolWarn(null);
      setRosterFallback(null);
      setLoadInfo(null);
      setRecordSources([]);
      return;
    }

    setLoading(true);
    const runId = ++fetchRunRef.current;
    // Safety net: never leave the page on an infinite spinner, even if a
    // read hangs or an unexpected error escapes the pipeline below.
    const safetyTimer = setTimeout(() => {
      if (fetchRunRef.current === runId) setLoading(false);
    }, 15000);
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    let selectedSubjectObj = null;
    try {
      selectedSubjectObj = JSON.parse(subject);
    } catch (parseErr) {
      console.error('[Attendance] Invalid subject value, cannot load:', subject);
      clearTimeout(safetyTimer);
      setLoading(false);
      return;
    }
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;

    const fetchData = async () => {
      try {
        const legacyCodes = Array.isArray(selectedSubjectObj?.legacy_codes) ? selectedSubjectObj.legacy_codes : [];
        const candidateDocIds = getAllCandidateAttendanceDocIds({
          programme,
          department,
          batch,
          academicYear,
          semester,
          subjectCode: selectedSubjectObj.code,
          legacyCodes,
          section
        });

        // Section-priority fetch: when Sec-A selected, prefer Sec-A doc; base doc (no section) only if Sec-A has no data — prevents 45 vs 30 double-count
        const secCleanKey = section ? sanitizeKey(section) : '';
        const isSecCandidate = id => secCleanKey && String(id).endsWith(`_${secCleanKey}`);
        const withSecIds = secCleanKey ? candidateDocIds.filter(isSecCandidate) : [];
        const withoutSecIds = secCleanKey ? candidateDocIds.filter(id => !isSecCandidate(id)) : candidateDocIds;

        let mergedMeta = {};
        let mergedRecords = {};
        let hasSecData = false;

        // Normalized class key: same class saved under different key casings
        // (2026-07-10_P3 vs 2026-07-10_p3) or legacy date-only keys collapses to
        // one entry, so base + Sec-A docs merge without double-counting.
        const seenNormKeys = new Set();
        const legacyByDate = new Map();
        const compoundDates = new Set();
        const normRecKey = (rk) => {
          const s = String(rk || '');
          const m = s.match(/^(.*?)_+[pP](\d+)\s*$/);
          if (m) {
            return { nk: `${m[1].trim().toLowerCase()}__p${parseInt(m[2], 10)}`, isCompound: true, date: m[1].trim().toLowerCase() };
          }
          return { nk: `legacy__${s.trim().toLowerCase()}`, isCompound: false, date: s.trim().toLowerCase() };
        };

        const processDocData = (data) => {
          if (!data) return;
          if (data._meta) {
            mergedMeta = { ...data._meta, ...mergedMeta };
          }
          const docRecords = getAttendanceRecords(data);
          Object.entries(docRecords).forEach(([rk, rVal]) => {
            const { nk, isCompound, date } = normRecKey(rk);
            if (seenNormKeys.has(nk)) {
              // Same class already merged (Sec-A wins as primary), but preserve any students from base/legacy docs
              const existingRk = Object.keys(mergedRecords).find(k => normRecKey(k).nk === nk);
              if (existingRk && mergedRecords[existingRk]) {
                mergedRecords[existingRk].students = smartMergeStudentsMap(mergedRecords[existingRk].students, rVal.students);
              }
              return;
            }
            if (isCompound) {
              // A period-specific record supersedes any legacy date-only entry for the same date
              if (legacyByDate.has(date)) {
                const oldRk = legacyByDate.get(date);
                delete mergedRecords[oldRk];
                seenNormKeys.delete(`legacy__${date}`);
                legacyByDate.delete(date);
              }
              compoundDates.add(date);
            } else {
              if (compoundDates.has(date)) return; // legacy duplicate of an existing period record
              legacyByDate.set(date, rk);
            }
            seenNormKeys.add(nk);
            if (!mergedRecords[rk]) {
              mergedRecords[rk] = rVal;
            } else {
              mergedRecords[rk] = {
                ...rVal,
                ...mergedRecords[rk],
                students: smartMergeStudentsMap(mergedRecords[rk].students, rVal.students)
              };
            }
          });
        };

        // Capped chunked fetch: the candidate permutation space is huge (tens of
        // thousands of IDs) — firing getDoc for all of them hangs the page.
        // Fetch in small chunks and stop once a full chunk adds no new records
        // (cap 240 reads worst case). Runs in two phases so base (no-section)
        // docs always merge after Sec-A docs (Sec-A wins ties in processDocData).
        const CHUNK = 40;
        const PROBE = 12;
        const MAX_READS_PER_PHASE = 160;
        // Source-doc tracker: which attendance doc contributed which record keys
        const docHits = [];
        const fetchChunk = async (chunk) => {
          const snaps = await Promise.allSettled(chunk.map(id => getDoc(doc(db, "attendance", id))));
          snaps.forEach((result, ci) => {
            if (result.status === 'fulfilled' && result.value && result.value.exists()) {
              const rec = getAttendanceRecords(result.value.data());
              const keys = Object.keys(rec);
              if (keys.length) docHits.push({ id: chunk[ci], keys });
              processDocData(result.value.data());
            }
          });
        };
        const fetchIds = async (ids) => {
          let fetchedCount = 0;
          // Fast probe: canonical + closest variants first (usually hits in 1 round trip)
          const probe = ids.slice(0, PROBE);
          fetchedCount += probe.length;
          await fetchChunk(probe);
          for (let i = PROBE; i < ids.length && fetchedCount < MAX_READS_PER_PHASE; i += CHUNK) {
            const before = Object.keys(mergedRecords).length;
            const chunk = ids.slice(i, i + CHUNK);
            fetchedCount += chunk.length;
            await fetchChunk(chunk);
            const after = Object.keys(mergedRecords).length;
            // Stop early: records found and this whole chunk added nothing new.
            // Same-class duplicates collapse inside processDocData, so later,
            // increasingly exotic permutations cannot add anything.
            if (after > 0 && after === before) break;
          }
        };
        if (secCleanKey) {
          await fetchIds(withSecIds);
          await fetchIds(withoutSecIds);
        } else {
          await fetchIds(candidateDocIds);
        }
        setRecordSources(docHits);

        let studentSnap = await getDoc(doc(db, "students", compositeKey));
        if (!studentSnap.exists() && sectionSuffix) {
          const baseKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
          studentSnap = await getDoc(doc(db, "students", baseKey));
        }

        const attData = {
          _meta: mergedMeta,
          records: mergedRecords
        };

        let rawMaster = studentSnap.data() || {};
        // Load diagnostics: why the roster may resolve empty (shown on screen)
        const dbg = {
          docFound: !!studentSnap?.exists(),
          docId: studentSnap?.exists() ? studentSnap.id : compositeKey,
          preKeys: Object.keys(rawMaster).filter(k => !k.startsWith('_')).length,
          enrol: 'no enrolment doc',
          derived: 0,
          records: Object.keys(mergedRecords).length,
        };
        setAttendanceData(attData);

        // Fetch student_section_index for dual-ID lookup (admissionNo ↔ regNo) — merge Sec-A + base so base attendance records (14) resolve regNo correctly
        let secIdxData = {};
        try {
          const secIdxSnap = await getDoc(doc(db, 'student_section_index', compositeKey));
          if (secIdxSnap.exists()) {
            secIdxData = { ...secIdxSnap.data() };
          }
          if (sectionSuffix) {
            const baseSecKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
            const baseSecSnap = await getDoc(doc(db, 'student_section_index', baseSecKey));
            if (baseSecSnap.exists()) {
              secIdxData = { ...baseSecSnap.data(), ...secIdxData };
            }
          }
        } catch (e) {
          console.warn('[Attendance] student_section_index load error:', e);
        }
        setSectionIndex(secIdxData);

        // Filter master list by section enrolment if course_enrolments exists for this course
        try {
          const enrolDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}${sectionSuffix}`;
          let enrolSnap = await getDoc(doc(db, 'course_enrolments', enrolDocId));
          if (!enrolSnap.exists() && sectionSuffix) {
            const baseEnrolId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}`;
            enrolSnap = await getDoc(doc(db, 'course_enrolments', baseEnrolId));
          }
          if (!enrolSnap.exists() && legacyCodes.length > 0) {
            for (const legacyCode of legacyCodes) {
              const legEnrolId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${sanitizeKey(legacyCode)}${sectionSuffix}`;
              const legSnap = await getDoc(doc(db, 'course_enrolments', legEnrolId));
              if (legSnap.exists()) {
                enrolSnap = legSnap;
                break;
              }
            }
          }
          if (enrolSnap.exists()) {
            const enrolledData = enrolSnap.data();
            const normId = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const enrolledKeys = new Set(Object.keys(enrolledData).filter(k => enrolledData[k] && !k.startsWith('_')));
            const enrolledNorm = new Set([...enrolledKeys].map(normId));
            if (enrolledKeys.size > 0) {
              // Per-student alias sets so enrolment keys in ANY series
              // (register no / admission no / roll no, any casing) still match.
              const aliasOf = (k) => {
                const set = new Set([k]);
                const candVal = rawMaster[k];
                const push = (v) => { const s = String(v || '').trim(); if (s) set.add(s); };
                if (candVal && typeof candVal === 'object') {
                  push(candVal.regNo); push(candVal.reg); push(candVal.registerNo); push(candVal.register_number); push(candVal.reg_no);
                  push(candVal.admissionNo); push(candVal.admNo); push(candVal.adm_no); push(candVal.admission_no);
                  push(candVal.examNo); push(candVal.applicationNo);
                  push(candVal.rollNo); push(candVal.roll_no);
                }
                const si = secIdxData[k];
                if (si && typeof si === 'object') {
                  push(si.regNo); push(si.reg); push(si.admissionNo); push(si.admNo); push(si.rollNo);
                }
                return set;
              };
              const rosterKeys = Object.keys(rawMaster).filter(k => !k.startsWith('_'));
              const keptKeys = rosterKeys.filter(k => {
                for (const a of aliasOf(k)) {
                  if (enrolledKeys.has(a) || enrolledNorm.has(normId(a))) return true;
                }
                return false;
              });
              if (rosterKeys.length > 0 && keptKeys.length === 0) {
                // Enrolment list matches NOBODY — ID-series divergence, not an
                // empty class. Never wipe the roster; show everyone + warn.
                console.warn('[Attendance] course_enrolments keys match 0 roster students — showing full roster.', [...enrolledKeys].slice(0, 5));
                dbg.enrol = `DIVERGENT (${enrolledKeys.size} entries, 0 matched) — roster kept`;
                if (fetchRunRef.current === runId) setEnrolWarn({ subject: selectedSubjectObj.code, count: enrolledKeys.size });
              } else {
                dbg.enrol = `kept ${keptKeys.length}/${rosterKeys.length}`;
                if (fetchRunRef.current === runId) setEnrolWarn(null);
                const filtered = {
                  _meta: rawMaster._meta,
                  _joiningDate: rawMaster._joiningDate,
                  _joiningAY: rawMaster._joiningAY,
                  _order: rawMaster._order
                };
                keptKeys.forEach(k => { filtered[k] = rawMaster[k]; });
                rawMaster = filtered;
              }
            }
          }
        } catch (e) { console.warn('Enrollment filter failed:', e); }

        // Build regNo↔admissionNo pairs from every available source so old
        // register-number-keyed records resolve to current master-list keys
        // even when student_section_index docs are missing/incomplete.
        const extraPairs = {};
        const pairUp = (a, b) => {
          const x = String(a || '').trim(), y = String(b || '').trim();
          if (!x || !y || x === y) return;
          if (!extraPairs[x]) extraPairs[x] = y;
          if (!extraPairs[y]) extraPairs[y] = x;
        };
        Object.entries(rawMaster).forEach(([key, val]) => {
          if (key.startsWith('_') || !val || typeof val !== 'object') return;
          const candReg = val.regNo || val.reg || val.registerNo || val.register_number || val.reg_no;
          const candAdm = val.admissionNo || val.admNo || val.adm_no || val.admission_no || val.examNo || val.exam_no || val.applicationNo;
          const candRoll = val.rollNo || val.roll_no;
          if (candReg && candAdm) {
            pairUp(candAdm, candReg);
            pairUp(key, candReg);
            pairUp(key, candAdm);
          } else if (candReg) {
            pairUp(key, candReg);
          } else if (candAdm) {
            pairUp(key, candAdm);
          }
          if (candRoll) {
            pairUp(key, candRoll);
            if (candReg) pairUp(candReg, candRoll);
            if (candAdm) pairUp(candAdm, candRoll);
          }
        });
        setIdMapExtra(extraPairs);

        setMasterList(rawMaster);

        // Build default student list
        const joiningAY = rawMaster._joiningAY || {};
        let studentArray = Object.entries(rawMaster)
          .filter(([key]) => !key.startsWith('_'))
          .filter(([reg]) => {
            if (!academicYear) return true;
            const jAY = joiningAY[reg];
            return !jAY || jAY <= academicYear;
          })
          .map(([reg, nameVal]) => ({
            reg,
            name: typeof nameVal === 'object' ? (nameVal.name || 'Unknown') : nameVal,
            hours: 0,
            status: '',
            percentage: "0.00"
          }));

        // Fallback: namelist doc missing/empty but attendance records hold student
        // keys — rebuild the roster from records so marking stays possible.
        if (studentArray.length === 0) {
          const derivedMap = {};
          Object.values(mergedRecords).forEach(rec => {
            const st = rec?.students;
            if (Array.isArray(st)) {
              st.forEach(item => {
                const r = String(item?.reg || item?.regNo || item?.admNo || item?.id || '').trim();
                if (r && !derivedMap[r]) derivedMap[r] = (item?.name || item?.studentName || secIdxData[r]?.name || r);
              });
            } else if (st && typeof st === 'object') {
              Object.keys(st).forEach(k => {
                if (k.startsWith('_') || derivedMap[k]) return;
                const v = st[k];
                derivedMap[k] = (v && typeof v === 'object' && (v.name || v.studentName)) || secIdxData[k]?.name || k;
              });
            }
          });
          const derivedRegs = Object.keys(derivedMap);
          dbg.derived = derivedRegs.length;
          if (derivedRegs.length > 0) {
            const filler = {};
            derivedRegs.forEach(r => { filler[r] = derivedMap[r]; });
            rawMaster = { ...rawMaster, ...filler };
            setMasterList({ ...rawMaster });
            studentArray = derivedRegs.map(reg => ({
              reg,
              name: derivedMap[reg] || reg,
              hours: 0,
              status: '',
              percentage: "0.00"
            }));
            if (fetchRunRef.current === runId) setRosterFallback({ count: derivedRegs.length });
          } else if (fetchRunRef.current === runId) {
            setRosterFallback(null);
          }
        } else if (fetchRunRef.current === runId) {
          setRosterFallback(null);
        }

        studentArray.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));
        setStudents(studentArray);

        const recordKeys = Object.keys(mergedRecords).sort();
        if (fetchRunRef.current !== runId) return; // superseded by a newer filter change
        setLoadInfo({ ...dbg });
        console.log('[Attendance][load]', {
          roster: studentArray.length,
          studentsDocFound: !!dbg.docFound,
          enrol: dbg.enrol,
          recoveredFromRecords: dbg.derived,
          records: Object.keys(mergedRecords).length,
          sourceDocs: docHits.length,
        });
        setRecordDates(recordKeys);
        setCurrentRecordData(null);
        setTotalConducted("1");
      } catch (err) { console.error(err); }
      clearTimeout(safetyTimer);
      if (fetchRunRef.current === runId) setLoading(false);
      // Background bridge enrichment (module-level: no per-run closures).
      // Skipped when there is nothing to resolve at all.
      {
        const needBridge = Object.keys(rawMaster).some(k => !k.startsWith('_')) || Object.keys(mergedRecords).length > 0;
        const bgRunId = runId;
        if (needBridge || admissionsPairCache) {
          ensureAdmissionsPairs().then(pairs => {
            if (fetchRunRef.current !== bgRunId) return;
            if (Object.keys(pairs).length) {
              setIdMapExtra(prev => {
                const merged = { ...prev };
                let changed = false;
                Object.entries(pairs).forEach(([k, v]) => { if (!merged[k]) { merged[k] = v; changed = true; } });
                return changed ? merged : prev;
              });
            }
          });
        }
      }
    };
    fetchData();
    return () => { clearTimeout(safetyTimer); };
  }, [programme, department, batch, academicYear, semester, subject, section]);

  const handleStatusChange = (reg, status) => {
    const total = parseInt(totalConducted, 10) || 0;

    setStudents(prev => prev.map(s => {
      if (s.reg === reg) {
        // Toggle to '-' if clicking already active status, otherwise set new status
        const newStatus = s.status === status ? '-' : status;
        let newHours = 0;
        if (newStatus === 'P') {
          newHours = total > 0 ? total : 1;
        } else if (newStatus === 'OD') {
          newHours = -1;
        }

        return {
          ...s,
          status: newStatus,
          hours: newHours,
          percentage: (newStatus === 'P' && total > 0) ? ((newHours / total) * 100).toFixed(2) : "0.00",
          topicTaught: topicTaught.trim(),
          teachingAid,
          teachingMethodology
        };
      }
      return s;
    }));
  };

  const handleMarkAllHyphen = () => {
    setStudents(prev => prev.map(s => {
      if (readOnlyRegs.has(s.reg)) return s;
      return {
        ...s,
        status: '-',
        hours: 0,
        percentage: "0.00",
        topicTaught: topicTaught.trim(),
        teachingAid,
        teachingMethodology
      };
    }));
  };

  // Auto-load attendance when date or periods change
  useEffect(() => {
    if (!Object.keys(masterList).length || !attendanceDate || !periods.length) return;

    const firstPeriod = periods[0];
    const recordsMap = getAttendanceRecords(attendanceData);
    let dateRecord = findRecordForPeriod(recordsMap, attendanceDate, firstPeriod);
    // A record shell with zero student entries carries no markings — treat as
    // unmarked so the roster stays editable and no false badge shows.
    const recStudentsRaw = dateRecord?.students;
    const recEntryCount = Array.isArray(recStudentsRaw)
      ? recStudentsRaw.length
      : Object.keys(recStudentsRaw || {}).length;
    if (dateRecord && recEntryCount === 0) dateRecord = null;
    setCurrentRecordData(dateRecord);
    setRecordNotice(null);

    const isEvent = dateRecord?.isEvent || false;
    setIsEventAttendance(isEvent);
    setEventName(dateRecord?.eventName || "");
    if (isEvent) {
      setTopicTaught("");
      setTeachingAid("");
      setTeachingMethodology("");
    } else {
      setTopicTaught(dateRecord?.topicTaught || "");
      setTeachingAid(dateRecord?.teachingAid || "");
      setTeachingMethodology(dateRecord?.teachingMethodology || "");
    }

    const totalH = parseInt(dateRecord?.totalHours, 10) || 1;

    const joiningAY = masterList._joiningAY || {};
    const masterListObj = {};
    Object.entries(masterList)
      .filter(([key]) => !key.startsWith('_'))
      .filter(([reg]) => {
        if (!academicYear) return true;
        const jAY = joiningAY[reg];
        if (!jAY) return true;
        return jAY <= academicYear;
      })
      .forEach(([reg, nameVal]) => {
        masterListObj[reg] = typeof nameVal === 'object' ? (nameVal.name || 'Unknown') : nameVal;
      });

    const order = masterList._order;

    const studentArray = Object.entries(masterListObj).map(([reg, name]) => {
      const rawVal = getStudentData(dateRecord?.students, reg);
      const parsedVal = parseStudentAttendanceVal(rawVal);
      const studentExists = parsedVal !== null;
      let hours = parsedVal ? parsedVal.hours : 0;
      let stuTopic = parsedVal ? parsedVal.topicTaught : '';
      let stuAid = parsedVal ? parsedVal.teachingAid : '';
      let stuMethod = parsedVal ? parsedVal.teachingMethodology : '';
      let storedStatus = parsedVal ? parsedVal.status : '';

      // If record exists and student is recorded, use storedStatus; otherwise leave empty for user marking
      let status = studentExists ? storedStatus : '';
      if (status === 'P' && !hours) {
        hours = totalH;
      }

      return {
        reg, name, hours,
        status,
        percentage: (status === 'P' && totalH > 0) ? ((hours / totalH) * 100).toFixed(2) : "0.00",
        topicTaught: stuTopic,
        teachingAid: stuAid,
        teachingMethodology: stuMethod,
        _conflict: false
      };
    });

    studentArray.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));

    // Diagnose: record holds entries but zero roster students resolve to a
    // parseable marking — the record's ID series doesn't bridge to the roster,
    // or entries are null shells. Surface it instead of silent blank buttons.
    if (dateRecord && recEntryCount > 0) {
      const matched = studentArray.filter(s => {
        const v = getStudentData(dateRecord.students, s.reg);
        return v !== undefined && v !== null && parseStudentAttendanceVal(v) !== null;
      }).length;
      if (matched === 0) {
        const allRecKeys = Array.isArray(recStudentsRaw)
          ? recStudentsRaw.map(item => String(item?.reg || item?.regNo || item?.admNo || item?.id || JSON.stringify(item)).slice(0, 32))
          : Object.keys(recStudentsRaw);
        // Distinguish true ID mismatch from empty-shell entries: if record keys
        // overlap the roster but nothing parses, statuses were never saved.
        const rosterSet = new Set(studentArray.map(s => String(s.reg).trim().toLowerCase()));
        const normClean = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const overlap = allRecKeys.filter(k => {
          const kl = String(k).trim().toLowerCase();
          if (rosterSet.has(kl)) return true;
          for (const r of rosterSet) { if (normClean(r) === normClean(k)) return true; }
          return false;
        }).length;
        let sampleValue = '';
        try {
          const firstVal = Array.isArray(recStudentsRaw)
            ? recStudentsRaw[0]
            : recStudentsRaw[allRecKeys[0]];
          sampleValue = JSON.stringify(firstVal).slice(0, 300);
        } catch { sampleValue = '(unserializable)'; }
        const diagInfo = {
          recordKey: `${attendanceDate}_P${firstPeriod}`,
          recordEntryCount: recEntryCount,
          recordKeysTotal: allRecKeys.length,
          sampleValue,
          rosterCount: studentArray.length,
          rosterSample: studentArray.slice(0, 5).map(s => s.reg),
          sectionIndexEntries: Object.keys(sectionIndex || {}).length,
        };
        console.log('[Attendance][diag] record-vs-roster mismatch', diagInfo);
        setRecordNotice({
          type: overlap > 0 ? 'empty' : 'mismatch',
          recordKeys: allRecKeys.slice(0, 3),
          allKeys: allRecKeys,
          sampleValue,
          rosterCount: studentArray.length,
          rosterSample: studentArray.slice(0, 3).map(s => s.reg),
          sectionIndexCount: Object.keys(sectionIndex || {}).length,
          date: attendanceDate,
          period: firstPeriod
        });
      }
    }

    setStudents(studentArray);
  }, [attendanceDate, periods, attendanceData, masterList, sectionIndex, getStudentData]);

  // Check if period is already marked by another parallel subject (advisory only — does not hijack or lock students)
  useEffect(() => {
    if (!periods.length || !attendanceDate || !batch || !academicYear || !semester || !programme || !department) {
      setPeriodConflict(null);
      return;
    }
    const firstPeriod = periods[0];
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const batchPrefix = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_`;
    const recordKey = `${attendanceDate}_P${firstPeriod}`;
    let currentSubjectCode = '';
    try { currentSubjectCode = JSON.parse(subject || '{}').code || ''; } catch { }

    let cancelled = false;
    const check = async () => {
      try {
        // Bounded ID-range query: same-class docs only (no full-collection scan)
        const snap = await getDocs(query(
          collection(db, 'attendance'),
          where(documentId(), '>=', batchPrefix),
          where(documentId(), '<=', batchPrefix + '￯')
        ));
        for (const d of snap.docs) {
          const rec = getAttendanceRecords(d.data())?.[recordKey];
          if (!rec) continue;
          // Extract subject code from doc ID
          let rest = d.id.slice(batchPrefix.length);
          const secIdx = rest.indexOf('_Sec-');
          if (secIdx !== -1) rest = rest.slice(0, secIdx);
          // Skip current subject's own doc
          if (rest === currentSubjectCode) continue;

          // Advisory only: notify faculty that a parallel subject was also conducted in this period
          if (!cancelled) setPeriodConflict({ subjectCode: rest, markedBy: rec.markedBy || '' });
          return;
        }
        if (!cancelled) setPeriodConflict(null);
      } catch (e) {
        if (!cancelled) setPeriodConflict(null);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [period, attendanceDate, batch, academicYear, semester, programme, department, subject]);

  // ─── Centralized, Unified Student Attendance Statistics Engine ───
  const calculateStudentStats = useCallback((reg, keysList, recordsObj, joiningDateMap) => {
    let attended = 0;
    let odCount = 0;
    let absent = 0;
    let totalClasses = 0;
    const dailyRecords = {};

    // Robust joining date resolution across all student ID aliases
    let jd = '';
    const jdSources = [joiningDateMap, masterList?._joiningDate].filter(Boolean);
    for (const src of jdSources) {
      if (src[reg]) { jd = src[reg]; break; }
      if (idMap[reg] && src[idMap[reg]]) { jd = src[idMap[reg]]; break; }
      if (idMapExtra[reg] && src[idMapExtra[reg]]) { jd = src[idMapExtra[reg]]; break; }
      const aliases = studentAliasesMap[reg];
      if (aliases) {
        for (const a of aliases) {
          if (src[a]) { jd = src[a]; break; }
        }
      }
      if (jd) break;
    }
    if (!jd && masterList?.[reg] && typeof masterList[reg] === 'object') {
      jd = masterList[reg].joiningDate || masterList[reg]._joiningDate || '';
    }

    keysList.forEach(key => {
      const rec = recordsObj[key];
      if (!rec) return;

      const recordDate = extractPureDate(key);
      const isEvent = rec.isEvent;

      // Lateral entry / joining date check: classes before joining date are skipped
      if (jd && recordDate && recordDate < jd) {
        dailyRecords[key] = '—';
        return;
      }

      const rawVal = getStudentData(rec.students, reg);
      const parsedVal = parseStudentAttendanceVal(rawVal);

      if (isEvent) {
        const isPresent = parsedVal ? (parsedVal.status === 'P' || parsedVal.hours > 0) : true;
        dailyRecords[key] = parsedVal ? parsedVal.status : (isPresent ? 'P' : '—');
        return;
      }

      // If student has '-' (exempt / other elective / not applicable), do not count in totalClasses or absent
      if (parsedVal && (parsedVal.status === '-' || parsedVal.isNA || parsedVal.status === '—')) {
        dailyRecords[key] = '—';
        return;
      }
      // No usable marking (unknown ID, empty entry, or student absent from a
      // populated record): exclude from this class — never default to P/A here.
      // Records with zero student entries carry no signal for anyone.
      if (!rec.students || Object.keys(rec.students).length === 0) {
        dailyRecords[key] = '—';
        return;
      }
      if (!parsedVal) {
        dailyRecords[key] = '—';
        return;
      }

      // Non-event class conducted while student was enrolled
      totalClasses++;

      let status = 'P';
      if (parsedVal) {
        if (parsedVal.status === 'OD' || parsedVal.hours === -1) {
          odCount++;
          status = 'OD';
        } else if (parsedVal.status === 'P' || parsedVal.hours > 0) {
          attended++;
          status = 'P';
        } else if (parsedVal.status === 'A' || parsedVal.hours === 0) {
          absent++;
          status = 'A';
        } else {
          attended++;
          status = 'P';
        }
      } else {
        // System standard: unmarked students default to Present 'P'
        attended++;
        status = 'P';
      }

      dailyRecords[key] = status;
    });

    const effectiveClasses = Math.max(0, totalClasses - odCount);
    const percentage = effectiveClasses > 0
      ? ((attended / effectiveClasses) * 100).toFixed(2)
      : (odCount > 0 ? "100.00" : "0.00");
    const pctNum = parseFloat(percentage) || 0;
    const odPercentage = totalClasses > 0
      ? ((odCount / totalClasses) * 100).toFixed(2)
      : "0.00";
    const odPctNum = parseFloat(odPercentage) || 0;

    return {
      totalClasses,
      attended,
      absent,
      odCount,
      percentage,
      pctNum,
      odPercentage,
      odPctNum,
      dailyRecords
    };
  }, [getStudentData, masterList, idMap, idMapExtra, studentAliasesMap]);

  const handleGenerateReport = () => {
    const allRecords = getAttendanceRecords(attendanceData);
    if (!reportFromDate || !reportToDate || !Object.keys(allRecords).length) {
      setReportData(null);
      return;
    }

    const fromDate = extractPureDate(reportFromDate);
    const toDate = extractPureDate(reportToDate);
    const allKeys = Object.keys(allRecords).filter(k => {
      const datePart = extractPureDate(k);
      return datePart >= fromDate && datePart <= toDate;
    }).sort();

    if (allKeys.length === 0) {
      setReportData({ dates: [], students: [], totalClasses: 0 });
      return;
    }

    const totalClasses = allKeys.filter(k => !allRecords[k]?.isEvent).length;

    // Derive display labels for each key (date-only → plain, compound → "date (Period X)")
    const keyLabels = {};
    allKeys.forEach(k => {
      const rec = allRecords[k];
      const isEvent = rec?.isEvent;
      if (k.includes('_P')) {
        const idx = k.lastIndexOf('_P');
        const baseLabel = `${k.slice(0, idx)} (P${k.slice(idx + 2)})`;
        keyLabels[k] = isEvent && rec?.eventName ? `${baseLabel} [${rec.eventName}]` : baseLabel;
      } else {
        keyLabels[k] = k;
      }
    });

    const joiningAY = masterList._joiningAY || {};
    const studentMap = {};
    Object.entries(masterList)
      .filter(([key]) => !key.startsWith('_'))
      .filter(([reg]) => {
        if (!academicYear) return true;
        const jAY = joiningAY[reg];
        if (!jAY) return true;
        return jAY <= academicYear;
      })
      .forEach(([reg, nameVal]) => {
        studentMap[reg] = typeof nameVal === 'object' ? (nameVal.name || 'Unknown') : nameVal;
      });

    const joiningDateMap = masterList?._joiningDate || {};
    const studentStats = Object.keys(studentMap).map(reg => {
      const sStats = calculateStudentStats(reg, allKeys, allRecords, joiningDateMap);
      return {
        reg,
        name: studentMap[reg],
        attended: sStats.attended,
        totalClasses: sStats.totalClasses,
        absent: sStats.absent,
        odCount: sStats.odCount,
        percentage: sStats.percentage,
        odPercentage: sStats.odPercentage,
        dailyRecords: sStats.dailyRecords
      };
    });

    const eventDates = new Set(allKeys.filter(k => allRecords[k]?.isEvent));

    studentStats.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));

    setReportData({ dates: allKeys, keyLabels, students: studentStats, totalClasses, eventDates });
  };

  const handleExportReport = async () => {
    if (!reportData) return;

    // Parse subject JSON for readable display
    let subjectCode = '', subjectName = '', batchLabel = '', semLabel = '', sectionLabel = '';
    try {
      const parsed = JSON.parse(subject);
      subjectCode = parsed.code || '';
      batchLabel = parsed.batch || '';
      semLabel = parsed.sem || '';
      sectionLabel = parsed.section || '';
      const match = subjects.find(s => s.value === subject);
      if (match) {
        subjectName = match.text
          .replace(`${subjectCode} - `, '')
          .replace(/\s*\(.*\)\s*$/, '')
          .trim();
      }
    } catch { /* keep defaults */ }

    // Load college logo
    let logoDataUrl = null;
    try {
      const resp = await fetch('/logo.png');
      const blob = await resp.blob();
      logoDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch { /* logo unavailable, skip */ }

    // Landscape only when too many columns
    const totalCols = 6 + reportData.dates.length;
    const orient = totalCols > 10 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation: orient });
    const pageWidth = doc.internal.pageSize.getWidth();

    // ── Logo on first page ──
    let yPos = 10;
    if (logoDataUrl) {
      try {
        const logoW = pageWidth - 28;
        const logoH = logoW * 0.07;
        doc.addImage(logoDataUrl, 'PNG', 14, yPos, logoW, logoH);
        yPos += logoH + 4;
      } catch { /* skip */ }
    }

    // ── Title ──
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Attendance Report', 14, yPos);
    yPos += 7;

    // ── Subject / batch / sem / section ──
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`Subject: ${subjectCode}${subjectName ? ' - ' + subjectName : ''}`, 14, yPos);
    yPos += 5;

    doc.setFont(undefined, 'normal');
    const detailParts = [];
    if (batchLabel) detailParts.push(`Batch: ${batchLabel}`);
    if (semLabel) detailParts.push(`Semester: ${semLabel}`);
    if (sectionLabel) detailParts.push(`Section: ${sectionLabel}`);
    detailParts.push(`Date Range: ${reportFromDate} to ${reportToDate}`);
    detailParts.push(`Total Classes: ${reportData.totalClasses}`);
    doc.text(detailParts.join('  |  '), 14, yPos);
    yPos += 5;

    // ── Table ──
    const headers = ['Reg No', 'Student Name'];
    reportData.dates.forEach(d => headers.push(reportData.keyLabels?.[d] || d));
    headers.push('Total', 'Attended', 'Absent', 'OD', '%', 'OD%');

    const rows = reportData.students.map(s => {
      const absent = s.absent !== undefined ? s.absent : Math.max(0, s.totalClasses - s.attended - s.odCount);
      const row = [s.reg, s.name];
      reportData.dates.forEach(d => row.push(s.dailyRecords[d] || '—'));
      row.push(String(s.totalClasses), String(s.attended), String(absent), String(s.odCount), `${s.percentage}%`, `${s.odPercentage}%`);
      return row;
    });

    // Dynamic column styles: fixed widths for RegNo, Name, Total/Attended/Absent/OD/%/OD%; date cols auto-sized
    const dateColCount = reportData.dates.length;
    const colStyles = {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
      1: { halign: 'left', cellWidth: 34 },
    };
    const lastIdx = 2 + dateColCount;
    colStyles[lastIdx] = { halign: 'center', cellWidth: 10 };
    colStyles[lastIdx + 1] = { halign: 'center', cellWidth: 12 };
    colStyles[lastIdx + 2] = { halign: 'center', cellWidth: 10 };
    colStyles[lastIdx + 3] = { halign: 'center', cellWidth: 8 };
    colStyles[lastIdx + 4] = { halign: 'center', cellWidth: 10 };
    colStyles[lastIdx + 5] = { halign: 'center', cellWidth: 10 };

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: yPos,
      styles: { fontSize: 6.5, cellPadding: 1.5, halign: 'center', overflow: 'linebreak' },
      headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: colStyles,
      alternateRowStyles: { fillColor: [255, 251, 235] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`Attendance_Report_${batchLabel || "Report"}_${subjectCode || "Subject"}.pdf`);
  };

  const handleExportReportExcel = () => {
    if (!reportData || !reportData.students.length) return;

    let subjectCode = '', subjectName = '', batchLabel = '', semLabel = '', sectionLabel = '';
    try {
      const parsed = JSON.parse(subject);
      subjectCode = parsed.code || '';
      batchLabel = parsed.batch || '';
      semLabel = parsed.sem || '';
      sectionLabel = parsed.section || '';
      const match = subjects.find(s => s.value === subject);
      if (match) {
        subjectName = match.text
          .replace(`${subjectCode} - `, '')
          .replace(/\s*\(.*\)\s*$/, '')
          .trim();
      }
    } catch { /* keep defaults */ }

    const excelRows = reportData.students.map((s, idx) => {
      const absent = s.absent !== undefined ? s.absent : Math.max(0, s.totalClasses - s.attended - s.odCount);
      const row = {
        'S.No': idx + 1,
        'Reg No': s.reg,
        'Student Name': s.name,
        'Total Classes': s.totalClasses,
        'Attended': s.attended,
        'Absent': absent,
        'OD': s.odCount,
        'Attendance %': `${s.percentage}%`,
        'OD %': `${s.odPercentage}%`,
      };
      reportData.dates.forEach(d => {
        const label = reportData.keyLabels?.[d] || d;
        row[label] = s.dailyRecords[d] || '—';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");
    XLSX.writeFile(wb, `Attendance_Report_${batchLabel || "Batch"}_${subjectCode || "Subject"}.xlsx`);
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.reg.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveAttendance = async () => {
    // Guard: saving with an empty roster would write empty-shell records.
    // Refuse and protect existing attendance history instead.
    if (!students.length) {
      alert("No students loaded — refusing to save to protect existing attendance records. Reload the page; if still empty, re-upload the namelist (Upload page / HOD allotment).");
      return;
    }
    if (dateRangeInfo.blocked) {
      alert(dateRangeInfo.msg);
      return;
    }
    if (attendanceDate > new Date().toISOString().split('T')[0]) {
      alert("Cannot mark attendance for future dates.");
      return;
    }
    if (!programme || !department || !batch || !subject || !totalConducted || !attendanceDate) {
      alert("Please ensure all filters and Total Conducted hours are provided.");
      return;
    }
    if (!periods.length) {
      alert("Please select at least one Period before saving attendance.");
      return;
    }
    if (!isEventAttendance) {
      if (!topicTaught.trim()) {
        alert("Please enter what topic was taught today.");
        return;
      }
      if (!teachingAid) {
        alert("Please select the Teaching Aid used today.");
        return;
      }
      if (!teachingMethodology) {
        alert("Please select the Teaching Methodology used today.");
        return;
      }
    }

    // Collect attendance summary for confirmation
    const absentList = activeStudents.filter(s => s.status === 'A');
    const odList = activeStudents.filter(s => s.status === 'OD');
    const notMarkedList = activeStudents.filter(s => s.status === '');
    if (absentList.length > 0 || odList.length > 0 || notMarkedList.length > 0) {
      setSaveConfirmation({ absent: absentList, od: odList, notMarked: notMarkedList });
      return; // wait for confirm
    }

    // No absent students — save directly
    await confirmSaveAttendance();
  };

  const confirmSaveAttendance = async () => {
    setSaving(true);
    setSaveConfirmation(null);
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const attendanceDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}${sectionSuffix}`;

    // If another faculty's record, merge new entries without overwriting existing
    const isAnotherFacultyRecord = currentRecordData?.markedBy && currentRecordData.markedBy !== currentUid;
    const existingStudents = isAnotherFacultyRecord ? (currentRecordData.students || {}) : {};
    const newStudentsMap = {};

    const makeStudentEntry = (s) => {
      const entry = {
        status: s.status,
        hours: s.hours,
      };
      if (s.topicTaught && s.topicTaught.trim() !== topicTaught.trim()) {
        entry.topicTaught = s.topicTaught.trim();
      }
      if (s.teachingAid && s.teachingAid !== teachingAid) {
        entry.teachingAid = s.teachingAid;
      }
      if (s.teachingMethodology && s.teachingMethodology !== teachingMethodology) {
        entry.teachingMethodology = s.teachingMethodology;
      }
      return entry;
    };

    students.forEach(s => {
      // If student is marked, use their status; if left blank, save as '-' (Other Subject / Exempt)
      const finalStatus = s.status ? s.status : '-';
      const finalHours = finalStatus === 'P' ? (parseInt(totalConducted, 10) || 1) : (finalStatus === 'OD' ? -1 : 0);
      const studentObj = { ...s, status: finalStatus, hours: finalHours };
      // Skip only entries that actually parse — null shells must be
      // overwritten with fresh marks, never preserved.
      const alreadyMarked = getStudentData(existingStudents, s.reg);
      if (isAnotherFacultyRecord && alreadyMarked !== undefined && alreadyMarked !== null && parseStudentAttendanceVal(alreadyMarked) !== null) return; // skip existing in merge mode
      const entry = makeStudentEntry(studentObj);
      newStudentsMap[s.reg] = entry;
    });
    let mergedStudentsMap = { ...existingStudents, ...newStudentsMap };

    // Loop through all selected periods
    const existingRecords = getAttendanceRecords(attendanceData);
    let updatedRecords = { ...existingRecords };
    let nextTotal = isEventAttendance ? parseInt(totalConducted, 10) : parseInt(totalConducted, 10) + periods.length;

    for (const p of periods) {
      const dateRecord = {
        period: p,
        totalHours: parseInt(totalConducted, 10) || 1,
        students: mergedStudentsMap,
        topicTaught: isEventAttendance ? "" : topicTaught.trim(),
        teachingAid: isEventAttendance ? "" : teachingAid,
        teachingMethodology: isEventAttendance ? "" : teachingMethodology,
        markedBy: isAnotherFacultyRecord ? currentRecordData.markedBy : currentUid,
        updatedAt: new Date().toISOString()
      };
      if (isEventAttendance) {
        dateRecord.isEvent = true;
        dateRecord.eventName = eventName.trim();
      }
      const recordKey = `${attendanceDate}_P${p}`;
      updatedRecords[recordKey] = dateRecord;
    }

    try {
      const payload = prepareAttendancePayload(updatedRecords, {
        _meta: { totalHours: nextTotal, updatedAt: new Date().toISOString() }
      });

      await setDoc(doc(db, "attendance", attendanceDocId), payload, { merge: true });
      alert(`Attendance for ${attendanceDate} (Periods: ${periods.join(', ')}) saved successfully!`);

      const newRecordKeys = Object.keys(updatedRecords).sort();
      setRecordDates(newRecordKeys);
      setAttendanceData(prev => ({
        ...prev,
        ...payload,
        records: updatedRecords,
        _meta: { totalHours: nextTotal }
      }));

      // Clear period selection and reset state for next attendance entry
      setPeriod("");
      setPeriods([]);
    } catch (err) { console.error(err); alert("Failed to save records."); }
    setSaving(false);
  };

  const handleClearAttendance = async (periodToClear) => {
    if (!periodToClear) return;
    const recordKey = `${attendanceDate}_P${periodToClear}`;
    if (!confirm(`Clear attendance for ${attendanceDate} (Period ${periodToClear})? This cannot be undone.`)) return;

    setSaving(true);
    try {
      const progKey = formatProgrammeKey(programme);
      const semNum = String(semester).match(/\d+/)?.[0];
      const selectedSubjectObj = JSON.parse(subject);
      const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
      const attendanceDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}${sectionSuffix}`;

      const updatedRecords = { ...getAttendanceRecords(attendanceData) };
      delete updatedRecords[recordKey];

      const payload = prepareAttendancePayload(updatedRecords);
      await setDoc(doc(db, "attendance", attendanceDocId), payload, { merge: true });

      setAttendanceData(prev => ({ ...prev, ...payload, records: updatedRecords }));
      setRecordDates(Object.keys(updatedRecords).sort());
      setCurrentRecordData(null);
      setTopicTaught("");
      setTeachingAid("");
      setTeachingMethodology("");
      alert(`Attendance for ${attendanceDate} (Period ${periodToClear}) cleared.`);
    } catch (err) { console.error(err); alert("Failed to clear attendance."); }
    setSaving(false);
  };

  const handleExport = () => {
    if (!students.length) return;
    const ws = XLSX.utils.json_to_sheet(students);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${subject}_${batch}.xlsx`);
  };

  const handleMarkAllPresent = () => {
    const total = parseInt(totalConducted, 10) || 0;
    setStudents(prev => prev.map(s => {
      // Don't overwrite read-only entries or students marked '-' (other elective/parallel subject)
      if (readOnlyRegs.has(s.reg)) return s;
      if (s.status === '-') return s;
      return {
        ...s, status: 'P', hours: total,
        percentage: total > 0 ? "100.00" : "0.00",
        topicTaught: topicTaught.trim(),
        teachingAid,
        teachingMethodology
      };
    }));
  };

  // ─── non-event keys and record count (global) ───
  const nonEventKeys = useMemo(() => {
    const recordsMap = getAttendanceRecords(attendanceData);
    return Object.entries(recordsMap).filter(([, r]) => !r.isEvent).map(([k]) => k).sort();
  }, [attendanceData]);

  const nonEventRecordCount = nonEventKeys.length;

  // ─── unified cumulative attendance stats map (100% synchronized with reports) ───
  const cumulativeStatsMap = useMemo(() => {
    const recordsMap = getAttendanceRecords(attendanceData);
    if (!Object.keys(recordsMap).length) return {};
    const map = {};
    const joiningDateMap = masterList?._joiningDate || {};
    Object.keys(masterList || {}).forEach(reg => {
      if (reg.startsWith('_')) return;
      map[reg] = calculateStudentStats(reg, nonEventKeys, recordsMap, joiningDateMap);
    });
    return map;
  }, [attendanceData, masterList, nonEventKeys, calculateStudentStats]);

  const cumulativeAttended = useMemo(() => {
    const counts = {};
    Object.entries(cumulativeStatsMap).forEach(([reg, stats]) => {
      counts[reg] = stats.attended;
    });
    return counts;
  }, [cumulativeStatsMap]);

  const cumulativeOD = useMemo(() => {
    const counts = {};
    Object.entries(cumulativeStatsMap).forEach(([reg, stats]) => {
      counts[reg] = stats.odCount;
    });
    return counts;
  }, [cumulativeStatsMap]);

  const effectiveTotalPerStudent = useMemo(() => {
    const map = {};
    Object.entries(cumulativeStatsMap).forEach(([reg, stats]) => {
      map[reg] = stats.totalClasses;
    });
    return map;
  }, [cumulativeStatsMap]);

  // ─── derived stats ───
  const activeStudents = students;
  const markedStudents = activeStudents.filter(s => s.status === 'P' || s.status === 'A' || s.status === 'OD');
  const pctPresent = markedStudents.length
    ? ((activeStudents.filter(s => s.status === 'P').length / markedStudents.length) * 100).toFixed(1)
    : '—';

  // Read-only student regs (existing entries from another faculty for current subject only)
  const readOnlyRegs = useMemo(() => {
    const regs = new Set();
    if (currentRecordData?.markedBy && currentUid && currentRecordData.markedBy !== currentUid) {
      const studentKeys = Array.isArray(currentRecordData.students)
        ? currentRecordData.students.map(s => s.reg || s.regNo || s.admNo || s.id)
        : Object.keys(currentRecordData.students || {});
      studentKeys.forEach(r => {
        if (!r) return;
        regs.add(r);
        if (idMap[r]) regs.add(idMap[r]);
      });
    }
    return regs;
  }, [currentRecordData, currentUid, idMap]);

  return (
    <Layout title="Attendance Records">
      <div className="p-4 md:p-8 w-full space-y-6">

        {/* ═══ Hero Stats ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, label: 'Total Students', value: activeStudents.length, color: 'from-indigo-500 to-blue-600' },
            { icon: CalendarCheck2, label: 'Today\'s Attendance', value: `${pctPresent}%`, color: 'from-emerald-500 to-teal-600' },
            { icon: Calendar, label: 'Date', value: attendanceDate, color: 'from-violet-500 to-purple-600' },
            { icon: FileText, label: 'Total Classes', value: nonEventRecordCount || '—', color: 'from-amber-500 to-orange-600' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${color} p-5 shadow-xl`}>
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">{label}</p>
                  <p className="text-white text-2xl font-black mt-1">{value}</p>
                </div>
                <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm">
                  <Icon size={22} className="text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ Filter Card ═══ */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-5 md:p-6 transition-all">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
              <Search size={14} className="text-white" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Filters</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: 'Programme', value: programme, set: v => { setProgramme(v); setDepartment(''); handleSubjectChange(''); setSection(''); setPeriod(''); setPeriods([]); setTimetableConfig(null); setAvailablePeriodsWithTiming([]); }, opts: filteredProgrammes, display: formatProgDisplay, disabled: false },
              { label: 'Department', value: department, set: v => { setDepartment(v); handleSubjectChange(''); setSection(''); setPeriod(''); setPeriods([]); setTimetableConfig(null); setAvailablePeriodsWithTiming([]); }, opts: programme ? filteredDepartments : [], display: d => d, disabled: !programme },
              { label: 'Subject', value: subject, set: v => handleSubjectChange(v), opts: subjects, display: s => s.text, disabled: !department, valKey: 'value', special: true },
              { label: 'Batch', value: batch, set: setBatch, opts: batches, display: formatBatchDisplay, disabled: true },
              { label: 'Academic Year', value: academicYear, set: setAcademicYear, opts: aYears, display: y => y, disabled: true },
              { label: 'Semester', value: semester, set: setSemester, opts: semesters, display: s => s, disabled: true },
              { label: 'Section', value: section, set: setSection, opts: availableSections, display: s => s, disabled: !availableSections.length, placeholder: !availableSections.length ? 'No sections' : undefined },
            ].map(({ label, value, set, opts, display, disabled, valKey, placeholder }) => (
              <div key={label} className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-0.5">{label}</label>
                <select
                  value={value}
                  onChange={e => set(e.target.value)}
                  disabled={disabled}
                  className={`w-full appearance-none text-xs font-semibold rounded-xl px-3 py-2.5 outline-none transition-all border
                    ${disabled ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 cursor-pointer'}
                  `}
                >
                  <option value="">{placeholder || (disabled ? 'Auto' : `Select ${label}`)}</option>
                  {opts.map(o => (
                    <option key={valKey ? o[valKey] : o} value={valKey ? o[valKey] : o}>
                      {valKey ? display(o) : display(o)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Session controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest px-0.5">Date</label>
              <input type="date" value={attendanceDate} onChange={e => {
                setAttendanceDate(e.target.value);
                setPeriod("");
                setPeriods([]);
                setCurrentRecordData(null);
                setTopicTaught("");
                setTeachingAid("");
                setTeachingMethodology("");
                setIsEventAttendance(false);
                setEventName("");
                setPeriodConflict(null);
              }}
                min={dateRangeInfo.minDate ? dateRangeInfo.minDate.toISOString().split('T')[0] : undefined}
                max={new Date().toISOString().split('T')[0]}
                className={`w-full bg-gradient-to-r from-blue-50 to-indigo-50/50 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 transition-all ${dateRangeInfo.blocked
                  ? 'border-rose-300 text-rose-600 focus:ring-rose-500/40'
                  : 'border-blue-200 text-blue-700 focus:ring-blue-500/40'
                  }`}
              />
              {dateRangeInfo.blocked && (
                <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {dateRangeInfo.msg}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest px-0.5">Period <span className="text-rose-500">*</span></label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <select value="" onChange={e => {
                      const val = e.target.value;
                      if (val && !periods.includes(val)) {
                        setPeriods(prev => [...prev, val]);
                      }
                      e.target.value = "";
                    }}
                      className="w-full appearance-none bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                    >
                      <option value="">Select Period</option>
                      {availablePeriodsWithTiming.map(p => {
                        const isLocked = lockedPeriods.has(p.value) && !periods.includes(p.value);
                        return (
                          <option key={p.value} value={p.value} disabled={isLocked}>
                            {p.label}{isLocked ? ' — Not started' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                  </div>
                </div>
                {periods.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {periods.filter(Boolean).map(p => {
                      const periodInfo = availablePeriodsWithTiming.find(pi => pi.value === String(p).replace(/[^0-9]/g, '') || pi.value === p);
                      return (
                        <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-700">
                          {periodInfo ? periodInfo.label : `Period ${p}`}
                          <button type="button" onClick={() => setPeriods(prev => prev.filter(x => x !== p))} className="hover:text-red-500 transition-colors">
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {periods.length > 0 && (markedPeriodRec || periodConflict) ? (
                  <span className={`shrink-0 px-2.5 py-1.5 border rounded-lg text-[10px] font-black uppercase tracking-wider ${periodConflict || (markedPeriodRec?.markedBy && markedPeriodRec.markedBy !== currentUid)
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-amber-100 border-amber-300 text-amber-700'
                    }`}>
                    {periodConflict
                      ? `Already marked (${periodConflict.subjectCode})`
                      : (() => {
                        if (markedPeriodRec?.markedBy && markedPeriodRec.markedBy !== currentUid) {
                          return `Marked by ${facultyNames[markedPeriodRec.markedBy] || markedPeriodRec.markedBy}`;
                        }
                        return 'Already marked';
                      })()
                    }
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-0.5">Total Classes</label>
              <div className="w-full bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-xs font-black text-emerald-700 cursor-not-allowed">
                {nonEventRecordCount || '—'}
              </div>
            </div>
          </div>

          {/* Consider for the period (Event) checkbox */}
          {subject && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEventAttendance}
                  onChange={e => {
                    setIsEventAttendance(e.target.checked);
                    if (!e.target.checked) setEventName("");
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40 cursor-pointer"
                />
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Consider for the period (Event)</span>
              </label>
              {isEventAttendance && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-widest px-0.5">Event Name <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={e => setEventName(e.target.value)}
                    placeholder="e.g., Sports Day, Workshop, Guest Lecture..."
                    className="w-full bg-gradient-to-r from-amber-50/50 to-amber-50/10 border border-amber-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-amber-950 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all placeholder:text-slate-400"
                  />
                </div>
              )}
            </div>
          )}

          {/* Topic Taught, Teaching Aid, Teaching Methodology */}
          {subject && !isEventAttendance && (
            <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-indigo-600 uppercase tracking-widest px-0.5">Topic Taught <span className="text-rose-500">*</span></label>
                <textarea
                  rows={3}
                  value={topicTaught}
                  onChange={e => setTopicTaught(e.target.value)}
                  placeholder="Describe what topic you taught today in detail (e.g., Unit 1 - Introduction to DBMS, Entity-Relationship Models and schemas)..."
                  className="w-full bg-gradient-to-r from-indigo-50/50 to-indigo-50/10 border border-indigo-200 rounded-xl px-4 py-3 text-sm font-semibold text-indigo-950 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all placeholder:text-slate-400 resize-y min-h-[90px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-indigo-600 uppercase tracking-widest px-0.5">Teaching Aid <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <select
                      value={teachingAid}
                      onChange={e => setTeachingAid(e.target.value)}
                      className="w-full appearance-none bg-gradient-to-r from-indigo-50 to-indigo-50/20 border border-indigo-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                    >
                      <option value="">Select Teaching Aid</option>
                      <option value="Black Board / White Board">Black Board / White Board</option>
                      <option value="Projector / PPT">Projector / PPT</option>
                      <option value="Smart Board / Interactive Flat Panel">Smart Board / Interactive Flat Panel</option>
                      <option value="Google Classroom / LMS">Google Classroom / LMS</option>
                      <option value="Charts / Physical Models">Charts / Physical Models</option>
                      <option value="Tablet / Digital Stylus">Tablet / Digital Stylus</option>
                      <option value="Video / Multimedia">Video / Multimedia</option>
                      <option value="Handouts / Printed Material">Handouts / Printed Material</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-indigo-600 uppercase tracking-widest px-0.5">Teaching Methodology <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <select
                      value={teachingMethodology}
                      onChange={e => setTeachingMethodology(e.target.value)}
                      className="w-full appearance-none bg-gradient-to-r from-indigo-50 to-indigo-50/20 border border-indigo-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                    >
                      <option value="">Select Methodology</option>
                      <option value="Lecture Method (Chalk & Talk)">Lecture Method (Chalk & Talk)</option>
                      <option value="Power Point Presentation">Power Point Presentation</option>
                      <option value="Demonstration / Practical Hands-on">Demonstration / Practical Hands-on</option>
                      <option value="Interactive Discussion / Brainstorming">Interactive Discussion / Brainstorming</option>
                      <option value="Flipped Classroom">Flipped Classroom</option>
                      <option value="Group Discussion / Collaborative Learning">Group Discussion / Collaborative Learning</option>
                      <option value="Peer Teaching / Seminar">Peer Teaching / Seminar</option>
                      <option value="Case Study Analysis">Case Study Analysis</option>
                      <option value="Problem-Based Learning">Problem-Based Learning</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Attendance Table ═══ */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 overflow-hidden transition-all">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-900 via-blue-950 to-indigo-950 px-5 md:px-7 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm">
                <CalendarCheck2 size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base md:text-lg leading-tight">Attendance Entry</h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 peer-focus:text-slate-400 pointer-events-none" />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="peer bg-white/10 border border-white/20 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:bg-white focus:text-slate-800 focus:placeholder:text-slate-400 focus:[-webkit-text-fill-color:#1e293b] focus:caret-slate-800 transition-all w-36 md:w-44"
                />
              </div>
              <button onClick={handleMarkAllPresent}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/25"
              >
                <Users size={15} /> Mark All Present
              </button>
              <button onClick={handleMarkAllHyphen}
                className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-slate-600 to-zinc-700 hover:from-slate-700 hover:to-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-slate-600/25"
                title="Mark all students as - (Other Subject / Exempt)"
              >
                <Minus size={15} /> Mark All -
              </button>
              <button onClick={handleSaveAttendance} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50"
              >
                {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={15} />}
                Save
              </button>
              {currentRecordData && periods.length > 0 && readOnlyRegs.size === 0 && periods.map(p => {
                const recordKey = `${attendanceDate}_P${p}`;
                const hasRecord = getAttendanceRecords(attendanceData)?.[recordKey];
                return hasRecord ? (
                  <button key={p} onClick={() => handleClearAttendance(p)} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-rose-500/25 disabled:opacity-50"
                  >
                    <X size={15} /> Clear P{p}
                  </button>
                ) : null;
              })}
              <button
                onClick={() => {
                  if (!subject) {
                    alert("Please select a subject first.");
                    return;
                  }
                  const allRecords = getAttendanceRecords(attendanceData);
                  const recordKeys = Object.keys(allRecords);
                  if (recordKeys.length > 0) {
                    const pureDates = recordKeys.map(k => extractPureDate(k)).filter(Boolean).sort();
                    if (pureDates.length > 0) {
                      setReportFromDate(pureDates[0]);
                      setReportToDate(pureDates[pureDates.length - 1]);
                    }
                  }
                  setShowReportModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/25"
                title="Generate Attendance Report"
              >
                <Download size={15} /> Report
              </button>
            </div>
          </div>

          {/* Why-empty diagnostics (roster resolved to zero) */}
          {students.length === 0 && !loading && loadInfo && (
            <div className="mx-5 md:mx-7 mt-4 p-4 bg-slate-50 border border-slate-300 rounded-2xl flex gap-3">
              <AlertCircle size={18} className="text-slate-500 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-mono">
                <p className="font-black text-slate-700 uppercase tracking-wider mb-1 font-sans">Why is the namelist empty?</p>
                <div className="text-slate-600 space-y-0.5">
                  <div>Students doc: <strong>{loadInfo.docFound ? `FOUND (${loadInfo.preKeys} students)` : 'NOT FOUND'}</strong>{!loadInfo.docFound && <span className="opacity-70"> — checked {loadInfo.docId}</span>}</div>
                  <div>Enrolment filter: <strong>{loadInfo.enrol}</strong></div>
                  <div>Recovered from attendance records: <strong>{loadInfo.derived}</strong></div>
                  <div>Attendance records loaded: <strong>{loadInfo.records}</strong></div>
                </div>
                <p className="text-slate-500 font-sans font-medium mt-1.5">Fix: re-upload the namelist (Upload page) or check HOD section allotment for this batch/section.</p>
              </div>
            </div>
          )}
          {/* Record-vs-roster mismatch diagnostics */}
          {rosterFallback && (
            <div className="mx-5 md:mx-7 mt-4 p-4 bg-sky-50 border border-sky-300 rounded-2xl flex gap-3">
              <AlertCircle size={18} className="text-sky-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-black text-sky-800 uppercase tracking-wider mb-1">
                  Namelist missing — roster rebuilt from attendance records
                </p>
                <p className="text-sky-700 font-medium">
                  No namelist found for this class, so {rosterFallback.count} students were restored from
                  marked attendance records. Names may show register numbers — re-upload the namelist
                  (Upload page / HOD allotment) to restore full names.
                </p>
              </div>
            </div>
          )}
          {enrolWarn && (
            <div className="mx-5 md:mx-7 mt-4 p-4 bg-sky-50 border border-sky-300 rounded-2xl flex gap-3">
              <AlertCircle size={18} className="text-sky-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-black text-sky-800 uppercase tracking-wider mb-1">
                  Enrolment list doesn't match namelist IDs
                </p>
                <p className="text-sky-700 font-medium">
                  Course enrolment for {enrolWarn.subject} has {enrolWarn.count} entries but none match this
                  roster's IDs — showing all students instead of an empty list. Ask HOD to re-check the
                  Course Enrolment upload (register no vs admission no series).
                </p>
              </div>
            </div>
          )}
          {recordNotice && (recordNotice.type === 'mismatch' || recordNotice.type === 'empty') && (
            <div className="mx-5 md:mx-7 mt-4 p-4 bg-amber-50 border border-amber-300 rounded-2xl flex gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-black text-amber-800 uppercase tracking-wider mb-1">
                  {recordNotice.type === 'empty'
                    ? 'Saved record has empty entries — no statuses were stored'
                    : 'Saved record found, but no student IDs match this roster'}
                </p>
                <p className="text-amber-700 font-medium">
                  {recordNotice.type === 'empty' ? (
                    <>{recordNotice.date} · Period {recordNotice.period} lists the roster students but every entry is empty (<span className="font-mono font-bold">{`{}`}</span>) — attendance was never actually marked for this period, so there is nothing to display.</>
                  ) : (
                    <>{recordNotice.date} · Period {recordNotice.period} has entries, but none resolve to the
                    listed register numbers — usually admission-no vs register-no series with no bridge
                    record in <span className="font-mono font-bold">student_section_index</span>.</>
                  )}
                </p>
                <p className="text-amber-700 font-medium mt-1">
                  Record keys: <span className="font-mono font-bold">{(recordNotice.recordKeys || []).join(', ') || '—'}</span>
                  <span className="mx-1.5">|</span>
                  Roster: <span className="font-mono font-bold">{(recordNotice.rosterSample || []).join(', ') || '—'}</span>
                </p>
                <div className="mt-2">
                  <p className="text-amber-800 font-black uppercase tracking-wider">
                    Firestore source docs ({(recordSources || []).length} found for this class):
                  </p>
                  <div className="mt-1 space-y-1">
                    {(recordSources || []).slice(0, 6).map(h => {
                      const normK = (rk) => {
                        const s = String(rk || '');
                        const m = s.match(/^(.*?)_+[pP](\d+)\s*$/);
                        if (m) return `${m[1].trim().toLowerCase()}__p${parseInt(m[2], 10)}`;
                        return `legacy__${s.trim().toLowerCase()}`;
                      };
                      const tNk = normK(`${recordNotice.date}_P${recordNotice.period}`);
                      const hasTarget = (h.keys || []).some(k => normK(k) === tNk);
                      return (
                        <div key={h.id} className={`font-mono text-[11px] px-2 py-1 rounded ${hasTarget ? 'bg-amber-200/70 text-amber-900 font-bold' : 'bg-white/60 text-amber-700'}`}>
                          {hasTarget ? '★ ' : ''}{h.id} <span className="opacity-70">({(h.keys || []).length} records)</span>
                        </div>
                      );
                    })}
                    {(recordSources || []).length === 0 && (
                      <span className="font-mono text-[11px] text-amber-700">none (all reads missed)</span>
                    )}
                  </div>
                </div>
                {(recordNotice.rosterCount !== undefined || recordNotice.sampleValue) && (
                  <div className="mt-2 font-mono text-[11px] text-amber-800 bg-white/50 rounded-lg p-2 space-y-0.5">
                    <div>Roster students: <strong>{recordNotice.rosterCount ?? '—'}</strong> · Record entries: <strong>{(recordNotice.allKeys || []).length}</strong> · Section-index entries: <strong>{recordNotice.sectionIndexCount ?? '—'}</strong></div>
                    {recordNotice.sampleValue && (
                      <div className="break-all">First entry value: <strong>{recordNotice.sampleValue}</strong></div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const info = {
                      recordKey: `${recordNotice.date}_P${recordNotice.period}`,
                      recordKeysTotal: (recordNotice.allKeys || []).length,
                      recordKeys: (recordNotice.allKeys || []).slice(0, 60),
                      sampleValue: recordNotice.sampleValue,
                      rosterCount: recordNotice.rosterCount,
                      rosterSample: (recordNotice.rosterSample || []).slice(0, 10),
                      sectionIndexEntries: recordNotice.sectionIndexCount,
                      sourceDocs: (recordSources || []).map(h => ({ id: h.id, records: (h.keys || []).length })),
                    };
                    console.log('[Attendance][diag]', info);
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(JSON.stringify(info, null, 1))
                        .then(() => alert('Diagnostics copied — paste it in chat'))
                        .catch(() => alert('Copy failed — open Console (F12) and copy the [Attendance][diag] line'));
                    } else {
                      alert('Clipboard unavailable — open Console (F12) and copy the [Attendance][diag] line');
                    }
                  }}
                  className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                >
                  Copy debug info
                </button>
                <p className="text-amber-700 font-medium mt-1">
                  You can mark fresh below — saving overwrites this period with the roster IDs.
                </p>
              </div>
            </div>
          )}

          {/* Table body */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-20 flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-medium">Loading attendance data...</p>
              </div>
            ) : !students.length ? (
              <div className="py-16 flex flex-col items-center gap-4">
                <div className="p-4 rounded-2xl bg-slate-50">
                  <FileX size={40} className="text-slate-300" />
                </div>
                <p className="text-sm text-slate-400 font-medium">No students found for this selection.</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Reg No</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                    <th className="px-3 py-3.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-5 py-3.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Attended</th>
                    <th className="px-5 py-3.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map(s => (
                    <tr key={s.reg} className="group transition-all duration-150 hover:bg-indigo-50/40">
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-slate-500 font-mono">{s.reg}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {[
                            { label: 'P', value: 'P', activeClass: 'bg-emerald-500 text-white shadow-emerald-200', hoverClass: 'hover:bg-emerald-50 hover:text-emerald-600' },
                            { label: 'A', value: 'A', activeClass: 'bg-rose-500 text-white shadow-rose-200', hoverClass: 'hover:bg-rose-50 hover:text-rose-600' },
                            { label: 'OD', value: 'OD', activeClass: 'bg-blue-500 text-white shadow-blue-200', hoverClass: 'hover:bg-blue-50 hover:text-blue-600' },
                            { label: '-', value: '-', activeClass: 'bg-slate-500 text-white shadow-slate-200', hoverClass: 'hover:bg-slate-50 hover:text-slate-600' },
                          ].map(({ label, value, activeClass, hoverClass }) => {
                            const isExistingEntry = readOnlyRegs.has(s.reg);
                            return (
                              <button key={value}
                                onClick={() => handleStatusChange(s.reg, value)}
                                disabled={isExistingEntry}
                                className={`min-w-[30px] px-2 py-1.5 rounded-lg text-xs font-black transition-all border ${s.status === value
                                  ? activeClass + ' border-transparent'
                                  : `bg-white text-slate-400 border-slate-200 ${hoverClass} group-hover:border-slate-300`
                                  } ${isExistingEntry ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      {(() => {
                        const stats = cumulativeStatsMap[s.reg] || { attended: 0, totalClasses: nonEventRecordCount, odCount: 0, percentage: "0.00", pctNum: 0 };
                        return (
                          <>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col items-center justify-center">
                                <span className="text-xs font-black text-indigo-600">
                                  {stats.attended} <span className="text-[10px] font-bold text-slate-400">/ {stats.totalClasses}</span>
                                </span>
                                {stats.odCount > 0 && (
                                  <span className="text-[9px] font-bold text-blue-500 font-mono">
                                    {stats.odCount} OD
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center justify-center gap-2.5">
                                <div className="w-full max-w-[100px] h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                  <div className={`h-full rounded-full transition-all duration-700 ${stats.pctNum < 75 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                    }`} style={{ width: `${Math.min(stats.pctNum, 100)}%` }} />
                                </div>
                                <span className={`text-xs font-black min-w-[46px] text-right ${stats.pctNum < 75 ? 'text-rose-600' : 'text-emerald-600'
                                  }`}>
                                  {stats.pctNum.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer summary */}
          {students.length > 0 && (
            <div className="px-5 md:px-7 py-3 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[10px]">
              <span className="text-slate-400 font-medium">
                <strong className="text-slate-600">{filteredStudents.length}</strong> / <strong className="text-slate-600">{students.length}</strong> students shown
              </span>
              <div className="flex items-center gap-4">
                <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />P: <strong className="text-slate-700">{students.filter(s => s.status === 'P').length}</strong></span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5" />A: <strong className="text-slate-700">{students.filter(s => s.status === 'A').length}</strong></span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />OD: <strong className="text-slate-700">{students.filter(s => s.status === 'OD').length}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Save Confirmation Popup ═══ */}
        {saveConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setSaveConfirmation(null)}
            />
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden transform transition-all duration-300 scale-100 animate-scaleUp">
              <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-pink-800 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-white">
                  <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm md:text-base">Confirm Attendance</h3>
                    <p className="text-rose-200 text-[10px] uppercase font-bold tracking-wider">
                      {[
                        saveConfirmation.absent.length > 0 && `${saveConfirmation.absent.length} Absent`,
                        saveConfirmation.od.length > 0 && `${saveConfirmation.od.length} OD`,
                        saveConfirmation.notMarked.length > 0 && `${saveConfirmation.notMarked.length} Not Marked`,
                      ].filter(Boolean).join(', ') || 'All Present'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSaveConfirmation(null)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 max-h-80 overflow-y-auto space-y-4">
                {[
                  { label: 'Absent', list: saveConfirmation.absent, bg: 'bg-rose-50/60', border: 'border-rose-100', avatarBg: 'bg-rose-100', avatarText: 'text-rose-700' },
                  { label: 'OD', list: saveConfirmation.od, bg: 'bg-blue-50/60', border: 'border-blue-100', avatarBg: 'bg-blue-100', avatarText: 'text-blue-700' },
                  { label: 'Not Marked', list: saveConfirmation.notMarked, bg: 'bg-amber-50/60', border: 'border-amber-100', avatarBg: 'bg-amber-100', avatarText: 'text-amber-700' },
                ].map(({ label, list, bg, border, avatarBg, avatarText }) => list.length > 0 && (
                  <div key={label}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{label} ({list.length})</p>
                    <div className="space-y-1.5">
                      {list.map(s => (
                        <div key={s.reg} className={`flex items-center gap-3 px-3.5 py-2 ${bg} rounded-xl border ${border}`}>
                          <div className={`w-7 h-7 rounded-full ${avatarBg} flex items-center justify-center text-[10px] font-black ${avatarText} shrink-0`}>
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-700 truncate">{s.name}</p>
                            <p className="text-[10px] font-mono font-semibold text-slate-400">{s.reg}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setSaveConfirmation(null)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSaveAttendance}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-500/20"
                >
                  <Save size={14} />
                  Confirm & Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Report Data Modal ═══ */}
        {showReportDataModal && reportData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowReportDataModal(false)} />
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-5xl w-full max-h-[90vh] overflow-hidden transform transition-all duration-300 scale-100 animate-scaleUp">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 px-5 md:px-7 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm">
                    <CalendarCheck2 size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-base md:text-lg leading-tight">Attendance Report</h2>
                    <p className="text-amber-200 text-[10px] font-bold uppercase tracking-widest">
                      {reportFromDate} → {reportToDate} · {reportData.totalClasses} class(es)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportReportExcel}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-700/80 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-sm"
                    title="Export Report as Excel (.xlsx)"
                  >
                    <FileSpreadsheet size={15} /> Export Excel
                  </button>
                  <button onClick={handleExportReport}
                    className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-sm"
                    title="Export Report as PDF"
                  >
                    <Download size={15} /> Export PDF
                  </button>
                  <button onClick={() => setShowReportDataModal(false)}
                    className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              {/* Body */}
              <div className="overflow-auto max-h-[calc(90vh-100px)] p-4 md:p-6">
                {reportData.students.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-4">
                    <div className="p-4 rounded-2xl bg-amber-50"><FileX size={40} className="text-amber-300" /></div>
                    <p className="text-sm text-slate-400 font-medium">No data for the selected range.</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-amber-50/50">
                        <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">Reg No</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">Student Name</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-blue-600 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">Total</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">Attended</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-rose-600 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">Absent</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-blue-600 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">OD</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">%</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-blue-500 uppercase tracking-widest bg-amber-50/90 backdrop-blur-sm">OD%</th>
                        {reportData.dates.map(d => {
                          const label = reportData.keyLabels?.[d] || d;
                          const bracketMatch = label.match(/^(.*)(\[.*\])$/);
                          const isEventCol = reportData.eventDates?.has(d);
                          return (
                            <th key={d} className={`px-2 py-3.5 text-center text-[9px] font-black uppercase tracking-widest whitespace-nowrap min-w-[60px] bg-amber-50/90 backdrop-blur-sm ${isEventCol ? 'bg-amber-100/80 border-x-2 border-amber-300' : 'text-amber-700'}`}>
                              {bracketMatch ? (
                                <><span className={isEventCol ? 'text-amber-700' : ''}>{bracketMatch[1]}</span><span className="text-amber-400 font-extrabold">{bracketMatch[2]}</span></>
                              ) : (
                                label
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData.students.map(s => {
                        const absent = s.absent !== undefined ? s.absent : Math.max(0, s.totalClasses - s.attended - s.odCount);
                        return (
                          <tr key={s.reg} className="hover:bg-amber-50/40 transition-all duration-150">
                            <td className="px-5 py-3.5"><span className="text-xs font-bold text-slate-500 font-mono">{s.reg}</span></td>
                            <td className="px-5 py-3.5"><span className="text-sm font-semibold text-slate-800">{s.name}</span></td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-blue-700">{s.totalClasses}</td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-emerald-700">{s.attended}</td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-rose-600">{absent}</td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-blue-600">{s.odCount}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                  <div className={`h-full rounded-full transition-all duration-700 ${parseFloat(s.percentage) < 75 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`} style={{ width: `${Math.min(parseFloat(s.percentage), 100)}%` }} />
                                </div>
                                <span className={`text-xs font-black min-w-[44px] text-right ${parseFloat(s.percentage) < 75 ? 'text-rose-600' : 'text-emerald-600'}`}>{s.percentage}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-blue-600">{s.odPercentage}%</td>
                            {reportData.dates.map(d => {
                              const isEvent = reportData.eventDates?.has(d);
                              const val = s.dailyRecords[d];
                              const cellColor = val === 'P' ? 'text-emerald-600' : val === 'OD' ? 'text-blue-600' : val === 'A' ? 'text-rose-500' : 'text-slate-300';
                              return (
                                <td key={d} className={`px-2 py-3.5 text-center text-xs font-black whitespace-nowrap ${isEvent ? 'bg-amber-50/60 border-x-2 border-amber-200' : ''} ${cellColor}`}>
                                  {val || '—'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
        {/* ═══ Report Parameters Modal ═══ */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            {/* Backdrop blur */}
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setShowReportModal(false)}
            />

            {/* Modal Container */}
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100 animate-scaleUp">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-white">
                  <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                    <CalendarCheck2 size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm md:text-base">Retrieve Attendance Report</h3>
                    <p className="text-blue-100 text-[10px] uppercase font-bold tracking-wider">Choose Date Range</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">From Date</label>
                    <input
                      type="date"
                      value={reportFromDate}
                      onChange={e => setReportFromDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">To Date</label>
                    <input
                      type="date"
                      value={reportToDate}
                      onChange={e => setReportToDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const allRecords = getAttendanceRecords(attendanceData);
                      const recordKeys = Object.keys(allRecords);
                      if (recordKeys.length > 0) {
                        const pureDates = recordKeys.map(k => extractPureDate(k)).filter(Boolean).sort();
                        if (pureDates.length > 0) {
                          setReportFromDate(pureDates[0]);
                          setReportToDate(pureDates[pureDates.length - 1]);
                        }
                      }
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-all"
                  >
                    All Dates (Full Subject)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const y = now.getFullYear();
                      const m = String(now.getMonth() + 1).padStart(2, '0');
                      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
                      setReportFromDate(`${y}-${m}-01`);
                      setReportToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    This Month
                  </button>
                </div>

                {/* Warning/Info */}
                <div className="p-3.5 bg-blue-50/50 rounded-2xl border border-blue-100 flex gap-2.5">
                  <FileText size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                    Selecting a date range will fetch and consolidate all attendance records recorded within those dates for the active subject.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleGenerateReport();
                    setShowReportDataModal(true);
                    setShowReportModal(false);
                  }}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20"
                >
                  <CalendarCheck2 size={14} />
                  Generate Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
