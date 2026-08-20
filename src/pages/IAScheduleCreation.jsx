import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, setDoc, getDoc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Calendar, Loader2, Save, Send, CheckCircle2, AlertTriangle, 
  ChevronRight, ClipboardList, Info, HelpCircle, Sparkles, Plus,
  Printer, Trash2, Eye, ShieldCheck, Clock, BookOpen, Layers,
  PenLine, Search, X, Landmark, UserCheck, Users2, RefreshCw,
  CalendarCheck2, ChevronDown, Layers2, Lock
} from "lucide-react";
import Layout from "../components/Layout";
import { useBatches } from "../hooks/useBatches";
import { useRegulations } from "../hooks/useRegulations";
import { useDepartments } from "../hooks/useDepartments";
import { formatBatchDisplay, formatDepartmentDisplay, getAcademicYears, formatProgrammeKey, sanitizeKey } from "../lib/utils";

const cleanStr = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
const normClean = (s) => String(s || "").replace(/[._\s\-/]/g, "").toLowerCase();
// Normalize a course code for cross-source matching: case-insensitive, internal spaces stripped
// so e.g. "OPE353" and "OPE 353" are treated as the same course.
const normCodeKey = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

const parseSyllabusDocId = (id) => {
  const parts = id.split('_');
  if (parts.length < 3) return { progKey: "", deptKey: "", regKey: "" };
  let progKey = parts[0];
  let deptStartIdx = 1;
  if (['B', 'M'].includes(parts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(parts[1])) {
    progKey = `${parts[0]}_${parts[1]}`;
    deptStartIdx = 2;
  }
  const regKey = parts[parts.length - 1];
  const deptKey = parts.slice(deptStartIdx, parts.length - 1).join('_');
  return { progKey, deptKey, regKey };
};

// Convert 24h string ("09:30" or "14:00") to 12h formatted string ("09:30 AM" or "02:00 PM")
const format12Hour = (time24) => {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const formattedH = String(h).padStart(2, '0');
  return `${formattedH}:${mStr || '00'} ${ampm}`;
};

// Derive FN (Forenoon) or AN (Afternoon) from start time hour (< 12 -> FN, >= 12 -> AN)
const deriveSlotFromTime = (startTimeStr) => {
  if (!startTimeStr) return '';
  const [hStr] = startTimeStr.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return '';
  return h < 12 ? 'FN' : 'AN';
};

// Build complete display string e.g. "FN (09:30 AM - 12:30 PM)"
const buildTimeSlotString = (startTimeStr, endTimeStr) => {
  if (!startTimeStr) return '';
  const slot = deriveSlotFromTime(startTimeStr);
  const start12 = format12Hour(startTimeStr);
  const end12 = endTimeStr ? format12Hour(endTimeStr) : '';
  if (end12) {
    return `${slot} (${start12} - ${end12})`;
  }
  return `${slot} (${start12})`;
};

// Derive course type for a syllabus subject (Theory / Laboratory / Theory Cum Lab / Project Work / Activity)
const deriveSubjectCourseType = (sub) => {
  if (!sub) return "Theory";
  const explicit = String(
    sub.courseType ||
    sub.course_type ||
    sub.category ||
    sub.subjectType ||
    sub.type ||
    ""
  ).trim();

  const ignoreSet = new Set(["", "program course", "overall", "undefined", "null"]);
  if (explicit && !ignoreSet.has(explicit.toLowerCase())) {
    return explicit;
  }

  const normName = String(sub.name || sub.subjectName || sub.courseName || sub.title || "").toUpperCase();
  const isIntegratedByName = normName.includes("THEORY CUM LAB") || normName.includes("THEORY CUM LABORATORY") || normName.includes("WITH LAB") || normName.includes("WITH LABORATORY");
  const isLabByName = normName.includes("LABORATORY") || normName.includes(" PRACTICAL") || normName.endsWith(" PRACTICAL") || normName.includes(" WORKSHOP");
  const isProjectByName = normName.includes("PROJECT WORK") || normName.includes("PROJECT PHASE") || normName.includes("DISSERTATION") || normName.includes("THESIS");
  const isActivityByName = normName.includes("VALUE ADDED") || normName.includes("MANDATORY ACTIVITY");

  if (isIntegratedByName) return "Theory Cum Lab";
  if (isLabByName) return "Laboratory";
  if (isProjectByName) return "Project Work";
  if (isActivityByName) return "Activity";
  return "Theory";
};

const normalizeTypeKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Convert Firestore-array-as-object doc data into an array (same as Curriculum.jsx)
const toArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "object" && v !== null) {
    const vals = Object.values(v);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
    return vals;
  }
  return [];
};

// Map a derived subject course type (e.g. "Theory Cum Lab") to the closest course type
// configured for the regulation in Curriculum.jsx (e.g. "Integrated") so dropdown
// options, row chips and filtering all use the configured names.
const mapToConfiguredCourseType = (derivedType, configuredTypes) => {
  if (!derivedType) return derivedType;
  const d = normalizeTypeKey(derivedType);
  if (!d) return derivedType;

  if (configuredTypes && configuredTypes.length > 0) {
    const exact = configuredTypes.find(t => normalizeTypeKey(t) === d);
    if (exact) return exact;
  }

  const isIntegrated = d.includes("integrated") || d.includes("theorycumlab") || (d.includes("theory") && d.includes("lab")) || d.includes("labintegrated");
  const isLab = d.includes("lab") || d.includes("practical") || d.includes("workshop") || d.includes("drawing");
  const isTheory = d.includes("theory") && !d.includes("lab");
  const isProject = d.includes("project") || d.includes("viva") || d.includes("dissertation") || d.includes("thesis");
  const isActivity = d.includes("activity") || d.includes("valueadded") || d.includes("seminar");

  if (configuredTypes && configuredTypes.length > 0) {
    let best = null;
    let bestScore = 0;
    configuredTypes.forEach(t => {
      const k = normalizeTypeKey(t);
      if (!k) return;
      let score = 0;
      if (isIntegrated && (k.includes("integrated") || (k.includes("theory") && k.includes("lab")))) score += 10;
      if (isLab && (k.includes("lab") || k.includes("practical"))) score += 10;
      if (isTheory && k.includes("theory") && !k.includes("lab")) score += 8;
      if (isProject && (k.includes("project") || k.includes("viva") || k.includes("dissertation") || k.includes("thesis"))) score += 10;
      if (isActivity && (k.includes("activity") || k.includes("seminar") || k.includes("valueadd"))) score += 10;
      if (k.includes(d) || d.includes(k)) score += 4;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    if (best) return best;
  }

  if (isIntegrated) return "Integrated";
  if (isLab) return "Laboratory";
  if (isProject) return "Project Work";
  if (isActivity) return "Activity";
  if (isTheory) return "Theory";

  return derivedType;
};

export default function IAScheduleCreation({ embedded = false }) {
  const navigate = useNavigate();
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  // --- Profile / Auth States ---
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  // --- Selection States ---
  const [selectedProgramme, setSelectedProgramme] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedCourseTypes, setSelectedCourseTypes] = useState([]);
  const [courseTypeOpen, setCourseTypeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // --- Master Data Collections ---
  const [usersMap, setUsersMap] = useState({});
  const [allSyllabus, setAllSyllabus] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [examEvents, setExamEvents] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState([]);
  const [holidayDates, setHolidayDates] = useState([]);
  const [courseTypeConfigs, setCourseTypeConfigs] = useState({});
  const [courseBankMap, setCourseBankMap] = useState({});

  // --- Assignments State (QP Setters, Sets, Window) ---
  const [assignments, setAssignments] = useState({});
  const [timetable, setTimetable] = useState({}); // maps subjectCode -> { date, startTime, endTime, slot, timeSlot }
  const [bulkSetsVal, setBulkSetsVal] = useState("2");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Authenticate user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setCurrentUserData(data);
            setUserRole(data.role || "");
          }
        } catch (err) {
          console.error("Error loading user profile:", err);
        }
      }
      setLoadingUser(false);
    });
    return () => unsub();
  }, []);

  // 2. Read Users Map
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      snap.forEach(d => { map[d.id] = d.data(); });
      setUsersMap(map);
    });
    return () => unsub();
  }, []);

  // 3. Read All Syllabus Documents across departments
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const parsed = parseSyllabusDocId(d.id);
        docs.push({ id: d.id, ...parsed, data: d.data() });
      });
      setAllSyllabus(docs);
    }, () => setAllSyllabus([]));
    return () => unsub();
  }, []);

  // 4. Read All Subject Handling Assignments across departments
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "subject_assignments"), (snap) => {
      const entries = [];
      snap.forEach(docSnap => {
        const idParts = docSnap.id.split('_');
        if (idParts.length < 5) return;

        let sectionExtracted = '';
        let semKey = idParts.pop();
        if (!/^\d+$/.test(semKey) && idParts.length >= 4) {
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

        const docData = docSnap.data() || {};
        Object.entries(docData).forEach(([uid, val]) => {
          if (uid === '_meta' || uid.startsWith('_')) return;

          const addCode = (c) => {
            if (typeof c === 'string' && c.trim()) {
              entries.push({
                code: c.trim().toUpperCase(),
                uid,
                progKey: progKeyExtracted,
                dept: deptKey,
                batch: batchKey,
                academicYear: ayKey,
                semester: String(semKey),
                section: sectionExtracted
              });
            } else if (typeof c === 'object' && c !== null) {
              const codeStr = c.code || c.subjectCode || c.courseCode;
              if (codeStr && typeof codeStr === 'string' && codeStr.trim()) {
                entries.push({
                  code: codeStr.trim().toUpperCase(),
                  uid,
                  progKey: progKeyExtracted,
                  dept: deptKey,
                  batch: batchKey,
                  academicYear: ayKey,
                  semester: String(semKey),
                  section: sectionExtracted
                });
              }
            }
          };

          if (Array.isArray(val)) {
            val.forEach(addCode);
          } else {
            addCode(val);
          }
        });
      });
      setAllAssignments(entries);
    }, (err) => {
      console.warn("Error listening to subject_assignments:", err);
      setAllAssignments([]);
    });
    return () => unsub();
  }, []);

  // 5. Read Academic Calendar & CIA Configs
  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, "academic_calendar_events"), (snap) => {
      const exams = [];
      const hDays = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.type === "Exam") {
          exams.push({ id: d.id, ...data });
        } else if (data.type === "Holiday") {
          if (data.fromDate && data.toDate) {
            let cur = new Date(data.fromDate);
            const end = new Date(data.toDate);
            while (cur <= end) {
              hDays.push(cur.toISOString().split("T")[0]);
              cur.setDate(cur.getDate() + 1);
            }
          } else if (data.eventDate) {
            hDays.push(data.eventDate);
          }
        }
      });
      exams.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));
      setExamEvents(exams);
      setHolidayDates(hDays);
    });

    const unsubCia = onSnapshot(collection(db, "cia_configs"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setCiaConfigs(list);
    });

    const unsubCType = onSnapshot(collection(db, "course_type_configs"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setCourseTypeConfigs(data);
    }, (err) => {
      console.warn("Error listening to course_type_configs:", err);
      setCourseTypeConfigs({});
    });

    const unsubCourseBank = onSnapshot(collection(db, "courses"), (snap) => {
      const map = {};
      const nameMap = {};
      snap.forEach(d => {
        const data = d.data() || {};
        const rawCode = String(data.code || data.subjectCode || data.courseCode || "").trim();
        const code = normCodeKey(rawCode);
        const rawType = String(data.courseType || data.course_type || data.category || "").trim();
        const fallbackType = String(data.type || "").trim();
        const ignoreGeneric = new Set(["program course", "professional elective", "open elective", "mandatory course", "overall"]);
        const type = rawType || (!ignoreGeneric.has(fallbackType.toLowerCase()) ? fallbackType : "");
        const name = String(data.name || data.courseName || data.subjectName || "").trim();
        const dept = sanitizeKey(data.department || "Overall");
        if (code) {
          if (!map[code]) map[code] = {};
          if (!map[code]._byDept) map[code]._byDept = {};
          if (type) map[code]._byDept[dept] = type;
          if (!map[code]._anyType && type) map[code]._anyType = type;
          if (name) map[code].name = name;
          map[code].canonicalCode = rawCode;
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
      setCourseBankMap({ ...map, _nameMap: nameMap });
    }, (err) => {
      console.warn("Error listening to courses (CourseBank):", err);
      setCourseBankMap({});
    });

    return () => {
      unsubEvents();
      unsubCia();
      unsubCType();
      unsubCourseBank();
    };
  }, []);

  // 6. Program & Batch Selection Options
  const programmes = useMemo(() => Object.keys(deptMap || {}), [deptMap]);

  const availableBatches = useMemo(() => {
    const set = new Set();
    const progsToUse = selectedProgramme ? [selectedProgramme] : programmes;
    progsToUse.forEach(p => {
      getActiveBatches(p).forEach(b => set.add(b));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [selectedProgramme, programmes, getActiveBatches]);

  const academicYears = useMemo(() => getAcademicYears(batch), [batch]);

  const semesters = useMemo(() => {
    if (!batch || !academicYear) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    if (yearIndex < 0) return [];
    return [String((yearIndex * 2) + 1), String((yearIndex * 2) + 2)];
  }, [batch, academicYear]);

  useEffect(() => {
    setSemester("");
    setSelectedExamId("");
    setSelectedCourseTypes([]);
  }, [batch, academicYear]);

  const activeProgrammes = useMemo(() => {
    if (!batch) return [];
    const baseProgs = selectedProgramme ? [selectedProgramme] : programmes;
    return baseProgs.filter(p => getActiveBatches(p).includes(batch));
  }, [selectedProgramme, programmes, batch, getActiveBatches]);

  // Exam events (configured in Academic Calendar) filtered for the selected batch
  const getFormattedExamTitle = useCallback((rawTitle, batchName) => {
    if (!rawTitle) return "";
    const bReg = getRegulationForBatch(activeProgrammes[0], batchName || batch);
    if (!bReg) return rawTitle;

    let cleanReg = bReg.trim();
    const rMatch = cleanReg.match(/R\d{4}/i);
    if (rMatch) cleanReg = `AU - ${rMatch[0].toUpperCase()}`;

    const regParenRegex = /\((?:AU\s*-\s*)?R\d{4}\)/i;
    if (regParenRegex.test(rawTitle)) {
      return rawTitle.replace(regParenRegex, `(${cleanReg})`);
    }
    return `${rawTitle} (${cleanReg})`;
  }, [batch, activeProgrammes, getRegulationForBatch]);

  const filteredExamEvents = useMemo(() => {
    if (!batch) return [];
    const cBatch = cleanStr(batch);
    const matching = (examEvents || []).filter(ev => {
      if (ev.batch) {
        const eb = cleanStr(ev.batch);
        if (cBatch && eb && !eb.includes(cBatch) && !cBatch.includes(eb)) return false;
      }
      if (ev.batches && Array.isArray(ev.batches) && ev.batches.length > 0) {
        const ebs = ev.batches.map(b => cleanStr(b));
        if (cBatch && !ebs.some(b => b.includes(cBatch) || cBatch.includes(b))) return false;
      }
      if (ev.ciaId && ciaConfigs.length > 0) {
        const cia = ciaConfigs.find(c => c.id === ev.ciaId);
        if (cia && cia.batch) {
          const cb = cleanStr(cia.batch);
          if (cBatch && cb && !cb.includes(cBatch) && !cBatch.includes(cb)) return false;
        }
      }
      return ev.fromDate && ev.toDate;
    });

    const uniqueMap = new Map();
    matching.forEach(ev => {
      const displayTitle = getFormattedExamTitle(ev.title, batch);
      const key = `${cleanStr(displayTitle)}_${ev.fromDate || ''}_${ev.toDate || ''}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { ...ev, displayTitle });
      }
    });
    return Array.from(uniqueMap.values());
  }, [examEvents, ciaConfigs, batch, getFormattedExamTitle]);

  const selectedExam = useMemo(() => {
    return filteredExamEvents.find(e => e.id === selectedExamId) || null;
  }, [selectedExamId, filteredExamEvents]);

  // Set count configured per academic year in Curriculum (Exam Version Sets).
  // Stored on the linked cia_configs doc as numSetsByAy.{sanitizedAY} (or flat numSets).
  const configuredNumSets = useMemo(() => {
    if (!academicYear) return null;
    let cfg = null;
    if (selectedExam?.ciaId) {
      cfg = ciaConfigs.find(c => c.id === selectedExam.ciaId) || null;
    }
    if (!cfg && selectedExam?.title) {
      const titleNorm = cleanStr(selectedExam.title);
      cfg = ciaConfigs.find(c => {
        const nameNorm = cleanStr(c.examName || c.exam || c.name || c.title || "");
        return nameNorm && (nameNorm === titleNorm || nameNorm.includes(titleNorm) || titleNorm.includes(nameNorm));
      }) || null;
    }
    const ayKey = sanitizeKey(academicYear);
    const ayVal = ayKey ? cfg?.numSetsByAy?.[ayKey] : undefined;
    const parsed = parseInt(ayVal ?? cfg?.numSets ?? "", 10);
    return (parsed > 0) ? parsed : null;
  }, [selectedExam, ciaConfigs, academicYear]);

  // Auto-select first matching exam event
  useEffect(() => {
    if (filteredExamEvents.length > 0) {
      const exists = filteredExamEvents.some(e => e.id === selectedExamId);
      if (!exists) setSelectedExamId(filteredExamEvents[0].id);
    } else {
      setSelectedExamId("");
    }
  }, [filteredExamEvents, selectedExamId]);



  // Working dates (excl. Sundays & academic-calendar holidays) within the selected exam window
  const availableExamDates = useMemo(() => {
    if (!selectedExam || !selectedExam.fromDate || !selectedExam.toDate) return [];
    const holidaySet = new Set(holidayDates || []);
    const dates = [];
    const start = new Date(selectedExam.fromDate);
    const end = new Date(selectedExam.toDate);
    let count = 0;
    while (start <= end && count < 120) {
      const dStr = start.toISOString().split("T")[0];
      const isSunday = start.getDay() === 0;
      if (!isSunday && !holidaySet.has(dStr)) dates.push(dStr);
      start.setDate(start.getDate() + 1);
      count++;
    }
    return dates;
  }, [selectedExam, holidayDates]);

  // Course types configured per regulation in Curriculum (course_type_configs), with AY-specific fallback
  const getConfiguredTypesForRegulation = useCallback((regulation) => {
    if (!regulation) return [];
    const regKey = sanitizeKey(regulation);
    const ayKey = academicYear ? sanitizeKey(academicYear) : "";
    const activeKey = ayKey ? `${regKey}_${ayKey}` : regKey;
    const list = toArray(courseTypeConfigs[activeKey]);
    return list.length > 0 ? list : toArray(courseTypeConfigs[regKey]);
  }, [courseTypeConfigs, academicYear]);

  const getCanonicalCode = useCallback((rawCode, name, deptKey) => {
    if (!name && !rawCode) return rawCode || "";
    const nameMap = courseBankMap._nameMap || {};
    const normName = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (deptKey && normName) {
      const cleanD = sanitizeKey(deptKey);
      if (nameMap[`${cleanD}_${normName}`]) {
        return nameMap[`${cleanD}_${normName}`];
      }
    }
    if (normName && nameMap[normName]) {
      return nameMap[normName];
    }
    const normC = normCodeKey(rawCode);
    if (courseBankMap[normC]?.canonicalCode) {
      return courseBankMap[normC].canonicalCode;
    }
    return rawCode || "";
  }, [courseBankMap]);

  // 7. Aggregate Subjects across ALL Departments (Common vs Department-Specific)
  const syllabusSubjects = useMemo(() => {
    if (!batch || !semester) return [];
    const byCode = {};

    activeProgrammes.forEach(prog => {
      const progKey = formatProgrammeKey(prog);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!regulation) return;
      const regNorm = normClean(regulation);
      const configuredTypes = getConfiguredTypesForRegulation(regulation);

      const matching = allSyllabus.filter(s => s.progKey === progKey && normClean(s.regKey) === regNorm);
      matching.forEach(sDoc => {
        const subs = toArray(sDoc.data?.semesters?.[semester]);
        subs.forEach(sub => {
          if (!sub || sub.isNonOBE === true || sub.isActive === false) return;
          const rawCode = String(sub.code || sub.subjectCode || sub.courseCode || "").trim();
          const name = String(sub.name || sub.subjectName || sub.courseName || sub.title || "").trim();
          if (!rawCode && !name) return;

          const canonicalCode = getCanonicalCode(rawCode, name, sDoc.deptKey);
          const code = canonicalCode || rawCode;
          const codeKey = normCodeKey(code);

          if (!byCode[codeKey]) {
            byCode[codeKey] = { code, name, courseTypes: [], departments: [] };
          }
          if (name && !byCode[codeKey].name) byCode[codeKey].name = name;
          if (code && byCode[codeKey].code !== code) byCode[codeKey].code = code;

          const bankEntry = courseBankMap[codeKey];
          const deptCleanKey = sanitizeKey(sDoc.deptKey);
          const bankType = String(bankEntry?._byDept?.[deptCleanKey] || bankEntry?._anyType || "").trim();
          const ignoreTypes = new Set(["", "program course", "overall", "undefined", "null", "professional elective", "open elective", "mandatory course"]);
          const useBankType = bankType && !ignoreTypes.has(bankType.toLowerCase());
          const baseType = useBankType ? bankType : deriveSubjectCourseType(sub);
          const ct = mapToConfiguredCourseType(baseType, configuredTypes);
          if (ct && !byCode[codeKey].courseTypes.includes(ct)) byCode[codeKey].courseTypes.push(ct);

          const key = `${progKey}|||${sDoc.deptKey}`;
          if (!byCode[codeKey].departments.some(d => d.key === key)) {
            byCode[codeKey].departments.push({ progKey, prog, dept: sDoc.deptKey, key });
          }
        });
      });
    });

    return Object.values(byCode)
      .map(s => ({ ...s, departments: s.departments.sort((a, b) => a.dept.localeCompare(b.dept)) }))
      .sort((a, b) => {
        const commonA = a.departments.length > 1 ? 0 : 1;
        const commonB = b.departments.length > 1 ? 0 : 1;
        if (commonA !== commonB) return commonA - commonB;
        if (a.departments[0]?.dept !== b.departments[0]?.dept) {
          return (a.departments[0]?.dept || "").localeCompare(b.departments[0]?.dept || "");
        }
        return a.code.localeCompare(b.code);
      });
  }, [allSyllabus, activeProgrammes, batch, semester, getRegulationForBatch, getConfiguredTypesForRegulation, courseBankMap]);

  // Configured course types (from Curriculum course_type_configs) across the selected batch's regulations,
  // ordered by configuration. Falls back to types derived from the current semester's subjects when none configured.
  const availableCourseTypes = useMemo(() => {
    const configuredSet = new Set();
    if (batch) {
      activeProgrammes.forEach(prog => {
        const progKey = formatProgrammeKey(prog);
        const regulation = getRegulationForBatch(progKey, batch);
        getConfiguredTypesForRegulation(regulation).forEach(t => {
          const s = String(t).trim();
          if (s) configuredSet.add(s);
        });
      });
    }

    const subjectTypeSet = new Set();
    syllabusSubjects.forEach(s => (s.courseTypes || []).forEach(ct => subjectTypeSet.add(ct)));

    const order = ["Theory", "Theory Cum Lab", "Laboratory", "Project Work", "Activity"];
    const merged = new Set([...configuredSet, ...subjectTypeSet]);
    return order.filter(o => merged.has(o)).concat([...merged].filter(t => !order.includes(t)));
  }, [batch, activeProgrammes, getRegulationForBatch, getConfiguredTypesForRegulation, syllabusSubjects]);

  const getFacultyName = (uid) => {
    const u = usersMap[uid];
    return u?.facultyName || u?.displayName || u?.name || u?.email || "Faculty";
  };

  // 8. Map Handling Faculty for each Course Code across departments
  const codeHandlers = useMemo(() => {
    if (!batch || !academicYear || !semester) return {};
    const map = {};
    const cBatch = cleanStr(batch);
    const cAy = cleanStr(academicYear);
    const cSem = String(semester).trim();

    allAssignments.forEach(a => {
      const matchBatch = !a.batch || cleanStr(a.batch) === cBatch || cleanStr(a.batch).includes(cBatch) || cBatch.includes(cleanStr(a.batch));
      const matchAy = !a.academicYear || cleanStr(a.academicYear) === cAy || cleanStr(a.academicYear).includes(cAy) || cAy.includes(cleanStr(a.academicYear));
      const matchSem = String(a.semester).trim() === cSem;

      if (!matchBatch || !matchAy || !matchSem) return;

      const normCode = normCodeKey(a.code);
      if (!map[normCode]) map[normCode] = [];
      const exists = map[normCode].find(h => h.uid === a.uid && h.dept === a.dept && h.progKey === a.progKey);
      if (!exists) {
        map[normCode].push({ uid: a.uid, dept: a.dept, progKey: a.progKey, prog: a.progKey });
      }
    });

    Object.keys(map).forEach(code => {
      map[code].sort((x, y) => (getFacultyName(x.uid) || '').localeCompare(getFacultyName(y.uid) || ''));
    });
    return map;
  }, [allAssignments, batch, academicYear, semester, usersMap]);

  // Combine rows with handling faculty (respecting the multi-select course type filter)
  const rows = useMemo(() => {
    const showAll = selectedCourseTypes.length === 0;
    const source = syllabusSubjects.filter(s =>
      showAll || (s.courseTypes || []).some(ct => selectedCourseTypes.includes(ct))
    );
    if (!source.length) return [];
    return source.map(s => {
      const normCode = normCodeKey(s.code);
      const handlers = (codeHandlers[normCode] || []).map(h => ({
        uid: h.uid,
        name: getFacultyName(h.uid),
        dept: h.dept,
        progKey: h.progKey,
        label: `${getFacultyName(h.uid)}${s.departments.length > 1 || h.dept ? ` (${formatDepartmentDisplay(h.dept, h.progKey)})` : ""}`
      }));
      return { ...s, handlers };
    });
  }, [syllabusSubjects, codeHandlers, usersMap, selectedCourseTypes]);

  // Auto-Select Rule: Pre-select QP Setter if exactly 1 handling faculty exists
  useEffect(() => {
    if (!rows.length) return;
    setAssignments(prev => {
      const next = { ...prev };
      let changed = false;

      rows.forEach(r => {
        const existing = next[r.code];
        const singleHandlerUid = r.handlers.length >= 1 ? r.handlers[0].uid : "";
        const singleHandlerName = r.handlers.length >= 1 ? r.handlers[0].name : "";

        if (!existing) {
          next[r.code] = {
            code: r.code,
            name: r.name,
            departments: r.departments || [],
            setterUid: singleHandlerUid,
            setterName: singleHandlerName,
            numSets: 1,
            fromDate: "",
            toDate: ""
          };
          changed = true;
        } else if (!existing.setterUid && r.handlers.length >= 1) {
          next[r.code] = {
            ...existing,
            departments: r.departments || existing.departments || [],
            setterUid: singleHandlerUid,
            setterName: singleHandlerName
          };
          changed = true;
        } else if (!existing.departments || existing.departments.length === 0) {
          next[r.code] = {
            ...existing,
            departments: r.departments || []
          };
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [rows]);

  // Helper to normalize any date format (ISO, Timestamp object, DD/MM/YYYY, YYYY-MM-DD) to YYYY-MM-DD
  const getEffectiveExamDate = useCallback((as) => {
    if (!as) return "";
    let raw = as.examDate ?? as.exam_date ?? as.date ?? as.assignedDate ?? "";
    if (!raw) return "";

    if (typeof raw === "object" && raw !== null) {
      if (typeof raw.toDate === "function") {
        raw = raw.toDate().toISOString().split("T")[0];
      } else if (raw.seconds) {
        raw = new Date(raw.seconds * 1000).toISOString().split("T")[0];
      } else if (raw instanceof Date) {
        raw = raw.toISOString().split("T")[0];
      } else {
        raw = String(raw);
      }
    }

    const rawStr = String(raw).trim();
    if (!rawStr) return "";

    if (rawStr.includes("T")) return rawStr.split("T")[0];

    if (rawStr.includes("/")) {
      const parts = rawStr.split("/");
      if (parts.length === 3) {
        const [d, m, y] = parts;
        if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (d.length === 4) return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`;
      }
    }

    if (rawStr.includes("-")) {
      const parts = rawStr.split("-");
      if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
        const [d, m, y] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    return rawStr;
  }, []);

  // 9. Load Saved QP Setter Assignments from Firestore
  useEffect(() => {
    if (!batch || !semester) {
      setAssignments({});
      return;
    }
    const normB = normCodeKey(batch);
    const normAY = academicYear ? normCodeKey(academicYear) : "";
    const normSem = String(semester).trim();

    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      let combinedAssignments = {};
      let foundExamId = "";

      snap.forEach(d => {
        const data = d.data() || {};
        const dBatch = normCodeKey(data.batch || "");
        const normID = normCodeKey(d.id);
        const dSem = String(data.semester || "").trim();
        const dAY = normCodeKey(data.academicYear || "");

        const startYr1 = batch.match(/20\d{2}/)?.[0] || batch.match(/\b\d{2}\b/)?.[0] || "";
        const targetStr = (data.batch || "") + " " + d.id;
        const startYr2 = targetStr.match(/20\d{2}/)?.[0] || targetStr.match(/\b\d{2}\b/)?.[0] || "";

        let yearMatches = false;
        if (startYr1 && startYr2) {
          const y1Clean = startYr1.length === 2 ? `20${startYr1}` : startYr1;
          const y2Clean = startYr2.length === 2 ? `20${startYr2}` : startYr2;
          yearMatches = (y1Clean === y2Clean);
        }

        const isBatchMatch =
          dBatch === normB ||
          (dBatch && normB && (dBatch.includes(normB) || normB.includes(dBatch))) ||
          normID.includes(normB) ||
          yearMatches;

        const isSemMatch = dSem === normSem || d.id.endsWith(`_${normSem}`);
        const isAyMatch = !normAY || !dAY || dAY === normAY || dAY.includes(normAY) || normAY.includes(dAY);

        if (isBatchMatch && isSemMatch && isAyMatch) {
          if (data.assignments && typeof data.assignments === "object") {
            Object.entries(data.assignments).forEach(([k, item]) => {
              if (!item) return;
              const effectiveDate = getEffectiveExamDate(item);
              combinedAssignments[k] = {
                ...item,
                examDate: effectiveDate || item.examDate || ""
              };
            });
          }
          if (data.examId) foundExamId = data.examId;
        }
      });

      setAssignments(prev => ({ ...prev, ...combinedAssignments }));

      if (foundExamId) {
        setSelectedExamId(prev => prev || foundExamId);
      }
    });
    return () => unsub();
  }, [batch, academicYear, semester, getEffectiveExamDate]);

  // 10. Filtered Rows by Search Query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    const qNorm = normCodeKey(searchQuery);
    return rows.filter(r =>
      normCodeKey(r.code).includes(qNorm) ||
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.departments.some(d => d.dept.toLowerCase().includes(q)) ||
      r.handlers.some(h => h.name.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  // Stats calculation
  const totalSubjects = rows.length;
  const commonCount = rows.filter(r => r.departments.length > 1).length;
  const assignedCount = Object.values(assignments).filter(a => a.setterUid).length;

  const getAssignmentForCode = useCallback((code, assignObj) => {
    if (!code || !assignObj) return {};
    if (assignObj[code]) return assignObj[code];
    const targetNorm = normCodeKey(code);
    const matchedKey = Object.keys(assignObj).find(k => normCodeKey(k) === targetNorm);
    if (matchedKey && assignObj[matchedKey]) {
      return assignObj[matchedKey];
    }
    return {};
  }, []);

  const handleAssignmentChange = (code, field, value) => {
    setAssignments(prev => {
      const targetNorm = normCodeKey(code);
      const matchingKeys = Object.keys(prev).filter(k => normCodeKey(k) === targetNorm);
      const keysToUpdate = matchingKeys.length > 0 ? matchingKeys : [code];

      const next = { ...prev };
      keysToUpdate.forEach(k => {
        const cur = next[k] || { code: k, name: "", setterUid: "", setterName: "", numSets: 1, fromDate: "", toDate: "", examDate: "", startTime: "", endTime: "", slot: "", session: "", timeSlot: "" };
        const updated = { ...cur, [field]: value };
        if (field === "setterUid") {
          const handlerObj = usersMap[value];
          updated.setterName = handlerObj ? (handlerObj.facultyName || handlerObj.displayName || handlerObj.name || handlerObj.email) : "";
        }
        if (field === "startTime" || field === "endTime") {
          const sTime = field === "startTime" ? value : (cur.startTime || "");
          const eTime = field === "endTime" ? value : (cur.endTime || "");
          const slot = deriveSlotFromTime(sTime);
          updated.slot = slot;
          updated.session = slot;
          updated.timeSlot = buildTimeSlotString(sTime, eTime);
        }
        next[k] = updated;
      });

      if (!next[code]) {
        const primary = next[keysToUpdate[0]] || {};
        next[code] = { ...primary, code };
      }

      return next;
    });
  };

  // Bulk Apply Submission Window Date Range across all rows
  const handleApplyBulkDates = (from, to) => {
    if (!from || !to) return;
    setAssignments(prev => {
      const next = { ...prev };
      rows.forEach(r => {
        const cur = next[r.code] || { code: r.code, name: r.name, setterUid: "", setterName: "", numSets: 1, fromDate: "", toDate: "" };
        next[r.code] = { ...cur, fromDate: from, toDate: to };
      });
      return next;
    });
    showToast("Applied submission window date range to all subjects!", "success");
  };

  // Bulk Apply Exam Timing across all rows
  const handleApplyBulkTiming = (sTime, eTime) => {
    if (!sTime) return;
    setAssignments(prev => {
      const next = { ...prev };
      rows.forEach(r => {
        const cur = next[r.code] || { code: r.code, name: r.name, setterUid: "", setterName: "", numSets: 1, fromDate: "", toDate: "" };
        const slot = deriveSlotFromTime(sTime);
        next[r.code] = {
          ...cur,
          startTime: sTime,
          endTime: eTime || "",
          slot,
          session: slot,
          timeSlot: buildTimeSlotString(sTime, eTime)
        };
      });
      return next;
    });
    showToast("Applied exam timing to all subjects!", "success");
  };

  // Bulk Apply Question Paper Set count across all rows
  const handleApplyBulkSets = (numSetsVal) => {
    const num = parseInt(numSetsVal, 10);
    if (isNaN(num) || num < 1) return;
    setAssignments(prev => {
      const next = { ...prev };
      rows.forEach(r => {
        const cur = next[r.code] || { code: r.code, name: r.name, setterUid: "", setterName: "", numSets: 1, fromDate: "", toDate: "" };
        next[r.code] = { ...cur, numSets: num };
      });
      return next;
    });
    showToast(`Applied ${num} Set${num > 1 ? 's' : ''} to all subjects!`, "success");
  };

  // ---- Exam Timetable Report (print window with college logo on top) ----
  const buildReportHtml = (logoDataUrl, collegeName) => {
    const scheduled = rows
      .filter(r => getAssignmentForCode(r.code, assignments)?.examDate)
      .map(r => {
        const as = getAssignmentForCode(r.code, assignments);
        const sTime = as.startTime || "";
        const eTime = as.endTime || "";
        const slot = as.slot || as.session || (sTime ? deriveSlotFromTime(sTime) : "");
        return {
          code: r.code,
          name: r.name,
          date: as.examDate,
          startTime: sTime,
          endTime: eTime,
          slot,
          timeSlot: as.timeSlot || buildTimeSlotString(sTime, eTime),
          dept: r.departments.map(d => formatDepartmentDisplay(d.dept, d.progKey)).join(", "),
          isCommon: r.departments.length > 1,
          setter: as.setterName || "-"
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const logoImg = logoDataUrl || "";
    const meta = [
      ["Programme", selectedProgramme || "All Programmes"],
      ["Exam", selectedExam?.title || "-"],
      ["Batch", formatBatchDisplay(batch)],
      ["Academic Year", academicYear],
      ["Semester", `Semester ${semester}`]
    ].map(([k, v]) => `<div class="meta-col"><span class="meta-label">${k}</span><span class="meta-value">${v}</span></div>`).join("");

    const rowsHtml = scheduled.length
      ? scheduled.map((s, idx) => `
          <tr>
            <td class="center">${idx + 1}</td>
            <td class="center">${new Date(s.date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}<br/><span class="day">(${new Date(s.date).toLocaleDateString("en-IN", { weekday: "long" })})</span></td>
            <td class="center">
              ${s.slot ? `<span class="session-badge ${s.slot.toLowerCase()}">${s.slot}</span>` : ""}
              <br/><span class="time-str">${s.startTime ? (s.endTime ? `${format12Hour(s.startTime)} - ${format12Hour(s.endTime)}` : format12Hour(s.startTime)) : "-"}</span>
            </td>
            <td class="center code-cell">${s.code}</td>
            <td class="name-cell">${s.name}${s.isCommon ? '<br/><span class="common-tag">Common</span>' : ""}</td>
            <td class="center">${s.setter}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="center empty">No exam dates assigned yet. Set dates in the "Exam Date Assign" column before generating the report.</td></tr>`;

    return `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>IA Exam Timetable Report</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; line-height: 1.45; }
          .header { text-align: center; border-bottom: 3px solid #120c7a; padding-bottom: 14px; margin-bottom: 18px; }
          .header img { max-width: 130mm; max-height: 28mm; object-fit: contain; }
          .college-name { font-size: 22px; font-weight: 800; color: #120c7a; margin: 10px 0 4px; letter-spacing: 1px; text-transform: uppercase; }
          .header h2 { margin: 6px 0 2px; color: #120c7a; font-size: 18px; letter-spacing: 1px; }
          .header p { margin: 2px 0; font-size: 12px; color: #444; }
          .meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 11px; margin-bottom: 16px; background: #f6f7fb; padding: 10px 14px; border: 1px solid #dde0ef; border-radius: 8px; }
          .meta-col { display: flex; flex-direction: column; gap: 2px; }
          .meta-label { text-transform: uppercase; font-size: 9px; font-weight: 700; color: #7a7f9c; letter-spacing: 1px; }
          .meta-value { font-weight: 800; color: #120c7a; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border: 1px solid #333; padding: 8px 10px; }
          th { background: #120c7a; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
          .center { text-align: center; }
          .day { color: #666; font-size: 10px; font-style: italic; }
          .code-cell { font-weight: 700; color: #120c7a; }
          .name-cell { font-weight: 600; }
          .common-tag { display: inline-block; margin-top: 3px; font-size: 9px; font-weight: 700; color: #7c3aed; background: #f3e8ff; border: 1px solid #e9d5ff; padding: 1px 6px; border-radius: 4px; }
          .session-badge { display: inline-block; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; }
          .session-badge.fn { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
          .session-badge.an { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
          .time-str { font-size: 10px; font-weight: 700; color: #4b5563; }
          .empty { color: #999; font-style: italic; padding: 24px 10px; }
          .footer { margin-top: 44px; display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
          .sig-box { text-align: center; width: 32%; border-top: 1px dashed #333; padding-top: 6px; }
          @media print {
            body { padding: 10mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="text-align:right;margin-bottom:10px">
          <button onclick="window.print()" style="padding:8px 18px;background:#120c7a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Print / Save as PDF</button>
        </div>
        <div class="header">
          ${logoImg ? `<img src="${logoImg}" alt="College Logo" />` : `<div class="college-name">${collegeName || "COLLEGE LOGO"}</div>`}
          ${logoImg ? `<div class="college-name">${collegeName || ""}</div>` : ""}
          <h2>INTERNAL ASSESSMENT EXAMINATION TIMETABLE</h2>
          <p>Semester ${semester} · Academic Year ${academicYear} · Batch ${formatBatchDisplay(batch)}</p>
        </div>
        <div class="meta">${meta}</div>
        <table>
          <thead>
            <tr>
              <th style="width:5%">Sl.No</th>
              <th style="width:18%">Date & Day</th>
              <th style="width:18%">Session & Timing</th>
              <th style="width:14%">Subject Code</th>
              <th>Subject Name</th>
              <th style="width:20%">QP Setter</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <div class="sig-box">Prepared By<br/>Exam Cell / Dept Coordinator</div>
          <div class="sig-box">Controller of Examinations</div>
          <div class="sig-box">Principal</div>
        </div>
      </body>
      </html>`;
  };

  const handleGenerateReport = () => {
    if (!batch || !academicYear || !semester) {
      showToast("Please select Batch, Academic Year and Semester first.", "error");
      return;
    }

    const openReportWindow = (html) => {
      const win = window.open("", "_blank");
      if (!win) {
        showToast("Popup blocked. Please allow pop-ups for this site.", "error");
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { try { win.print(); } catch (e) { /* ignore */ } }, 350);
    };

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxW = 700;
      const maxH = 160;
      let w = img.width;
      let h = img.height;
      const ratio = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try {
        openReportWindow(buildReportHtml(canvas.toDataURL("image/png")));
      } catch (e) {
        openReportWindow(buildReportHtml(""));
      }
    };
    img.onerror = () => openReportWindow(buildReportHtml(""));
    img.src = "/logo.png";
  };

  // Save Assignments to Firestore
  const handleSaveAssignments = async () => {
    if (!batch || !academicYear || !semester) {
      showToast("Please select Batch, Academic Year, and Semester first.", "error");
      return;
    }

    const unassigned = rows.filter(r => !getAssignmentForCode(r.code, assignments)?.setterUid);
    if (unassigned.length > 0) {
      if (!window.confirm(`${unassigned.length} subjects have not been assigned a QP Setter yet. Do you still want to save?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const docKey = `${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semester}`;
      const savedReg = getRegulationForBatch(activeProgrammes[0], batch);
      let cleanExamName = selectedExam?.title || "";
      if (savedReg && cleanExamName) {
        let cleanRegStr = savedReg.trim();
        const rMatch = cleanRegStr.match(/R\d{4}/i);
        if (rMatch) cleanRegStr = `AU - ${rMatch[0].toUpperCase()}`;
        const regParenRegex = /\((?:AU\s*-\s*)?R\d{4}\)/i;
        if (regParenRegex.test(cleanExamName)) {
          cleanExamName = cleanExamName.replace(regParenRegex, `(${cleanRegStr})`);
        } else {
          cleanExamName = `${cleanExamName} (${cleanRegStr})`;
        }
      }

      const payload = {
        batch,
        academicYear,
        semester,
        examId: selectedExam?.id || "",
        examName: cleanExamName || selectedExam?.title || "",
        examWindow: selectedExam ? `${selectedExam.fromDate} to ${selectedExam.toDate}` : "",
        status: "Pending Principal Approval",
        updatedBy: currentUserData?.facultyName || auth.currentUser?.email || "Exam Cell",
        updatedById: auth.currentUser?.uid || "",
        updatedAt: new Date().toISOString(),
        assignments
      };

      await setDoc(doc(db, "qp_setter_assignments", docKey), payload, { merge: true });

      // Notify newly assigned QP setters in background
      Object.values(assignments).forEach(async (as) => {
        if (!as.setterUid) return;
        try {
          await addDoc(collection(db, "notifications"), {
            type: "qp_setter_assigned",
            targetUid: as.setterUid,
            targetName: as.setterName || "",
            batch,
            academicYear,
            semester,
            subjectCode: as.code,
            subjectName: as.name,
            numSets: as.numSets || 1,
            fromDate: as.fromDate || "",
            toDate: as.toDate || "",
            assignedBy: currentUserData?.facultyName || "Exam Cell",
            createdAt: serverTimestamp(),
            read: false
          });
        } catch (e) {
          // ignore silent notification errors
        }
      });

      showToast("IA Schedule saved and moved to Principal for approval!", "success");
    } catch (err) {
      console.error("Failed to save QP setter assignments:", err);
      showToast("Failed to save assignments.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-zinc-400">
        <Loader2 className="animate-spin text-[#120c7a]" size={32} />
        <span className="text-xs font-bold uppercase tracking-wider">Loading Exam Cell Module...</span>
      </div>
    );
  }

  const content = (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-2xl text-xs font-bold ${
            toast.type === "success" 
              ? "bg-emerald-950 border-emerald-500/40 text-emerald-200" 
              : "bg-rose-950 border-rose-500/40 text-rose-200"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} className="text-emerald-400" /> : <AlertTriangle size={18} className="text-rose-400" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className={`${embedded ? "space-y-6" : "p-4 md:p-8 w-full space-y-6 font-sans"}`}>
        {/* Header Banner - Signature Royal Blue Theme */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-[#0d095c] p-6 md:p-8 text-white shadow-2xl border border-blue-900/30">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none hidden lg:block">
            <PenLine size={280} strokeWidth={1} />
          </div>

          <div className="relative z-10 space-y-2.5 max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-blue-400/20 text-blue-200 border border-blue-300/30 backdrop-blur-md">
              <Landmark size={14} className="text-blue-300" /> Exam Cell & COE Command Center
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              QP Setter Assignment & IA Schedule
            </h1>
            <p className="text-blue-100/90 text-sm md:text-base font-medium max-w-3xl leading-relaxed">
              Assign question paper setters, define set counts, and set submission windows centrally per subject for a batch/semester across all departments. Common courses are automatically merged.
            </p>
          </div>
        </div>

        {/* Dynamic Selection Filters */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="text-[#120c7a]" size={18} />
              Select Programme, Batch & Academic Semester
            </h2>
            {totalSubjects > 0 && (
              <span className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-xs font-black">
                {totalSubjects} Subjects Total ({commonCount} Common)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 text-xs font-semibold">
            {/* Programme Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                Programme <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedProgramme}
                onChange={(e) => {
                  setSelectedProgramme(e.target.value);
                  setBatch("");
                  setAcademicYear("");
                  setSemester("");
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
              >
                <option value="">-- Choose Programme --</option>
                {programmes.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Batch Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                Select Batch <span className="text-rose-500">*</span>
              </label>
              <select
                value={batch}
                disabled={!selectedProgramme}
                onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{selectedProgramme ? "-- Choose Batch --" : "-- Choose Programme First --"}</option>
                {availableBatches.map(b => (
                  <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                ))}
              </select>
            </div>

            {/* Academic Year Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                Academic Year <span className="text-rose-500">*</span>
              </label>
              <select
                value={academicYear}
                disabled={!batch}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="">-- Choose Academic Year --</option>
                {academicYears.map(ay => (
                  <option key={ay} value={ay}>{ay}</option>
                ))}
              </select>
            </div>

            {/* Semester Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                Semester <span className="text-rose-500">*</span>
              </label>
              <select
                value={semester}
                disabled={!academicYear}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="">-- Choose Semester --</option>
                {semesters.map(s => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>

            {/* Exam Filter (from Academic Calendar) */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                Exam Event <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedExam?.id || ""}
                disabled={!batch}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="">-- Choose Exam --</option>
                {filteredExamEvents.map(ev => {
                  const displayTitle = getFormattedExamTitle(ev.title, batch);
                  return (
                    <option key={ev.id} value={ev.id}>
                      {displayTitle} ({ev.fromDate} to {ev.toDate})
                    </option>
                  );
                })}
              </select>
              {selectedExam && (
                <p className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg flex items-center gap-1.5">
                  <CalendarCheck2 size={12} className="shrink-0" />
                  <span className="truncate">{getFormattedExamTitle(selectedExam.title, batch)}: {selectedExam.fromDate} &rarr; {selectedExam.toDate}</span>
                </p>
              )}
            </div>

            {/* Course Type Filter (Multi-select) */}
            <div className="space-y-1.5 relative">
              <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                Course Type
              </label>
              <button
                type="button"
                onClick={() => setCourseTypeOpen(o => !o)}
                disabled={availableCourseTypes.length === 0}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {selectedCourseTypes.length === 0
                    ? "All Course Types"
                    : selectedCourseTypes.length === availableCourseTypes.length
                      ? "All Course Types"
                      : `${selectedCourseTypes.length} selected`}
                </span>
                <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${courseTypeOpen ? "rotate-180" : ""}`} />
              </button>
              {courseTypeOpen && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl p-2 space-y-1">
                  <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-100 mb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCourseTypes([])}
                      className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCourseTypes(availableCourseTypes)}
                      className="text-[10px] font-extrabold text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Select All
                    </button>
                  </div>
                  {availableCourseTypes.map(ct => {
                    const checked = selectedCourseTypes.includes(ct);
                    return (
                      <label
                        key={ct}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors ${checked ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedCourseTypes(prev =>
                            prev.includes(ct) ? prev.filter(t => t !== ct) : [...prev, ct]
                          )}
                          className="accent-[#120c7a] w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-800">{ct}</span>
                      </label>
                    );
                  })}
                  {availableCourseTypes.length === 0 && (
                    <p className="px-2 py-1.5 text-[10px] font-semibold text-slate-400">No subjects loaded for this semester.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats & Quick Actions Bar */}
        {batch && academicYear && semester && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Setters Assigned & Bulk Apply Sets */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Setters Assigned</span>
                  <span className="text-xl font-black text-slate-900">{assignedCount} / {totalSubjects}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <UserCheck size={18} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                <select
                  id="bulkNumSets"
                  value={configuredNumSets ? String(configuredNumSets) : bulkSetsVal}
                  onChange={(e) => setBulkSetsVal(e.target.value)}
                  disabled={!!configuredNumSets}
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800 outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  title={configuredNumSets ? "Set count configured in Curriculum (Exam Version Sets)" : ""}
                >
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} Set{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const val = configuredNumSets ? String(configuredNumSets) : bulkSetsVal;
                    handleApplyBulkSets(val);
                  }}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold py-1.5 rounded-xl transition-all"
                >
                  Apply Sets to All
                </button>
              </div>
              {configuredNumSets && (
                <div className="text-[10px] font-bold text-slate-400 flex items-center justify-between pt-1">
                  <span className="truncate">Curriculum configured: {configuredNumSets} Set{configuredNumSets > 1 ? 's' : ''} for this AY</span>
                  <Lock size={12} className="shrink-0 ml-1" />
                </div>
              )}
            </div>

            {/* Total Subjects */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Total Subjects</span>
                <span className="text-2xl font-black text-slate-900">{totalSubjects}</span>
                <span className="text-[10px] block font-bold text-indigo-600 mt-0.5">{commonCount} Multi-Dept Common</span>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <BookOpen size={22} />
              </div>
            </div>

            {/* Bulk Apply Dates */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-2">
              <span className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Bulk Apply Window to All</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  id="bulkFrom"
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800"
                />
                <input
                  type="date"
                  id="bulkTo"
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800"
                />
              </div>
              <button
                onClick={() => {
                  const f = document.getElementById("bulkFrom")?.value;
                  const t = document.getElementById("bulkTo")?.value;
                  handleApplyBulkDates(f, t);
                }}
                className="w-full bg-[#120c7a] hover:bg-[#100b6e] text-white text-[11px] font-extrabold py-1.5 rounded-xl transition-all"
              >
                Apply Dates to All
              </button>
            </div>

            {/* Bulk Apply Exam Timing */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-2">
              <span className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Bulk Apply Timing to All</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  id="bulkStartTime"
                  defaultValue="09:30"
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800"
                />
                <span className="text-slate-400 font-bold text-xs">&rarr;</span>
                <input
                  type="time"
                  id="bulkEndTime"
                  defaultValue="11:00"
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800"
                />
              </div>
              <button
                onClick={() => {
                  const st = document.getElementById("bulkStartTime")?.value;
                  const et = document.getElementById("bulkEndTime")?.value;
                  handleApplyBulkTiming(st, et);
                }}
                className="w-full bg-gradient-to-r from-blue-700 to-indigo-900 hover:opacity-95 text-white text-[11px] font-extrabold py-1.5 rounded-xl transition-all"
              >
                Apply Timing to All
              </button>
            </div>
          </div>
        )}

        {/* Search & Main Table Section */}
        {batch && academicYear && semester && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search course code, subject name, department, or faculty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <span className="text-xs font-extrabold text-slate-400 shrink-0">
                Showing {filteredRows.length} of {rows.length} Subjects
              </span>
            </div>

            {filteredRows.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs font-semibold space-y-2">
                <BookOpen size={36} className="mx-auto text-slate-300" />
                <p>No subjects found matching your filters for Semester {semester}.</p>
                {selectedCourseTypes.length > 0 && (
                  <p className="text-[11px] font-bold text-amber-600">Try clearing the Course Type filter ({selectedCourseTypes.join(", ")}).</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border border-slate-300 shadow-xs rounded-2xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-800 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="p-3.5 border border-slate-300 rounded-tl-2xl text-center">Department</th>
                      <th className="p-3.5 border border-slate-300">Course Code</th>
                      <th className="p-3.5 border border-slate-300">Course Name</th>
                      <th className="p-3.5 border border-slate-300">Subject Handling Faculty</th>
                      <th className="p-3.5 border border-slate-300">Question Paper Setter (Assign)</th>
                      <th className="p-3.5 border border-slate-300 text-center">Set</th>
                      <th className="p-3.5 border border-slate-300">Submission Window</th>
                      <th className="p-3.5 border border-slate-300">Exam Timing (FN / AN)</th>
                      <th className="p-3.5 border border-slate-300 rounded-tr-2xl">Exam Date Assign</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {filteredRows.map((r, idx) => {
                      const isCommon = r.departments.length > 1;
                      const as = getAssignmentForCode(r.code, assignments);
                      const hasSingleHandler = r.handlers.length === 1;

                      // Helper to get group key for single-department rowSpan merging
                      const getDeptGroupKey = (row) => {
                        if (row.departments.length > 1) return "COMMON";
                        const d = row.departments[0];
                        return formatDepartmentDisplay(d?.dept, d?.progKey);
                      };

                      const currentDeptKey = getDeptGroupKey(r);
                      const prevDeptKey = idx > 0 ? getDeptGroupKey(filteredRows[idx - 1]) : null;
                      const isFirstOfGroup = idx === 0 || currentDeptKey !== prevDeptKey || isCommon;

                      let groupRowSpan = 1;
                      if (!isCommon && isFirstOfGroup) {
                        let nextIdx = idx + 1;
                        while (
                          nextIdx < filteredRows.length &&
                          filteredRows[nextIdx].departments.length === 1 &&
                          getDeptGroupKey(filteredRows[nextIdx]) === currentDeptKey
                        ) {
                          groupRowSpan++;
                          nextIdx++;
                        }
                      }

                      const activeSlot = as.slot || as.session || (as.startTime ? deriveSlotFromTime(as.startTime) : "");

                      return (
                        <tr key={r.code} className="hover:bg-slate-50 transition-colors">
                          {/* 1st Col: Department (Center Aligned) */}
                          {isCommon ? (
                            <td className="p-3.5 align-middle text-center border border-slate-200 bg-purple-50/20 min-w-[200px]">
                              <div className="space-y-1.5 flex flex-col items-center justify-center">
                                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 font-black rounded-md text-[10px] uppercase border border-purple-200 inline-block shadow-2xs">
                                  Common
                                </span>
                                <div className="flex flex-wrap justify-center gap-1">
                                  {r.departments.map((d, i) => (
                                    <span key={i} className="text-[9px] font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                                      {formatDepartmentDisplay(d.dept, d.progKey)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </td>
                          ) : isFirstOfGroup ? (
                            <td
                              rowSpan={groupRowSpan}
                              className="p-4 align-middle text-center font-black text-slate-800 border border-slate-200 bg-slate-50/40 min-w-[200px]"
                            >
                              <div className="sticky top-4 text-center">
                                <span className="font-extrabold text-slate-900 text-xs leading-snug block text-center">
                                  {formatDepartmentDisplay(r.departments[0]?.dept, r.departments[0]?.progKey)}
                                </span>
                              </div>
                            </td>
                          ) : null}

                          {/* 2nd Col: Course Code */}
                          <td className="p-3.5 align-middle border border-slate-200">
                            <span className="font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs tracking-tight">
                              {getCanonicalCode(r.code, r.name, r.departments[0]?.dept)}
                            </span>
                          </td>

                          {/* 3rd Col: Course Name */}
                          <td className="p-3.5 align-middle border border-slate-200 max-w-xs">
                            <span className="font-bold text-slate-900 block leading-tight">{r.name}</span>
                            {(r.courseTypes || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(r.courseTypes || []).map(ct => (
                                  <span key={ct} className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md border text-indigo-700 bg-indigo-50 border-indigo-100">
                                    {ct}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* 4th Col: Subject Handling Faculty */}
                          <td className="p-3.5 align-middle border border-slate-200 max-w-xs">
                            {r.handlers.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {r.handlers.map((h, i) => (
                                  <span key={i} className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                                    {h.label}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <AlertTriangle size={12} /> No faculty allocated
                              </span>
                            )}
                          </td>

                          {/* 5th Col: Question Paper Setter Dropdown */}
                          <td className="p-3.5 align-middle border border-slate-200 min-w-[200px]">
                            <select
                              value={as.setterUid || ""}
                              onChange={(e) => handleAssignmentChange(r.code, "setterUid", e.target.value)}
                              className={`w-full border rounded-xl p-2 text-xs font-extrabold outline-none transition-all cursor-pointer ${
                                as.setterUid
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                                  : "bg-amber-50 border-amber-300 text-amber-900"
                              }`}
                            >
                              <option value="">-- Select Setter --</option>
                              {r.handlers.length > 0 ? (
                                r.handlers.map((h) => (
                                  <option key={h.uid} value={h.uid}>
                                    {h.label} {hasSingleHandler ? "(Auto Selected)" : ""}
                                  </option>
                                ))
                              ) : (
                                Object.values(usersMap)
                                  .filter(u => u.role === "Faculty" || u.role === "HOD")
                                  .map(u => (
                                    <option key={u.uid || u.id} value={u.uid || u.id}>
                                      {u.facultyName || u.displayName || u.email}
                                    </option>
                                  ))
                              )}
                            </select>
                          </td>

                          {/* 6th Col: Set Count */}
                          <td className="p-3.5 align-middle border border-slate-200 text-center w-20">
                            <select
                              value={configuredNumSets ? String(configuredNumSets) : String(as.numSets || 1)}
                              onChange={(e) => handleAssignmentChange(r.code, "numSets", parseInt(e.target.value, 10))}
                              disabled={!!configuredNumSets}
                              title={configuredNumSets ? "Set count locked from Curriculum (Exam Version Sets)" : ""}
                              className="w-16 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-black text-slate-800 text-center outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {[1, 2, 3, 4, 5, 6].map(num => (
                                <option key={num} value={num}>{num} Set{num > 1 ? 's' : ''}</option>
                              ))}
                            </select>
                          </td>

                          {/* 7th Col: Submission Window (From -> To) */}
                          <td className="p-3.5 align-middle border border-slate-200 min-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={as.fromDate || ""}
                                onChange={(e) => handleAssignmentChange(r.code, "fromDate", e.target.value)}
                                className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800 outline-none"
                              />
                              <span className="text-slate-400 font-bold text-xs">&rarr;</span>
                              <input
                                type="date"
                                value={as.toDate || ""}
                                onChange={(e) => handleAssignmentChange(r.code, "toDate", e.target.value)}
                                className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800 outline-none"
                              />
                            </div>
                          </td>

                          {/* 8th Col: Exam Timing (Start -> End & Auto FN/AN Badge) */}
                          <td className="p-3.5 align-middle border border-slate-200 min-w-[200px]">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="time"
                                  value={as.startTime || ""}
                                  onChange={(e) => handleAssignmentChange(r.code, "startTime", e.target.value)}
                                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <span className="text-slate-400 font-bold text-xs">&rarr;</span>
                                <input
                                  type="time"
                                  value={as.endTime || ""}
                                  onChange={(e) => handleAssignmentChange(r.code, "endTime", e.target.value)}
                                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-[11px] font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                              </div>

                              {as.startTime ? (
                                <div className="flex items-center justify-between gap-1 px-1">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                    activeSlot === "FN"
                                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                                      : "bg-amber-100 text-amber-800 border border-amber-200"
                                  }`}>
                                    <Clock size={10} />
                                    {activeSlot} SESSION
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500 truncate">
                                    {format12Hour(as.startTime)}{as.endTime ? ` - ${format12Hour(as.endTime)}` : ""}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-400 block text-center">
                                  No timing set
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 9th Col: Exam Date Assign */}
                          <td className="p-3.5 align-middle border border-slate-200 min-w-[160px]">
                            {selectedExam ? (() => {
                              const effectiveDate = getEffectiveExamDate(as);
                              return (
                                <select
                                  value={effectiveDate}
                                  onChange={(e) => handleAssignmentChange(r.code, "examDate", e.target.value)}
                                  className={`w-full border rounded-xl p-2 text-[11px] font-bold outline-none transition-all cursor-pointer ${
                                    effectiveDate
                                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                                      : "bg-slate-50 border-slate-200 text-slate-800"
                                  }`}
                                >
                                  <option value="">-- Assign Date --</option>
                                  {effectiveDate && !availableExamDates.includes(effectiveDate) && (
                                    <option value={effectiveDate}>
                                      {new Date(effectiveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" })} (Saved)
                                    </option>
                                  )}
                                  {availableExamDates.map(dateStr => (
                                    <option key={dateStr} value={dateStr}>
                                      {new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" })}
                                    </option>
                                  ))}
                                </select>
                              );
                            })() : (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg">
                                <AlertTriangle size={12} /> Choose exam event
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sticky Save Footer Bar */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <div className="text-xs font-bold text-slate-500">
                {assignedCount} of {totalSubjects} subjects assigned with setters.
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateReport}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-xs font-extrabold shadow-lg shadow-emerald-950/20 transition-all cursor-pointer"
                >
                  <Printer size={16} />
                  Print Timetable Report
                </button>
                <button
                  onClick={handleSaveAssignments}
                  disabled={saving}
                  className="bg-[#120c7a] hover:bg-[#100b6e] text-white px-8 py-3 rounded-2xl text-xs font-extrabold shadow-lg shadow-blue-950/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save & Notify QP Setters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <Layout title="Exam Cell — QP Setter & Schedule Creation">
      {content}
    </Layout>
  );
}
