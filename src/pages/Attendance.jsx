import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, getDoc, getDocs, setDoc, onSnapshot, collection, deleteField } from "firebase/firestore";
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
  X
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { fetchAllCourseNamesMap, getCourseName } from "../utils/courseUtils";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay, getAttendanceRecords, parseStudentAttendanceVal, sanitizeKey } from "../lib/utils";
import useUnsavedChanges from "../hooks/useUnsavedChanges";

// Sanitize key — imported from lib/utils to match system-wide format

function extractPureDate(key) {
  if (!key) return '';
  const str = String(key).trim();
  if (str.includes('_P')) return str.slice(0, str.lastIndexOf('_P'));
  return str;
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
    return map;
  }, [sectionIndex]);

  const getStudentData = useCallback((studentsMap, id) => {
    if (!studentsMap || !id) return undefined;
    const targetId = String(id).trim().toLowerCase();
    const altId = idMap[id] ? String(idMap[id]).trim().toLowerCase() : '';

    // 1. If studentsMap is an Array: [ { reg, status }, ... ] or [ { regNo, status }, ... ]
    if (Array.isArray(studentsMap)) {
      const match = studentsMap.find(item => {
        if (!item) return false;
        const itemReg = String(item.reg || item.regNo || item.admNo || item.admissionNo || item.id || '').trim().toLowerCase();
        return itemReg === targetId || (altId && itemReg === altId);
      });
      return match || undefined;
    }

    // 2. If studentsMap is an Object: { "420725104001": ... }
    if (typeof studentsMap === 'object') {
      if (studentsMap[id] !== undefined) return studentsMap[id];
      if (idMap[id] && studentsMap[idMap[id]] !== undefined) return studentsMap[idMap[id]];

      const keys = Object.keys(studentsMap);
      const matchedKey = keys.find(k => {
        const normK = String(k).trim().toLowerCase();
        return normK === targetId || (altId && normK === altId);
      });
      if (matchedKey) return studentsMap[matchedKey];
    }

    return undefined;
  }, [idMap]);

  const findRecordForPeriod = useCallback((recordsObj, dateStr, periodVal) => {
    if (!recordsObj || !dateStr || !periodVal) return null;
    const exactKey = `${dateStr}_P${periodVal}`;
    if (recordsObj[exactKey]) return recordsObj[exactKey];

    const targetDate = String(dateStr).trim();
    const targetP = String(periodVal).trim();

    const keys = Object.keys(recordsObj);
    const match = keys.find(k => {
      if (!k.startsWith(targetDate)) return false;
      const rest = k.slice(targetDate.length).replace(/^[_ -]+/, '').toLowerCase();
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
    if (inRange) return { blocked: false, msg: '', minDate, maxDate };
    if (selected < minDate) return { blocked: true, msg: 'This date is before the semester start date. Attendance cannot be marked before the semester begins.', minDate, maxDate };
    if (selected > maxDate) return { blocked: true, msg: 'This date is after the semester end date. Attendance cannot be marked after the semester ends.', minDate, maxDate };
    return { blocked: true, msg: 'This date is outside the configured semester date range.', minDate, maxDate };
  }, [semesterConfigs, attendanceDate]);

  // New Logic: Fetch subjects based on Programme and Department assignments
  useEffect(() => {
    if (!programme || !department || !currentUid || !userRole) return;

    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const progKey = formatProgrammeKey(programme);
    const deptKey = sanitizeKey(department);
    const targetDeptNorm = norm(department);
    const targetProgNorm = norm(programme);
    const assignmentsRef = collection(db, "subject_assignments");

    const unsubscribe = onSnapshot(assignmentsRef, async (snapshot) => {
      const contexts = [];
      const batchesToFetchSyllabus = new Set();

      snapshot.docs.forEach(doc => {
        const idNorm = norm(doc.id);
        const matchDept = idNorm.includes(targetDeptNorm) || (deptKey && idNorm.includes(norm(deptKey)));
        const matchProg = !targetProgNorm || idNorm.includes(targetProgNorm) || (progKey && idNorm.includes(norm(progKey))) || targetProgNorm.includes('ug') || idNorm.includes('ug') || idNorm.includes('be') || idNorm.includes('btech');

        if (!matchDept || !matchProg) return;

        const parts = doc.id.split('_').filter(Boolean);
        let batch = parts[0];
        let ay = parts[1];
        let sem = parts[2];
        let secSuffix = '';

        const secPart = parts.find(p => /^Sec/i.test(p) || /^Section/i.test(p));
        if (secPart) {
          secSuffix = secPart;
        }

        const numericParts = parts.filter(p => /^\d{4}/.test(p) || /^\d+$/.test(p) || /^Sem/i.test(p));
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
          handleSubjectChange(match.value);
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
              handleSubjectChange(match.value);
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

  const handleSubjectChange = (val) => {
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
    setPeriods([]);
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
      const legacyCompositeKey = `${progKey}_${department.replace(/[.#$[\]]/g,'_')}_${batch.replace(/[.#$[\]]/g,'_')}_${academicYear.replace(/[.#$[\]]/g,'_')}_${semNum}`;

      try {
        let allocationSnap = await getDoc(doc(db, "timetable_allocations", compositeKey));
        if (!allocationSnap.exists() && legacyCompositeKey !== compositeKey) {
          allocationSnap = await getDoc(doc(db, "timetable_allocations", legacyCompositeKey));
        }
        if (allocationSnap.exists()) {
          const allocationData = allocationSnap.data();
          setTimetableConfig(allocationData);

          const periods = [];
          const periodsPerDay = parseInt(allocationData.periodsPerDay, 10) || 0;
          for (let i = 1; i <= periodsPerDay; i++) {
            const start = computePeriodStart(i, allocationData);
            const dur = parseInt(allocationData.periodDurations[i] || 0, 10) || 0;
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
  }, [programme, department, batch, academicYear, semester, computePeriodStart]);

  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) {
      setAttendanceData(null);
      setStudents([]);
      setMasterList({});
      setRecordDates([]);
      setCurrentRecordData(null);
      setReportData(null);
      setShowReport(false);
      setShowReportDataModal(false);
      setTopicTaught("");
      setTeachingAid("");
      setTeachingMethodology("");
      return;
    }

    setLoading(true);
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const attendanceDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}${sectionSuffix}`;
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;

    const fetchData = async () => {
      try {
        const baseAttendanceDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}`;
        let attendanceSnap = await getDoc(doc(db, "attendance", attendanceDocId));
        // Fallback for attendance docId with different progKey/ batch format
        if (!attendanceSnap.exists()) {
          try {
            const allAttSnap = await getDocs(collection(db, 'attendance'));
            const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetCodeNorm = norm(selectedSubjectObj.code);
            const targetBatchNorm = norm(batch);
            const targetDeptNorm = norm(department);
            for (const dSnap of allAttSnap.docs) {
              const idNorm = norm(dSnap.id);
              if (idNorm.includes(targetCodeNorm) && idNorm.includes(targetDeptNorm) && idNorm.includes(targetBatchNorm)) {
                const dData = dSnap.data() || {};
                const hasCode = String(dSnap.id).includes(selectedSubjectObj.code);
                if (hasCode) { attendanceSnap = dSnap; break; }
              }
            }
          } catch (e) { console.warn('[Attendance] attendance fallback scan error:', e); }
        }
        let studentSnap = await getDoc(doc(db, "students", compositeKey));
        if (!studentSnap.exists() && sectionSuffix) {
          const baseKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
          studentSnap = await getDoc(doc(db, "students", baseKey));
        }
        // ── Robust fallback: scan all students docs by _meta if exact keys miss (handles programme UG vs B_E & batch format variants) ──
        if (!studentSnap.exists()) {
          try {
            const allSnap = await getDocs(collection(db, 'students'));
            const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const batchNorm = (s) => {
              const str = String(s || '');
              const m = str.match(/\d{4}\s*-\s*\d{2,4}/);
              if (m) {
                let b = m[0].replace(/\s/g, '');
                // expand 2024-28 -> 2024-2028
                const parts = b.split('-');
                if (parts[1] && parts[1].length === 2) b = `${parts[0]}-20${parts[1]}`;
                return b;
              }
              return str.match(/\d{4}-\d{4}/)?.[0] || str;
            };
            const targetBatch = batchNorm(batch);
            const targetDeptNorm = norm(department);
            const targetSection = String(section || '').trim().toLowerCase();
            let bestSnap = null;
            let bestScore = -1;
            allSnap.forEach(dSnap => {
              const dData = dSnap.data() || {};
              const meta = dData._meta || {};
              const docIdNorm = norm(dSnap.id);
              const deptMatch = meta.department ? (norm(meta.department) === targetDeptNorm || norm(meta.department).includes(targetDeptNorm) || targetDeptNorm.includes(norm(meta.department))) : docIdNorm.includes(targetDeptNorm);
              const batchMatch = meta.batch ? batchNorm(meta.batch) === targetBatch : docIdNorm.includes(norm(targetBatch));
              if (!deptMatch || !batchMatch) return;
              let score = 0;
              const metaSec = String(meta.section || '').toLowerCase();
              if (metaSec === targetSection) score += 10;
              else if (!targetSection && !metaSec) score += 5;
              else if (dSnap.id.toLowerCase().includes(targetSection)) score += 3;
              // prefer docs that actually have students
              const hasStudents = Object.keys(dData).some(k => !k.startsWith('_'));
              if (hasStudents) score += 2;
              if (score > bestScore) { bestScore = score; bestSnap = dSnap; }
            });
            if (bestSnap) {
              studentSnap = { exists: () => true, data: () => bestSnap.data(), id: bestSnap.id };
            }
          } catch (e) {
            console.warn('[Attendance] students fallback scan error:', e);
          }
        }

        const data = attendanceSnap.data() || {};
        let mergedMeta = data._meta || {};
        let mergedRecords = { ...getAttendanceRecords(data) };

        // If section is selected, ALSO merge records from base doc ID (unsectioned/legacy attendance records)
        if (sectionSuffix) {
          try {
            const baseSnap = await getDoc(doc(db, "attendance", baseAttendanceDocId));
            if (baseSnap.exists()) {
              const baseData = baseSnap.data();
              const baseRecords = getAttendanceRecords(baseData);
              Object.entries(baseRecords).forEach(([rk, rVal]) => {
                if (!mergedRecords[rk]) {
                  mergedRecords[rk] = rVal;
                }
              });
              if (!mergedMeta.totalHours && baseData._meta?.totalHours) {
                mergedMeta.totalHours = baseData._meta.totalHours;
              }
            }
          } catch (e) {
            console.warn('[Attendance] Base attendance doc merge warning:', e);
          }
        }

        const attData = {
          _meta: mergedMeta,
          records_json: JSON.stringify(mergedRecords),
          records: mergedRecords
        };

        let rawMaster = studentSnap.data() || {};
        setAttendanceData(attData);

        // Fetch student_section_index for dual-ID lookup (admissionNo ↔ regNo)
        let secIdxData = {};
        try {
          const secIdxSnap = await getDoc(doc(db, 'student_section_index', compositeKey));
          if (secIdxSnap.exists()) {
            secIdxData = secIdxSnap.data();
          } else if (sectionSuffix) {
            const baseSecKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
            const baseSecSnap = await getDoc(doc(db, 'student_section_index', baseSecKey));
            if (baseSecSnap.exists()) secIdxData = baseSecSnap.data();
          }
          // Fallback: if studentSnap was resolved via scan, try its id for section index
          if (!Object.keys(secIdxData).length && studentSnap?.id && studentSnap.id !== compositeKey) {
            try {
              const altSnap = await getDoc(doc(db, 'student_section_index', studentSnap.id));
              if (altSnap.exists()) secIdxData = altSnap.data();
            } catch {}
          }
          // Final fallback: scan all student_section_index docs by meta-like matching
          if (!Object.keys(secIdxData).length) {
            try {
              const allSecSnap = await getDocs(collection(db, 'student_section_index'));
              const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const targetDeptNorm = norm(department);
              const targetBatchNorm = norm(batch);
              for (const dSnap of allSecSnap.docs) {
                const idNorm = norm(dSnap.id);
                if (idNorm.includes(targetDeptNorm) && idNorm.includes(targetBatchNorm)) {
                  const dData = dSnap.data() || {};
                  if (Object.keys(dData).some(k => !k.startsWith('_'))) { secIdxData = dData; break; }
                }
              }
            } catch {}
          }
        } catch (e) {
          console.warn('[Attendance] student_section_index load error:', e);
        }
        setSectionIndex(secIdxData);

        // Filter to only enrolled students from course_enrolments — robust fallback
        try {
          let enrolDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${sanitizeKey(selectedSubjectObj.code)}${sectionSuffix}`;
          let enrolSnap = await getDoc(doc(db, 'course_enrolments', enrolDocId));
          if (!enrolSnap.exists() && sectionSuffix) {
            const baseEnrolDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${sanitizeKey(selectedSubjectObj.code)}`;
            enrolSnap = await getDoc(doc(db, 'course_enrolments', baseEnrolDocId));
          }
          // Fallback: scan all enrolment docs for this subject/batch/dept/section (handles progKey mismatch)
          if (!enrolSnap.exists()) {
            try {
              const allEnrolSnap = await getDocs(collection(db, 'course_enrolments'));
              const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const targetCodeNorm = norm(selectedSubjectObj.code);
              const targetDeptNorm = norm(department);
              const targetBatchNorm = norm(batch);
              const targetSecNorm = norm(section);
              for (const dSnap of allEnrolSnap.docs) {
                const idNorm = norm(dSnap.id);
                if (idNorm.includes(targetCodeNorm) && idNorm.includes(targetDeptNorm) && idNorm.includes(targetBatchNorm)) {
                  if (targetSecNorm && !idNorm.includes(targetSecNorm)) {
                    // if section selected but doc is base (no section), still consider as fallback
                    // keep but prefer section-specific
                  }
                  const dData = dSnap.data() || {};
                  if (Object.keys(dData).some(k => dData[k])) { enrolSnap = dSnap; break; }
                }
              }
            } catch {}
          }
          if (enrolSnap.exists()) {
            const enrolledData = enrolSnap.data();
            const enrolledKeys = new Set(Object.keys(enrolledData).filter(k => enrolledData[k] && !k.startsWith('_')));
            // If enrolment doc exists but has zero enrolled keys, treat as "no enrolment filter" — show all students
            if (enrolledKeys.size > 0) {
              const hasAnyMatch = Object.keys(rawMaster).some(k => !k.startsWith('_') && enrolledKeys.has(k));
              // Only apply filter if at least one student matches; otherwise show all (prevents empty namelist)
              if (hasAnyMatch) {
                const filtered = { _meta: rawMaster._meta };
                if (rawMaster._order) filtered._order = rawMaster._order;
                if (rawMaster._joiningAY) filtered._joiningAY = rawMaster._joiningAY;
                Object.keys(rawMaster).forEach(k => {
                  if (k !== '_meta' && k !== '_order' && k !== '_joiningAY' && enrolledKeys.has(k)) {
                    filtered[k] = rawMaster[k];
                  }
                });
                // If filtered results in zero students but rawMaster had students, keep rawMaster (backward compatible)
                const filteredCount = Object.keys(filtered).filter(k => !k.startsWith('_')).length;
                if (filteredCount > 0) rawMaster = filtered;
              }
            }
          }
        } catch (e) {
          console.warn('Enrollment filter failed, showing all students:', e);
        }
        setMasterList(rawMaster);

        // Build default student list with cumulative attendance
        const joiningAY = rawMaster._joiningAY || {};
        const masterListObj = {};
        Object.entries(rawMaster)
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

        const order = rawMaster._order;
        const studentArray = Object.entries(masterListObj).map(([reg, name]) => ({
          reg,
          name,
          hours: 0,
          status: '',
          percentage: "0.00",
          topicTaught: '',
          teachingAid: '',
          teachingMethodology: '',
          _conflict: false
        }));

        studentArray.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));

        setStudents(studentArray);

        // Support both old format ({ _meta, students }), map format ({ _meta, records }), and json format ({ _meta, records_json })
        let recordKeys = [];
        const recordsObj = getAttendanceRecords(attData);
        if (Object.keys(recordsObj).length > 0) {
          recordKeys = Object.keys(recordsObj).sort();
        } else if (attData?._meta?.date) {
          // Migrate old format: wrap into records
          recordKeys = [attData._meta.date];
        }
        setRecordDates(recordKeys);
        setCurrentRecordData(null);
        setTotalConducted("1");
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    fetchData();
  }, [programme, department, batch, academicYear, semester, subject, section]);

  const handleStatusChange = (reg, status) => {
    // Don't allow changing read-only entries
    if (readOnlyRegs.has(reg)) return;

    const total = parseInt(totalConducted, 10) || 0;
    let val = 0;
    if (status === 'P') {
      val = total;
    }

    setStudents(prev => prev.map(s => {
      if (s.reg === reg) {
        return {
          ...s,
          status: status,
          hours: val,
          percentage: total > 0 ? ((val / total) * 100).toFixed(2) : "0.00",
          topicTaught: topicTaught.trim(),
          teachingAid,
          teachingMethodology
        };
      }
      return s;
    }));
  };

  // Auto-load attendance when date or periods change
  useEffect(() => {
    if (!Object.keys(masterList).length || !attendanceDate || !periods.length) return;

    const firstPeriod = periods[0];
    const recordsMap = getAttendanceRecords(attendanceData);
    const dateRecord = findRecordForPeriod(recordsMap, attendanceDate, firstPeriod);
    setCurrentRecordData(dateRecord);

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

      // If dateRecord exists (period was already marked), but student entry was missing/empty in Firestore, default to 'P' (Present)
      let status = studentExists ? storedStatus : (dateRecord ? 'P' : '');
      if (dateRecord && !studentExists) {
        hours = totalH;
      }

      let isConflict = false;
      const rawConflictVal = getStudentData(periodConflict?.record, reg);
      const parsedConflict = parseStudentAttendanceVal(rawConflictVal);
      if (parsedConflict !== null) {
        hours = parsedConflict.hours;
        status = parsedConflict.status;
        isConflict = true;
      }
      return {
        reg, name, hours,
        status,
        percentage: totalH > 0 ? ((hours / totalH) * 100).toFixed(2) : "0.00",
        topicTaught: stuTopic,
        teachingAid: stuAid,
        teachingMethodology: stuMethod,
        _conflict: isConflict
      };
    });

    studentArray.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));

    setStudents(studentArray);
  }, [attendanceDate, periods, attendanceData, masterList, periodConflict]);

  // Check if period is already marked by another subject in the same batch for overlapping students
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
        const snap = await getDocs(collection(db, 'attendance'));
        const currentEnrolledRegs = Object.keys(masterList || {}).filter(k => !k.startsWith('_'));

        for (const d of snap.docs) {
          if (!d.id.startsWith(batchPrefix)) continue;
          const rec = getAttendanceRecords(d.data())?.[recordKey];
          if (!rec) continue;
          // Extract subject code from doc ID
          let rest = d.id.slice(batchPrefix.length);
          const secIdx = rest.indexOf('_Sec-');
          if (secIdx !== -1) rest = rest.slice(0, secIdx);
          // Skip current subject's own doc
          if (rest === currentSubjectCode) continue;

          // Check if marked students in the other subject overlap with enrolled students of the current subject
          if (currentEnrolledRegs.length > 0) {
            const markedStudents = rec.students || {};
            const hasOverlap = currentEnrolledRegs.some(reg => markedStudents[reg] !== undefined);
            if (!hasOverlap) {
              // No overlap: this marked record belongs to a parallel elective / course with different students
              continue;
            }
          }

          if (!cancelled) setPeriodConflict({ subjectCode: rest, markedBy: rec.markedBy || '', record: rec.students || {} });
          return;
        }
        if (!cancelled) setPeriodConflict(null);
      } catch (e) { console.warn('[Attendance] Period conflict check error:', e); if (!cancelled) setPeriodConflict(null); }
    };
    check();
    return () => { cancelled = true; };
  }, [period, attendanceDate, batch, academicYear, semester, programme, department, subject, masterList]);

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

    const order = masterList._order;
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

    const studentStats = Object.keys(studentMap).map(reg => {
      let attended = 0, markedClasses = 0, odCount = 0;
      const dailyRecords = {};
      allKeys.forEach(key => {
        const rec = allRecords[key];
        const rawVal = getStudentData(rec?.students, reg);
        const parsedVal = parseStudentAttendanceVal(rawVal);

        if (rec?.isEvent) {
          const isPresent = parsedVal ? (parsedVal.status === 'P' || parsedVal.hours > 0) : true;
          dailyRecords[key] = parsedVal ? parsedVal.status : (isPresent ? 'P' : '—');
          return;
        }

        let statusStr = 'P';
        if (parsedVal) {
          const isOd = parsedVal.status === 'OD' || parsedVal.hours === -1;
          if (isOd) {
            odCount++;
            statusStr = 'OD';
          } else if (parsedVal.status === 'P' || parsedVal.hours > 0) {
            attended++;
            statusStr = 'P';
          } else if (parsedVal.status === 'A' || parsedVal.hours <= 0) {
            statusStr = 'A';
          }
        } else {
          // Marked period where student was missing from studentsObj — count as Present ('P')
          attended++;
          statusStr = 'P';
        }
        markedClasses++;
        dailyRecords[key] = statusStr;
      });
      const classesForPct = markedClasses - odCount;
      return {
        reg,
        name: studentMap[reg],
        attended,
        totalClasses: markedClasses,
        odCount,
        percentage: classesForPct > 0 ? ((attended / classesForPct) * 100).toFixed(2) : (markedClasses > 0 ? "0.00" : "0.00"),
        odPercentage: markedClasses > 0 ? ((odCount / markedClasses) * 100).toFixed(2) : "0.00",
        dailyRecords
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
      const absent = s.totalClasses - s.attended - s.odCount;
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

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.reg.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveAttendance = async () => {
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

    const makeStudentEntry = (s) => ({
      status: s.status,
      hours: s.hours,
      topicTaught: isEventAttendance ? "" : (s.topicTaught || topicTaught.trim()),
      teachingAid: isEventAttendance ? "" : (s.teachingAid || teachingAid),
      teachingMethodology: isEventAttendance ? "" : (s.teachingMethodology || teachingMethodology)
    });

    students.forEach(s => {
      if (s._conflict) return; // skip conflict students
      const finalStatus = s.status || 'P';
      const finalHours = finalStatus === 'P' ? (parseInt(totalConducted, 10) || 1) : (finalStatus === 'OD' ? -1 : 0);
      const studentObj = { ...s, status: finalStatus, hours: finalHours };
      if (isAnotherFacultyRecord && (getStudentData(existingStudents, s.reg) !== undefined)) return; // skip existing in merge mode
      const entry = makeStudentEntry(studentObj);
      newStudentsMap[s.reg] = entry;
      const altId = idMap[s.reg];
      if (altId) newStudentsMap[altId] = entry;
    });
    let mergedStudentsMap = { ...existingStudents, ...newStudentsMap };
    const hasNewEntries = Object.keys(newStudentsMap).length > 0;

    if (!hasNewEntries && !isAnotherFacultyRecord) {
      // Regular flow, build map from all active students (defaulting unmarked to P)
      const freshMap = {};
      students.forEach(s => {
        if (s._conflict) return; // skip conflict students
        const finalStatus = s.status || 'P';
        const finalHours = finalStatus === 'P' ? (parseInt(totalConducted, 10) || 1) : (finalStatus === 'OD' ? -1 : 0);
        const studentObj = { ...s, status: finalStatus, hours: finalHours };
        const entry = makeStudentEntry(studentObj);
        freshMap[s.reg] = entry;
        const altId = idMap[s.reg];
        if (altId) freshMap[altId] = entry;
      });
      mergedStudentsMap = freshMap;
    }

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
      await setDoc(doc(db, "attendance", attendanceDocId), {
        _meta: { totalHours: nextTotal, updatedAt: new Date().toISOString() },
        records_json: JSON.stringify(updatedRecords),
        records: deleteField()
      }, { merge: true });
      alert(`Attendance for ${attendanceDate} (Periods: ${periods.join(', ')}) saved successfully!`);

      const newRecordKeys = Object.keys(updatedRecords).sort();
      setRecordDates(newRecordKeys);
      setAttendanceData(prev => ({ ...prev, records_json: JSON.stringify(updatedRecords), records: updatedRecords, _meta: { totalHours: nextTotal } }));

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

      await setDoc(doc(db, "attendance", attendanceDocId), {
        records_json: JSON.stringify(updatedRecords),
        records: deleteField()
      }, { merge: true });

      setAttendanceData(prev => ({ ...prev, records_json: JSON.stringify(updatedRecords), records: updatedRecords }));
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
      // Don't overwrite read-only entries
      if (readOnlyRegs.has(s.reg)) return s;
      return {
        ...s, status: 'P', hours: total,
        percentage: total > 0 ? "100.00" : "0.00",
        topicTaught: topicTaught.trim(),
        teachingAid,
        teachingMethodology
      };
    }));
  };

  // ─── cumulative attendance from all records ───
  const cumulativeAttended = useMemo(() => {
    const recordsMap = getAttendanceRecords(attendanceData);
    if (!Object.keys(recordsMap).length) return {};
    const counts = {};
    Object.values(recordsMap).forEach(record => {
      if (record.isEvent) return;
      const studentsObj = record.students || {};
      Object.keys(masterList || {}).forEach(reg => {
        if (reg.startsWith('_')) return;
        const rawVal = getStudentData(studentsObj, reg);
        const parsedVal = parseStudentAttendanceVal(rawVal);
        if (parsedVal) {
          if (parsedVal.status !== 'OD' && parsedVal.status !== 'A') {
            counts[reg] = (counts[reg] || 0) + 1;
          }
        } else {
          // Marked period where student entry was missing in studentsObj — default to attended
          counts[reg] = (counts[reg] || 0) + 1;
        }
      });
    });
    return counts;
  }, [attendanceData, masterList, getStudentData]);

  // ─── cumulative OD count ───
  const cumulativeOD = useMemo(() => {
    const recordsMap = getAttendanceRecords(attendanceData);
    if (!Object.keys(recordsMap).length) return {};
    const counts = {};
    Object.values(recordsMap).forEach(record => {
      if (record.isEvent) return;
      const studentsObj = record.students || {};
      Object.keys(masterList || {}).forEach(reg => {
        if (reg.startsWith('_')) return;
        const rawVal = getStudentData(studentsObj, reg);
        const parsedVal = parseStudentAttendanceVal(rawVal);
        if (parsedVal && (parsedVal.status === 'OD' || parsedVal.hours === -1)) {
          counts[reg] = (counts[reg] || 0) + 1;
        }
      });
    });
    return counts;
  }, [attendanceData, masterList, getStudentData]);

  // ─── non-event record count (excludes event attendance from total classes) ───
  const nonEventRecordCount = useMemo(() => {
    const recordsMap = getAttendanceRecords(attendanceData);
    if (!Object.keys(recordsMap).length) return 0;
    return Object.values(recordsMap).filter(r => !r.isEvent).length;
  }, [attendanceData]);

  // ─── derived stats ───
  const activeStudents = students.filter(s => !s._conflict);
  const pctPresent = activeStudents.length
    ? ((activeStudents.filter(s => s.status === 'P').length / activeStudents.length) * 100).toFixed(1)
    : '—';

  // Read-only student regs (existing entries from another faculty for current subject or period conflict)
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
    if (periodConflict?.record) {
      const conflictKeys = Array.isArray(periodConflict.record)
        ? periodConflict.record.map(s => s.reg || s.regNo || s.admNo || s.id)
        : Object.keys(periodConflict.record);
      conflictKeys.forEach(r => {
        if (!r) return;
        regs.add(r);
        if (idMap[r]) regs.add(idMap[r]);
      });
    }
    return regs;
  }, [currentRecordData, currentUid, periodConflict, idMap]);

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
              { label: 'Programme', value: programme, set: v => { setProgramme(v); setDepartment(''); setSubject(''); setSection(''); }, opts: filteredProgrammes, display: formatProgDisplay, disabled: false },
              { label: 'Department', value: department, set: v => { setDepartment(v); setSubject(''); setSection(''); }, opts: programme ? filteredDepartments : [], display: d => d, disabled: !programme },
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
                      {availablePeriodsWithTiming.filter(p => !lockedPeriods.has(p.value) || periods.includes(p.value)).map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                  </div>
                </div>
                {periods.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {periods.map(p => {
                      const periodInfo = availablePeriodsWithTiming.find(pi => pi.value === p);
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
                {periods.length > 0 && (periods.some(p => getAttendanceRecords(attendanceData)?.[`${attendanceDate}_P${p}`]) || periodConflict) ? (
                  <span className={`shrink-0 px-2.5 py-1.5 border rounded-lg text-[10px] font-black uppercase tracking-wider ${periodConflict || (() => {
                      const rec = periods.map(p => getAttendanceRecords(attendanceData)?.[`${attendanceDate}_P${p}`]).find(Boolean) || currentRecordData;
                      return rec?.markedBy && rec.markedBy !== currentUid;
                    })()
                      ? 'bg-red-100 border-red-300 text-red-700'
                      : 'bg-amber-100 border-amber-300 text-amber-700'
                    }`}>
                    {periodConflict
                      ? `Already marked (${periodConflict.subjectCode})`
                      : (() => {
                        const rec = periods.map(p => getAttendanceRecords(attendanceData)?.[`${attendanceDate}_P${p}`]).find(Boolean) || currentRecordData;
                        if (rec?.markedBy && rec.markedBy !== currentUid) {
                          return `Marked by ${facultyNames[rec.markedBy] || rec.markedBy}`;
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
                  setShowReportModal(true);
                  if (recordDates.length > 0) {
                    const minD = extractPureDate(recordDates[0]);
                    const maxD = extractPureDate(recordDates[recordDates.length - 1]);
                    if (!reportFromDate) setReportFromDate(minD);
                    if (!reportToDate) setReportToDate(maxD);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/25"
                title="Generate Attendance Report"
              >
                <Download size={15} /> Report
              </button>
            </div>
          </div>

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
                    <tr key={s.reg} className={`group transition-all duration-150 ${s._conflict && readOnlyRegs.has(s.reg) ? 'bg-amber-50/40' : 'hover:bg-indigo-50/40'}`}>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-slate-500 font-mono">{s.reg}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                        {s._conflict && readOnlyRegs.has(s.reg) && (
                          <span className="ml-2 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {periodConflict?.subjectCode || 'conflict'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {[
                            { label: 'P', value: 'P', activeClass: 'bg-emerald-500 text-white shadow-emerald-200', hoverClass: 'hover:bg-emerald-50 hover:text-emerald-600' },
                            { label: 'A', value: 'A', activeClass: 'bg-rose-500 text-white shadow-rose-200', hoverClass: 'hover:bg-rose-50 hover:text-rose-600' },
                            { label: 'OD', value: 'OD', activeClass: 'bg-blue-500 text-white shadow-blue-200', hoverClass: 'hover:bg-blue-50 hover:text-blue-600' },
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
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center">
                          <span className="text-xs font-black text-indigo-600">
                            {cumulativeAttended[s.reg] || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-2.5">
                          <div className="w-full max-w-[100px] h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div className={`h-full rounded-full transition-all duration-700 ${((cumulativeAttended[s.reg] || 0) / (nonEventRecordCount || 1)) * 100 < 75 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                              }`} style={{ width: `${Math.min(((cumulativeAttended[s.reg] || 0) / (nonEventRecordCount || 1)) * 100, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-black min-w-[46px] text-right ${((cumulativeAttended[s.reg] || 0) / (nonEventRecordCount || 1)) * 100 < 75 ? 'text-rose-600' : 'text-emerald-600'
                            }`}>
                            {((cumulativeAttended[s.reg] || 0) / (nonEventRecordCount || 1) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
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
                  <button onClick={handleExportReport}
                    className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-sm"
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
                        const absent = s.totalClasses - s.attended - s.odCount;
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
