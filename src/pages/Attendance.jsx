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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Per-date record states
  const [recordDates, setRecordDates] = useState([]);
  const [selectedRecordDate, setSelectedRecordDate] = useState("");
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
        setAvailablePeriodsWithTiming([]);
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
          setAvailablePeriodsWithTiming([]);
        }
      } catch (err) {
        console.error("Error fetching timetable config:", err);
        setTimetableConfig(null);
        setAvailablePeriodsWithTiming([]);
      }
    };
    fetchTimetableConfig();
  }, [programme, department, batch, academicYear, semester, computePeriodStart]);

  useEffect(() => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) {
      setAttendanceData(null);
      setStudents([]);
      setRecordDates([]);
      setSelectedRecordDate("");
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
        const masterList = studentSnap.data() || {};
        setAttendanceData(attData);

        const masterListObj = {};
        Object.entries(masterList)
          .filter(([key]) => !key.startsWith('_'))
          .forEach(([reg, name]) => { masterListObj[reg] = name; });

        const order = masterList._order;

        // Support both old format ({ _meta, students }) and new format ({ _meta, records })
        let dates = [];
        if (attData?.records) {
          dates = Object.keys(attData.records).sort();
        } else if (attData?._meta?.date) {
          // Migrate old format: wrap into records
          dates = [attData._meta.date];
        }
        setRecordDates(dates);

        // Auto-select the latest date or today's date
        const today = new Date().toISOString().split('T')[0];
        const dateToLoad = dates.includes(today) ? today : (dates.length > 0 ? dates[dates.length - 1] : today);
        setSelectedRecordDate(dateToLoad);

        // Load the selected date's record
        let dateRecord = null;
        if (attData?.records?.[dateToLoad]) {
          dateRecord = attData.records[dateToLoad];
        } else if (dates.length === 0 && attData?._meta?.date === dateToLoad) {
          // Old format backward compatibility
          dateRecord = { period: attData._meta.period, totalHours: attData._meta.totalHours, students: attData.students || {} };
        }
        setCurrentRecordData(dateRecord);

        const tHours = dateRecord?.totalHours || attData?._meta?.totalHours || "1";
        setTotalConducted(tHours);
        if (dateRecord?.period || attData?._meta?.period) setPeriod(dateRecord?.period || attData._meta.period);

        // Build student list from the selected date's record
        const studentArray = Object.entries(masterListObj).map(([reg, name]) => {
          const hours = dateRecord?.students?.[reg] !== undefined ? dateRecord.students[reg] : (parseInt(tHours, 10) || 1);
          const totalHours = parseInt(tHours, 10) || 1;
          return {
            reg,
            name,
            hours,
            status: dateRecord?.students?.[reg] !== undefined ? (hours > 0 ? 'P' : 'A') : 'P',
            percentage: totalHours > 0 ? ((hours / totalHours) * 100).toFixed(2) : "0.00"
          };
        });

        if (order) studentArray.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
        else studentArray.sort((a, b) => a.reg.localeCompare(b.reg));

        setStudents(studentArray);
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

  const handleSelectRecordDate = (date) => {
    setSelectedRecordDate(date);
    setAttendanceDate(date);

    if (!attendanceData) return;

    let dateRecord = null;
    if (attendanceData.records?.[date]) {
      dateRecord = attendanceData.records[date];
    } else if (attendanceData._meta?.date === date && !attendanceData.records) {
      dateRecord = { period: attendanceData._meta.period, totalHours: attendanceData._meta.totalHours, students: attendanceData.students || {} };
    }
    setCurrentRecordData(dateRecord);

    const tHours = dateRecord?.totalHours || attendanceData?._meta?.totalHours || "1";
    setTotalConducted(tHours);
    if (dateRecord?.period) setPeriod(dateRecord.period);

    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;

    getDoc(doc(db, "students", compositeKey)).then(studentSnap => {
      const masterList = studentSnap.data() || {};
      const totalH = parseInt(tHours, 10) || 1;
      const studentArray = Object.entries(masterList)
        .filter(([key]) => !key.startsWith('_'))
        .map(([reg, name]) => {
          const hours = dateRecord?.students?.[reg] !== undefined ? dateRecord.students[reg] : totalH;
          return {
            reg,
            name,
            hours,
            status: dateRecord?.students?.[reg] !== undefined ? (hours > 0 ? 'P' : 'A') : 'P',
            percentage: totalH > 0 ? ((hours / totalH) * 100).toFixed(2) : "0.00"
          };
        });

      const order = masterList._order;
      if (order) studentArray.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
      else studentArray.sort((a, b) => a.reg.localeCompare(b.reg));
      setStudents(studentArray);
    });
  };

  const handleGenerateReport = () => {
    if (!reportFromDate || !reportToDate || !attendanceData?.records) {
      setReportData(null);
      return;
    }

    const fromDate = reportFromDate;
    const toDate = reportToDate;
    const allDates = Object.keys(attendanceData.records).filter(d => d >= fromDate && d <= toDate).sort();

    if (allDates.length === 0) {
      setReportData({ dates: [], students: [], totalClasses: 0 });
      return;
    }

    const totalClasses = allDates.length;
    const progKey = formatProgrammeKey(programme);
    const semNum = String(semester).match(/\d+/)?.[0];
    const selectedSubjectObj = JSON.parse(subject);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;

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
        allDates.forEach(date => {
          const rec = attendanceData.records[date];
          const hours = rec?.students?.[reg];
          const totalH = parseInt(rec?.totalHours || totalConducted, 10) || 1;
          const isPresent = hours !== undefined ? hours > 0 : false;
          if (isPresent) attended++;
          dailyRecords[date] = isPresent ? 'P' : 'A';
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

      setReportData({ dates: allDates, students: studentStats, totalClasses });
    });
  };

  const handleExportReport = () => {
    if (!reportData) return;
    const doc = new jsPDF({ orientation: reportData.dates.length > 6 ? "landscape" : "portrait" });

    doc.setFontSize(16);
    doc.text(`Attendance Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Subject: ${subject || "N/A"}  |  Date Range: ${reportFromDate} to ${reportToDate}  |  Total Classes: ${reportData.totalClasses}`, 14, 22);

    const headers = ["Reg No", "Student Name", "Total", "Attended", "Absent", "%"];
    reportData.dates.forEach(d => headers.push(d));

    const rows = reportData.students.map(s => {
      const row = [s.reg, s.name, String(s.totalClasses), String(s.attended), String(s.totalClasses - s.attended), `${s.percentage}%`];
      reportData.dates.forEach(d => row.push(s.dailyRecords[d] || '—'));
      return row;
    });

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 28,
      styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
      headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 28 },
        1: { halign: 'left', cellWidth: 40 },
      },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`Attendance_Report_${subject || "subject"}_${reportFromDate}_to_${reportToDate}.pdf`);
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
      // Merge with existing records (don't overwrite other dates)
      const existingRecords = attendanceData?.records || {};
      const updatedRecords = { ...existingRecords, [attendanceDate]: dateRecord };
      const nextTotal = parseInt(totalConducted, 10) + 1;

      await setDoc(doc(db, "attendance", attendanceDocId), {
        _meta: { totalHours: nextTotal, updatedAt: new Date().toISOString() },
        records: updatedRecords
      });
      alert(`Attendance for ${attendanceDate} saved successfully!`);

      // Update local state
      const newRecordDates = [...new Set([...recordDates, attendanceDate])].sort();
      setRecordDates(newRecordDates);
      setAttendanceData(prev => ({ ...prev, records: updatedRecords, _meta: { totalHours: nextTotal } }));

      // Auto-increment Total Mark Attendance for next day
      setTotalConducted(String(nextTotal));

      // Move to next day
      const nextDay = new Date(attendanceDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDate = nextDay.toISOString().split('T')[0];
      setAttendanceDate(nextDate);
      setSelectedRecordDate(nextDate);
      setPeriod("");
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

  return (
    <Layout title="Attendance Records">
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Programme</label>
              <select value={programme} onChange={e => { setProgramme(e.target.value); setDepartment(""); setSubject(""); setSection(""); }} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium">
                <option value="">Select</option>
                {filteredProgrammes.map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
              <select value={department} onChange={e => { setDepartment(e.target.value); setSubject(""); setSection(""); }} disabled={!programme} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50">
                <option value="">Select</option>
                {programme && filteredDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject</label>
              <select value={subject} onChange={e => handleSubjectChange(e.target.value)} disabled={!department} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50 text-[#120c7a] font-bold">
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.value} value={s.value}>{s.text}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
              <select value={batch} onChange={e => setBatch(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed" disabled>
                <option value="">Select</option>
                {batches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
              <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed" disabled>
                <option value="">Select</option>
                {aYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed" disabled>
                <option value="">Select</option>
                {semesters.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Section</label>
              <select value={section} disabled className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium bg-zinc-100 cursor-not-allowed">
                <option value="">{section || (availableSections.length === 0 ? "No sections configured" : "Select Section")}</option>
                {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-100">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest ml-1">Date</label>
              <input 
                type="date"
                value={attendanceDate} 
                onChange={e => setAttendanceDate(e.target.value)} 
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a] cursor-pointer" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest ml-1">Period</label>
              <div className="relative">
                <select 
                  value={period} 
                  onChange={e => setPeriod(e.target.value)} 
                  className="w-full appearance-none bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!timetableConfig}
                >
                  <option value="">{timetableConfig ? "Select Period" : "No timetable allocated"}</option>
                  {availablePeriodsWithTiming.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest ml-1">Total Mark Attendance (Classes)</label>
              <input 
                type="number" 
                min="1"
                placeholder="e.g. 60" 
                value={totalConducted} 
                onChange={e => {
                  const val = e.target.value;
                  setTotalConducted(val);
                  const total = parseInt(val, 10) || 0;
                  setStudents(prev => prev.map(s => {
                    const newPercentage = total > 0 ? ((s.hours / total) * 100).toFixed(2) : "0.00";
                    return { ...s, percentage: newPercentage };
                  }));
                }}
                className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-2 outline-none transition-all font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
          </div>

          {/* Edit Existing Date & Report Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 pt-4 border-t border-slate-100">
            {recordDates.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-purple-600 uppercase tracking-widest ml-1">Edit Existing Date</label>
                <div className="relative">
                  <select 
                    value={selectedRecordDate} 
                    onChange={e => handleSelectRecordDate(e.target.value)}
                    className="w-full appearance-none bg-purple-50/50 border border-purple-100 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-bold text-purple-700 cursor-pointer"
                  >
                    {recordDates.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none" size={16} />
                </div>
                <p className="text-[10px] text-purple-400 ml-1">{recordDates.length} date(s) recorded</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-amber-600 uppercase tracking-widest ml-1">Attendance Report</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setShowReport(!showReport); if (!showReport && recordDates.length > 0) { setReportFromDate(recordDates[0]); setReportToDate(recordDates[recordDates.length - 1]); } }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    showReport 
                      ? "bg-amber-500 text-white border-amber-500" 
                      : "bg-white text-amber-700 border-amber-200 hover:border-amber-400"
                  }`}
                >
                  <FileText size={14} />
                  {showReport ? "Close Report" : "Generate Report"}
                </button>
              </div>
            </div>
          </div>

          {/* Report Date Range */}
          {showReport && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-amber-600 uppercase tracking-widest ml-1">From Date</label>
                  <input 
                    type="date" 
                    value={reportFromDate} 
                    onChange={e => setReportFromDate(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold text-amber-700" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-amber-600 uppercase tracking-widest ml-1">To Date</label>
                  <input 
                    type="date" 
                    value={reportToDate} 
                    onChange={e => setReportToDate(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold text-amber-700" 
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleGenerateReport}
                    className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    <CalendarCheck2 size={14} /> Generate
                  </button>
                  {reportData && (
                    <button 
                      onClick={handleExportReport}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-xl text-xs font-bold hover:border-amber-400 transition-all"
                    >
                      <Download size={14} /> PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-8 py-6 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl text-white">
                <CalendarCheck2 size={24} />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl leading-tight">Student Attendance</h2>
                {totalConducted && (
                  <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Marking base: {totalConducted} Sessions {period ? `(Period ${period})` : ""}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 group-focus-within:text-[#120c7a] transition-colors" size={16} />
                <input 
                  type="text" 
                  placeholder="Search students..." 
                  className="bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/50 focus:bg-white focus:!text-[#120c7a] focus:placeholder:text-zinc-400 transition-all outline-none shadow-inner"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={handleSaveAttendance} 
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={18} />}
                Save Records
              </button>
              <button onClick={handleExport} className="p-2.5 bg-white text-[#120c7a] rounded-xl hover:bg-blue-50 transition-all shadow-lg">
                <Download size={20} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-20 text-center"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : !students.length ? (
              <div className="py-20 text-center flex flex-col items-center gap-4">
                <FileX size={48} className="text-slate-200" />
                <p className="text-slate-400 font-medium italic">No attendance records found for this selection.</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Register Number</th>
                    <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                    <th className="px-4 py-4 text-center text-[11px] font-black text-emerald-500 uppercase tracking-widest">P</th>
                    <th className="px-4 py-4 text-center text-[11px] font-black text-rose-500 uppercase tracking-widest">A</th>
                    <th className="px-4 py-4 text-center text-[11px] font-black text-blue-500 uppercase tracking-widest">OD</th>
                    <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Classes Attended</th>
                    <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s) => (
                    <tr key={s.reg} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-8 py-4 text-sm font-bold text-slate-600 font-mono">{s.reg}</td>
                      <td className="px-8 py-4 text-sm font-bold text-slate-800">{s.name}</td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="radio" 
                          name={`status-${s.reg}`} 
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          checked={s.status === 'P'}
                          onChange={() => handleStatusChange(s.reg, 'P')}
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="radio" 
                          name={`status-${s.reg}`} 
                          className="w-4 h-4 accent-rose-500 cursor-pointer"
                          checked={s.status === 'A'}
                          onChange={() => handleStatusChange(s.reg, 'A')}
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="radio" 
                          name={`status-${s.reg}`} 
                          className="w-4 h-4 accent-blue-500 cursor-pointer"
                          checked={s.status === 'OD'}
                          onChange={() => handleStatusChange(s.reg, 'OD')}
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <input 
                          type="number"
                          min="0"
                          max={parseInt(totalConducted, 10) || 0}
                          value={s.hours}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            const total = parseInt(totalConducted, 10) || 0;
                            setStudents(prev => prev.map(st => {
                              if (st.reg === s.reg) {
                                const newStatus = val === 0 ? 'A' : (val >= total ? 'P' : 'P');
                                return {
                                  ...st,
                                  hours: val,
                                  status: newStatus,
                                  percentage: total > 0 ? ((val / total) * 100).toFixed(2) : "0.00"
                                };
                              }
                              return st;
                            }));
                          }}
                          className="w-20 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                      </td>
                      <td className="px-8 py-4 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                            <div 
                              className={`h-full transition-all duration-1000 ${parseFloat(s.percentage) < 75 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${s.percentage}%` }}
                            />
                          </div>
                          <span className={`text-sm font-black min-w-[50px] ${parseFloat(s.percentage) < 75 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {s.percentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Attendance Report Table */}
        {showReport && reportData && (
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-amber-500 px-8 py-6 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl text-white">
                  <CalendarCheck2 size={24} />
                </div>
                <div>
                  <h2 className="text-white font-bold text-xl leading-tight">Attendance Report</h2>
                  <p className="text-amber-100 text-xs font-medium uppercase tracking-widest">
                    {reportFromDate} to {reportToDate} · {reportData.totalClasses} class(es)
                  </p>
                </div>
              </div>
              <button 
                onClick={handleExportReport}
                className="flex items-center gap-2 px-4 py-2 bg-white text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-50 transition-all shadow-lg"
              >
                <Download size={18} /> Export PDF
              </button>
            </div>

            <div className="overflow-x-auto">
              {reportData.students.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center gap-4">
                  <FileX size={48} className="text-slate-200" />
                  <p className="text-slate-400 font-medium italic">No attendance data found for the selected date range.</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Reg No</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                      <th className="px-6 py-4 text-center text-[11px] font-black text-blue-600 uppercase tracking-widest">Total Classes</th>
                      <th className="px-6 py-4 text-center text-[11px] font-black text-emerald-600 uppercase tracking-widest">Attended</th>
                      <th className="px-6 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Absent</th>
                      <th className="px-6 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.students.map((s) => {
                      const absent = s.totalClasses - s.attended;
                      return (
                        <tr key={s.reg} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-600 font-mono">{s.reg}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-800">{s.name}</td>
                          <td className="px-6 py-4 text-center text-sm font-bold text-blue-700">{s.totalClasses}</td>
                          <td className="px-6 py-4 text-center text-sm font-bold text-emerald-700">{s.attended}</td>
                          <td className="px-6 py-4 text-center text-sm font-bold text-rose-600">{absent}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                                <div 
                                  className={`h-full transition-all duration-1000 ${parseFloat(s.percentage) < 75 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${s.percentage}%` }}
                                />
                              </div>
                              <span className={`text-sm font-black min-w-[50px] ${parseFloat(s.percentage) < 75 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {s.percentage}%
                              </span>
                            </div>
                          </td>
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
