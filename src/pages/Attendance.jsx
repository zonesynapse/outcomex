import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot, collection } from "firebase/firestore";
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
  FileText
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

// Sanitize key matching HODRoleConfig's local version
function sanitizeKey(key) {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
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
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState("");
  const [totalConducted, setTotalConducted] = useState("");

  const [timetableConfig, setTimetableConfig] = useState(null);
  const [availablePeriodsWithTiming, setAvailablePeriodsWithTiming] = useState([]);

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
    if (userRole === 'Faculty' || userRole === 'HOD') {
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
  }, [currentUid, userRole]);

  // Data States
  const [attendanceData, setAttendanceData] = useState(null);
  const [students, setStudents] = useState([]);
  const [masterList, setMasterList] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Per-date record states
  const [recordDates, setRecordDates] = useState([]);
  const [currentRecordData, setCurrentRecordData] = useState(null);

  // Report states
  const [showReport, setShowReport] = useState(false);
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportData, setReportData] = useState(null);

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
      if (userRole !== 'Faculty' && userRole !== 'HOD') return true;
      const progKey = formatProgrammeKey(prog);
      if (userRole === 'HOD' && formatProgrammeKey(userProgramme) === progKey) return true;
      return derivedProgs.includes(progKey);
    });
  }, [userRole, userProgramme, derivedProgs, PROGRAMME_DEPARTMENTS]);

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
    if (userRole !== 'Faculty' && userRole !== 'HOD') return depts;
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
  }, [programme, userRole, derivedDepts, userProgramme, userDepartment, PROGRAMME_DEPARTMENTS]);

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
    const progKey = formatProgrammeKey(programme);
    const docId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}`;
    const cfg = sectionConfigs[docId];
    if (!cfg || !cfg.numSections) return [];
    const count = cfg.numSections;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: count }, (_, i) => `Sec-${letters[i]}`);
  }, [batch, department, programme, sectionConfigs]);

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
    });
    return () => unsub();
  }, []);

  // New Logic: Fetch subjects based on Programme and Department assignments
  useEffect(() => {
    if (!programme || !department || !currentUid || !userRole) return;

    const progKey = formatProgrammeKey(programme);
    const deptKey = sanitizeKey(department);
    const prefix = `${progKey}_${deptKey}_`;
    const assignmentsRef = collection(db, "subject_assignments");

    const unsubscribe = onSnapshot(assignmentsRef, async (snapshot) => {
      const contexts = [];
      const batchesToFetchSyllabus = new Set();

      snapshot.docs.forEach(doc => {
        if (!doc.id.startsWith(prefix)) return;
        const remaining = doc.id.slice(prefix.length);
        const parts = remaining.split('_');
        const batch = parts[0];
        const ay = parts[1];
        const sem = parts[2];
        const secSuffix = parts.length > 3 ? parts.slice(3).join('_') : '';
        const data = doc.data();

        Object.entries(data).forEach(([uid, codes]) => {
          if (userRole === 'Faculty' && uid !== currentUid) return;
          if (Array.isArray(codes)) {
            codes.forEach(code => {
              contexts.push({ code, batch, ay, sem, section: secSuffix, uid });
              batchesToFetchSyllabus.add(batch);
            });
          }
        });
      });

      const namesMap = {};
      for (const b of Array.from(batchesToFetchSyllabus)) {
        const reg = getRegulationForBatch(progKey, b);
        if (reg) {
          const syllabusKey = `${progKey}_${deptKey}_${sanitizeKey(reg)}`;
          const syllabusSnap = await getDoc(doc(db, "syllabus_data", syllabusKey));
          if (syllabusSnap.exists()) {
            const syllabus = syllabusSnap.data();
            Object.values(syllabus.semesters || {}).forEach(semList => {
              if (Array.isArray(semList)) {
                semList.forEach(s => { if (s && s.code) namesMap[s.code] = s.name; });
              }
            });
          }
        }
      }

      setSubjectContexts(contexts);
      
      const uniqueSubjectAssignments = [];
      const seenAssignments = new Set();

      contexts.forEach(ctx => {
        const assignmentIdentifier = `${ctx.code}-${ctx.batch}-${ctx.ay}-${ctx.sem}-${ctx.section}`;
        if (!seenAssignments.has(assignmentIdentifier)) {
          uniqueSubjectAssignments.push({
            value: JSON.stringify({ code: ctx.code, batch: ctx.batch, ay: ctx.ay, sem: ctx.sem, section: ctx.section }),
            text: `${ctx.code} - ${namesMap[ctx.code] || ""}${ctx.section ? ` (${ctx.section})` : ''}`
          });
          seenAssignments.add(assignmentIdentifier);
        }
      });
      setSubjects(uniqueSubjectAssignments);
    });

    return () => unsubscribe();
  }, [programme, department, currentUid, userRole, getRegulationForBatch, getOrdinal, formatBatchDisplay]);

  const handleSubjectChange = (val) => {
    if (!val) {
      setSubject("");
      setBatch("");
      setAcademicYear("");
      setSemester("");
      setSection("");
      return;
    }
    setSubject(val);
    const selectedCtx = JSON.parse(val);
    setBatch(selectedCtx.batch);
    setAcademicYear(selectedCtx.ay);
    setSemester(`${getOrdinal(parseInt(selectedCtx.sem))} Semester`);
    if (selectedCtx.section) setSection(selectedCtx.section);
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

      try {
        const allocationSnap = await getDoc(doc(db, "timetable_allocations", compositeKey));
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
        const [attendanceSnap, studentSnap] = await Promise.all([
          getDoc(doc(db, "attendance", attendanceDocId)),
          getDoc(doc(db, "students", compositeKey))
        ]);

        const attData = attendanceSnap.data();
        const rawMaster = studentSnap.data() || {};
        setAttendanceData(attData);
        setMasterList(rawMaster);
        setStudents([]);

        // Support both old format ({ _meta, students }) and new format ({ _meta, records })
        let recordKeys = [];
        if (attData?.records) {
          recordKeys = Object.keys(attData.records).sort();
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
    const total = parseInt(totalConducted, 10) || 0;
    let val = 0;
    if (status === 'P' || status === 'OD') {
      val = total;
    }

    setStudents(prev => prev.map(s => {
      if (s.reg === reg) {
        return {
          ...s,
          status: status,
          hours: val,
          percentage: total > 0 ? ((val / total) * 100).toFixed(2) : "0.00"
        };
      }
      return s;
    }));
  };

  // Auto-load attendance when date or period changes
  useEffect(() => {
    if (!attendanceData?.records || !Object.keys(masterList).length || !attendanceDate) return;

    const recordKey = period ? `${attendanceDate}_P${period}` : attendanceDate;
    const dateRecord = attendanceData.records[recordKey] || null;
    setCurrentRecordData(dateRecord);

    const totalH = parseInt(dateRecord?.totalHours, 10) || 1;

    const masterListObj = {};
    Object.entries(masterList)
      .filter(([key]) => !key.startsWith('_'))
      .forEach(([reg, name]) => { masterListObj[reg] = name; });

    const order = masterList._order;

    const studentArray = Object.entries(masterListObj).map(([reg, name]) => {
      const studentExists = dateRecord?.students?.[reg] !== undefined;
      const hours = studentExists ? dateRecord.students[reg] : 0;
      return {
        reg,
        name,
        hours,
        status: studentExists ? (hours > 0 ? 'P' : 'A') : '',
        percentage: totalH > 0 ? ((hours / totalH) * 100).toFixed(2) : "0.00"
      };
    });

    if (order) studentArray.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
    else studentArray.sort((a, b) => a.reg.localeCompare(b.reg));

    setStudents(studentArray);
  }, [attendanceDate, period, attendanceData, masterList]);

  const handleGenerateReport = () => {
    if (!reportFromDate || !reportToDate || !attendanceData?.records) {
      setReportData(null);
      return;
    }

    const fromDate = reportFromDate;
    const toDate = reportToDate;
    const allKeys = Object.keys(attendanceData.records).filter(k => {
      const datePart = k.includes('_P') ? k.slice(0, k.lastIndexOf('_P')) : k;
      return datePart >= fromDate && datePart <= toDate;
    }).sort();

    if (allKeys.length === 0) {
      setReportData({ dates: [], students: [], totalClasses: 0 });
      return;
    }

    const totalClasses = allKeys.length;
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;

    // Derive display labels for each key (date-only → plain, compound → "date (Period X)")
    const keyLabels = {};
    allKeys.forEach(k => {
      if (k.includes('_P')) {
        const idx = k.lastIndexOf('_P');
        keyLabels[k] = `${k.slice(0, idx)} (P${k.slice(idx + 2)})`;
      } else {
        keyLabels[k] = k;
      }
    });

    getDoc(doc(db, "students", compositeKey)).then(studentSnap => {
      const masterList = studentSnap.data() || {};
      const order = masterList._order;

      const studentMap = {};
      Object.entries(masterList)
        .filter(([key]) => !key.startsWith('_'))
        .forEach(([reg, name]) => { studentMap[reg] = name; });

      const studentStats = Object.keys(studentMap).map(reg => {
        let attended = 0;
        const dailyRecords = {};
        allKeys.forEach(key => {
          const rec = attendanceData.records[key];
          const hours = rec?.students?.[reg];
          const totalH = parseInt(rec?.totalHours || totalConducted, 10) || 1;
          const isPresent = hours !== undefined ? hours > 0 : false;
          if (isPresent) attended++;
          dailyRecords[key] = isPresent ? 'P' : 'A';
        });
        return {
          reg,
          name: studentMap[reg],
          attended,
          totalClasses,
          percentage: totalClasses > 0 ? ((attended / totalClasses) * 100).toFixed(2) : "0.00",
          dailyRecords
        };
      });

      if (order) studentStats.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
      else studentStats.sort((a, b) => a.reg.localeCompare(b.reg));

      setReportData({ dates: allKeys, keyLabels, students: studentStats, totalClasses });
    });
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
    headers.push('Total', 'Attended', 'Absent', '%');

    const rows = reportData.students.map(s => {
      const row = [s.reg, s.name];
      reportData.dates.forEach(d => row.push(s.dailyRecords[d] || '—'));
      row.push(String(s.totalClasses), String(s.attended), String(s.totalClasses - s.attended), `${s.percentage}%`);
      return row;
    });

    // Dynamic column styles: fixed widths for RegNo, Name, Total/Attended/Absent/%; date cols auto-sized
    const dateColCount = reportData.dates.length;
    const colStyles = {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
      1: { halign: 'left', cellWidth: 34 },
    };
    const lastIdx = 2 + dateColCount;
    colStyles[lastIdx]     = { halign: 'center', cellWidth: 12 };
    colStyles[lastIdx + 1] = { halign: 'center', cellWidth: 14 };
    colStyles[lastIdx + 2] = { halign: 'center', cellWidth: 12 };
    colStyles[lastIdx + 3] = { halign: 'center', cellWidth: 14 };

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

    doc.output('dataurlnewwindow');
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.reg.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveAttendance = async () => {
    if (!programme || !department || !batch || !subject || !totalConducted || !attendanceDate) {
      alert("Please ensure all filters and Total Conducted hours are provided.");
      return;
    }
    if (!period) {
      alert("Please select a Period before saving attendance.");
      return;
    }
    setSaving(true);
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const attendanceDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${selectedSubjectObj.code}${sectionSuffix}`;
    
    const studentsMap = {};
    students.forEach(s => { studentsMap[s.reg] = s.hours; });

    const dateRecord = {
      period,
      totalHours: parseInt(totalConducted, 10) || 1,
      students: studentsMap,
      updatedAt: new Date().toISOString()
    };

    try {
      // Merge with existing records (don't overwrite other dates/periods)
      const recordKey = period ? `${attendanceDate}_P${period}` : attendanceDate;
      const existingRecords = attendanceData?.records || {};
      const isEdit = !!existingRecords[recordKey];
      const updatedRecords = { ...existingRecords, [recordKey]: dateRecord };
      const nextTotal = parseInt(totalConducted, 10) + 1;

      await setDoc(doc(db, "attendance", attendanceDocId), {
        _meta: { totalHours: nextTotal, updatedAt: new Date().toISOString() },
        records: updatedRecords
      });
      alert(`Attendance for ${attendanceDate} (Period ${period}) saved successfully!`);

      // Update local state
      const newRecordKeys = Object.keys(updatedRecords).sort();
      setRecordDates(newRecordKeys);
      setAttendanceData(prev => ({ ...prev, records: updatedRecords, _meta: { totalHours: nextTotal } }));

      if (isEdit) {
        // Editing existing record — keep same date/period selected
      } else {
        // New record — auto-increment and move to next day
        setTotalConducted(String(nextTotal));
        const nextDay = new Date(attendanceDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDate = nextDay.toISOString().split('T')[0];
        setAttendanceDate(nextDate);
        setPeriod("");
      }
    } catch (err) { console.error(err); alert("Failed to save records."); }
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
    setStudents(prev => prev.map(s => ({
      ...s,
      status: 'P',
      hours: total,
      percentage: total > 0 ? "100.00" : "0.00"
    })));
  };

  // ─── cumulative attendance from all records ───
  const cumulativeAttended = useMemo(() => {
    if (!attendanceData?.records) return {};
    const counts = {};
    Object.values(attendanceData.records).forEach(record => {
      Object.entries(record.students || {}).forEach(([reg, hours]) => {
        if (Number(hours) > 0) counts[reg] = (counts[reg] || 0) + 1;
      });
    });
    return counts;
  }, [attendanceData]);

  // ─── derived stats ───
  const pctPresent = students.length
    ? ((students.filter(s => s.status === 'P' || s.status === 'OD').length / students.length) * 100).toFixed(1)
    : '—';

  return (
    <Layout title="Attendance Records">
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* ═══ Hero Stats ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, label: 'Total Students', value: students.length, color: 'from-indigo-500 to-blue-600' },
            { icon: CalendarCheck2, label: 'Today\'s Attendance', value: `${pctPresent}%`, color: 'from-emerald-500 to-teal-600' },
            { icon: Calendar, label: 'Date', value: attendanceDate, color: 'from-violet-500 to-purple-600' },
            { icon: FileText, label: 'Total Classes', value: recordDates.length || '—', color: 'from-amber-500 to-orange-600' },
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
              <Search size= {14} className="text-white" />
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
              { label: 'Section', value: section, set: setSection, opts: availableSections, display: s => s, disabled: true, placeholder: !availableSections.length ? 'No sections' : undefined },
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
              <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest px-0.5">Period <span className="text-rose-500">*</span></label>
              <div className="relative">
                <select value={period} onChange={e => setPeriod(e.target.value)}
                  className="w-full appearance-none bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                >
                  <option value="">Select Period</option>
                  {availablePeriodsWithTiming.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-0.5">Total Classes</label>
              <div className="w-full bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-xs font-black text-emerald-700 cursor-not-allowed">
                {recordDates.length || '—'}
              </div>
            </div>
          </div>

          {/* Report toggle */}
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-100">
            <button onClick={() => { setShowReport(!showReport); if (!showReport && recordDates.length > 0) { setReportFromDate(recordDates[0]); setReportToDate(recordDates[recordDates.length - 1]); } }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                showReport ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-200' : 'bg-white text-amber-700 border border-amber-200 hover:border-amber-400'
              }`}
            >
              <FileText size={14} />
              {showReport ? 'Close Report' : 'Attendance Report'}
            </button>
          </div>

          {/* Report date range */}
          {showReport && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 items-end">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-widest px-0.5">From</label>
                <input type="date" value={reportFromDate} onChange={e => setReportFromDate(e.target.value)}
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-amber-700 outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-widest px-0.5">To</label>
                <input type="date" value={reportToDate} onChange={e => setReportToDate(e.target.value)}
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-amber-700 outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                />
              </div>
              <button onClick={handleGenerateReport}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-200"
              >
                <CalendarCheck2 size={14} /> Generate
              </button>
              {reportData && (
                <button onClick={handleExportReport}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-amber-200 text-amber-700 rounded-xl text-xs font-bold hover:border-amber-400 hover:bg-amber-50 transition-all"
                >
                  <Download size={14} /> Export PDF
                </button>
              )}
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
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:bg-white focus:text-indigo-800 focus:placeholder:text-slate-400 transition-all w-36 md:w-44"
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
              <button onClick={handleExport} className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-xl transition-all">
                <Download size={16} />
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
                    <tr key={s.reg} className="group hover:bg-indigo-50/40 transition-all duration-150">
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
                          ].map(({ label, value, activeClass, hoverClass }) => (
                            <button key={value}
                              onClick={() => handleStatusChange(s.reg, value)}
                              className={`min-w-[30px] px-2 py-1.5 rounded-lg text-xs font-black transition-all border ${
                                s.status === value
                                  ? activeClass + ' border-transparent'
                                  : `bg-white text-slate-400 border-slate-200 ${hoverClass} group-hover:border-slate-300`
                              }`}
                            >
                              {label}
                            </button>
                          ))}
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
                            <div className={`h-full rounded-full transition-all duration-700 ${
                              ((cumulativeAttended[s.reg] || 0) / (recordDates.length || 1)) * 100 < 75 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                            }`} style={{ width: `${Math.min(((cumulativeAttended[s.reg] || 0) / (recordDates.length || 1)) * 100, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-black min-w-[46px] text-right ${
                            ((cumulativeAttended[s.reg] || 0) / (recordDates.length || 1)) * 100 < 75 ? 'text-rose-600' : 'text-emerald-600'
                          }`}>
                            {((cumulativeAttended[s.reg] || 0) / (recordDates.length || 1) * 100).toFixed(1)}%
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

        {/* ═══ Report Table ═══ */}
        {showReport && reportData && (
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 overflow-hidden transition-all">
            <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 px-5 md:px-7 py-4 flex flex-wrap items-center justify-between gap-4">
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
              <button onClick={handleExportReport}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-sm"
              >
                <Download size={15} /> Export PDF
              </button>
            </div>

            <div className="overflow-x-auto">
              {reportData.students.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-4">
                  <div className="p-4 rounded-2xl bg-amber-50"><FileX size={40} className="text-amber-300" /></div>
                  <p className="text-sm text-slate-400 font-medium">No data for the selected range.</p>
                </div>
              ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-amber-50/50">
                        <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Reg No</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-blue-600 uppercase tracking-widest">Total</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest">Attended</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-rose-600 uppercase tracking-widest">Absent</th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">%</th>
                        {reportData.dates.map(d => (
                          <th key={d} className="px-2 py-3.5 text-center text-[9px] font-black text-amber-700 uppercase tracking-widest whitespace-nowrap min-w-[60px]">
                            {reportData.keyLabels?.[d] || d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData.students.map(s => {
                        const absent = s.totalClasses - s.attended;
                        return (
                          <tr key={s.reg} className="hover:bg-amber-50/40 transition-all duration-150">
                            <td className="px-5 py-3.5"><span className="text-xs font-bold text-slate-500 font-mono">{s.reg}</span></td>
                            <td className="px-5 py-3.5"><span className="text-sm font-semibold text-slate-800">{s.name}</span></td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-blue-700">{s.totalClasses}</td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-emerald-700">{s.attended}</td>
                            <td className="px-4 py-3.5 text-center text-xs font-black text-rose-600">{absent}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                  <div className={`h-full rounded-full transition-all duration-700 ${
                                    parseFloat(s.percentage) < 75 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                  }`} style={{ width: `${Math.min(parseFloat(s.percentage), 100)}%` }} />
                                </div>
                                <span className={`text-xs font-black min-w-[44px] text-right ${
                                  parseFloat(s.percentage) < 75 ? 'text-rose-600' : 'text-emerald-600'
                                }`}>{s.percentage}%</span>
                              </div>
                            </td>
                            {reportData.dates.map(d => (
                              <td key={d} className={`px-2 py-3.5 text-center text-xs font-black ${
                                s.dailyRecords[d] === 'P' ? 'text-emerald-600' : s.dailyRecords[d] === 'OD' ? 'text-blue-600' : 'text-rose-500'
                              }`}>
                                {s.dailyRecords[d] || '—'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
