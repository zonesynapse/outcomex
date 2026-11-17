import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, collection, setDoc, getDoc, onSnapshot, getDocs, query, where, documentId, limit } from "firebase/firestore";
import {
  ChevronDown,
  Save,
  CheckCircle2,
  AlertCircle,
  Keyboard,
  Upload,
  Download,
  Lock
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, formatProgrammeKey, isDeptMatch as canonicalDeptMatch, stripSanitizedDegreePrefix, stripDegreePrefixDynamic } from "../lib/utils";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import { fetchAllCourseNamesMap } from "../utils/courseUtils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};
const sanitizeKeyStrict = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const deriveSemesterNumber = (label) => {
  if (!label) return '';
  const m = String(label).match(/(\d+)/);
  return m ? m[1] : '';
};

const parseSubjectCodeKey = (raw) => {
  if (!raw) return '';
  let candidate = raw;

  // 1. If raw is an object, extract key property
  if (typeof raw === 'object' && raw !== null) {
    candidate = raw.code || raw.CODE || raw.subjectCode || raw.courseCode || raw.subject_code || raw.course_code || raw.subject || raw.course || raw.id || '';
  }

  let s = String(candidate || '').trim();
  if (!s) return '';

  // 2. If candidate is a string starting with '{', attempt JSON.parse
  if (s.startsWith('{') && s.endsWith('}')) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object') {
        const inner = parsed.code || parsed.CODE || parsed.subjectCode || parsed.courseCode || parsed.subject_code || parsed.course_code || parsed.subject || parsed.course || parsed.id;
        if (inner) s = String(inner).trim();
      }
    } catch { /* non-critical */ }
  }

  // 3. Strip raw composite Firestore keys like "CODEBM3551NAMEEMBEDDED..."
  const m = s.match(/CODE([A-Z0-9]+)NAME/i);
  if (m) s = m[1];
  else {
    // "CS25C09 - Java Programming" -> "CS25C09"
    // "CME 340 - CAD/CAM" -> "CME 340" (space-separated codes keep their number part)
    s = s.split(' - ')[0].split(' — ')[0].split(':')[0].trim();
    const spaced = s.match(/^([A-Z]{2,}\s+\d+[A-Z0-9]*)/);
    s = spaced ? spaced[1].trim() : s.split(/\s+/)[0];
  }

  const clean = s.toUpperCase().trim();

  // 4. Strict Validation Guard:
  // Subject code must NOT start with '{', '[', '"', or contain 'OBJECT'
  if (/^[{\["']/.test(clean) || clean.includes('OBJECT') || clean.includes('{') || clean.includes('}') || clean.includes('"')) {
    return '';
  }

  // Course code is alphanumeric with optional dashes/underscores and ONE internal
  // space (e.g. CS25C09, GE3791, CCS334, CME 340, GE 3751)
  const codeMatch = clean.match(/^([A-Z0-9_-]+(?:\s+[A-Z0-9_-]+)?)/);
  return codeMatch ? codeMatch[1].trim() : '';
};

// Canonicalize any batch representation into "XX Batch (YYYY-YY)" without double-wrapping.
// e.g. "2025-2029" -> "25 Batch (2025-29)", "25 Batch (2025-29)" stays as-is.
const canonicalizeBatch = (b) => {
  if (!b) return '';
  const s = String(b).trim();
  if (/^\d{2}\s*Batch\s*\(/i.test(s)) return s;
  const m = s.match(/(19|20)\d{2}\s*[-–—]\s*(\d{2,4})/);
  if (!m) return s;
  const start = s.match(/(19|20)\d{2}/)[0];
  let end = (m[2] || '').replace(/\D/g, '');
  if (end.length === 4) end = end.slice(-2);
  if (end.length !== 2) {
    // Derive from duration guess: if start year + 2 looks like PG handled elsewhere, default 4-yr UG
    end = String((parseInt(start, 10) + 4) % 100).padStart(2, '0');
  }
  const yy = String(start).slice(-2);
  return `${yy} Batch (${start}-${end})`;
};

const batchStartYear = (b) => {
  if (!b) return null;
  const m = String(b).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
};

const yearStartOf = (s) => String(s || '').match(/(19|20)\d{2}/)?.[0] || '';

const getBatchDurationYears = (b) => {
  if (!b) return null;
  const years = String(b).match(/(19|20)\d{2}/g);
  if (!years || years.length < 2) {
    // Try short form "2025-29"
    const m = String(b).match(/(20\d{2})\s*[-–—]\s*(\d{2})\b/);
    if (m) return 2000 + parseInt(m[2], 10) - parseInt(m[1], 10);
    return null;
  }
  const start = parseInt(years[0], 10);
  let end = parseInt(years[years.length - 1], 10);
  if (end < 100) end = Math.floor(start / 100) * 100 + end;
  return end - start;
};

// Shared normalizer for Firestore string comparisons (dept/programme/batch/section).
const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');

const isFirestoreKey = (str) => {
  if (!str) return false;
  const s = String(str).trim();
  return s.startsWith('-') || (/^[a-zA-Z0-9_-]{16,}$/.test(s) && !s.includes(' ') && !s.includes('IA') && !s.includes('CIA') && !s.includes('Exam') && !s.includes('Assignment'));
};

const stripSetSuffix = (s) => String(s || '').replace(/\s*\(?\s*set\s*[-_:.]?\s*([0-9]+|[a-z])\s*\)?\s*$/i, '').trim();

const isExamNameMatch = (a, b) => {
  if (!a || !b) return false;
  const na = norm(stripSetSuffix(a));
  const nb = norm(stripSetSuffix(b));
  return na === nb;
};

// Dynamically extract all configured exam tokens from Firestore (cia_configs, generated_qps, availableExams)
// strictly excluding the current exam, so no exam names are ever hardcoded.
const getOtherConfiguredExamTokens = (curExam, configs = [], qps = [], available = []) => {
  if (!curExam) return [];
  const curClean = sanitizeKey(stripSetSuffix(curExam)).toLowerCase();
  const curSan = sanitizeKey(curExam).toLowerCase();
  const rawSet = new Set();

  (configs || []).forEach(c => {
    [c.examName, c.exam_name, c.exam, c.id].forEach(val => {
      if (!val || isFirestoreKey(val)) return;
      rawSet.add(String(val).trim());
    });
  });

  (qps || []).forEach(q => {
    [q.exam_name, q.examName, q.exam, q.qpaper_name, q.qpaperName].forEach(val => {
      if (!val || isFirestoreKey(val)) return;
      rawSet.add(String(val).trim());
    });
  });

  (available || []).forEach(e => {
    [e.text, e.value, e.baseName].forEach(val => {
      if (!val || isFirestoreKey(val)) return;
      rawSet.add(String(val).trim());
    });
  });

  const tokens = new Set();
  rawSet.forEach(name => {
    const s = String(name);
    const b = stripSetSuffix(s);
    const sSan = sanitizeKey(s).toLowerCase();
    const bSan = sanitizeKey(b).toLowerCase();
    const sSanStrict = sanitizeKeyStrict(s).toLowerCase();
    const bSanStrict = sanitizeKeyStrict(b).toLowerCase();

    [sSan, bSan, sSanStrict, bSanStrict].forEach(tok => {
      if (tok && tok !== curClean && tok !== curSan) {
        tokens.add(tok);
      }
    });
  });

  return Array.from(tokens);
};

const getNormalizedCourseType = (typeStr) => {
  if (!typeStr) return '';
  return String(typeStr).trim().toLowerCase().replace(/[–—_ ]/g, '');
};

// Module-level in-memory caches for instantaneous sub-100ms mark and roster loading
const studentRosterCache = new Map();
const marksDocumentCache = new Map();

export default function MarkEntry() {
  const location = useLocation();
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  // Fuzzy batch equality: "2025-2029" matches "25 Batch (2025-29)"
  const isBatchMatch = useCallback((a, b) => {
    if (!a || !b) return false;
    if (String(a).trim() === String(b).trim()) return true;
    const ya = batchStartYear(a);
    const yb = batchStartYear(b);
    return ya !== null && yb !== null && ya === yb;
  }, []);

  // Canonical department matching - STRICT: both must be present and match
  // Canonical dynamic department matching backed by Firestore department registry
  const isDeptMatch = useCallback((docDept, targetDept) => {
    if (!targetDept || !docDept) return false;
    return canonicalDeptMatch(docDept, targetDept);
  }, []);
  // Selection States
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [exam, setExam] = useState("");
  const [markType, setMarkType] = useState("");
  const [isUniversityExam, setIsUniversityExam] = useState(false);
  const [isIndirectAssessment, setIsIndirectAssessment] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userProgramme, setUserProgramme] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [facultyAssignPrefixes, setFacultyAssignPrefixes] = useState([]);
  const [facultyAssignedGroups, setFacultyAssignedGroups] = useState([]);
  const [subjectCourseType, setSubjectCourseType] = useState("");
  const [subjectCOs, setSubjectCOs] = useState([]);
  const activeCOs = useMemo(() => Array.isArray(subjectCOs) ? subjectCOs : [], [subjectCOs]);

  useEffect(() => {
    if (!auth.currentUser) return;
    let unsubscribeAssignments = null;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    getDoc(userRef).then(snapshot => {
      if (snapshot.exists()) {
        const userData = snapshot.data();
        setUserRole(userData.role);
        setUserProgramme(userData.programme || "");
        setUserDepartment(userData.department || "");
        {
          const assignmentsRef = collection(db, 'subject_assignments');
          const myRole = userData.role;
          const isPrivilegedListener = myRole === 'Admin' || myRole === 'HOD' || myRole === 'Principal';
          // Robust flat doc-ID parser: {progKey}_{dept...}_{batch...}_{ay}_{sem}[_{section}]
          // Tolerates canonical batch tokens ("24 Batch (2024-28)", "25_Batch") that break naive split.
          const parseAssignmentDocId = (id) => {
            const parts = String(id || '').split('_');
            let section = "";
            let end = parts.length;
            const lastPart = parts[end - 1] || "";
            if (end > 1 && !/^\d+$/.test(lastPart)) {
              section = lastPart;
              end -= 1;
            }
            const sem = String(parts[end - 1] || "").replace(/[^0-9]/g, "");
            let ay = "";
            let idx = end - 2;
            if (idx >= 0 && /^\d{4}-\d{2,4}$/.test(parts[idx])) {
              ay = parts[idx];
              idx -= 1;
            }
            const batchTokens = [];
            while (idx >= 0 && (/\d/.test(parts[idx]) || /batch/i.test(parts[idx]))) {
              batchTokens.unshift(parts[idx]);
              idx -= 1;
            }
            // Dynamically resolve progKey by matching against known programmes from PROGRAMME_DEPARTMENTS
            let progKey = parts[0] || "";
            let deptStartIdx = 1;
            const allKnownProgs = Object.keys(PROGRAMME_DEPARTMENTS || {});
            const twoParts = parts.length > 1 ? `${parts[0]}_${parts[1]}` : "";
            const matchedProg = allKnownProgs.find(p => formatProgrammeKey(p) === twoParts) ||
              allKnownProgs.find(p => formatProgrammeKey(p) === parts[0]);
            if (matchedProg) {
              progKey = formatProgrammeKey(matchedProg);
              deptStartIdx = progKey.includes('_') ? 2 : 1;
            } else if (parts.length > 1 && formatProgrammeKey(`${parts[0]}_${parts[1]}`)) {
              const cand = formatProgrammeKey(`${parts[0]}_${parts[1]}`);
              if (cand && cand.length > 2) {
                progKey = cand;
                deptStartIdx = 2;
              }
            }
            const dept = parts.slice(deptStartIdx, Math.max(deptStartIdx, idx + 1)).join('_');
            return { progKey, dept, batch: batchTokens.join('_'), ay, sem, section };
          };
          unsubscribeAssignments = onSnapshot(assignmentsRef, (assignSnap) => {
            const prefixes = [];
            const groups = [];
            assignSnap.forEach(d => {
              const data = d.data() || {};
              const meta = data._meta || {};
              // Faculty: only own UID. Privileged (Admin/HOD/Principal): union of ALL uids so dept subjects show.
              let codes = [];
              if (isPrivilegedListener) {
                Object.entries(data).forEach(([k, v]) => {
                  if (k.startsWith('_')) return;
                  if (Array.isArray(v)) codes.push(...v);
                });
                codes = [...new Set(codes.filter(Boolean))];
                if (codes.length === 0) return;
              } else {
                if (!data?.[auth.currentUser.uid]) return;
                codes = data[auth.currentUser.uid];
                if (!Array.isArray(codes) || codes.length === 0) return;
                codes = codes.filter(Boolean);
              }
              const parsed = parseAssignmentDocId(d.id);
              const progKey = meta.programmeKey || meta.progKey || parsed.progKey;
              const deptPart = parsed.dept;
              const department = (meta.department || deptPart.replace(/_/g, ' ').trim());
              const programme = meta.programme || meta.programme_name || progKey;
              const batch = meta.batch || parsed.batch || (d.id.match(/\d{4}\s*[-–—]\s*\d{2,4}/) || [])[0] || '';
              const ay = meta.academicYear || meta.academic_year || parsed.ay;
              const sem = meta.semester || parsed.sem;
              const sec = meta.section || parsed.section;
              if (!batch && !ay && !sem) {
                const yearMatch = d.id.match(/\d{4}-\d{4}/);
                if (yearMatch && yearMatch.index >= 2) {
                  prefixes.push(d.id.slice(0, yearMatch.index - 1));
                }
                // Still keep group when meta carries batch info
                if (!meta.batch) return;
              }
              prefixes.push(`${progKey}_${deptPart}`);
              groups.push({
                progKey,
                programme,
                department,
                batch,
                academicYear: ay,
                semester: sem,
                section: sec,
                codes,
              });
            });
            setFacultyAssignPrefixes(prefixes);
            setFacultyAssignedGroups(groups);
          });
        }
      }
    });
    return () => {
      if (unsubscribeAssignments) unsubscribeAssignments();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  // Data States
  const [students, setStudents] = useState([]);
  const [enrolledRegs, setEnrolledRegs] = useState({});
  const [qpParts, setQpParts] = useState([]);
  const [assignmentConfig, setAssignmentConfig] = useState([]);
  const [qpMeta, setQpMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [marksLoading, setMarksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToastMsg = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // Mark Entry States (per student)
  const [marksData, setMarksData] = useState({});

  // Keyboard Navigation State (per-student cursor to avoid global changes)
  // activeCursor: { [regno]: { A: number, B: number, C: number, CO: string, Assignment: number, lastActivePart: string } }
  const [activeCursor, setActiveCursor] = useState({});

  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [availableExams, setAvailableExams] = useState([]);
  const [allQPs, setAllQPs] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState([]);
  const [gradeConfigs, setGradeConfigs] = useState([]); // Grades for current regulation
  const fileInputRef = useRef(null);
  const eseFileInputRef = useRef(null);
  // Resolved marks doc ID for the current filter set. Older saves stored the QP
  // push-ID in the exam slot ("..._CS25C08_-OsVReAuCyJ5lRI2-WsS_...") while the exam
  // dropdown now carries the display name ("IA 1") — exact-key-only lookup misses
  // those docs and the table wrongly shows all zeros.
  const [resolvedMarksDocId, setResolvedMarksDocId] = useState(null);
  const marksResolveCache = useRef({});
  const courseTypeCacheRef = useRef({});
  const syllabusCacheRef = useRef({});

  // Warn on accidental reload/close while editing marks
  const isMarksDirty = useMemo(() => {
    return Object.keys(marksData).length > 0;
  }, [marksData]);
  useUnsavedChanges(isMarksDirty);

  const handleDownloadTemplate = () => {
    if (!students.length) {
      showToastMsg("No students found to generate template.", "error");
      return;
    }

    const csvData = students.map(s => {
      const row = {
        "Register Number": s.regNo || s.reg,
        "Name": s.name
      };
      activeCOs.forEach(co => {
        row[co] = "";
      });
      return row;
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Indirect_Assessment_Template_${subject}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToastMsg("Template downloaded! Fill the CO marks (max 3) and upload.", "success");
  };

  const handleDownloadEseTemplate = () => {
    if (!students || !students.length) {
      showToastMsg("No students found to generate template.", "error");
      return;
    }

    const isCOWise = markType === 'CO Wise';
    const header = isCOWise
      ? ["Register Number", "Student Name", ...activeCOs]
      : ["Register Number", "Student Name", "Grade"];

    const ws_data = [header];

    students.forEach(s => {
      if (isCOWise) {
        ws_data.push([
          s.regNo || s.reg,
          s.name,
          ...activeCOs.map(() => "")
        ]);
      } else {
        ws_data.push([
          s.regNo || s.reg,
          s.name,
          ""
        ]);
      }
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "ESE Template");

    const cleanSub = parseSubjectCodeKey(subject) || sanitizeKey(subject) || "Subject";
    const cleanExam = String(exam || "ESE").replace(/[^a-zA-Z0-9_-]/g, "_");
    const modeTag = isCOWise ? "CO_Wise" : "Grade";
    XLSX.writeFile(wb, `ESE_${modeTag}_Template_${cleanSub}_${cleanExam}.xlsx`);
    showToastMsg(`Downloaded ESE ${isCOWise ? "CO Wise" : "Grade"} Template successfully!`, "success");
  };

  const handleEseFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!subject || !exam) {
      showToastMsg("Please select subject and exam first!", "error");
      return;
    }

    let sectionIndexLookup = {};
    try {
      const progKey = formatProgrammeKey(programme);
      const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
      const ssDocId = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;
      const ssSnap = await getDoc(doc(db, 'student_section_index', ssDocId));
      if (ssSnap.exists()) {
        const idxData = ssSnap.data();
        Object.entries(idxData).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          sectionIndexLookup[key] = key;
          if (val?.regNo) sectionIndexLookup[val.regNo] = key;
        });
      }
    } catch (err) {
      // Non-critical
    }

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(dataBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rawRows || rawRows.length === 0) {
        showToastMsg("Uploaded file is empty.", "error");
        return;
      }

      const sampleRow = rawRows[0];
      const keys = Object.keys(sampleRow);
      const regCol = keys.find(k => /reg/i.test(k) || /roll/i.test(k));
      const gradeCol = keys.find(k => /^grade$/i.test(k.trim()) || (/grade/i.test(k) && !/point/i.test(k)));
      const coCols = keys.filter(k => /^co\d+/i.test(k.trim()));

      if (!regCol) {
        showToastMsg("File must have a 'Register Number' column.", "error");
        return;
      }

      const isCOWise = markType === 'CO Wise' || (coCols.length > 0 && !gradeCol);

      if (isCOWise && coCols.length === 0) {
        showToastMsg("File must have CO columns (e.g. CO1, CO2, CO3, CO4, CO5).", "error");
        return;
      } else if (!isCOWise && !gradeCol) {
        showToastMsg("File must have a 'Grade' column.", "error");
        return;
      }

      const activeGrades = gradeConfigs || [];
      const newMarksData = { ...marksData };
      let matchCount = 0;

      rawRows.forEach(row => {
        const regno = String(row[regCol] || '').trim();
        if (!regno) return;

        const targetReg = newMarksData[regno] ? regno : (sectionIndexLookup[regno] || regno);
        if (newMarksData[targetReg]) {
          if (isCOWise) {
            matchCount++;
            coCols.forEach(col => {
              const coKey = col.toUpperCase().trim();
              const val = row[col];
              if (val !== undefined && val !== '') {
                newMarksData[targetReg][coKey] = Number(val);
              }
            });
            const coSum = activeCOs.reduce((a, co) => a + Number(newMarksData[targetReg][co] || 0), 0);
            newMarksData[targetReg].total = coSum;
          } else {
            const rawGrade = String(row[gradeCol] || '').trim().toUpperCase();
            if (rawGrade) {
              matchCount++;
              if (rawGrade === 'AB' || rawGrade === 'ABSENT') {
                newMarksData[targetReg] = {
                  ...newMarksData[targetReg],
                  absent: true,
                  grade: 'AB',
                  gradePoint: '',
                  overall: '',
                  total: 0
                };
              } else {
                const gradeDef = activeGrades.find(g => String(g.grade).toUpperCase() === rawGrade);
                const markVal = gradeDef ? gradeDef.mark : "";
                const gpVal = gradeDef ? gradeDef.gradePoint : "";
                newMarksData[targetReg] = {
                  ...newMarksData[targetReg],
                  absent: false,
                  grade: rawGrade,
                  gradePoint: gpVal,
                  overall: markVal,
                  total: isNaN(Number(markVal)) ? 0 : Number(markVal)
                };
              }
            }
          }
        }
      });

      setMarksData(newMarksData);
      showToastMsg(`Successfully imported ${isCOWise ? 'CO Marks' : 'Grades'} for ${matchCount} students!`, "success");
    } catch (err) {
      console.error("ESE File Upload Error:", err);
      showToastMsg("Failed to read Excel/CSV file.", "error");
    } finally {
      if (eseFileInputRef.current) eseFileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check if subject and exam are selected
    if (!subject || !exam) {
      showToastMsg("Please select subject and exam first!", "error");
      return;
    }

    // Pre-load student_section_index for dual-ID lookup (admissionNo ↔ regNo)
    let sectionIndexLookup = {};
    try {
      const progKey = formatProgrammeKey(programme);
      const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
      const ssDocId = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;
      const ssSnap = await getDoc(doc(db, 'student_section_index', ssDocId));
      if (ssSnap.exists()) {
        const idxData = ssSnap.data();
        Object.entries(idxData).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          sectionIndexLookup[key] = key;
          if (val?.regNo) sectionIndexLookup[val.regNo] = key;
        });
      }
    } catch (e) {
      // Non-critical — direct match still works
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { data, meta } = results;

        // Validation: Must have register number (or similar)
        const regCol = meta.fields.find(f => /reg/i.test(f) || /roll/i.test(f));
        if (!regCol) {
          showToastMsg("CSV must have a 'Register Number' column", "error");
          return;
        }

        const coCols = meta.fields.filter(f => /^co\d+/i.test(f));
        if (coCols.length === 0) {
          showToastMsg("CSV must have at least one CO column (e.g., CO1, CO2)", "error");
          return;
        }

        const newMarksData = { ...marksData };
        let matchCount = 0;
        let fallbackCount = 0;

        data.forEach(row => {
          const regno = String(row[regCol]).trim();
          // Try direct match first, then fallback to section index
          const targetReg = newMarksData[regno] ? regno : (sectionIndexLookup[regno] || regno);
          if (newMarksData[targetReg]) {
            matchCount++;
            if (targetReg !== regno) fallbackCount++;
            coCols.forEach(col => {
              const coKey = col.toUpperCase().trim();
              const val = row[col];
              if (val !== undefined && val !== '') {
                newMarksData[targetReg][coKey] = Number(val);
              }
            });
            // Also calculate total if needed, although for indirect it's often just CO marks
            newMarksData[targetReg].total = calculateTotal(targetReg, newMarksData);
          }
        });

        setMarksData(newMarksData);
        let msg = `Successfully updated marks for ${matchCount} students!`;
        if (fallbackCount > 0) msg += ` (${fallbackCount} matched via alternate ID)`;
        showToastMsg(msg, "success");
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        console.error("CSV Parse Error:", err);
        showToastMsg("Failed to parse CSV file.", "error");
      }
    });
  };

  // Fetch CIA Configs in real-time from Firestore
  useEffect(() => {
    const configsRef = collection(db, 'cia_configs');
    const unsub = onSnapshot(configsRef, (snapshot) => {
      const configsArray = [];
      snapshot.forEach(doc => {
        configsArray.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setCiaConfigs(configsArray);
    }, (error) => {
      console.error("Error fetching CIA configs:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (programme) {
      const progKey = formatProgrammeKey(programme);
      setAvailableBatches(getActiveBatches(progKey));
    } else {
      setAvailableBatches([]);
    }
  }, [programme, getActiveBatches]);

  // Fetch all generated QPs once to use for filtering
  useEffect(() => {
    const qpRef = collection(db, 'generated_qps');
    const unsub = onSnapshot(qpRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        const docData = doc.data();
        if (!docData || typeof docData !== 'object') return;
        // Flat documents store a single QP payload directly (same check as FacultyDashboard)
        const isFlatDoc = docData.subject || docData.subject_code || docData.parts || docData.assignment_config || docData.qpaper_name;
        if (isFlatDoc) {
          list.push({
            ...docData,
            id: docData.id || docData.qpId || doc.id,
            _id: doc.id, // field key fallback = parent doc ID for flat docs
            _compositeKey: doc.id // The parent doc ID used for subcollection path
          });
          return;
        }
        // Flatten summaries stored as fields in the document
        Object.entries(docData).forEach(([fieldKey, summary]) => {
          if (summary && typeof summary === 'object' && (summary.subject || summary.batch)) {
            list.push({
              ...summary,
              _id: fieldKey, // The specific version ID (e.g., 'Exam' or 'Assignment' or 'DCA-I')
              _compositeKey: doc.id // The parent doc ID used for subcollection path
            });
          }
        });
      });
      setAllQPs(list);
    }, (error) => {
      console.error("Error fetching all QPs:", error);
      setAllQPs([]);
    });
    return () => unsub();
  }, []);

  const derivedProgs = useMemo(() => {
    const progs = new Set();
    // From structured assignment groups (handles multi-department faculty correctly)
    facultyAssignedGroups.forEach(g => {
      const pk = formatProgrammeKey(g.progKey || g.programme || '');
      if (pk) progs.add(pk);
    });
    if (!facultyAssignPrefixes.length && progs.size === 0) return [];
    Object.keys(PROGRAMME_DEPARTMENTS).forEach(prog => {
      const progKey = formatProgrammeKey(prog);
      if (facultyAssignPrefixes.some(p => p.startsWith(progKey))) {
        progs.add(progKey);
      }
    });
    return Array.from(progs);
  }, [facultyAssignPrefixes, facultyAssignedGroups, PROGRAMME_DEPARTMENTS]);

  const filteredProgrammes = useMemo(() => {
    const qpProg = location.state?.qp?.programme || location.state?.qp?.progKey;
    const homeProg = formatProgrammeKey(userProgramme);
    return Object.keys(PROGRAMME_DEPARTMENTS).filter(prog => {
      const progKey = formatProgrammeKey(prog);
      // Always keep the dashboard-passed programme selectable
      if (qpProg && formatProgrammeKey(qpProg) === progKey) return true;
      // Strict home-programme scoping for ALL roles
      if (homeProg && homeProg === progKey) return true;
      // Assigned/derived programme scoping (from subject_assignments)
      if (derivedProgs.includes(progKey)) return true;
      // Safety fallback: no scoping signals at all -> keep the full list
      if (!homeProg && derivedProgs.length === 0) return true;
      return false;
    });
  }, [PROGRAMME_DEPARTMENTS, userProgramme, derivedProgs, location.state]);

  const derivedDepts = useMemo(() => {
    const depts = new Set();
    facultyAssignedGroups.forEach(g => {
      const gProg = formatProgrammeKey(g.progKey || g.programme || '');
      if (!programme || gProg === formatProgrammeKey(programme)) {
        if (g.department) depts.add(String(g.department).replace(/[_ ]+/g, ' ').trim());
      }
    });
    if (facultyAssignPrefixes.length && programme) {
      const progKey = formatProgrammeKey(programme);
      facultyAssignPrefixes.forEach(prefix => {
        if (prefix.startsWith(progKey)) {
          depts.add(prefix.slice(progKey.length).replace(/^_+/, '').replace(/[_ ]+/g, ' ').trim());
        }
      });
    }
    return Array.from(depts).filter(Boolean);
  }, [facultyAssignPrefixes, facultyAssignedGroups, programme]);

  const filteredDepartments = useMemo(() => {
    const depts = PROGRAMME_DEPARTMENTS[formatProgrammeKey(programme)] || [];
    const qpDept = location.state?.qp?.department || location.state?.qp?.dept;
    // Collect ALL departments from assignments (multi-dept faculty) + home dept
    const allMine = new Set(derivedDepts);
    if (userDepartment) allMine.add(String(userDepartment).replace(/[_ ]+/g, ' ').trim());
    facultyAssignedGroups.forEach(g => {
      if (g.department) allMine.add(String(g.department).replace(/[_ ]+/g, ' ').trim());
    });
    if (allMine.size === 0) {
      if (qpDept && !depts.includes(qpDept)) return [...depts, qpDept];
      return depts;
    }
    const normalizedMine = Array.from(allMine).map(d => d.toLowerCase());
    let out = depts.filter(dept => {
      const normDept = sanitizeKey(dept).replace(/[_ ]+/g, ' ').trim().toLowerCase();
      return normalizedMine.some(d => d === normDept || d.includes(normDept) || normDept.includes(d));
    });
    if (qpDept && !out.includes(qpDept)) out = [...out, qpDept];
    if (userDepartment && !out.includes(userDepartment)) out = [...out, userDepartment];
    return out.length > 0 ? out : depts;
  }, [programme, derivedDepts, userDepartment, facultyAssignedGroups, PROGRAMME_DEPARTMENTS, location.state]);

  // Available Batches: scoped to user's assignments + active QPs, fuzzy batch match,
  // programme-duration filtered (UG=4yr, PG=2yr), canonicalized, NEVER wiped to empty.
  useEffect(() => {
    if (!programme) {
      setAvailableBatches([]);
      return;
    }
    const progKey = formatProgrammeKey(programme);
    const baseBatches = getActiveBatches(progKey) || [];
    const isPg = progKey === 'PG' || progKey === 'M_E' || progKey === 'M_Tech';
    const targetDuration = isPg ? 2 : 4;

    const assignedBatches = facultyAssignedGroups
      .filter(g => !programme || formatProgrammeKey(g.progKey || g.programme || '') === progKey)
      .map(g => g.batch)
      .filter(Boolean);

    // QP batches: batch match only — do NOT require dept equality so cross-department
    // Common QPs (e.g. CS25C09 set by CSE for AI&DS students) keep their batch alive.
    const qpBatches = (allQPs || [])
      .filter(qp => {
        if (!qp.batch) return false;
        if (qp.programme && formatProgrammeKey(qp.programme) !== progKey) return false;
        return true;
      })
      .map(qp => qp.batch);

    const merged = [...baseBatches, ...assignedBatches, ...qpBatches].filter(Boolean);
    const canonMap = new Map();
    merged.forEach(b => {
      const c = canonicalizeBatch(b);
      if (!canonMap.has(c)) canonMap.set(c, c);
    });
    let list = Array.from(canonMap.keys());
    // Duration filter: keep batches matching programme duration; if filter empties, keep all.
    const durFiltered = list.filter(b => {
      const d = getBatchDurationYears(b);
      return d === null || d === targetDuration;
    });
    if (durFiltered.length > 0) list = durFiltered;
    // Preserve currently-selected batch even if scopes haven't loaded yet
    if (batch && !list.some(b => isBatchMatch(b, batch))) {
      list = [canonicalizeBatch(batch), ...list];
    }
    setAvailableBatches(list);
  }, [programme, allQPs, facultyAssignedGroups, getActiveBatches, batch, isBatchMatch]);

  // Academic Years: strictly from user's assignments + QPs for the selected batch.
  // For new batches without QPs yet, derive the valid 4-year range from the batch.
  useEffect(() => {
    if (!batch || !programme) {
      setAcademicYears([]);
      return;
    }
    const normAy = (s) => {
      const m = String(s || '').match(/(19|20)\d{2}/g);
      if (!m) return String(s || '').trim();
      const start = parseInt(m[0], 10);
      return `${start}-${start + 1}`;
    };
    const aySet = new Set();
    facultyAssignedGroups
      .filter(g => isBatchMatch(g.batch, batch))
      .forEach(g => { if (g.academicYear) aySet.add(normAy(g.academicYear)); });
    (allQPs || [])
      .filter(qp => qp.batch && isBatchMatch(qp.batch, batch))
      .forEach(qp => {
        const ay = qp.academic_year || qp.academicYear;
        if (ay) aySet.add(normAy(ay));
      });
    // Preserve current selection
    if (academicYear) aySet.add(normAy(academicYear));
    let list = Array.from(aySet).filter(Boolean).sort();
    if (list.length === 0) {
      const start = batchStartYear(batch);
      if (start) {
        const isPg = ['PG', 'M_E', 'M_Tech'].includes(formatProgrammeKey(programme));
        const dur = isPg ? 2 : 4;
        list = Array.from({ length: dur }, (_, i) => `${start + i}-${start + i + 1}`);
      }
    }
    setAcademicYears(list);
    // Clear stale selection only when we have a concrete list that excludes it
    if (list.length > 0) {
      const qpAy = location.state?.qp?.academic_year || location.state?.qp?.academicYear;
      setAcademicYear(prev => (prev && list.includes(prev) ? prev : (prev || qpAy || "")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, programme, allQPs, facultyAssignedGroups, isBatchMatch]);

  // Semesters: ONLY semesters where the user has assigned subjects or active QPs
  // for the selected Batch + Academic Year. No unassigned fallback pairs.
  useEffect(() => {
    if (!academicYear || !batch || !programme) {
      setSemesters([]);
      return;
    }
    const normAyEq = (a, b) => {
      if (!a || !b) return true;
      const na = String(a).match(/(19|20)\d{2}/)?.[0] || String(a);
      const nb = String(b).match(/(19|20)\d{2}/)?.[0] || String(b);
      return na === nb || String(a).includes(String(b)) || String(b).includes(String(a));
    };
    const qpSems = (allQPs || [])
      .filter(qp => qp.batch && isBatchMatch(qp.batch, batch) && normAyEq(qp.academic_year || qp.academicYear, academicYear))
      .map(qp => deriveSemesterNumber(qp.semester))
      .filter(Boolean);
    const groupSems = facultyAssignedGroups
      .filter(g => isBatchMatch(g.batch, batch) && normAyEq(g.academicYear, academicYear))
      .map(g => deriveSemesterNumber(g.semester))
      .filter(Boolean);
    let activeSemNums = [...new Set([...qpSems, ...groupSems])].map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    const isPg = ['PG', 'M_E', 'M_Tech'].includes(formatProgrammeKey(programme));
    const maxSem = isPg ? 4 : 8;
    let semListToUse = [];
    if (activeSemNums.length > 0) {
      semListToUse = activeSemNums.filter(n => n >= 1 && n <= maxSem);
    } else {
      // Last-resort derivation from batch year math (new batch, no assignments recorded yet)
      const bStart = batchStartYear(batch);
      const ayStart = batchStartYear(academicYear);
      if (bStart !== null && ayStart !== null) {
        const yearDiff = ayStart - bStart;
        if (yearDiff >= 0 && yearDiff < 4) {
          semListToUse = [yearDiff * 2 + 1, yearDiff * 2 + 2].filter(n => n <= maxSem);
        }
      }
      if (semListToUse.length === 0) semListToUse = [1];
    }
    const sems = semListToUse.sort((a, b) => a - b).map(n => {
      const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      return `${n}${suffix} Semester`;
    });
    setSemesters(sems);
    // Clear stale semester only when the fresh list excludes it
    if (sems.length > 0) {
      setSemester(prev => (prev && sems.includes(prev) ? prev : ""));
    }
  }, [academicYear, batch, programme, allQPs, facultyAssignedGroups, isBatchMatch]);

  // Stable signature of relevant QP subject codes for the active batch and semester
  const activeQpCodesKey = useMemo(() => {
    const needSem = deriveSemesterNumber(semester);
    return (allQPs || [])
      .filter(qp => qp && isBatchMatch(qp.batch, batch) && String(deriveSemesterNumber(qp.semester)) === String(needSem))
      .map(qp => parseSubjectCodeKey(qp.subject || qp.course || qp.subject_code || qp.courseCode))
      .filter(Boolean)
      .sort()
      .join(',');
  }, [allQPs, batch, semester, isBatchMatch]);

  // Subjects: User-handled assigned subjects + active QPs for selected department & semester.
  // Uses canonical department matching and global course map so subjects are never blank.
  useEffect(() => {
    const fetchSubjectNames = async () => {
      if (!batch || !academicYear || !semester || !programme || !department) {
        setSubjects([]);
        return;
      }

      const progKey = formatProgrammeKey(programme);
      const deptKey = sanitizeKey(department);
      const needSem = deriveSemesterNumber(semester);
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
      const normAyEq = (a, b) => {
        if (!a || !b) return true;
        return String(a).includes(String(b)) || String(b).includes(String(a)) ||
          (String(a).match(/(19|20)\d{2}/)?.[0] === String(b).match(/(19|20)\d{2}/)?.[0]);
      };

      try {
        const isPrivileged = userRole === 'Admin' || userRole === 'HOD' || userRole === 'Principal';

        const cleanCode = (c) => parseSubjectCodeKey(c);
        let userHandledCodes = [];
        let deptAllCodes = [];

        // 1. User-handled subjects from assigned groups using canonical department match.
        // NOTE: g.semester may be stored as "5", "Sem 5" or "5th Semester" — always compare via deriveSemesterNumber.
        // AcademicYear is deliberately NOT gated here: a batch takes a semester only once,
        // so assignment docs tagged with a previous AY (recorded when HOD mapped them)
        // are the same subjects. AY-tag variance must not wipe the dropdown.
        const semEq = (a, b) => String(deriveSemesterNumber(a) || '').trim() === String(b || '').trim();
        facultyAssignedGroups
          .filter(g => isBatchMatch(g.batch, batch) && semEq(g.semester, needSem))
          .forEach(g => {
            if (isDeptMatch(g.department, department)) {
              (g.codes || []).forEach(c => {
                const cc = cleanCode(c);
                if (cc) {
                  deptAllCodes.push(cc);
                  userHandledCodes.push(cc);
                }
              });
            }
          });

        // Fallback 1: facultyAssignedGroups matching batch + sem (broad academicYear match)
        if (userHandledCodes.length === 0) {
          facultyAssignedGroups
            .filter(g => isBatchMatch(g.batch, batch) && semEq(g.semester, needSem))
            .forEach(g => {
              if (isDeptMatch(g.department, department)) {
                (g.codes || []).forEach(c => {
                  const cc = cleanCode(c);
                  if (cc) {
                    deptAllCodes.push(cc);
                    userHandledCodes.push(cc);
                  }
                });
              }
            });
        }

        // Fallback 2: direct composite doc reads from subject_assignments (try section + base keys)
        if (userHandledCodes.length === 0) {
          const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
          const candidateKeys = [
            `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${needSem}${sectionSuffix}`,
            `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${needSem}`,
          ];
          for (const assignmentCompositeKey of candidateKeys) {
            try {
              const assignmentSnap = await getDoc(doc(db, 'subject_assignments', assignmentCompositeKey));
              if (assignmentSnap.exists()) {
                const assignments = assignmentSnap.data();
                if (isPrivileged) {
                  Object.values(assignments).forEach(v => { if (Array.isArray(v)) v.forEach(c => { const cc = cleanCode(c); if (cc) deptAllCodes.push(cc); }); });
                }
                (assignments[currentUser.uid] || []).forEach(c => { const cc = cleanCode(c); if (cc) userHandledCodes.push(cc); });
                if (userHandledCodes.length > 0 || deptAllCodes.length > 0) break;
              }
            } catch { /* non-critical */ }
          }
        }

        // Fallback 2b: collection scan for any subject_assignments doc matching batch+sem+dept
        // (covers canonical-batch IDs like "24 Batch (2024-28)" that exact-key reads miss).
        if (userHandledCodes.length === 0 && deptAllCodes.length === 0) {
          try {
            const allAssignSnap = await getDocs(collection(db, 'subject_assignments'));
            allAssignSnap.forEach(d => {
              const data = d.data() || {};
              const meta = data._meta || {};
              const idLow = String(d.id || '').toLowerCase();
              // Batch gate: meta batch or start-year match on doc ID
              const metaBatch = meta.batch || '';
              const batchOk = (metaBatch && isBatchMatch(metaBatch, batch)) || isBatchMatch(d.id, batch);
              if (!batchOk) return;
              // Semester gate: meta semester (derived) or trailing _<sem>[_Sec] on doc ID
              const metaSemNum = deriveSemesterNumber(meta.semester || '');
              const idSemTail = String(d.id || '').match(/_(\d+)(?:_sec[^_]*)?$/i);
              const idSemNum = idSemTail ? deriveSemesterNumber(idSemTail[1]) : '';
              const semOk = (metaSemNum && String(metaSemNum) === String(needSem)) ||
                (!metaSemNum && idSemNum && String(idSemNum) === String(needSem));
              if (!semOk) return;
              // Department gate (STRICT): meta department first; else parse dept tokens
              // from doc ID between progKey and batch tokens. Never substring-match —
              // "B_E_" prefix would pass every B.E. department.
              const metaDept = meta.department || '';
              let deptOk = !!(metaDept && isDeptMatch(metaDept, department));
              if (!deptOk && !metaDept) {
                const idParts = String(d.id || '').split('_');
                let pIdx = 0;
                if (idParts.length > 1 && ['B', 'M'].includes(idParts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(idParts[1])) pIdx = 2;
                else pIdx = 1;
                let bIdx = idParts.findIndex((p, i) => i >= pIdx && /^\d{4}-\d{2,4}$/.test(p));
                if (bIdx === -1) {
                  bIdx = idParts.findIndex((p, i) => i >= pIdx && (/\d{4}/.test(p) || /batch/i.test(p)));
                  if (bIdx !== -1) {
                    while (bIdx + 1 < idParts.length && (/\d/.test(idParts[bIdx + 1]) || /batch/i.test(idParts[bIdx + 1])) && !/^\d{4}-\d{2,4}$/.test(idParts[bIdx + 1])) bIdx += 1;
                  }
                }
                const deptTokens = bIdx !== -1 ? idParts.slice(pIdx, bIdx + (/batch/i.test(idParts[bIdx] || '') ? 0 : 0)).join('_') : '';
                // When batch token itself holds the year ("24 Batch (2024-28)"), dept is everything before it
                const parsedDept = (deptTokens || '').replace(/_/g, ' ').trim();
                deptOk = !!(parsedDept && isDeptMatch(parsedDept, department));
              }
              if (!deptOk) return;
              Object.entries(data).forEach(([k, v]) => {
                if (k.startsWith('_') || !Array.isArray(v)) return;
                if (!isPrivileged && k !== currentUser.uid) return;
                v.forEach(c => {
                  const cc = cleanCode(c);
                  if (cc) {
                    deptAllCodes.push(cc);
                    if (isPrivileged || k === currentUser.uid) userHandledCodes.push(cc);
                  }
                });
              });
            });
          } catch { /* non-critical */ }
        }

        // 2. QPs: handled/allocated for Faculty; dept-wide for privileged roles.
        // NOTE: qp.semester may be "Sem 5" / "5th Semester" — compare via deriveSemesterNumber.
        const qpDeptCodes = [];
        const userQpCodes = (allQPs || [])
          .filter(qp => {
            if (!qp.batch || !isBatchMatch(qp.batch, batch)) return false;
            if (qp.programme && formatProgrammeKey(qp.programme) !== progKey) return false;
            const qpAy = qp.academic_year || qp.academicYear;
            if (!normAyEq(qpAy, academicYear)) return false;
            if (String(deriveSemesterNumber(qp.semester) || '').trim() !== String(needSem)) return false;

            const qpCode = cleanCode(qp.subject || qp.course || qp.subject_code || qp.courseCode);
            if (!qpCode) return false;

            const qpDeptRaw = qp.department || qp.dept || '';
            const qpHasDept = !!(qpDeptRaw && String(qpDeptRaw).trim());
            const qpDeptMatch = qpHasDept && isDeptMatch(qpDeptRaw, department);

            if (isPrivileged) {
              // Privileged dept-wide visibility: STRICT department gating. A QP counts
              // only when it explicitly carries this department, OR its subject code is
              // part of this department's own assigned set (deptAllCodes). Never trust
              // userHandledCodes here — for privileged users it is the union across ALL
              // departments, which previously leaked e.g. BME subjects into an ECE
              // selection. QPs with missing/empty department must NOT leak either.
              if (qpDeptMatch || deptAllCodes.includes(qpCode)) {
                qpDeptCodes.push(qpCode);
                return true;
              }
              return false;
            }

            // Faculty (non-privileged): STRICT department gating.
            // An owned/allocated QP only counts when it explicitly carries the selected department.
            // Raw ownership (created_by / allocated_to) alone is NOT sufficient — a setter who
            // authored QPs in another department must not leak those subjects into this dropdown.
            // Cross-department Common QPs allocated to this user are covered by qpDeptMatch
            // because the QP document should carry the target department.
            const isMyQp = (Array.isArray(qp.allocated_to) && qp.allocated_to.includes(currentUser.uid)) ||
              (qp.allocated_faculty_id && qp.allocated_faculty_id === currentUser.uid) ||
              (qp.created_by && qp.created_by === currentUser.uid) ||
              (qp.allocatedTo && (
                qp.allocatedTo.facultyId === currentUser.uid ||
                qp.allocatedTo.id === currentUser.uid ||
                (currentUser.email && qp.allocatedTo.facultyEmail === currentUser.email) ||
                (currentUser.email && qp.allocatedTo.email === currentUser.email)
              )) ||
              (currentUser.email && (qp.faculty_email === currentUser.email || qp.creator_email === currentUser.email));
            if (isMyQp && (qpDeptMatch || !qpHasDept)) return true;

            return false;
          })
          .map(qp => cleanCode(qp.subject || qp.course || qp.subject_code || qp.courseCode))
          .filter(Boolean);

        const dashboardCode = dashboardQp ? cleanCode(dashboardQp.subject || dashboardQp.course || dashboardQp.subject_code || dashboardQp.courseCode) : '';
        let uniqueCodes = [...new Set([...userHandledCodes, ...userQpCodes, ...(dashboardCode ? [dashboardCode] : [])])];
        // Dedupe spacing variants ("CME 340" vs "CME340" = same subject) — keep first
        {
          const seenNoSpace = new Set();
          uniqueCodes = uniqueCodes.filter(code => {
            const k = String(code).toUpperCase().replace(/\s+/g, '');
            if (seenNoSpace.has(k)) return false;
            seenNoSpace.add(k);
            return true;
          });
        }
        if (isPrivileged) {
          uniqueCodes = [...new Set([...uniqueCodes, ...deptAllCodes, ...qpDeptCodes])];
        }

        // Filter to only subjects that have at least one "Allocated & Released" QP
        // in allQPs for the current batch/academicYear/semester/department
        const activeQpSubjectCodes = new Set(
          (allQPs || [])
            .filter(qp => {
              if (!qp.batch || !isBatchMatch(qp.batch, batch)) return false;
              if (qp.programme && formatProgrammeKey(qp.programme) !== progKey) return false;
              const qpAy = qp.academic_year || qp.academicYear;
              if (!normAyEq(qpAy, academicYear)) return false;
              if (String(deriveSemesterNumber(qp.semester) || '').trim() !== String(needSem)) return false;

              // NOTE: no department gate here — QP department metadata is often
              // missing or differently formatted. Department scoping already comes
              // from the assignment side (userHandledCodes/deptAllCodes); this set
              // only answers "does a QP exist for this subject in batch/AY/sem?".

              const statusNorm = String(qp.status || qp.state || '').toLowerCase().trim();
              const isAllocated = statusNorm === 'allocated & released' ||
                statusNorm === 'allocated' ||
                statusNorm === 'approved' ||
                statusNorm === 'approved by exam cell' ||
                statusNorm === 'approved_by_coe' ||
                statusNorm === 'approved_by_hod' ||
                qp.allocated === true ||
                qp.isAllocated === true ||
                Boolean(qp.allocatedTo) ||
                qp.status === 'Allocated & Released';
              return isAllocated;
            })
            .map(qp => cleanCode(qp.subject || qp.course || qp.subject_code || qp.courseCode))
            .filter(Boolean)
        );

        // Assigned subjects (mapped in any AY) must always show — QP availability
        // is enforced on the Exam dropdown, not here. The allocated-QP gate below
        // applies ONLY when the user has no assigned subjects at all.
        // Exception: preserve dashboardCode (from dashboard navigation).
        const hasDashboardCode = Boolean(dashboardCode);
        const hasAssignedSubjects = userHandledCodes.length > 0 || deptAllCodes.length > 0;
        if (!hasAssignedSubjects) {
          const noSpace = (c) => String(c).replace(/\s+/g, '');
          const dashKey = hasDashboardCode ? noSpace(dashboardCode) : '';
          const activeKeys = new Set([...activeQpSubjectCodes].map(noSpace));
          uniqueCodes = uniqueCodes.filter(code => {
            if (hasDashboardCode && noSpace(code) === dashKey) return true;
            return activeKeys.has(noSpace(code));
          });
        }

        // Fallback 3: syllabus subjects ONLY when no assigned subjects exist at all.
        // Otherwise an empty list is the correct answer — assigned subjects always
        // show; unassigned syllabus subjects still need an allocated QP (final gate).
        // Never dump the full syllabus and never leak other departments' subjects.
        if (uniqueCodes.length === 0 && userHandledCodes.length === 0 && deptAllCodes.length === 0) {
          try {
            const regulation = getRegulationForBatch(progKey, batch);
            const semKeysToTry = [needSem, `Sem ${needSem}`, `${needSem}th Semester`];
            const syllabusSnap = await getDoc(doc(db, 'syllabus_data', `${progKey}_${deptKey}_${sanitizeKey(regulation)}`));
            if (syllabusSnap.exists()) {
              const syllabusData = syllabusSnap.data() || {};
              const semestersObj = syllabusData.semesters || syllabusData || {};
              for (const sk of semKeysToTry) {
                const list = semestersObj[sk];
                if (Array.isArray(list) && list.length > 0) {
                  list.forEach(s => {
                    const cc = cleanCode(s?.code);
                    if (cc) uniqueCodes.push(cc);
                  });
                  if (uniqueCodes.length > 0) break;
                }
              }
            }
            // NOTE: no cross-semester / cross-department last resort here — other
            // departments' subjects (e.g. CCS338, BM3591) must never leak into this
            // department's dropdown.
          } catch { /* non-critical */ }
        }

        // Final gate: applies ONLY to the unassigned syllabus-fallback path above.
        // Fallback 3 appends raw syllabus codes, so the QP intersection is applied
        // here — but never when the user has assigned subjects (those always show).
        // The dashboard-navigated subject is always preserved.
        {
          const keepDash = dashboardCode || '';
          const stillAssigned = userHandledCodes.length > 0 || deptAllCodes.length > 0;
          const noSpace = (c) => String(c).replace(/\s+/g, '');
          const dashKey = keepDash ? noSpace(keepDash) : '';
          const activeKeys = new Set([...activeQpSubjectCodes].map(noSpace));
          uniqueCodes = [...new Set(uniqueCodes)].filter(code => (keepDash && noSpace(code) === dashKey) || stillAssigned || activeKeys.has(noSpace(code)));
        }

        // 1. Syllabus titles & course types lookup for exact regulation match (single targeted document, fast & cached)
        const regulation = getRegulationForBatch ? getRegulationForBatch(progKey, batch) : '';
        const syllDocId = `${progKey}_${deptKey}_${sanitizeKey(regulation)}`;
        const syllabusMap = {};
        const syllabusTypeMap = {};

        let syllabusData = syllabusCacheRef.current[syllDocId] || null;
        if (!syllabusData && regulation) {
          try {
            const syllabusSnap = await getDoc(doc(db, 'syllabus_data', syllDocId));
            if (syllabusSnap.exists()) {
              syllabusData = syllabusSnap.data();
              syllabusCacheRef.current[syllDocId] = syllabusData;
            }
          } catch { /* non-critical */ }
        }

        if (syllabusData?.semesters?.[needSem]) {
          syllabusData.semesters[needSem].forEach(s => {
            if (s?.code) {
              const cU = String(s.code).toUpperCase().trim();
              const cNoSpace = cU.replace(/\s+/g, '');
              syllabusMap[cU] = s.name || '';
              syllabusMap[cNoSpace] = s.name || '';
              const cType = s.category || s.courseType || s.type || s.subjectType || '';
              if (cType) {
                syllabusTypeMap[cU] = cType;
                syllabusTypeMap[cNoSpace] = cType;
              }
            }
          });
        }

        // 2. Only fetch heavy courseNamesMap if some codes are completely missing titles
        let courseNamesMap = {};
        const hasMissingTitles = uniqueCodes.some(code => {
          const clean = parseSubjectCodeKey(code);
          const noSpace = clean.replace(/\s+/g, '');
          return !syllabusMap[clean] && !syllabusMap[noSpace];
        });

        if (hasMissingTitles) {
          try {
            courseNamesMap = await fetchAllCourseNamesMap();
          } catch { /* fallback */ }
        }

        const mappedSubjects = uniqueCodes
          .map(code => {
            const clean = parseSubjectCodeKey(code);
            if (!clean) return null;
            // Titles may be keyed with or without the internal space ("CME 340" vs "CME340")
            const noSpace = clean.replace(/\s+/g, '');
            const title = syllabusMap[clean] || syllabusMap[noSpace] || courseNamesMap[clean] || courseNamesMap[noSpace] || courseNamesMap[clean.toUpperCase()] || courseNamesMap[noSpace.toUpperCase()] || '';
            const type = syllabusTypeMap[clean] || syllabusTypeMap[noSpace] || (/lab|practical|studio|drawing/i.test(title || clean) ? 'Practical' : (/project|dissertation/i.test(title || clean) ? 'Project' : 'Theory'));
            return {
              value: clean,
              text: title ? `${clean} - ${title}` : clean,
              type
            };
          })
          .filter(Boolean);

        setSubjects(mappedSubjects);
        // Preserve pre-selected subject if still valid; otherwise clear
        setSubject(prev => (prev && mappedSubjects.some(s => s.value === prev) ? prev : ""));
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
        setSubject("");
      }
    };
    fetchSubjectNames();
  }, [batch, academicYear, semester, programme, department, section, getRegulationForBatch, activeQpCodesKey, userRole, facultyAssignedGroups, isBatchMatch, isDeptMatch]);

  // Filter Available Exams based on generated QPs and University Configs.
  // Cross-department Common QPs included (no strict dept equality).
  // "IA 1 (Set 2)" is surfaced as base exam "IA 1" so one option covers all sets.
  useEffect(() => {
    if (!batch || !academicYear || !semester || !subject || !programme || !department) {
      setAvailableExams([]);
      return;
    }

    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const normAyEq = (a, b) => {
      if (!a || !b) return true;
      return String(a).includes(String(b)) || String(b).includes(String(a)) ||
        (String(a).match(/(19|20)\d{2}/)?.[0] === String(b).match(/(19|20)\d{2}/)?.[0]);
    };
    const targetProgKey = formatProgrammeKey(programme);
    const targetSemNum = deriveSemesterNumber(semester);
    const targetSubCode = parseSubjectCodeKey(subject);
    const stripSetSuffix = (s) => String(s || '').replace(/\s*\(?\s*set\s*[-_:.]?\s*([0-9]+|[a-z])\s*\)?\s*$/i, '').trim();
    // Strict regulation boundary: this batch belongs to a specific regulation
    // (e.g. 23 Batch → AU - R2021). Configs saved under any other regulation
    // (e.g. CIA 1/2/3 created for R2025) must never leak into this dropdown.
    const batchRegulation = getRegulationForBatch ? getRegulationForBatch(targetProgKey, batch) : "";
    const normReg = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isRegMatch = (a, b) => {
      if (!a || !b) return true;
      const na = normReg(a);
      const nb = normReg(b);
      if (na === nb) return true;
      const ya = na.match(/\d{4}/)?.[0] || na.match(/\d{2}/)?.[0];
      const yb = nb.match(/\d{4}/)?.[0] || nb.match(/\d{2}/)?.[0];
      if (ya && yb && ya === yb) return true;
      return na.includes(nb) || nb.includes(na);
    };

    // Determine current effective course type directly from Firestore-loaded state or subjects list
    const effectiveCourseType = subjectCourseType || (() => {
      const foundInSubs = subjects.find(s => s.value === subject || parseSubjectCodeKey(s.value) === targetSubCode);
      return foundInSubs?.type || "";
    })();
    const targetNormCourseType = getNormalizedCourseType(effectiveCourseType);

    // Helper to test if a CIA config or QP exam matches the target course type
    const isExamMatchingCourseType = (cfg) => {
      if (!cfg) return false;

      const activeSubCourseType = subjectCourseType || effectiveCourseType;

      // Pure courseTypes array matching (from CIA Config Page tags):
      if (cfg.courseTypes && Array.isArray(cfg.courseTypes) && cfg.courseTypes.length > 0) {
        if (activeSubCourseType) {
          const sTypeNorm = norm(activeSubCourseType);
          const cfgNorms = cfg.courseTypes.map(ct => norm(ct));
          const hasMatch = cfgNorms.includes(sTypeNorm) || cfgNorms.some(ct => ct === sTypeNorm || ct.includes(sTypeNorm) || sTypeNorm.includes(ct));
          if (!hasMatch) return false;
        }
      }

      return true;
    };

    // 1. Get exams strictly from generated QPs with status 'Allocated & Released' (or approved)
    const qpExams = allQPs
      .filter(qp => {
        if (!qp.batch || !isBatchMatch(qp.batch, batch)) return false;

        const qpProgKey = formatProgrammeKey(qp.programme || qp.program || '');
        if (qpProgKey && targetProgKey && qpProgKey !== targetProgKey) return false;

        const qpReg = qp.regulation || qp.batchRegulation;
        if (batchRegulation && qpReg && !isRegMatch(qpReg, batchRegulation)) return false;

        const qpAy = qp.academic_year || qp.academicYear;
        if (qpAy && !normAyEq(qpAy, academicYear)) return false;

        const qpSemNum = deriveSemesterNumber(qp.semester);
        if (qpSemNum && targetSemNum && String(qpSemNum) !== String(targetSemNum)) return false;

        const qpSubCode = parseSubjectCodeKey(qp.subject || qp.course || qp.subject_code || qp.courseCode);
        if (qpSubCode && targetSubCode && qpSubCode.replace(/\s+/g, '') !== targetSubCode.replace(/\s+/g, '')) return false;

        const rawName = qp.qpaper_name || qp.qpaperName;
        const baseName = stripSetSuffix(rawName) || rawName;
        const matchedConfig = ciaConfigs.find(c => c.id === rawName || c.examName === rawName || c.examName === baseName || c.id === baseName);

        // Filter QPs by course type & category
        const evalConfig = matchedConfig || {
          examName: baseName,
          isPractical: qp.isPractical || qp.assessment_type === 'Practical',
          isAssignment: qp.assessment_type === 'Assignment',
          isProject: qp.assessment_type === 'Project',
          isActivity: qp.assessment_type === 'Activity',
          isIndirectAssessment: qp.isIndirectAssessment
        };
        if (!isExamMatchingCourseType(evalConfig)) return false;

        // Strictly keep papers that are Allocated & Released (or Approved by Exam Cell / COE / HOD)
        const statusNorm = String(qp.status || qp.state || '').toLowerCase().trim();
        const isAllocated = qp.allocated === true ||
          qp.isAllocated === true ||
          Boolean(qp.allocatedTo) ||
          /allocated|approved/i.test(statusNorm);

        return isAllocated;
      })
      .map(qp => {
        const isFirestoreKey = (str) => {
          if (!str) return false;
          const s = String(str).trim();
          return s.startsWith('-') || (/^[a-zA-Z0-9_-]{16,}$/.test(s) && !s.includes(' ') && !s.includes('IA') && !s.includes('CIA') && !s.includes('Exam') && !s.includes('Assignment'));
        };

        const rawName = qp.qpaper_name || qp.qpaperName;
        const qpId = qp.id;
        const explicitExamName = qp.exam_name || qp.examName || qp.exam;

        const matchedConfig = ciaConfigs.find(c =>
          (rawName && (c.id === rawName || c.examName === rawName)) ||
          (qpId && (c.id === qpId || c.examName === qpId)) ||
          (explicitExamName && (c.examName === explicitExamName || c.id === explicitExamName))
        );

        let cleanExamName = '';
        if (explicitExamName && !isFirestoreKey(explicitExamName)) {
          cleanExamName = explicitExamName;
        } else if (matchedConfig?.examName && !isFirestoreKey(matchedConfig.examName)) {
          cleanExamName = matchedConfig.examName;
        } else if (rawName && !isFirestoreKey(rawName)) {
          cleanExamName = rawName;
        } else {
          cleanExamName = qp.assessment_type || 'Internal Exam';
        }

        const setVal = (qp.set || qp.setName || qp.set_name || '').toString().trim();
        const setSuffix = setVal && !/set\s*[-_:.]?\s*/i.test(setVal) ? `Set ${setVal}` : setVal;
        const hasSetInName = /\(set\s*[-_:.]?\s*([0-9]+|[a-z])\)/i.test(cleanExamName);
        const displayName = (setSuffix && !hasSetInName) ? `${cleanExamName} (${setSuffix})` : cleanExamName;
        const baseName = stripSetSuffix(cleanExamName) || cleanExamName;

        return {
          value: displayName,
          text: displayName,
          baseName: baseName,
          qpId: qp.id,
          _id: qp._id,
          _compositeKey: qp._compositeKey,
          type: matchedConfig?.isUniversity ? 'University' : (qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical' ? qp.assessment_type : (matchedConfig?.isPractical ? 'Practical' : 'Internal')),
          hasQP: true
        };
      });

    // 2. Get Configured Exams from ciaConfigs — strictly filtered by Regulation and Subject Course Type
    const needDept = norm(department);
    const ciaExams = ciaConfigs
      .filter(c => {
        // Regulation check: must match batch's regulation
        if (batchRegulation && c.regulation && !isRegMatch(c.regulation, batchRegulation)) return false;
        if (c.program && formatProgrammeKey(c.program) !== targetProgKey) return false;
        if (c.department && norm(c.department) !== needDept) return false;
        if (c.batch && !isBatchMatch(c.batch, batch)) return false;
        if (c.academicYear && !normAyEq(c.academicYear, academicYear)) return false;
        if (c.semester && String(deriveSemesterNumber(c.semester)) !== String(targetSemNum)) return false;

        // Match course type & category
        return isExamMatchingCourseType(c, targetNormCourseType);
      })
      .map(c => {
        const cleanName = c.examName || c.exam_name || c.exam || (!isFirestoreKey(c.id) ? c.id : '') || 'Internal Exam';
        return {
          value: cleanName,
          text: cleanName,
          type: c.isUniversity ? 'University' : (c.isAssignment ? 'Assignment' : (c.isProject ? 'Project' : (c.isPractical ? 'Practical' : (c.isIndirectAssessment ? 'Indirect' : 'Internal')))),
          isIndirectAssessment: !!c.isIndirectAssessment,
          hasQP: false
        };
      });

    const isFirestoreKey = (str) => {
      if (!str) return false;
      const s = String(str).trim();
      return s.startsWith('-') || (/^[a-zA-Z0-9_-]{16,}$/.test(s) && !s.includes(' ') && !s.includes('IA') && !s.includes('CIA') && !s.includes('Exam') && !s.includes('Assignment'));
    };

    const combined = [...qpExams, ...ciaExams].filter(e => e && e.text && !isFirestoreKey(e.text));

    // Remove duplicates based on normalized display text, prioritizing hasQP
    const uniqueExams = [];
    const seen = new Set();
    for (const e of combined) {
      const normText = e.text ? String(e.text).toLowerCase().trim() : '';
      if (normText && !seen.has(normText)) {
        seen.add(normText);
        uniqueExams.push({ ...e });
      } else if (normText && seen.has(normText)) {
        const existing = uniqueExams.find(ex => String(ex.text).toLowerCase().trim() === normText);
        if (existing) {
          if (e.hasQP) existing.hasQP = true;
          if (e.type && (existing.type === 'Internal' || !existing.type)) existing.type = e.type;
        }
      }
    }

    // Dashboard handoff guarantee: the clicked QP row's exam must always be
    // selectable, even when the strict qpExams filter above excluded its document
    // over metadata shape differences (programme/department/regulation formats).
    // Only applies when the dashboard QP's subject matches the selected subject,
    // so manual (non-handoff) flows are completely untouched.
    const dashQp = location.state?.qp;
    if (dashQp) {
      // Resolve the CIA exam name the paper was created for — exam_name first.
      // qpaper_name may hold a raw Firestore push key; keys must never surface.
      const dashRawName = [dashQp.exam_name, dashQp.examName, dashQp.exam, dashQp.qpaper_name, dashQp.qpaperName]
        .map(s => String(s || '').trim())
        .find(s => s && !isFirestoreKey(s)) || '';
      const dashCode = parseSubjectCodeKey(dashQp.subject || dashQp.course || dashQp.subject_code || dashQp.courseCode);
      if (dashRawName && dashCode && targetSubCode && dashCode === targetSubCode) {
        const dashSetVal = (dashQp.set || dashQp.setName || dashQp.set_name || '').toString().trim();
        const dashSetSuffix = dashSetVal && !/set\s*[-_:.]?\s*/i.test(dashSetVal) ? `Set ${dashSetVal}` : dashSetVal;
        const dashHasSetInName = /\(set\s*[-_:.]?\s*([0-9]+|[a-z])\)/i.test(dashRawName);
        const dashDisplay = (dashSetSuffix && !dashHasSetInName) ? `${dashRawName} (${dashSetSuffix})` : dashRawName;
        const dashBase = stripSetSuffix(dashDisplay) || dashDisplay;
        const dashAt = dashQp.assessment_type || '';
        const dashEntry = {
          value: dashDisplay,
          text: dashDisplay,
          baseName: dashBase,
          qpId: dashQp.id || dashQp.qpId || '',
          _id: dashQp._id || dashQp._compositeKey || dashQp.compositeKey || dashQp.id || '',
          _compositeKey: dashQp._compositeKey || dashQp.compositeKey || '',
          type: dashQp.isUniversity ? 'University' : ((dashAt === 'Assignment' || dashAt === 'Project' || dashAt === 'Practical') ? dashAt : (dashQp.isPractical ? 'Practical' : 'Internal')),
          isIndirectAssessment: !!dashQp.isIndirectAssessment,
          hasQP: true,
        };
        const dashNorm = dashDisplay.toLowerCase().trim();
        const existsIdx = uniqueExams.findIndex(ex => String(ex.text).toLowerCase().trim() === dashNorm);
        if (existsIdx === -1) {
          uniqueExams.push(dashEntry);
        } else {
          // Same display text already present: enrich with the clicked row's ids
          // so id-match + fetchQP ranking hit the exact Set row clicked.
          const ex = uniqueExams[existsIdx];
          if (!ex.qpId && dashEntry.qpId) ex.qpId = dashEntry.qpId;
          if (!ex._id && dashEntry._id) ex._id = dashEntry._id;
          if (!ex._compositeKey && dashEntry._compositeKey) ex._compositeKey = dashEntry._compositeKey;
          ex.hasQP = true;
        }
      }
    }

    setAvailableExams(uniqueExams);
    setExam(prev => {
      if (prev && uniqueExams.some(e => e.value === prev || e.text === prev)) return prev;
      return "";
    });
  }, [batch, academicYear, semester, subject, programme, department, allQPs, ciaConfigs, subjectCourseType, isBatchMatch, getRegulationForBatch, location.state]);

  // Auto-set Mark Type when Exam is selected
  useEffect(() => {
    if (exam && availableExams.length > 0) {
      const selectedExam = availableExams.find(e => e.value === exam);
      if (selectedExam) {
        const isUni = selectedExam.type === 'University';
        setIsUniversityExam(isUni);
        setIsIndirectAssessment(!!selectedExam.isIndirectAssessment);

        if (isUni) {
          // ESE/University: let user choose CO Wise or Overall via dropdown — don't auto-set
          // Keep existing markType if it's already a valid choice, otherwise leave empty
          if (markType !== 'CO Wise' && markType !== 'Overall') {
            setMarkType('');
          }
        } else if (selectedExam.isIndirectAssessment) {
          setMarkType("CO Wise");
        } else {
          setMarkType(selectedExam.type);
        }
      }
    } else {
      setMarkType("");
      setIsUniversityExam(false);
      setIsIndirectAssessment(false);
    }
  }, [exam, availableExams]);

  // Fetch course type and COs for the selected subject
  useEffect(() => {
    if (!programme || !department || !batch || !subject) {
      setSubjectCourseType("");
      setSubjectCOs([]);
      return;
    }
    const fetchCourseType = async () => {
      const progKey = formatProgrammeKey(programme);
      const deptKey = sanitizeKey(department);
      const strictDept = sanitizeKeyStrict(department);
      const rawSubCode = parseSubjectCodeKey(subject) || sanitizeKey(subject);
      const regVal = getRegulationForBatch ? getRegulationForBatch(progKey, batch) : "";
      const regKey = regVal ? sanitizeKey(regVal) : "";

      // 0. Immediate resolution: if already known from subjects list, set type
      const subFromState = subjects.find(s => s.value === subject || parseSubjectCodeKey(s.value) === rawSubCode);
      if (subFromState?.type) {
        setSubjectCourseType(subFromState.type);
      }

      // Check session memory cache
      const cacheKey = `${progKey}_${deptKey}_${regKey}_${rawSubCode}`;
      if (courseTypeCacheRef.current[cacheKey]) {
        setSubjectCourseType(courseTypeCacheRef.current[cacheKey]);
        return;
      }

      const candidateKeys = [
        `${progKey}_${deptKey}_${rawSubCode}`,
        `${progKey}_${strictDept}_${rawSubCode}`,
        `${progKey}_Overall_${rawSubCode}`
      ];
      if (regKey) {
        candidateKeys.unshift(
          `${progKey}_${deptKey}_${regKey}_${rawSubCode}`,
          `${progKey}_${strictDept}_${regKey}_${rawSubCode}`,
          `${progKey}_Overall_${regKey}_${rawSubCode}`
        );
      }

      try {
        let foundType = "";
        let foundCOs = [];

        const extractCOs = (d) => {
          if (!d) return [];
          if (Array.isArray(d.co) && d.co.length > 0) {
            return d.co.map((c, i) => String(c?.id || c?.code || c?.coNumber || `CO${i + 1}`).trim()).filter(Boolean);
          }
          if (typeof d === 'object') {
            const keys = Object.keys(d)
              .filter(k => /^co\d+$/i.test(k))
              .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));
            if (keys.length > 0) return keys.map(k => k.toUpperCase());
          }
          return [];
        };

        const tryGet = async (key) => {
          try {
            const snap = await getDoc(doc(db, 'courses', key));
            if (snap.exists()) {
              const d = snap.data();
              if (foundCOs.length === 0) foundCOs = extractCOs(d);
              return d.type || d.category || d.courseType || d.subjectType || "";
            }
          } catch { }
          return "";
        };

        // Parallel evaluation of candidate keys in one single roundtrip
        const results = await Promise.all(candidateKeys.map(k => tryGet(k)));
        foundType = results.find(Boolean) || "";

        // Query course_outcomes and course_bank for Course Outcomes if not yet found
        if (foundCOs.length === 0) {
          const coCandidateKeys = [
            `${deptKey}_${regKey}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}`,
            `${deptKey}_${regKey}_${rawSubCode}_${sanitizeKey(academicYear)}`,
            `${deptKey}_${regKey}_${sanitizeKey(subject)}`,
            `${deptKey}_${regKey}_${rawSubCode}`,
            rawSubCode
          ];
          for (const cKey of coCandidateKeys) {
            if (foundCOs.length > 0) break;
            try {
              const cSnap = await getDoc(doc(db, 'course_outcomes', cKey));
              if (cSnap.exists()) {
                const cCos = extractCOs(cSnap.data());
                if (cCos.length > 0) { foundCOs = cCos; break; }
              }
            } catch { }
          }
        }
        if (foundCOs.length === 0) {
          try {
            const cbSnap = await getDoc(doc(db, 'course_bank', rawSubCode));
            if (cbSnap.exists()) {
              const cbCos = extractCOs(cbSnap.data());
              if (cbCos.length > 0) foundCOs = cbCos;
            }
          } catch { }
        }
        if (foundCOs.length > 0) {
          setSubjectCOs(foundCOs);
        }

        // Fallback 1: field query on code (covers any doc key format in courses)
        if (!foundType) {
          try {
            const qSnap = await getDocs(query(collection(db, 'courses'), where('code', '==', rawSubCode)));
            let best = ""; let bestScore = -1;
            const normProg = (v) => String(v ?? '').replace(/[.#$[\]/ ]/g, '_').toLowerCase();
            const progNorm = normProg(progKey);
            const deptNorm = normProg(deptKey);
            const deptStrictNorm = normProg(strictDept);
            const regNorm = regKey ? normProg(regKey) : "";
            qSnap.forEach(d => {
              const data = d.data();
              const pNorm = normProg(data.programme || data.progKey || "");
              const depNorm = normProg(data.department || data.deptKey || "");
              const rNorm = normProg(data.regulation || "");
              let score = 0;
              if (pNorm === progNorm || (data.programme && formatProgrammeKey(data.programme) === progKey)) score += 10;
              if (depNorm === deptNorm || depNorm === deptStrictNorm) score += 8;
              else if (depNorm === 'overall') score += 4;
              if (regNorm && rNorm === regNorm) score += 6;
              const type = data.type || data.category || data.courseType || data.subjectType || "";
              if (type && score > bestScore) { bestScore = score; best = type; }
              if (type && bestScore === -1 && best === "") best = type;
              if (foundCOs.length === 0) {
                const qCos = extractCOs(data);
                if (qCos.length > 0) { foundCOs = qCos; setSubjectCOs(qCos); }
              }
            });
            if (best) foundType = best;
          } catch { }
        }
        // Fallback 2: syllabus_data (most reliable — same as image's source)
        if (!foundType && regVal) {
          try {
            const sSnap = await getDoc(doc(db, 'syllabus_data', `${progKey}_${deptKey}_${sanitizeKey(regVal)}`));
            const sData = sSnap.exists() ? sSnap.data() : null;
            if (sData?.semesters) {
              for (const semList of Object.values(sData.semesters)) {
                if (Array.isArray(semList)) {
                  const hit = semList.find(s => String(s.code || '').toUpperCase() === rawSubCode.toUpperCase());
                  if (hit) { foundType = hit.category || hit.courseType || hit.type || hit.subjectType || ""; if (foundType) break; }
                }
              }
            }
          } catch { }
        }
        // Fallback 3: scan all syllabus_data for this dept (regulation-agnostic)
        if (!foundType) {
          try {
            const sSnapAll = await getDocs(collection(db, 'syllabus_data'));
            sSnapAll.forEach(d => {
              if (foundType) return;
              const data = d.data();
              if (!data?.semesters) return;
              // only consider docs matching progKey+deptKey loosely
              const idLower = String(d.id || '').toLowerCase();
              if (!idLower.includes(deptKey.toLowerCase().replace(/[_ ]+/g, '').slice(0, 4)) && !idLower.includes('overall')) {
                // skip unrelated depts if map is large — but still scan if dept matches loosely
              }
              for (const semList of Object.values(data.semesters)) {
                if (Array.isArray(semList)) {
                  const hit = semList.find(s => String(s.code || '').toUpperCase() === rawSubCode.toUpperCase());
                  if (hit && (hit.category || hit.courseType || hit.type)) { foundType = hit.category || hit.courseType || hit.type || ""; break; }
                }
              }
            });
          } catch { }
        }
        setSubjectCourseType(foundType);
      } catch (e) { console.error("Error fetching course type:", e); setSubjectCourseType(""); }
    };
    fetchCourseType();
  }, [programme, department, batch, subject, getRegulationForBatch]);

  // Fetch Question Paper
  useEffect(() => {
    const fetchQP = () => {
      if (!department || !academicYear || !subject || !exam || !semester) {
        setQpParts([]);
        setQpMeta({});
        return;
      }

      try {
        const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
        const needAy = norm(academicYear);
        const targetSubCode = parseSubjectCodeKey(subject);
        const stripSetSuffix = (s) => String(s || '').replace(/\s*\(?\s*set\s*[-_:.]?\s*([0-9]+|[a-z])\s*\)?\s*$/i, '').trim();
        const targetExam = norm(stripSetSuffix(exam));
        const targetSem = deriveSemesterNumber(semester);
        const isExamNameMatch = (a, b) => norm(stripSetSuffix(a)) === norm(stripSetSuffix(b));
        const isApproved = (qp) => {
          const st = norm(qp.status || '');
          return st === 'allocated' || st === 'allocated & released' || st === 'approved_by_coe' ||
            st === 'approved_by_hod' || st === 'approved' || st === 'approved_by_exam_cell' || st === 'approved_by_ac';
        };

        const isFirestoreKey = (str) => {
          if (!str) return false;
          const s = String(str).trim();
          return s.startsWith('-') || (/^[a-zA-Z0-9_-]{16,}$/.test(s) && !s.includes(' ') && !s.includes('IA') && !s.includes('CIA') && !s.includes('Exam') && !s.includes('Assignment'));
        };

        const candidates = allQPs.filter(qp => {
          const qpSubCode = parseSubjectCodeKey(qp.subject || qp.course || qp.subject_code || qp.courseCode);
          const qpAy = norm(qp.academic_year || qp.academicYear || '');
          const qpSem = deriveSemesterNumber(qp.semester);
          const qpSection = norm(qp.section || '');
          const needSection = norm(section || '');
          const sectionMatch = !qp.section || !needSection || qpSection === needSection;

          const rawQpName = qp.qpaper_name || qp.qpaperName || qp.id;
          const matchedCfg = ciaConfigs.find(c => c.id === rawQpName || c.id === qp.id || c.examName === rawQpName || c.examName === qp.exam_name);
          const cleanQpName = qp.exam_name || qp.examName || matchedCfg?.examName || (!isFirestoreKey(rawQpName) ? rawQpName : '');
          const qpExam = cleanQpName || qp.qpaper_name || '';

          return qpSubCode.replace(/\s+/g, '') === targetSubCode.replace(/\s+/g, '') &&
            (!qpAy || !needAy || qpAy === needAy || qpAy.includes(needAy) || needAy.includes(qpAy)) &&
            (!qp.batch || isBatchMatch(qp.batch, batch)) &&
            (isExamNameMatch(qpExam, targetExam) || qp.id === exam || qp.qpaper_name === exam || isExamNameMatch(rawQpName, targetExam)) &&
            String(qpSem) === String(targetSem) &&
            sectionMatch;
        });
        const targetRawExam = norm(exam);
        const targetQpId = dashboardQp?.id || dashboardQp?.qpId || '';
        const targetDashComposite = dashboardQp?._compositeKey || dashboardQp?.compositeKey || '';
        const targetDashName = norm(dashboardQp?.qpaper_name || dashboardQp?.qpaperName || dashboardQp?.exam_name || '');

        candidates.sort((a, b) => {
          const rank = (qp) => {
            const qpId = String(qp.id || '');
            // Dashboard handoff: the clicked row's field key lives in qp._id
            // (MarkEntry's allQPs flattening stores it there, not in qp.id).
            const qpKey = String(qp._id || '');
            const qpComposite = String(qp._compositeKey || qp.compositeKey || '');
            if (targetQpId && (qpId === targetQpId || qpKey === targetQpId) &&
              (!targetDashComposite || !qpComposite || qpComposite === targetDashComposite)) return 0;

            const matchedCfg = ciaConfigs.find(c => c.id === qp.qpaper_name || c.id === qp.id);
            const cleanQpName = norm(qp.exam_name || qp.examName || matchedCfg?.examName || qp.qpaper_name || '');
            if (targetRawExam && cleanQpName === targetRawExam) return 1;

            if (targetDashName && cleanQpName === targetDashName) return 2;

            const st = norm(qp.status || '');
            if (st === 'allocated' || st === 'allocated & released') return 3;
            if (st === 'approved_by_coe' || st === 'approved_by_exam_cell') return 4;
            if (st === 'approved_by_hod' || st === 'approved') return 5;
            return 6;
          };
          return rank(a) - rank(b);
        });
        const match = candidates.find(qp => isApproved(qp)) || candidates[0];

        if (match) {
          // Full data already in match (parent doc stores full payload)
          setQpParts(Array.isArray(match.parts) ? match.parts : []);
          setAssignmentConfig(Array.isArray(match.assignment_config) ? match.assignment_config : []);

          setQpMeta({
            qpaper_name: match.qpaper_name,
            semester: match.semester,
            co_weightage: match.co_weightage || {}
          });

          if (match.co_weightage && typeof match.co_weightage === 'object') {
            const qpCos = Object.keys(match.co_weightage)
              .filter(k => /^co\d+/i.test(k))
              .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));
            if (qpCos.length > 0) {
              setSubjectCOs(prev => prev.length > 0 ? prev : qpCos);
            }
          }
        } else {
          setQpParts([]);
          setAssignmentConfig([]);
          setQpMeta({});
        }
      } catch (error) {
        console.error("QP Fetch Error:", error);
      }
    };

    fetchQP();
  }, [department, academicYear, subject, exam, semester, markType, allQPs, batch, section, isBatchMatch]);

  // Fetch Grade Configs when regulation changes
  useEffect(() => {
    if (!programme || !batch) {
      setGradeConfigs([]);
      return;
    }
    const fetchGradeConfig = async () => {
      try {
        const progKey = formatProgrammeKey(programme);
        const regulation = getRegulationForBatch(progKey, batch);

        const parseGradeData = (data) => {
          if (!data || typeof data !== 'object') return null;
          // Handle { value: [...] } format (Curriculum.jsx saves as Object.assign({}, array) → { "0": {...} } then Firestore re-indexes)
          if (data.value && Array.isArray(data.value)) return data.value;
          // Handle { "0": {...}, "1": {...} } format
          if (!Array.isArray(data)) {
            const vals = Object.values(data).filter(v => v && typeof v === 'object' && v.grade);
            if (vals.length > 0) return vals;
          }
          // Handle plain array
          if (Array.isArray(data) && data.length > 0) return data;
          return null;
        };

        // Try with the regulation from batchRegulations mapping
        if (regulation) {
          const docId = sanitizeKeyStrict(regulation);
          console.log('[gradeConfigs] looking up:', docId);
          const snap = await getDoc(doc(db, 'grade_configs', docId));
          if (snap.exists()) {
            const grades = parseGradeData(snap.data());
            if (grades) { setGradeConfigs(grades); return; }
          }
          // Try raw regulation as doc ID (spaces may not be sanitized in Firestore)
          const rawSnap = await getDoc(doc(db, 'grade_configs', regulation));
          if (rawSnap.exists()) {
            const grades = parseGradeData(rawSnap.data());
            if (grades) { setGradeConfigs(grades); return; }
          }
        }

        // Fallback: read ALL grade_configs docs and use the one with most entries
        const allSnap = await getDocs(collection(db, 'grade_configs'));
        let best = [];
        allSnap.forEach(d => {
          const grades = parseGradeData(d.data());
          if (grades && grades.length > best.length) best = grades;
        });
        if (best.length > 0) {
          setGradeConfigs(best);
        }
      } catch (e) {
        console.error('[gradeConfigs] error:', e);
      }
    };
    fetchGradeConfig();
  }, [programme, batch, getRegulationForBatch]);

  // Resolve a marks doc saved under a legacy exam-slot format (QP push-ID instead of
  // the display name, e.g. "..._CS25C08_-OsVReAuCyJ5lRI2-WsS_..."). Matches on _meta
  // so both eras resolve; returns { id, data } of the richest match or null.
  const findMarksDocByMeta = useCallback(async ({ batch, programme, department, subject, exam, academicYear, semester, markType, section, qpName, qpIds }) => {
    try {
      let docs = [];
      const batchYear = yearStartOf(batch);
      const prefixes = [...new Set([
        sanitizeKey(batch),
        batchYear ? `23_batch_${batchYear}` : '',
        batchYear ? `${batchYear}` : '',
        canonicalizeBatch ? sanitizeKey(canonicalizeBatch(batch)) : ''
      ].filter(Boolean))];

      const snaps = await Promise.all(
        prefixes.map(pfx => getDocs(query(
          collection(db, 'marks'),
          where(documentId(), '>=', pfx),
          where(documentId(), '<=', pfx + '\uf8ff'),
          limit(30)
        )).catch(() => ({ forEach: () => { } })))
      );
      const seen = new Set();
      snaps.forEach(s => s.forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); docs.push(d); }
      }));
      if (docs.length === 0) return null;

      const targetProgKey = formatProgrammeKey(programme);
      const targetSubCode = parseSubjectCodeKey(subject);
      const targetSemNum = String(deriveSemesterNumber(semester) || '').trim();
      const targetAyStart = yearStartOf(academicYear);
      const targetBatchStart = yearStartOf(batch);
      // Valid tokens that represent the target exam ONLY
      const validQpPushKeys = (qpIds || []).filter(id => id && isFirestoreKey(id));
      const examTokens = new Set(
        [
          exam,
          sanitizeKey(exam),
          stripSetSuffix(exam),
          sanitizeKey(stripSetSuffix(exam)),
          ...(isFirestoreKey(qpName) ? [qpName] : []),
          ...(isExamNameMatch(qpName, exam) ? [qpName, sanitizeKey(qpName)] : []),
          ...validQpPushKeys
        ]
          .filter(Boolean)
          .map(t => String(t).trim().toLowerCase())
      );

      let best = null;
      let bestCount = -1;
      docs.forEach(d => {
        const data = d.data() || {};
        const m = data._meta || {};
        const qm = data.qpaper_meta || {};
        const docId = String(d.id || '');
        const docIdLower = docId.toLowerCase();

        // Batch gate (fuzzy start-year / isBatchMatch / docId)
        const docBatch = m.batch || qm.batch || data.batch || '';
        const docBatchYear = yearStartOf(docBatch || docId);
        const batchMatches = !batch || !docBatch || isBatchMatch(docBatch, batch) || (docBatchYear && targetBatchStart && docBatchYear === targetBatchStart) || isBatchMatch(docId, batch);
        if (!batchMatches) return;

        // Programme gate
        const docProg = m.programme || qm.programme || data.programme;
        if (docProg && targetProgKey && formatProgrammeKey(docProg) !== targetProgKey) return;

        // Department gate
        const docDept = m.department || qm.department || data.department;
        if (docDept && department && !isDeptMatch(docDept, department)) return;

        // Subject gate
        const metaSub = parseSubjectCodeKey(m.subject || qm.subject || data.subject || docId || '');
        if (metaSub && targetSubCode && metaSub !== targetSubCode) return;

        // Academic year gate
        const docAy = m.academic_year || qm.academic_year || data.academic_year || data.academicYear;
        if (docAy && targetAyStart && yearStartOf(docAy) !== targetAyStart) return;

        // Semester gate
        const metaSemNum = String(deriveSemesterNumber(m.semester || m.semester_label || qm.semester || qm.semester_label || data.semester || '') || '').trim();
        if (metaSemNum && targetSemNum && metaSemNum !== targetSemNum) return;

        // Section gate: flexible match ("Sec-A" vs "A" vs "SecA")
        if (section) {
          const secTrim = String(section).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          const docSec = String(m.section || qm.section || data.section || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (docSec && docSec !== 'all' && docSec !== secTrim && !docSec.includes(secTrim) && !secTrim.includes(docSec)) return;
        }

        // STRICT EXAM GATE — Never allow cross-exam contamination (e.g. IA 1 marks leaking into IA 2)
        const metaExam = String(m.exam || qm.exam || data.exam || '').trim();
        const metaExamName = String(m.exam_name || m.examName || qm.exam_name || data.exam_name || '').trim();
        const metaQpName = String(qm.qpaper_name || m.qpaper_name || '').trim();

        // 1. If metaExamName is an explicit, human-readable exam name, it MUST match the target exam!
        if (metaExamName && !isFirestoreKey(metaExamName)) {
          if (!isExamNameMatch(metaExamName, exam)) return;
        }

        // 2. If metaExam is an explicit, human-readable exam name, it MUST match the target exam!
        if (metaExam && !isFirestoreKey(metaExam)) {
          if (!isExamNameMatch(metaExam, exam)) return;
        }

        // 3. Reject if docId explicitly contains a different configured exam name from Firestore
        const otherExamTokens = getOtherConfiguredExamTokens(exam, ciaConfigs, allQPs, availableExams);
        const hasOtherExamInDocId = otherExamTokens.some(keSan => {
          return docIdLower.includes(`_${keSan}_`) || docIdLower.endsWith(`_${keSan}`);
        });
        if (hasOtherExamInDocId) return;

        // 4. Document must positively match the target exam or one of its authorized QP tokens
        const metaExamLower = metaExam.toLowerCase();
        const metaExamNameLower = metaExamName.toLowerCase();
        const metaQpNameLower = metaQpName.toLowerCase();

        const matchesTargetExam =
          (metaExamName && isExamNameMatch(metaExamName, exam)) ||
          (metaExam && isExamNameMatch(metaExam, exam)) ||
          (metaQpName && isExamNameMatch(metaQpName, exam)) ||
          examTokens.has(metaExamLower) ||
          examTokens.has(metaExamNameLower) ||
          examTokens.has(metaQpNameLower) ||
          docIdLower.includes(norm(stripSetSuffix(exam)));

        if (!matchesTargetExam) return;

        // Richest doc wins (most student entries)
        const count = data.students && typeof data.students === 'object' ? Object.keys(data.students).length : 0;
        if (count > bestCount) {
          bestCount = count;
          best = { id: d.id, data };
        }
      });
      return best;
    } catch (e) {
      console.warn('Legacy marks scan error:', e);
      return null;
    }
  }, [canonicalizeBatch, isBatchMatch, isDeptMatch]);

  // Fetch Students and Saved Marks (High-Performance Parallel Architecture)
  useEffect(() => {
    let isCancelled = false;
    const loadData = async () => {
      if (!programme || !department || !batch || !academicYear || !semester || !subject || !exam) {
        setStudents([]);
        setMarksData({});
        setResolvedMarksDocId(null);
        setLoading(false);
        setMarksLoading(false);
        return;
      }

      setLoading(true);
      setMarksLoading(true);

      try {
        const progKey = formatProgrammeKey(programme);
        const deptKey = sanitizeKey(department);
        const deptKeyStrict = sanitizeKeyStrict(department);
        const deptNoDegree = stripSanitizedDegreePrefix(deptKey);
        const cleanBatch = sanitizeKey(batch);
        const yKey = sanitizeKey(academicYear);
        const semNum = deriveSemesterNumber(semester);
        const rawSubCode = (typeof subject === 'object' ? (subject.code || subject.id) : String(subject).split(' - ')[0]).toUpperCase().trim();
        const targetSubCode = parseSubjectCodeKey(subject);
        const subCodeClean = sanitizeKey(rawSubCode);
        const subSanitized = sanitizeKey(typeof subject === 'object' ? (subject.name || subject.id || '') : subject);

        const effectiveMarkType = markType || (() => {
          const selectedExam = availableExams.find(e => e.value === exam);
          if (selectedExam?.isIndirectAssessment) return 'CO Wise';
          if (selectedExam?.type === 'University') return '';
          return selectedExam?.type || 'Internal';
        })();

        // --- Task 1: Student Roster & Course Enrolments (Parallel) ---
        const fetchRosterTask = async () => {
          const rosterCacheKey = `${cleanBatch}_${progKey}_${deptKey}_${section || ''}_${academicYear || ''}`;
          if (studentRosterCache.has(rosterCacheKey)) {
            const cached = studentRosterCache.get(rosterCacheKey);
            return {
              studentList: [...cached.studentList],
              studentDocId: cached.studentDocId,
              enrolled: cached.enrolled || {}
            };
          }

          const secVariations = [];
          if (section) {
            const rawSec = String(section).trim();
            const cleanSec = sanitizeKey(rawSec);
            secVariations.push(`_${cleanSec}`);
            secVariations.push(`_${cleanSec.replace(/-/g, '_')}`);
            secVariations.push(`_${cleanSec.replace(/_/g, '-')}`);
            const secLetter = rawSec.replace(/[^a-zA-Z0-9]/g, '');
            if (secLetter) {
              secVariations.push(`_${secLetter}`);
              secVariations.push(`_Sec_${secLetter}`);
              secVariations.push(`_Sec-${secLetter}`);
            }
          }
          const allSecVariations = [...new Set([...secVariations, ''])];

          const deptCandidates = Array.from(new Set([
            deptKey,
            deptKeyStrict,
            deptNoDegree,
            department
          ].filter(Boolean)));

          const batchCandidates = [
            cleanBatch,
            batch,
            cleanBatch.replace(/_Batch_\([^)]+\)/i, '_Batch'),
            cleanBatch.replace(/_Batch/i, '')
          ];
          const yearsMatch = String(batch).match(/(\d{4})\s*[-_]\s*(\d{2,4})/);
          if (yearsMatch) {
            const by1 = yearsMatch[1];
            const rawBy2 = yearsMatch[2];
            const by2 = rawBy2.length === 2 ? `20${rawBy2}` : rawBy2;
            const shortBy1 = by1.slice(-2);
            const shortBy2 = by2.slice(-2);
            batchCandidates.push(`${by1}-${by2}`);
            batchCandidates.push(`${by1}_${by2}`);
            batchCandidates.push(`${by1}-${shortBy2}`);
            batchCandidates.push(`${by1}_${shortBy2}`);
            batchCandidates.push(`${shortBy1}_batch_${by1}_${shortBy2}`);
            batchCandidates.push(`${shortBy1}_batch_${by1}_${by2}`);
          }

          const topCandidates = [
            `${cleanBatch}_${progKey}_${deptKey}${section ? `_${sanitizeKey(section)}` : ''}`,
            `${cleanBatch}_${progKey}_${deptKeyStrict}${section ? `_${sanitizeKey(section)}` : ''}`,
            `${cleanBatch}_${progKey}_${deptKey}_${section}`,
            `${cleanBatch}_${progKey}_${deptKeyStrict}_${section}`,
            `${cleanBatch}_${deptKey}${section ? `_${sanitizeKey(section)}` : ''}`,
            `${cleanBatch}_${deptKeyStrict}${section ? `_${sanitizeKey(section)}` : ''}`,
            `${cleanBatch}_${progKey}_${deptKey}`,
            `${cleanBatch}_${progKey}_${deptKeyStrict}`,
            `${cleanBatch}_${deptKey}`,
            `${cleanBatch}_${deptKeyStrict}`
          ];

          const otherCandidates = [];
          for (const b of batchCandidates) {
            for (const d of deptCandidates) {
              for (const s of allSecVariations) {
                otherCandidates.push(`${b}_${progKey}_${d}${s}`);
                otherCandidates.push(`${b}_${d}${s}`);
              }
            }
          }
          const uniqueCandidates = Array.from(new Set([...topCandidates, ...otherCandidates])).slice(0, 30);

          let studentData = null;
          let studentDocId = uniqueCandidates[0] || `${cleanBatch}_${progKey}_${deptKey}`;

          // Fast parallel probe for top 10 candidates (~20ms)
          const primaryProbes = await Promise.allSettled(
            uniqueCandidates.slice(0, 10).map(cid => getDoc(doc(db, 'students', cid)))
          );
          for (let i = 0; i < primaryProbes.length; i++) {
            const res = primaryProbes[i];
            if (res.status === 'fulfilled' && res.value && res.value.exists()) {
              const data = res.value.data();
              if (data && Object.keys(data).filter(k => !k.startsWith('_')).length > 0) {
                studentData = data;
                studentDocId = res.value.id;
                break;
              }
            }
          }

          // If top 10 didn't hit, check the remainder in parallel
          if (!studentData && uniqueCandidates.length > 10) {
            const secondaryProbes = await Promise.allSettled(
              uniqueCandidates.slice(10).map(cid => getDoc(doc(db, 'students', cid)))
            );
            for (let i = 0; i < secondaryProbes.length; i++) {
              const res = secondaryProbes[i];
              if (res.status === 'fulfilled' && res.value && res.value.exists()) {
                const data = res.value.data();
                if (data && Object.keys(data).filter(k => !k.startsWith('_')).length > 0) {
                  studentData = data;
                  studentDocId = res.value.id;
                  break;
                }
              }
            }
          }

          // Fallback scan across students collection only if candidate docs missed
          if (!studentData || Object.keys(studentData).filter(k => !k.startsWith('_')).length === 0) {
            try {
              const studentsSnap = await getDocs(collection(db, 'students'));
              let matchedDoc = null;
              let matchedBaseDoc = null;

              studentsSnap.forEach(d => {
                const data = d.data();
                const meta = data?._meta || {};
                const docDept = meta.department || d.id;
                const docBatch = meta.batch || d.id;

                if (isBatchMatch(docBatch, batch) && isDeptMatch(docDept, department)) {
                  const count = Object.keys(data).filter(k => !k.startsWith('_')).length;
                  if (count > 0) {
                    const docIdLower = d.id.toLowerCase();
                    const secLower = section ? section.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
                    if (secLower && docIdLower.includes(secLower)) {
                      matchedDoc = { data, docId: d.id };
                    } else if (!matchedBaseDoc) {
                      matchedBaseDoc = { data, docId: d.id };
                    }
                  }
                }
              });

              const chosen = matchedDoc || matchedBaseDoc;
              if (chosen) {
                studentData = chosen.data;
                studentDocId = chosen.docId;
              }
            } catch (e) {
              console.warn("Student fallback scan error:", e);
            }
          }

          let studentList = [];
          if (studentData) {
            studentList = Object.entries(studentData)
              .filter(([key]) => !key.startsWith('_'))
              .map(([reg, value]) => ({ reg, name: (value !== null && typeof value === 'object') ? (value.name || '') : String(value || '') }));

            studentList.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));

            // Filter by joining academic year — lateral entry students only show from their joining AY
            const joiningAY = studentData._joiningAY || {};
            if (academicYear && Object.keys(joiningAY).length > 0) {
              studentList = studentList.filter(s => {
                const jAY = joiningAY[s.reg];
                if (!jAY) return true;
                return jAY <= academicYear;
              });
            }
          }

          // Check course enrolments
          const enrolled = {};
          if (subject) {
            let batchYearRange = '';
            if (batch) {
              const mYears = String(batch).match(/(19|20)\d{2}/g);
              if (mYears && mYears.length >= 2) {
                batchYearRange = `${mYears[0]}-${mYears[mYears.length - 1]}`;
              } else {
                const mShort = String(batch).match(/(20\d{2})\s*[-–—]\s*(\d{2,4})/);
                if (mShort) {
                  let yEnd = mShort[2];
                  if (yEnd.length === 2) yEnd = `${mShort[1].slice(0, 2)}${yEnd}`;
                  batchYearRange = `${mShort[1]}-${yEnd}`;
                }
              }
            }

            const deptKeys = Array.from(new Set([deptKey, deptKeyStrict].filter(Boolean)));
            const batchKeys = Array.from(new Set([cleanBatch, batchYearRange ? sanitizeKey(batchYearRange) : ''].filter(Boolean)));
            const subKeys = Array.from(new Set([subCodeClean, subSanitized].filter(Boolean)));
            const secSuffixes = section ? [`_${sanitizeKey(section)}`, `_${section}`, ''] : [''];

            const candidateDocIds = [];
            for (const dK of deptKeys) {
              for (const bK of batchKeys) {
                for (const sK of subKeys) {
                  for (const sSuff of secSuffixes) {
                    const cid = `${progKey}_${dK}_${bK}_${yKey}_${semNum}_${sK}${sSuff}`;
                    if (!candidateDocIds.includes(cid)) candidateDocIds.push(cid);
                  }
                }
              }
            }

            const enrolResults = await Promise.allSettled(
              candidateDocIds.slice(0, 16).map(cid => getDoc(doc(db, 'course_enrolments', cid)))
            );

            enrolResults.forEach(res => {
              if (res.status === 'fulfilled' && res.value && res.value.exists()) {
                const obj = res.value.data() || {};
                Object.entries(obj).forEach(([k, val]) => {
                  if (k.startsWith('_')) return;
                  if (val === true || val === 1 || val === "true" || (typeof val === 'object' && val !== null && val.enrolled !== false)) {
                    enrolled[k] = true;
                  }
                });
              }
            });

            if (Object.keys(enrolled).length > 0) {
              const filtered = studentList.filter(s => {
                const sReg = String(s.reg || s.regNo || s.examNo || '').trim();
                const sNorm = sReg.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                return Object.keys(enrolled).some(eKey => {
                  const eNorm = String(eKey).trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                  return eNorm === sNorm || eKey === sReg;
                });
              });
              if (filtered.length > 0) {
                studentList = filtered;
              }
            }
          }

          // Section index enrichment
          try {
            const sectionIndexRef = doc(db, 'student_section_index', studentDocId);
            const sectionIndexSnap = await getDoc(sectionIndexRef);
            if (sectionIndexSnap.exists()) {
              const sectionIndexData = sectionIndexSnap.data();
              studentList = studentList.map(s => ({
                ...s,
                regNo: sectionIndexData[s.reg]?.regNo || ""
              }));
            }
          } catch (e) { }

          const resolvedRoster = { studentList, studentDocId, enrolled };
          studentRosterCache.set(rosterCacheKey, resolvedRoster);
          return resolvedRoster;
        };

        // --- Task 2: Saved Marks Fetch (Parallel Fast-Break) ---
        const fetchMarksTask = async () => {
          if (!exam || !effectiveMarkType) return { savedMarks: {}, activeMarksId: null };

          const marksKey = [batch, programme, department, subject, exam, academicYear, semester, effectiveMarkType]
            .map(sanitizeKey)
            .join('_') + (section ? `_${sanitizeKey(section)}` : '');

          const resolveSig = [batch, programme, department, subject, exam, academicYear, semester, effectiveMarkType, section].join('|');

          // Check in-memory marks cache
          if (marksDocumentCache.has(resolveSig)) {
            const cached = marksDocumentCache.get(resolveSig);
            return { savedMarks: cached.data || {}, activeMarksId: cached.id };
          }

          let savedMarks = {};
          let activeMarksId = marksKey;

          // Target exact 4 top candidate keys first
          const directCandidates = [
            marksKey,
            [batch, programme, department, targetSubCode, exam, academicYear, semester, effectiveMarkType].map(sanitizeKey).join('_') + (section ? `_${sanitizeKey(section)}` : ''),
            [batch, programme, deptKeyStrict, subject, exam, academicYear, semester, effectiveMarkType].map(sanitizeKey).join('_') + (section ? `_${sanitizeKey(section)}` : ''),
            [batch, programme, deptKeyStrict, targetSubCode, exam, academicYear, semester, effectiveMarkType].map(sanitizeKey).join('_') + (section ? `_${sanitizeKey(section)}` : '')
          ];
          if (section) {
            directCandidates.push(
              [batch, programme, department, subject, exam, academicYear, semester, effectiveMarkType].map(sanitizeKey).join('_'),
              [batch, programme, department, targetSubCode, exam, academicYear, semester, effectiveMarkType].map(sanitizeKey).join('_')
            );
          }

          const directProbes = await Promise.allSettled(
            directCandidates.map(cId => getDoc(doc(db, 'marks', cId)))
          );

          for (const pRes of directProbes) {
            if (pRes.status === 'fulfilled' && pRes.value && pRes.value.exists()) {
              const pData = pRes.value.data() || {};
              const pMeta = pData._meta || {};
              const pExam = pMeta.exam_name || pMeta.examName || pMeta.exam;
              if (!pExam || isFirestoreKey(pExam) || isExamNameMatch(pExam, exam)) {
                if (pData.students && Object.keys(pData.students).length > 0) {
                  savedMarks = pData;
                  activeMarksId = pRes.value.id;
                  marksDocumentCache.set(resolveSig, { id: activeMarksId, data: savedMarks });
                  return { savedMarks, activeMarksId };
                }
              }
            }
          }

          // If direct keys didn't hit, check QP id variations & co_attainment with a strict 1.2s timeout
          const qpIdTokens = (allQPs || [])
            .filter(qp => {
              const c = parseSubjectCodeKey(qp.subject || qp.course || qp.subject_code || qp.courseCode);
              if (!c || !targetSubCode || c !== targetSubCode) return false;
              if (qp.batch && !isBatchMatch(qp.batch, batch)) return false;
              const qpSem = String(deriveSemesterNumber(qp.semester) || '').trim();
              if (qpSem && String(semNum || '').trim() && qpSem !== String(semNum || '').trim()) return false;
              const rawQpName = qp.qpaper_name || qp.qpaperName || qp.id;
              const matchedCfg = (ciaConfigs || []).find(cfg => cfg.id === rawQpName || cfg.id === qp.id || cfg.examName === rawQpName || cfg.examName === qp.exam_name);
              const cleanQpName = qp.exam_name || qp.examName || matchedCfg?.examName || (!isFirestoreKey(rawQpName) ? rawQpName : '');
              const qpExam = cleanQpName || qp.qpaper_name || '';
              return isExamNameMatch(qpExam, exam) || isExamNameMatch(rawQpName, exam) || qp.id === exam;
            })
            .flatMap(qp => [qp.id, qp._id, qp._compositeKey, qp.compositeKey])
            .filter(id => id && isFirestoreKey(id));

          // Fast candidate list
          const candidateMarksKeys = new Set();
          const subVariants = [sanitizeKey(subject), sanitizeKey(targetSubCode)].filter(Boolean);
          const deptVariants = [deptKey, deptKeyStrict].filter(Boolean);
          const examVariants = [sanitizeKey(exam), sanitizeKey(stripSetSuffix(exam)), ...qpIdTokens].filter(Boolean);
          const markTypeVariants = [sanitizeKey(effectiveMarkType), ''];
          const secVariants = section ? [`_${sanitizeKey(section)}`, ''] : [''];

          deptVariants.forEach(dK => {
            subVariants.forEach(sK => {
              examVariants.forEach(eK => {
                markTypeVariants.forEach(mK => {
                  secVariants.forEach(scK => {
                    const parts = [batch, programme, dK, sK, eK, academicYear, semester];
                    if (mK) parts.push(mK);
                    candidateMarksKeys.add(parts.map(sanitizeKey).join('_') + scK);
                  });
                });
              });
            });
          });

          const secondaryList = Array.from(candidateMarksKeys).slice(0, 16);
          const secProbes = await Promise.allSettled(
            secondaryList.map(cId => getDoc(doc(db, 'marks', cId)))
          );

          for (const pRes of secProbes) {
            if (pRes.status === 'fulfilled' && pRes.value && pRes.value.exists()) {
              const pData = pRes.value.data() || {};
              const pMeta = pData._meta || {};
              const pExam = pMeta.exam_name || pMeta.examName || pMeta.exam;
              if (!pExam || isFirestoreKey(pExam) || isExamNameMatch(pExam, exam)) {
                if (pData.students && Object.keys(pData.students).length > 0) {
                  savedMarks = pData;
                  activeMarksId = pRes.value.id;
                  marksDocumentCache.set(resolveSig, { id: activeMarksId, data: savedMarks });
                  return { savedMarks, activeMarksId };
                }
              }
            }
          }

          // Fallback check on co_attainment
          try {
            const baseKeyParts = [batch, programme, department, targetSubCode, academicYear, semester].map(sanitizeKey);
            const coAttainmentDocId = baseKeyParts.join('_') + (section ? `_${sanitizeKey(section)}` : '');
            const examDocId = sanitizeKey(exam);
            const subDocSnap = await getDoc(doc(db, 'co_attainment', coAttainmentDocId, 'exams', examDocId));
            if (subDocSnap.exists() && subDocSnap.data()?.students && Object.keys(subDocSnap.data().students).length > 0) {
              savedMarks = subDocSnap.data();
              activeMarksId = `co_attainment_${subDocSnap.id}`;
              marksDocumentCache.set(resolveSig, { id: activeMarksId, data: savedMarks });
              return { savedMarks, activeMarksId };
            }
          } catch (e) { }

          // Bounded timeout race for meta scan (never stalls > 1000ms)
          const metaScanPromise = findMarksDocByMeta({
            batch, programme, department, subject, exam, academicYear, semester, markType: effectiveMarkType, section,
            qpName: qpMeta?.qpaper_name,
            qpIds: qpIdTokens
          });
          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1000));
          const found = await Promise.race([metaScanPromise, timeoutPromise]);
          if (found && found.data) {
            savedMarks = found.data;
            activeMarksId = found.id;
            marksDocumentCache.set(resolveSig, { id: activeMarksId, data: savedMarks });
          }

          return { savedMarks, activeMarksId };
        };

        // --- Task 3: Exam Attendance Absentees (Parallel) ---
        const fetchAttendanceTask = async () => {
          const absentRegsSet = new Set();
          try {
            const sCodeClean = targetSubCode?.toLowerCase().replace(/[^a-z0-9]/g, "");
            const examClean = exam ? exam.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
            const attDocCandidates = [
              `${sCodeClean}_${examClean}_${deptKey}`,
              `${sCodeClean}_${examClean}_${deptKeyStrict}`,
              `${sCodeClean}_${sanitizeKey(exam)}_${deptKey}`,
              `${sCodeClean}_${examClean}`
            ];

            const attProbes = await Promise.allSettled(
              attDocCandidates.map(cid => getDoc(doc(db, "exam_attendance", cid)))
            );
            attProbes.forEach(p => {
              if (p.status === 'fulfilled' && p.value && p.value.exists()) {
                const attData = p.value.data();
                const attMap = attData.attendanceMap || {};
                Object.entries(attMap).forEach(([rNo, status]) => {
                  if (status === "ABSENT" || status === "Absent") {
                    const normReg = rNo.trim().toUpperCase();
                    absentRegsSet.add(normReg);
                    absentRegsSet.add(rNo.trim());
                    absentRegsSet.add(rNo.trim().toLowerCase());
                    absentRegsSet.add(rNo.replace(/[^0-9]/g, ""));
                  }
                });
              }
            });
          } catch (e) { }
          return absentRegsSet;
        };

        // EXECUTE ALL 3 TASKS IN PARALLEL (~30-50ms Total)
        const [rosterResult, marksResult, absentRegsSet] = await Promise.all([
          fetchRosterTask(),
          fetchMarksTask(),
          fetchAttendanceTask()
        ]);

        if (isCancelled) return;

        const { studentList, enrolled } = rosterResult;
        const { savedMarks, activeMarksId } = marksResult;

        setStudents(studentList);
        setEnrolledRegs(enrolled || {});
        setResolvedMarksDocId(activeMarksId);

        // Derive active COs if present in saved marks
        if (savedMarks?.students) {
          const allSavedKeys = new Set();
          Object.values(savedMarks.students).forEach(st => {
            if (st && typeof st === 'object') {
              Object.keys(st).forEach(k => {
                if (/^co\d+$/i.test(k)) allSavedKeys.add(k.toUpperCase());
              });
            }
          });
          if (allSavedKeys.size > 0) {
            const sortedSavedCos = Array.from(allSavedKeys).sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));
            setSubjectCOs(prev => prev.length > 0 ? prev : sortedSavedCos);
          }
        }

        // Build initialMarks instantly for the student roster (70 students)
        const initialMarks = {};
        studentList.forEach(s => {
          const saved = savedMarks?.students?.[s.reg] || {};
          const coSumLoaded = activeCOs.reduce((sum, k) => sum + Number(saved[k] || 0), 0);

          const rawReg = s.reg || "";
          const altRegNo = s.regNo || "";
          const cleanDigits = rawReg.replace(/[^0-9]/g, "");

          const isAttendanceAbsent =
            absentRegsSet.has(rawReg) ||
            absentRegsSet.has(rawReg.toUpperCase()) ||
            absentRegsSet.has(rawReg.toLowerCase()) ||
            absentRegsSet.has(altRegNo) ||
            absentRegsSet.has(altRegNo.toUpperCase()) ||
            (cleanDigits && absentRegsSet.has(cleanDigits));

          const isAbsentFinal = isAttendanceAbsent || !!saved.absent;

          const coFields = {};
          activeCOs.forEach(co => {
            coFields[co] = saved[co] ?? "";
          });
          Object.keys(saved).forEach(k => {
            if (/^co\d+$/i.test(k) && !(k in coFields)) {
              coFields[k] = saved[k];
            }
          });

          initialMarks[s.reg] = {
            partA: saved.partA || {},
            partB: saved.partB || {},
            partC: saved.partC || {},
            assignment: saved.assignment || {},
            overall: saved.overall || "",
            grade: saved.grade || "",
            gradePoint: saved.gradePoint || "",
            absent: isAbsentFinal,
            absentLocked: isAttendanceAbsent,
            total: isAbsentFinal ? "AB" : (saved.total || coSumLoaded || 0),
            ...coFields
          };
        });

        if (!isCancelled) {
          setMarksData(initialMarks);
        }
      } catch (error) {
        console.error("Data Load Error:", error);
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setMarksLoading(false);
        }
      }
    };

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [programme, department, batch, academicYear, semester, subject, exam, markType, section, isBatchMatch, findMarksDocByMeta]);

  const isAssignmentLike = markType === 'Assignment' || markType === 'Project' || markType === 'Practical';
  const showAbsentColumn = markType !== 'Assignment';

  const calculateTotal = (regno, currentMarks) => {
    const s = currentMarks[regno];
    if (s.absent) return "AB";

    if (markType === 'Overall') {
      return isNaN(Number(s.overall)) ? s.overall : Number(s.overall);
    }

    if (markType === 'CO Wise') {
      const coSum = activeCOs.reduce((a, co) => a + Number(s[co] || 0), 0);
      return coSum;
    }

    if (isAssignmentLike) {
      const assignmentTotal = Object.values(s.assignment || {}).reduce((a, b) => a + Number(b || 0), 0);
      return assignmentTotal;
    }

    const partA = Object.values(s.partA || {}).reduce((a, b) => a + Number(b || 0), 0);
    const partB = Object.values(s.partB || {}).reduce((a, o) => a + (o?.mark ? Number(o.mark) : 0), 0);
    const partC = Object.values(s.partC || {}).reduce((a, o) => a + (o?.mark ? Number(o.mark) : 0), 0);

    const total = partA + partB + partC;
    return total > 100 ? 100 : total;
  };

  const toggleStudentEnrollment = async (reg, checked) => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) {
      showToastMsg('Select programme/department/batch/AY/semester/subject first', 'error');
      return;
    }
    try { // Firestore subcollection path
      const progKey = formatProgrammeKey(programme); // Ensure progKey is sanitized
      const enrollRef = doc(db, 'course_enrolments', progKey, sanitizeKey(department), sanitizeKey(batch), sanitizeKey(academicYear), deriveSemesterNumber(semester), subject, reg);
      await setDoc(enrollRef, { enrolled: checked }, { merge: true }); // Use setDoc for Firestore
      setEnrolledRegs(prev => ({ ...prev, [reg]: !!checked }));
      showToastMsg('Enrollment updated', 'success');
    } catch (err) {
      console.error('Enrollment update failed', err);
      showToastMsg('Failed to update enrollment', 'error');
    }
  };

  const handleAbsentChange = (regno, checked) => {
    setMarksData(prev => {
      if (prev[regno]?.absentLocked && !checked) {
        return prev;
      }
      const newData = {
        ...prev,
        [regno]: { ...prev[regno], absent: checked }
      };
      newData[regno].total = calculateTotal(regno, newData);
      return newData;
    });
  };

  const handlePartAMark = (regno, qNo, val) => {
    setMarksData(prev => {
      const newData = {
        ...prev,
        [regno]: {
          ...prev[regno],
          partA: { ...prev[regno].partA, [`Q${qNo}`]: val }
        }
      };
      newData[regno].total = calculateTotal(regno, newData);
      return newData;
    });
  };

  const handlePartBMark = (regno, qNo, radio, val) => {
    if (!radio && val !== '' && val !== 0) {
      showToastMsg("Please select option A or B first!", "error");
      return;
    }
    setMarksData(prev => {
      const newData = {
        ...prev,
        [regno]: {
          ...prev[regno],
          partB: { ...prev[regno].partB, [`Q${qNo}`]: { radio, mark: val } }
        }
      };
      newData[regno].total = calculateTotal(regno, newData);
      return newData;
    });
  };

  const handlePartCMark = (regno, qNo, radio, val) => {
    if (!radio && val !== '' && val !== 0) {
      showToastMsg("Please select option A or B first!", "error");
      return;
    }
    setMarksData(prev => {
      const newData = {
        ...prev,
        [regno]: {
          ...prev[regno],
          partC: { ...prev[regno].partC, [`Q${qNo}`]: { radio, mark: val } }
        }
      };
      newData[regno].total = calculateTotal(regno, newData);
      return newData;
    });
  };

  const handleAssignmentMark = (regno, qIndex, val) => {
    setMarksData(prev => {
      const newData = {
        ...prev,
        [regno]: {
          ...prev[regno],
          assignment: { ...prev[regno].assignment, [`Q${qIndex + 1}`]: val }
        }
      };
      newData[regno].total = calculateTotal(regno, newData);
      return newData;
    });
  };

  const handleGradeEntry = (regno, gradeVal) => {
    const gradeDef = gradeConfigs.find(g => g.grade.toUpperCase() === gradeVal.toUpperCase());
    const markVal = gradeDef ? gradeDef.mark : "";
    const gpVal = gradeDef ? gradeDef.gradePoint : "";

    setMarksData(prev => {
      const newData = {
        ...prev,
        [regno]: {
          ...prev[regno],
          grade: gradeVal,
          gradePoint: gpVal,
          overall: markVal,
          total: isNaN(Number(markVal)) ? 0 : Number(markVal)
        }
      };
      return newData;
    });
  };

  const moveFocus = (regno, part, qNo) => {
    // 1. Update active cursor state (per student per part)
    if (['A', 'B', 'C', 'CO', 'Assignment'].includes(part)) {
      setActiveCursor(prev => ({
        ...prev,
        [regno]: {
          ...(prev[regno] || {}),
          [part]: qNo,
          lastActivePart: part
        }
      }));
    }

    const id = `input-${part}-${qNo}-${regno}`;

    // Use timeout to allow React to re-render the dynamic input before focusing
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
    }, 10);
  };

  const getCOForQuestion = (partLetter, qNo, radio) => {
    const part = qpParts.find(p => p.part === partLetter);
    if (!part || !part.questions) return null;

    let targetQno = String(qNo);
    if (radio) {
      const isEitherOr = part.questions.some(q => String(q.qno) === `${qNo}(a)`);
      if (isEitherOr) {
        targetQno = `${qNo}(${radio.toLowerCase()})`;
      }
    }

    const q = part.questions.find(q => String(q.qno) === targetQno);
    return q ? q.co : null;
  };

  const handleSave = async () => {
    if (!batch || !programme || !department || !subject || !exam || !academicYear || !semester) return;
    if (loading || marksLoading || saving) return;

    const defaultMarksKey = [batch, programme, department, subject, exam, academicYear, semester, markType]
        .filter(Boolean)
        .map(sanitizeKey)
        .join('_') + (section ? `_${sanitizeKey(section)}` : '');

    let marksDocId = defaultMarksKey;
    if (resolvedMarksDocId) {
      const resolvedSanitized = String(resolvedMarksDocId).toLowerCase();
      const otherExamTokens = getOtherConfiguredExamTokens(exam, ciaConfigs, allQPs, availableExams);

      const hasMismatchedExam = otherExamTokens.some(keSan => {
        return resolvedSanitized.includes(`_${keSan}_`) || resolvedSanitized.endsWith(`_${keSan}`);
      });

      if (!hasMismatchedExam) {
        marksDocId = resolvedMarksDocId;
      }
    }

    const matchedAvail = availableExams.find(e => e.value === exam);
    const meta = {
      programme,
      department,
      batch,
      academic_year: academicYear,
      semester_label: semester,
      subject,
      exam,
      exam_name: matchedAvail?.text || exam,
      mark_type: markType,
      is_university: isUniversityExam,
      isUniversity: isUniversityExam,
      is_indirect: isIndirectAssessment,
      isIndirectAssessment: isIndirectAssessment,
      entry_mode: isUniversityExam ? markType : 'CO Wise',
      qpaper_meta: qpMeta,
      section: section || ""
    };

    const enrichedMarksData = {};

    Object.keys(marksData).forEach(regno => {
      const sData = marksData[regno];
      const coTotals = {};

      if (!sData.absent) {
        if (markType === 'CO Wise') {
          activeCOs.forEach(co => {
            coTotals[co] = Number(sData[co] || 0);
          });
        } else if (markType === 'Overall' && isUniversityExam) {
          activeCOs.forEach(co => {
            coTotals[co] = Number(sData.overall || 0);
          });
        } else if (isAssignmentLike) {
          Object.entries(sData.assignment || {}).forEach(([qKey, mark]) => {
            const qIndex = parseInt(qKey.replace('Q', '')) - 1;
            if (mark === '' || mark === undefined || mark === null) return;
            const qNum = Number(mark);
            if (isNaN(qNum) || qNum <= 0) return;

            const qMappings = assignmentConfig[qIndex]?.mappings || [];
            const validMappings = qMappings.filter(m => {
              const c = (m.co || '').trim().toUpperCase();
              return c && /^CO\d+/i.test(c);
            });
            if (validMappings.length === 0) return;

            // Calculate proportional ratio split per CO mapping
            const mapWeights = validMappings.map(m => parseInt(m?.marks, 10) || 0);
            const totalWeight = mapWeights.reduce((a, b) => a + b, 0);

            validMappings.forEach((m, idx) => {
              const coKey = (m.co || '').trim().toUpperCase();
              const weight = mapWeights[idx];
              // Proportional ratio split: if weights are set, split by weight / totalWeight; else equal split
              const ratio = totalWeight > 0 ? (weight / totalWeight) : (1 / validMappings.length);
              const splitMark = qNum * ratio;
              coTotals[coKey] = (coTotals[coKey] || 0) + splitMark;
            });
          });
          // Round accumulated CO marks cleanly
          Object.keys(coTotals).forEach(co => {
            coTotals[co] = Math.round(coTotals[co]);
          });
        } else {
          // Part A
          Object.entries(sData.partA || {}).forEach(([qKey, mark]) => {
            const qNo = qKey.replace('Q', '');
            const co = getCOForQuestion('A', qNo);
            if (co && mark !== '') {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              if (coKeys.length > 0) {
                const markVal = Number(mark || 0);
                const split = markVal / coKeys.length;
                coKeys.forEach(coKey => {
                  coTotals[coKey] = (coTotals[coKey] || 0) + split;
                });
              }
            }
          });

          // Part B
          Object.entries(sData.partB || {}).forEach(([qKey, data]) => {
            const qNo = qKey.replace('Q', '');
            const co = getCOForQuestion('B', qNo, data.radio);
            if (co && data.mark !== '' && data.mark !== undefined) {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              if (coKeys.length > 0) {
                const markVal = Number(data.mark || 0);
                const split = markVal / coKeys.length;
                coKeys.forEach(coKey => {
                  coTotals[coKey] = (coTotals[coKey] || 0) + split;
                });
              }
            }
          });

          // Part C
          Object.entries(sData.partC || {}).forEach(([qKey, data]) => {
            const qNo = qKey.replace('Q', '');
            const co = getCOForQuestion('C', qNo, data.radio);
            if (co && data.mark !== '' && data.mark !== undefined) {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              if (coKeys.length > 0) {
                const markVal = Number(data.mark || 0);
                const split = markVal / coKeys.length;
                coKeys.forEach(coKey => {
                  coTotals[coKey] = (coTotals[coKey] || 0) + split;
                });
              }
            }
          });

          // Round accumulated CO marks cleanly
          Object.keys(coTotals).forEach(co => {
            coTotals[co] = Math.round(coTotals[co]);
          });
        }
      }

      enrichedMarksData[regno] = {
        ...sData,
        ...coTotals
      };
    });

    const payload = {
      _meta: meta,
      students: enrichedMarksData,
      saved_at: new Date().toISOString()
    };

    const hasValidEntries = Object.values(marksData).some(s =>
      s.absent ||
      (s.total > 0) ||
      (s.overall && s.overall !== "") ||
      Object.keys(s).some(k => /^CO\d+/i.test(k) && s[k] > 0) ||
      (s.assignment && Object.values(s.assignment).some(m => m !== ""))
    );

    if (!hasValidEntries) {
      showToastMsg("No valid marks entered to save.", "error");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'marks', marksDocId), payload); // Use setDoc for Firestore

      const resolveSig = [batch, programme, department, subject, exam, academicYear, semester, markType, section].join('|');
      marksDocumentCache.set(resolveSig, { id: marksDocId, data: payload });

      // Calculate and update CO attainment for this specific exam only
      const coAttainmentDocId = [batch, programme, department, subject, academicYear, semester].map(sanitizeKey).join('_') + (section ? `_${sanitizeKey(section)}` : '');
      const examDocId = sanitizeKey(exam || (meta.qpaper_meta?.qpaper_name || 'exam'));

      // Determine CO max marks for this exam — always derive from actual loaded QP data
      let coMaxMarks = {};
      if (isUniversityExam || isIndirectAssessment) {
        const maxVal = isIndirectAssessment ? 3 : 100;
        activeCOs.forEach(co => { coMaxMarks[co] = maxVal; });
      } else if (isAssignmentLike) {
        // Assignment/Project/Practical: CO max marks = allocated marks per CO from mappings
        const derived = {};
        (assignmentConfig || []).forEach(q => {
          (q.mappings || []).forEach(m => {
            const co = String(m?.co || '').trim().toUpperCase();
            if (!co || !/^CO\d+/i.test(co)) return;
            const mapMarks = parseInt(m?.marks, 10) || 0;
            if (mapMarks > 0) {
              derived[co] = (derived[co] || 0) + mapMarks;
            }
          });
        });
        coMaxMarks = derived;
      } else {
        // Regular internal exams: prefer the QP's explicit CO weightage (summary table).
        // The per-question `co` field in parts may be incomplete/empty for some questions,
        // which silently zeroes out max marks for those COs. co_weightage covers every CO.
        const derived = {};
        qpParts.forEach(part => {
          const marks = Number(part.marks_per_question || 0);
          if (marks <= 0) return;
          const groups = {};
          (part.questions || []).forEach(q => {
            const base = String(q.qno).replace(/\(?[ab]\)?$/i, '').trim();
            if (!groups[base]) groups[base] = new Set();
            if (q.co) groups[base].add(String(q.co).trim().toUpperCase());
          });
          Object.values(groups).forEach(coSet => {
            coSet.forEach(co => {
              derived[co] = (derived[co] || 0) + marks;
            });
          });
        });

        const weightage = qpMeta?.co_weightage || {};
        const weightageKeys = Object.keys(weightage).filter(k => Number(weightage[k]) > 0);
        const maxWeight = Math.max(0, ...weightageKeys.map(k => Number(weightage[k]) || 0));

        if (maxWeight > 1) {
          weightageKeys.forEach(co => {
            coMaxMarks[String(co).trim().toUpperCase()] = Number(weightage[co]) || 0;
          });
        } else if (Object.keys(derived).length > 0) {
          coMaxMarks = derived;
        } else if (weightageKeys.length > 0) {
          weightageKeys.forEach(co => {
            coMaxMarks[String(co).trim().toUpperCase()] = Number(weightage[co]) || 0;
          });
        }
      }

      activeCOs.forEach(co => {
        const cKey = co.toUpperCase();
        if (!(cKey in coMaxMarks) || coMaxMarks[cKey] <= 1) {
          const observed = Math.max(0, ...Object.values(enrichedMarksData).map(s => Number(s[cKey] || 0)));
          if (observed > 1) {
            if (observed <= 20.5) coMaxMarks[cKey] = 20;
            else if (observed <= 25) coMaxMarks[cKey] = 25;
            else if (observed <= 50) coMaxMarks[cKey] = 50;
            else if (observed <= 100) coMaxMarks[cKey] = 100;
            else coMaxMarks[cKey] = Math.ceil(observed);
          } else {
            coMaxMarks[cKey] = coMaxMarks[cKey] || 0;
          }
        }
      });

      // Build per-student CO totals from the enrichedMarksData we just saved with strict max mark capping
      const studentsCo = {};
      Object.entries(enrichedMarksData).forEach(([regno, sData]) => {
        const studentName = (students.find(st => st.reg === regno)?.name) || '';
        const entry = { name: studentName };
        if (sData.grade !== undefined && sData.grade !== null && sData.grade !== '') entry.grade = sData.grade;
        if (sData.gradePoint !== undefined && sData.gradePoint !== null && sData.gradePoint !== '') entry.gradePoint = sData.gradePoint;
        if (sData.gpa !== undefined && sData.gpa !== null && sData.gpa !== '') entry.gpa = sData.gpa;
        if (sData.overall !== undefined && sData.overall !== null && sData.overall !== '') entry.overall = sData.overall;
        if (sData.total !== undefined && sData.total !== null && sData.total !== '') entry.total = sData.total;
        if (sData.absent) entry.absent = true;
        Object.keys(sData).forEach(k => {
          if (/^CO\d+/i.test(k) && typeof sData[k] === 'number') {
            const cUpper = k.trim().toUpperCase();
            let markVal = sData[k];
            // Strict upper bound guard: student's CO mark cannot exceed coMaxMarks for this exam
            if (coMaxMarks[cUpper] && coMaxMarks[cUpper] > 0 && markVal > coMaxMarks[cUpper]) {
              markVal = coMaxMarks[cUpper];
            }
            entry[cUpper] = markVal;
          }
        });
        studentsCo[regno] = entry;
      });

      // Write per-exam attainment under subjectKey / examKey
      const attainmentExamPayload = {
        _meta: {
          batch, programme, department, subject, academicYear, semester,
          exam: exam, exam_name: matchedAvail?.text || exam, updated_at: new Date().toISOString(),
          is_university: isUniversityExam,
          isUniversity: isUniversityExam,
          is_indirect: isIndirectAssessment,
          isIndirectAssessment: isIndirectAssessment,
          entry_mode: isUniversityExam ? markType : 'CO Wise',
          mark_type: markType,
          section: section || ""
        },
        co_max_marks: coMaxMarks,
        students: studentsCo
      };

      await setDoc(doc(db, 'co_attainment', coAttainmentDocId, 'exams', examDocId), attainmentExamPayload);

      // If saved with a specific section, also write to the base course-level document
      if (section) {
        const coAttainmentDocIdNoSec = [batch, programme, department, subject, academicYear, semester].map(sanitizeKey).join('_');
        await setDoc(doc(db, 'co_attainment', coAttainmentDocIdNoSec, 'exams', examDocId), attainmentExamPayload).catch(() => { });
      }

      showToastMsg("Marks Saved and CO Attainment Updated!", "success");
    } catch (error) {
      console.error("Save Error:", error);
      showToastMsg("Failed to save marks.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const partA = qpParts.find(p => p.part === 'A');
    const partB = qpParts.find(p => p.part === 'B');
    const partC = qpParts.find(p => p.part === 'C');

    const isAssignment = isAssignmentLike;
    const isOverall = markType === 'Overall';
    const isCOWise = markType === 'CO Wise';

    let mainHeader = ["Register Number", "Student Name", "Absent"];
    let subHeader = ["", "", ""];

    if (isOverall) {
      mainHeader.push("Grade", "Grade Point", "Mark");
      subHeader.push("", "", "");
    } else if (isCOWise) {
      activeCOs.forEach(co => {
        mainHeader.push("CO Marks");
        subHeader.push(co);
      });
    } else if (isAssignment) {
      mainHeader = ["Register Number", "Student Name", "Absent"];
      subHeader = ["", "", ""];
      assignmentConfig.forEach((q, idx) => {
        mainHeader.push("Assignment");
        subHeader.push(`Q${idx + 1}`);
      });
      mainHeader.push("Total");
      subHeader.push("Total");
    } else {
      if (partA) {
        for (let i = 1; i <= (partA.num_questions || 10); i++) {
          mainHeader.push("Part A");
          subHeader.push(`Q${i}`);
        }
      }
      if (partB) {
        const start = 11;
        const count = partB.num_questions || 5;
        for (let q = start; q < start + count; q++) {
          mainHeader.push("Part B", "Part B");
          subHeader.push(`${q}A`, `${q}B`);
        }
      }
      if (partC) {
        const qNo = partC.questions?.[0]?.qno?.replace(/[^0-9]/g, '') || '16';
        mainHeader.push("Part C", "Part C");
        subHeader.push(`${qNo}A`, `${qNo}B`);
      }
      mainHeader.push("Total");
      subHeader.push("Total");
    }

    const ws_data = [mainHeader, subHeader];

    students.forEach(s => {
      const data = marksData[s.reg] || {};
      const isAbsent = data.absent;
      const row = [s.regNo || s.reg, s.name, isAbsent ? "AB" : ""];

      if (isOverall) {
        row.push(isAbsent ? "AB" : (data.grade || ""));
        row.push(isAbsent ? "AB" : (data.gradePoint || ""));
        row.push(isAbsent ? "AB" : (data.overall || ""));
      } else if (isCOWise) {
        activeCOs.forEach(co => {
          row.push(isAbsent ? "AB" : (data[co] ?? ""));
        });
      } else if (isAssignment) {
        assignmentConfig.forEach((q, idx) => {
          row.push(isAbsent ? "AB" : (data.assignment?.[`Q${idx + 1}`] ?? ""));
        });
        row.push(isAbsent ? "AB" : (data.total || ""));
      } else {
        if (partA) {
          for (let i = 1; i <= (partA.num_questions || 10); i++) {
            row.push(isAbsent ? "AB" : (data.partA?.[`Q${i}`] ?? ""));
          }
        }
        if (partB) {
          const start = 11;
          const count = partB.num_questions || 5;
          for (let q = start; q < start + count; q++) {
            const qData = data.partB?.[`Q${q}`];
            if (isAbsent) {
              row.push("AB", "AB");
            } else {
              row.push(qData?.radio === 'A' ? qData.mark : "", qData?.radio === 'B' ? qData.mark : "");
            }
          }
        }
        if (partC) {
          const qNo = partC.questions?.[0]?.qno?.replace(/[^0-9]/g, '') || '16';
          const qData = data.partC?.[`Q${qNo}`];
          if (isAbsent) {
            row.push("AB", "AB");
          } else {
            row.push(qData?.radio === 'A' ? qData.mark : "", qData?.radio === 'B' ? qData.mark : "");
          }
        }
        row.push(isAbsent ? "AB" : (data.total || ""));
      }
      ws_data.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Mark Entry");
    XLSX.writeFile(wb, `Mark_Entry_${subject}_${exam}.xlsx`);

    showToastMsg("Downloaded successfully!");
  };

  // Keyboard Navigation Logic
  const handleKeyDown = (e, regno, part, qNo) => {
    const sData = marksData[regno];
    if (sData?.absent) return;

    const studentIndex = students.findIndex(st => st.reg === regno);
    const nextStudent = students[studentIndex + 1];

    const getNextTarget = () => {
      let target = null;
      if (part === 'A') {
        const idx = qnosA.indexOf(qNo);
        if (idx !== -1 && idx < qnosA.length - 1) target = { regno, part: 'A', qNo: qnosA[idx + 1] };
        else if (qnosB.length > 0) target = { regno, part: 'B', qNo: qnosB[0] };
        else if (qnosC.length > 0) target = { regno, part: 'C', qNo: qnosC[0] };
      } else if (part === 'B') {
        const idx = qnosB.indexOf(qNo);
        if (idx !== -1 && idx < qnosB.length - 1) target = { regno, part: 'B', qNo: qnosB[idx + 1] };
        else if (qnosC.length > 0) target = { regno, part: 'C', qNo: qnosC[0] };
      } else if (part === 'C') {
        const idx = qnosC.indexOf(qNo);
        if (idx !== -1 && idx < qnosC.length - 1) target = { regno, part: 'C', qNo: qnosC[idx + 1] };
      } else if (part === 'CO') {
        const cos = activeCOs;
        const idx = cos.indexOf(qNo);
        if (idx !== -1 && idx < cos.length - 1) target = { regno, part: 'CO', qNo: cos[idx + 1] };
      } else if (part === 'Assignment') {
        const idx = qnosAssignment.indexOf(qNo);
        if (idx !== -1 && idx < qnosAssignment.length - 1) target = { regno, part: 'Assignment', qNo: qnosAssignment[idx + 1] };
      }
      return target;
    };

    const getPrevTarget = () => {
      let target = null;
      if (part === 'A') {
        const idx = qnosA.indexOf(qNo);
        if (idx > 0) target = { regno, part: 'A', qNo: qnosA[idx - 1] };
      } else if (part === 'B') {
        const idx = qnosB.indexOf(qNo);
        if (idx > 0) target = { regno, part: 'B', qNo: qnosB[idx - 1] };
        else if (qnosA.length > 0) target = { regno, part: 'A', qNo: qnosA[qnosA.length - 1] };
      } else if (part === 'C') {
        const idx = qnosC.indexOf(qNo);
        if (idx > 0) target = { regno, part: 'C', qNo: qnosC[idx - 1] };
        else if (qnosB.length > 0) target = { regno, part: 'B', qNo: qnosB[qnosB.length - 1] };
        else if (qnosA.length > 0) target = { regno, part: 'A', qNo: qnosA[qnosA.length - 1] };
      } else if (part === 'CO') {
        const cos = activeCOs;
        const idx = cos.indexOf(qNo);
        if (idx > 0) target = { regno, part: 'CO', qNo: cos[idx - 1] };
      } else if (part === 'Assignment') {
        const idx = qnosAssignment.indexOf(qNo);
        if (idx > 0) target = { regno, part: 'Assignment', qNo: qnosAssignment[idx - 1] };
      }
      return target;
    };

    if (e.key === "Enter") {
      e.preventDefault();
      const nextTarget = getNextTarget();
      if (nextTarget) {
        moveFocus(nextTarget.regno, nextTarget.part, nextTarget.qNo);
      } else if (nextStudent) {
        const firstPart = markType === 'CO Wise' ? 'CO' :
          isAssignmentLike ? 'Assignment' :
            qnosA.length > 0 ? 'A' :
              qnosB.length > 0 ? 'B' :
                qnosC.length > 0 ? 'C' : null;

        const firstQ = firstPart === 'CO' ? (activeCOs[0] || 'CO1') :
          firstPart === 'Assignment' ? 1 :
            firstPart === 'A' ? qnosA[0] :
              firstPart === 'B' ? qnosB[0] :
                firstPart === 'C' ? qnosC[0] : null;

        if (firstPart && firstQ) moveFocus(nextStudent.reg, firstPart, firstQ);
        else moveFocus(nextStudent.reg, part, qNo);
      } else {
        showToastMsg("Last student reached.", "info");
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      const nextTarget = getNextTarget();
      if (nextTarget) {
        e.preventDefault();
        moveFocus(nextTarget.regno, nextTarget.part, nextTarget.qNo);
      }
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      const prevTarget = getPrevTarget();
      if (prevTarget) {
        e.preventDefault();
        moveFocus(prevTarget.regno, prevTarget.part, prevTarget.qNo);
      }
      return;
    }

    // Part-Specific Shortcuts (A/B for Radio)
    if (part === 'B' || part === 'C') {
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (part === 'B') handlePartBMark(regno, qNo, 'A', sData.partB?.[`Q${qNo}`]?.mark ?? '');
        else handlePartCMark(regno, qNo, 'A', sData.partC?.[`Q${qNo}`]?.mark ?? '');
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        if (part === 'B') handlePartBMark(regno, qNo, 'B', sData.partB?.[`Q${qNo}`]?.mark ?? '');
        else handlePartCMark(regno, qNo, 'B', sData.partC?.[`Q${qNo}`]?.mark ?? '');
      }
    }
  };

  const partA = qpParts.find(p => p.part === 'A');
  const partB = qpParts.find(p => p.part === 'B');
  const partC = qpParts.find(p => p.part === 'C');

  // Dynamically get question numbers for each part
  const getPartQuestions = (partObj) => {
    if (!partObj?.questions) return [];
    const qnos = partObj.questions.map(q => {
      const n = parseInt(String(q.qno).replace(/[^0-9]/g, ''));
      return isNaN(n) ? q.qno : n;
    });
    return [...new Set(qnos)].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b), undefined, { numeric: true });
    });
  };

  const qnosA = useMemo(() => getPartQuestions(partA), [partA]);
  const qnosB = useMemo(() => getPartQuestions(partB), [partB]);
  const qnosC = useMemo(() => getPartQuestions(partC), [partC]);
  const qnosAssignment = useMemo(() => assignmentConfig.map((_, idx) => idx + 1), [assignmentConfig]);

  const availableSections = useMemo(() => {
    if (!batch || !department || !programme) return [];
    const progKey = formatProgrammeKey(programme);
    const normLower = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetDept = normLower(department);
    const targetBatch = batchStartYear(batch);
    // 1. Exact config doc
    const docId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}`;
    let cfg = sectionConfigs[docId];
    // 2. Fuzzy match across all section configs (dept alias + batch start-year)
    if (!cfg || !cfg.numSections) {
      for (const [key, val] of Object.entries(sectionConfigs || {})) {
        if (!val?.numSections) continue;
        if (targetBatch !== null && !String(key).includes(String(targetBatch))) continue;
        if (targetDept && !normLower(key).includes(targetDept) && !targetDept.includes(normLower(key))) continue;
        cfg = val;
        break;
      }
    }
    // 3. Assignment sections for this batch/sem
    const assignSecs = new Set();
    facultyAssignedGroups
      .filter(g => isBatchMatch(g.batch, batch))
      .forEach(g => { if (g.section) String(g.section).split(',').forEach(s => { const t = s.trim(); if (/^sec/i.test(t)) assignSecs.add(t); }); });
    if (cfg?.numSections) {
      const count = cfg.numSections;
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const fromCfg = Array.from({ length: count }, (_, i) => `Sec-${letters[i]}`);
      assignSecs.forEach(s => { if (!fromCfg.includes(s)) fromCfg.push(s); });
      return fromCfg;
    }
    if (assignSecs.size > 0) return Array.from(assignSecs).sort();
    // 4. Standard fallback so mark entry is never blocked
    return ['Sec-A', 'Sec-B'];
  }, [batch, department, programme, sectionConfigs, facultyAssignedGroups, isBatchMatch]);

  // Dashboard handoff: clicking "Mark Entry" on any QP card (My Question Papers list
  // or Common QP cards) navigates here with { state: { qp } }. Pre-select ALL dropdowns.
  const dashboardQp = location.state?.qp;
  useEffect(() => {
    if (!dashboardQp) return;
    const qp = dashboardQp;
    const stripSetSuffix = (s) => String(s || '').replace(/\s*\(?\s*set\s*[-_:.]?\s*([0-9]+|[a-z])\s*\)?\s*$/i, '').trim();
    const cleanCode = (s) => parseSubjectCodeKey(s);
    // Programme: resolve from qp, fall back to current/user value
    const qpProg = qp.programme || qp.program || qp.progKey || '';
    const progKey = formatProgrammeKey(qpProg);
    let progDisplay = programme;
    if (progKey) {
      const matchProg = Object.keys(PROGRAMME_DEPARTMENTS).find(p => formatProgrammeKey(p) === progKey);
      if (matchProg) progDisplay = matchProg;
    }
    if (progDisplay && progDisplay !== programme) setProgramme(progDisplay);
    // Department: qp dept may be the setter's dept (e.g. CSE) for Common papers.
    // Prefer the user's own assigned department when it handles this subject.
    const qpDept = qp.department || qp.dept || '';
    const qpCode = cleanCode(qp.subject || qp.course || qp.subject_code || qp.courseCode);
    const myDeptForCode = facultyAssignedGroups.find(g =>
      (g.codes || []).map(c => cleanCode(c)).includes(qpCode))?.department;
    const deptNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const progDepts = PROGRAMME_DEPARTMENTS[formatProgrammeKey(progDisplay || programme)] || [];
    const resolveDept = (raw) => {
      if (!raw) return '';
      if (progDepts.includes(raw)) return raw;
      const hit = progDepts.find(d => deptNorm(d) === deptNorm(raw) || deptNorm(d).includes(deptNorm(raw)) || deptNorm(raw).includes(deptNorm(d)));
      return hit || raw;
    };
    const deptToUse = resolveDept(myDeptForCode || userDepartment || qpDept || department);
    if (deptToUse && deptToUse !== department) {
      setDepartment(deptToUse);
    }
    // Batch (canonical), Academic Year, Semester
    const canonBatch = canonicalizeBatch(qp.batch || batch);
    if (canonBatch && canonBatch !== batch) setBatch(canonBatch);
    const qpAy = qp.academic_year || qp.academicYear || '';
    if (qpAy && qpAy !== academicYear) setAcademicYear(qpAy);
    const semNum = deriveSemesterNumber(qp.semester);
    if (semNum) {
      const n = parseInt(semNum, 10);
      const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      const semLabel = `${n}${suffix} Semester`;
      if (semLabel !== semester) setSemester(semLabel);
    }
    // Section defaults to qp section or Sec-A
    const qpSec = qp.section || qp.sec || (Array.isArray(qp.sections) ? qp.sections[0] : '') || qp.allocatedTo?.section || qp.meta?.section || qp._meta?.section || '';
    if (qpSec && qpSec !== section) setSection(qpSec);
    // Subject + Exam are set after their option lists populate (separate effects below)
    // Re-runs when assignments/user profile arrive so dept resolution improves
    // (all setters are idempotent — identical values bail out, no loops).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardQp, facultyAssignedGroups, userDepartment]);

  // After availableSections load or dashboardQp arrives, auto-select matching section
  useEffect(() => {
    if (!dashboardQp || availableSections.length === 0) return;
    const rawSec = dashboardQp.section || dashboardQp.sec || (Array.isArray(dashboardQp.sections) ? dashboardQp.sections[0] : '') || dashboardQp.allocatedTo?.section || dashboardQp.meta?.section || dashboardQp._meta?.section || '';
    const normSec = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let secToSet = '';

    if (rawSec) {
      const targetNorm = normSec(rawSec);
      secToSet = availableSections.find(s => {
        const n = normSec(s);
        return n === targetNorm || n.endsWith(targetNorm) || targetNorm.endsWith(n) || (targetNorm === 'a' && n === 'seca');
      }) || '';
    }

    if (!secToSet && availableSections.length === 1) {
      secToSet = availableSections[0];
    } else if (!secToSet && availableSections.length > 0 && rawSec) {
      secToSet = availableSections[0];
    }

    if (secToSet && secToSet !== section) {
      setSection(secToSet);
    }
  }, [dashboardQp, availableSections]);

  // After subjects load, auto-select the dashboard QP's subject code
  useEffect(() => {
    if (!dashboardQp || subjects.length === 0) return;
    const cleanCode = (s) => parseSubjectCodeKey(s);
    const qpCode = cleanCode(dashboardQp.subject || dashboardQp.course || dashboardQp.subject_code || dashboardQp.courseCode || '');
    if (qpCode && qpCode !== subject) {
      const noSpace = (c) => String(c).replace(/\s+/g, '');
      const hit = subjects.find(s => noSpace(cleanCode(s.value)) === noSpace(qpCode) || noSpace(cleanCode(s.text)) === noSpace(qpCode));
      if (hit) setSubject(hit.value);
      else if ([...new Set(subjects.map(s => cleanCode(s.value)))].map(noSpace).includes(noSpace(qpCode))) {
        const exactHit = subjects.find(s => noSpace(cleanCode(s.value)) === noSpace(qpCode));
        setSubject(exactHit ? exactHit.value : qpCode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardQp, subjects]);

  // After exams load, auto-select the dashboard QP's exam.
  // Priority: (1) QP document/field id match — distinguishes "IA 1 (Set 1)"
  // vs "IA 1 (Set 2)" rows for the same subject; (2) exact full name;
  // (3) base name with the (Set N) suffix stripped on BOTH sides (the QP doc
  // may store "IA 1" while the dropdown holds "IA 1 (Set 1)", or vice versa).
  useEffect(() => {
    if (!dashboardQp || availableExams.length === 0) return;
    const lower = (s) => String(s || '').toLowerCase().trim();
    const stripSetSuffix = (s) => String(s || '').replace(/\s*\(?\s*set\s*[-_:.]?\s*([0-9]+|[a-z])\s*\)?\s*$/i, '').trim();
    const isDashKey = (s) => {
      const t = String(s || '').trim();
      return !!t && (t.startsWith('-') || (/^[a-zA-Z0-9_-]{16,}$/.test(t) && !t.includes(' ') && !t.includes('IA') && !t.includes('CIA') && !t.includes('Exam') && !t.includes('Assignment')));
    };
    // The CIA exam the paper was created for (exam_name first) — never a raw key.
    const rawExamName = [dashboardQp.exam_name, dashboardQp.examName, dashboardQp.exam, dashboardQp.qpaper_name, dashboardQp.qpaperName]
      .map(s => String(s || '').trim())
      .find(s => s && !isDashKey(s)) || '';
    const baseExamName = stripSetSuffix(rawExamName);

    // (1) QP id match — most reliable, selects the exact Set row clicked
    const dashId = String(dashboardQp.id || dashboardQp.qpId || dashboardQp._id || '').trim();
    if (dashId) {
      const idHit = availableExams.find(e =>
        (e.qpId && String(e.qpId).trim() === dashId) ||
        (e._id && String(e._id).trim() === dashId)
      );
      if (idHit) {
        if (exam !== idHit.value) setExam(idHit.value);
        return;
      }
    }

    if (rawExamName) {
      const exactHit = availableExams.find(e =>
        lower(e.value) === rawExamName.toLowerCase() ||
        lower(e.text) === rawExamName.toLowerCase()
      );
      if (exactHit) {
        if (exam !== exactHit.value) setExam(exactHit.value);
        return;
      }
    }

    if (baseExamName) {
      const baseLower = baseExamName.toLowerCase();
      const baseHit = availableExams.find(e =>
        lower(stripSetSuffix(e.value)) === baseLower ||
        lower(stripSetSuffix(e.text)) === baseLower
      );
      if (baseHit && exam !== baseHit.value) {
        setExam(baseHit.value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardQp, availableExams]);

  return (
    <Layout title="Mark Entry">
      <div className="p-6 md:p-10 max-w-[98%] mx-auto">
        {/* Toast Popup */}
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[1000] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        {/* Filters Card */}
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-8 border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Row 1 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Programme Name</label>
              <div className="relative">
                <select
                  value={programme}
                  onChange={(e) => { setProgramme(e.target.value); setDepartment(""); setSection(""); }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Select Program</option>
                  {filteredProgrammes.map(prog => (
                    <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
              <div className="relative">
                <select
                  disabled={!programme}
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); setSection(""); }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Department</option>
                  {filteredDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
              <div className="relative">
                <select
                  disabled={!department}
                  value={batch}
                  onChange={(e) => { setBatch(e.target.value); setSection(""); }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Batch</option>
                  {availableBatches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
              <div className="relative">
                <select
                  disabled={!batch}
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Academic Year</option>
                  {academicYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            {/* Row 2 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Semester Type</label>
              <div className="relative">
                <select
                  disabled={!academicYear}
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Semester</option>
                  {semesters.map(sem => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Section</label>
              <div className="relative">
                <select
                  disabled={!department || !batch || availableSections.length === 0}
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">{availableSections.length === 0 && department && batch ? "No sections configured" : "Select Section"}</option>
                  {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                Subject
                {subjectCourseType && (
                  <span className="px-2 py-0.5 bg-blue-50 text-[#120c7a] text-[9px] font-black rounded-full border border-blue-100 tracking-widest">
                    {String(subjectCourseType).toUpperCase()}
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  value={subject}
                  onChange={(e) => {
                    const chosen = e.target.value;
                    setSubject(chosen);
                    const matchedSub = subjects.find(s => s.value === chosen);
                    if (matchedSub?.type) {
                      setSubjectCourseType(matchedSub.type);
                    }
                  }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => (
                    <option key={s.value} value={s.value}>
                      {s.text}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                Exam
                {subject && availableExams.length > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-full border border-emerald-100 tracking-widest">
                    {availableExams.length} AVAILABLE
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  disabled={!subject}
                  value={exam}
                  onChange={(e) => setExam(e.target.value)}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Exam</option>
                  {availableExams.map(e => (
                    <option key={e.value} value={e.value}>{e.text}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            {isUniversityExam && exam && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mark Type</label>
                <div className="relative">
                  <select
                    value={markType}
                    onChange={(e) => setMarkType(e.target.value)}
                    className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  >
                    <option value="">Select Mark Type</option>
                    <option value="CO Wise">CO Wise</option>
                    <option value="Overall">Overall</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
              </div>
            )}


          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100">
          <div className="bg-[#120c7a] px-6 py-2.5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h4 className="text-white font-bold text-sm tracking-wide">Mark Entry Table</h4>
              {(loading || marksLoading) && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/20 text-amber-200 border border-amber-400/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                  Fetching saved marks...
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {isIndirectAssessment && (
                <div className="flex items-center gap-3">
                  <div className="hidden lg:flex flex-col text-[10px] text-white/80 leading-tight text-right mr-2 border-r border-white/20 pr-3">
                    <span className="font-bold opacity-60 text-[8px] uppercase tracking-widest">CSV Format:</span>
                    <span className="italic font-medium">Reg No, Name, CO1, CO2, CO3...</span>
                  </div>
                  <button
                    onClick={handleDownloadTemplate}
                    disabled={loading || marksLoading || saving}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
                  >
                    <Download size={14} /> Download Template
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || marksLoading || saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-blue-900/20"
                  >
                    <Upload size={14} /> Upload CO Marks (CSV)
                  </button>
                </div>
              )}
              {isUniversityExam && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadEseTemplate}
                    disabled={loading || marksLoading || saving}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/20"
                  >
                    <Download size={14} /> Download Template
                  </button>
                  <input
                    type="file"
                    ref={eseFileInputRef}
                    onChange={handleEseFileUpload}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <button
                    onClick={() => eseFileInputRef.current?.click()}
                    disabled={loading || marksLoading || saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-900/20"
                  >
                    <Upload size={14} /> Upload Grades
                  </button>
                </div>
              )}
              <button
                onClick={handleDownloadExcel}
                disabled={loading || marksLoading || saving}
                className="bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed text-[#120c7a] px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Download size={14} /> Download as Excel
              </button>
              <button
                onClick={handleSave}
                disabled={loading || marksLoading || saving}
                className="bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-green-900/20"
              >
                <Save size={14} /> {saving ? "Saving..." : (loading || marksLoading) ? "Loading..." : "Save to Dashboard"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f8fafc]">
                  <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-left w-48">Register Number</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-left">Student Name</th>
                  {showAbsentColumn && <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">Absent</th>}

                  {markType === 'Overall' ? (
                    <>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-32">Grade</th>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-32">Grade Point</th>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-32">Mark</th>
                    </>
                  ) : markType === 'CO Wise' ? (
                    <>
                      {activeCOs.length === 0 ? (
                        <th className="px-6 py-3 text-[11px] font-bold text-amber-600 uppercase tracking-wider border-b border-slate-200 text-center">No COs Found in Course Bank</th>
                      ) : (
                        activeCOs.map(co => (
                          <th key={co} className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">{co}</th>
                        ))
                      )}
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">Total</th>
                    </>
                  ) : isAssignmentLike ? (
                    <>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-40">Assignment</th>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">Total</th>
                    </>
                  ) : (
                    <>
                      {partA && <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-40">Part A</th>}
                      {partB && <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-56">Part B</th>}
                      {partC && <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-56">Part C</th>}
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(loading || marksLoading) ? (
                  <tr>
                    <td colSpan={50} className="p-16 sm:p-24 text-center bg-slate-50/50">
                      <div className="flex flex-col items-center justify-center gap-3.5 max-w-md mx-auto">
                        <div className="relative">
                          <div className="w-12 h-12 border-4 border-indigo-200 border-t-[#120c7a] rounded-full animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-ping"></span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-base font-bold text-slate-800">
                            Loading assessment & student marks...
                          </p>
                          <p className="text-xs text-slate-500 font-medium">
                            Fetching saved assessment data from database. Please wait...
                          </p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200/60 rounded-full text-[11px] font-semibold text-blue-700 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          Synchronizing with Firestore
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : !exam ? (
                  <tr>
                    <td colSpan={50} className="p-20 text-center text-slate-400 italic font-medium">
                      Select an exam to view student list.
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={50} className="p-20 text-center text-slate-400 italic font-medium">
                      No students found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => {
                    const data = marksData[s.reg] || { partA: {}, partB: {}, partC: {}, absent: false, total: 0 };
                    const isAbsent = data.absent;

                    return (
                      <tr key={s.reg} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${isAbsent ? 'bg-slate-50/50' : ''}`}>
                        <td className={`px-6 py-3 text-sm font-mono text-slate-600 tabular-nums border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                          {s.reg}
                          {s.regNo && <span className="ml-2 text-[10px] text-emerald-600 font-bold">({s.regNo})</span>}
                        </td>
                        <td className={`px-6 py-3 text-sm font-medium text-slate-800 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>{s.name}</td>
                        {showAbsentColumn && (
                          <td className="px-6 py-3 text-center border-r border-slate-50">
                            <div className="flex flex-col items-center justify-center gap-1">
                              <input
                                type="checkbox"
                                checked={isAbsent}
                                disabled={data.absentLocked}
                                onChange={(e) => handleAbsentChange(s.reg, e.target.checked)}
                                className="absent-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mx-auto block cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              {data.absentLocked && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded shadow-2xs uppercase tracking-tighter">
                                  <Lock size={10} className="shrink-0" />
                                  Absent in Exam
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {markType === 'Overall' ? (
                          <>
                            <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                              <div className="flex justify-center">
                                <select
                                  disabled={isAbsent}
                                  value={data.grade ?? ""}
                                  onChange={(e) => handleGradeEntry(s.reg, e.target.value)}
                                  className="w-32 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center font-medium transition-all"
                                >
                                  <option value="">Grade</option>
                                  {gradeConfigs.map(g => (
                                    <option key={g.grade} value={g.grade}>{g.grade}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                              <div className="flex justify-center">
                                <input
                                  type="text"
                                  readOnly
                                  value={data.gradePoint ?? ""}
                                  className="w-32 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-center font-medium"
                                  placeholder="GP"
                                />
                              </div>
                            </td>
                            <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                              <div className="flex justify-center">
                                <input
                                  type="text"
                                  readOnly
                                  value={data.overall ?? ""}
                                  className="w-32 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-center font-medium"
                                  placeholder="Mark"
                                />
                              </div>
                            </td>
                          </>
                        ) : markType === 'CO Wise' ? (
                          <>
                            {activeCOs.length === 0 ? (
                              <td className="px-6 py-3 text-center text-xs text-slate-400 italic border-r border-slate-50">
                                Configure COs in Course Bank
                              </td>
                            ) : (
                              activeCOs.map(co => (
                                <td key={co} className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                                  <input
                                    id={`input-CO-${co}-${s.reg}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isAbsent}
                                    value={data[co] ?? ""}
                                    onKeyDown={(e) => handleKeyDown(e, s.reg, 'CO', co)}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val !== '' && isNaN(val)) return;
                                      let parsed = val === '' ? '' : Number(val);
                                      if (parsed !== '' && parsed < 0) parsed = 0;
                                      setMarksData(prev => {
                                        const studentObj = prev[s.reg] || {};
                                        const updatedStudent = {
                                          ...studentObj,
                                          [co]: parsed
                                        };
                                        const totalSum = activeCOs.reduce((acc, cKey) => {
                                          const cVal = Number(updatedStudent[cKey]);
                                          return acc + (isNaN(cVal) ? 0 : cVal);
                                        }, 0);
                                        updatedStudent.total = totalSum;
                                        return {
                                          ...prev,
                                          [s.reg]: updatedStudent
                                        };
                                      });
                                    }}
                                    className="w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50 mx-auto block"
                                  />
                                </td>
                              ))
                            )}
                            <td className={`total-marks px-6 py-3 text-center font-black tabular-nums text-xl ${isAbsent ? 'text-red-600' : 'text-blue-600'}`}>
                              {isAbsent ? 'AB' : (() => {
                                const coSum = activeCOs.reduce((sum, key) => {
                                  const val = Number(data[key]);
                                  return sum + (isNaN(val) ? 0 : val);
                                }, 0);
                                return coSum;
                              })()}
                            </td>
                          </>
                        ) : isAssignmentLike ? (
                          <>
                            <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                              <div className="flex items-center justify-center gap-3">
                                {(() => {
                                  const cursor = activeCursor[s.reg];
                                  const q = cursor?.Assignment || qnosAssignment[0] || 1;
                                  const qIdx = q - 1;
                                  const qConfig = assignmentConfig[qIdx];
                                  return (
                                    <>
                                      <span className="w-6 text-right font-bold text-slate-500 text-sm">{q}</span>
                                      <input
                                        id={`input-Assignment-${q}-${s.reg}`}
                                        type="text"
                                        inputMode="decimal"
                                        disabled={isAbsent}
                                        value={data.assignment?.[`Q${q}`] ?? ""}
                                        onFocus={() => {
                                          setActiveCursor(prev => ({
                                            ...prev,
                                            [s.reg]: { ...(prev[s.reg] || {}), Assignment: q, lastActivePart: 'Assignment' }
                                          }));
                                        }}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val !== '' && isNaN(val)) return;
                                          const max = qConfig?.marks || 100;
                                          let parsed = val === '' ? '' : Number(val);
                                          if (parsed !== '' && parsed > max) {
                                            showToastMsg(`Mark limit exceeded! Maximum is ${max}.`, 'error');
                                            parsed = '';
                                          }
                                          if (parsed !== '' && parsed < 0) parsed = 0;
                                          handleAssignmentMark(s.reg, qIdx, parsed);
                                        }}
                                        onKeyDown={(e) => handleKeyDown(e, s.reg, 'Assignment', q)}
                                        className="w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                      />
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className={`total-marks px-6 py-3 text-center font-black tabular-nums text-xl ${isAbsent ? 'text-red-600' : 'text-blue-600'}`}>
                              {isAbsent ? 'AB' : data.total}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* Part A */}
                            {partA && (
                              <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                                <div className="part-a-container flex items-center justify-center gap-3">
                                  {(() => {
                                    const cursor = activeCursor[s.reg];
                                    const q = cursor?.A || qnosA[0] || 1;
                                    return (
                                      <>
                                        <span className="question-number-a w-6 text-right font-bold text-slate-500 text-sm">{q}</span>
                                        <input
                                          id={`input-A-${q}-${s.reg}`}
                                          type="text"
                                          inputMode="decimal"
                                          disabled={isAbsent}
                                          value={data.partA[`Q${q}`] ?? ""}
                                          onFocus={() => {
                                            setActiveCursor(prev => ({
                                              ...prev,
                                              [s.reg]: { ...(prev[s.reg] || {}), A: q, lastActivePart: 'A' }
                                            }));
                                          }}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val !== '' && isNaN(val)) return;
                                            const max = partA.marks_per_question || 2;
                                            let parsed = val === '' ? '' : Number(val);
                                            if (parsed !== '' && parsed > max) {
                                              showToastMsg(`Mark limit exceeded! Maximum is ${max}.`, 'error');
                                              parsed = '';
                                            }
                                            if (parsed !== '' && parsed < 0) parsed = 0;
                                            handlePartAMark(s.reg, q, parsed);
                                          }}
                                          onKeyDown={(e) => handleKeyDown(e, s.reg, 'A', q)}
                                          className="part-a w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                        />
                                      </>
                                    );
                                  })()}
                                </div>
                              </td>
                            )}

                            {/* Part B */}
                            {partB && (
                              <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                                <div className="part-b-container flex items-center justify-center gap-3">
                                  {(() => {
                                    const cursor = activeCursor[s.reg];
                                    const q = cursor?.B || qnosB[0] || 11;
                                    const radio = data.partB[`Q${q}`]?.radio || '';
                                    return (
                                      <>
                                        <span className="question-number-b w-6 text-right font-bold text-slate-500 text-sm">{q}</span>
                                        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                          <input
                                            type="radio"
                                            disabled={isAbsent}
                                            name={`radio-b-${s.reg}`}
                                            checked={radio === 'A'}
                                            onChange={() => handlePartBMark(s.reg, q, 'A', data.partB[`Q${q}`]?.mark ?? '')}
                                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                          />
                                          <label className="text-[10px] font-bold text-slate-600">A</label>
                                          <input
                                            type="radio"
                                            disabled={isAbsent}
                                            name={`radio-b-${s.reg}`}
                                            checked={radio === 'B'}
                                            onChange={() => handlePartBMark(s.reg, q, 'B', data.partB[`Q${q}`]?.mark ?? '')}
                                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                          />
                                          <label className="text-[10px] font-bold text-slate-600">B</label>
                                        </div>
                                        <input
                                          id={`input-B-${q}-${s.reg}`}
                                          type="text"
                                          inputMode="decimal"
                                          disabled={isAbsent}
                                          value={data.partB[`Q${q}`]?.mark ?? ""}
                                          onFocus={() => {
                                            setActiveCursor(prev => ({
                                              ...prev,
                                              [s.reg]: { ...(prev[s.reg] || {}), B: q, lastActivePart: 'B' }
                                            }));
                                          }}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val !== '' && isNaN(val)) return;
                                            const max = partB.marks_per_question || 16;
                                            let parsed = val === '' ? '' : Number(val);
                                            if (parsed !== '' && parsed > max) {
                                              showToastMsg(`Mark limit exceeded! Maximum is ${max}.`, 'error');
                                              parsed = '';
                                            }
                                            if (parsed !== '' && parsed < 0) parsed = 0;
                                            handlePartBMark(s.reg, q, radio, parsed);
                                          }}
                                          onKeyDown={(e) => handleKeyDown(e, s.reg, 'B', q)}
                                          className="part-b w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                        />
                                      </>
                                    );
                                  })()}
                                </div>
                              </td>
                            )}

                            {/* Part C */}
                            {partC && (
                              <td className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                                <div className="part-c-container flex items-center justify-center gap-3">
                                  {(() => {
                                    const cursor = activeCursor[s.reg];
                                    const q = cursor?.C || qnosC[0] || 16;
                                    const radio = data.partC[`Q${q}`]?.radio || '';
                                    return (
                                      <>
                                        <span className="question-number-c w-6 text-right font-bold text-slate-500 text-sm">{q}</span>
                                        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                          <input
                                            type="radio"
                                            disabled={isAbsent}
                                            name={`radio-c-${s.reg}`}
                                            checked={radio === 'A'}
                                            onChange={() => handlePartCMark(s.reg, q, 'A', data.partC[`Q${q}`]?.mark ?? '')}
                                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                          />
                                          <label className="text-[10px] font-bold text-slate-600">A</label>
                                          <input
                                            type="radio"
                                            disabled={isAbsent}
                                            name={`radio-c-${s.reg}`}
                                            checked={radio === 'B'}
                                            onChange={() => handlePartCMark(s.reg, q, 'B', data.partC[`Q${q}`]?.mark ?? '')}
                                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                          />
                                          <label className="text-[10px] font-bold text-slate-600">B</label>
                                        </div>
                                        <input
                                          id={`input-C-${q}-${s.reg}`}
                                          type="text"
                                          inputMode="decimal"
                                          disabled={isAbsent}
                                          value={data.partC[`Q${q}`]?.mark ?? ""}
                                          onFocus={() => {
                                            setActiveCursor(prev => ({
                                              ...prev,
                                              [s.reg]: { ...(prev[s.reg] || {}), C: q, lastActivePart: 'C' }
                                            }));
                                          }}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val !== '' && isNaN(val)) return;
                                            const max = partC.marks_per_question || 15;
                                            let parsed = val === '' ? '' : Number(val);
                                            if (parsed !== '' && parsed > max) {
                                              showToastMsg(`Mark limit exceeded! Maximum is ${max}.`, 'error');
                                              parsed = '';
                                            }
                                            if (parsed !== '' && parsed < 0) parsed = 0;
                                            handlePartCMark(s.reg, q, radio, parsed);
                                          }}
                                          onKeyDown={(e) => handleKeyDown(e, s.reg, 'C', q)}
                                          className="part-c w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                        />
                                      </>
                                    );
                                  })()}
                                </div>
                              </td>
                            )}

                            <td className={`total-marks px-6 py-3 text-center font-black tabular-nums text-xl ${isAbsent ? 'text-red-600' : 'text-blue-600'}`}>
                              {isAbsent ? 'AB' : data.total}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="mt-6 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
          <div className="flex items-center gap-3 text-zinc-500">
            <Keyboard size={18} className="text-[#120c7a]" />
            <p className="text-sm">
              <strong className="text-zinc-700">Keyboard Shortcuts:</strong>
              <span className="mx-2 px-2 py-0.5 bg-zinc-100 rounded text-xs font-bold uppercase">Enter</span> Next Question |
              <span className="mx-2 px-2 py-0.5 bg-zinc-100 rounded text-xs font-bold uppercase">E</span> Previous Question |
              <span className="mx-2 px-2 py-0.5 bg-zinc-100 rounded text-xs font-bold uppercase">A / B</span> Select Option (Part B/C) |
              <span className="mx-2 px-2 py-0.5 bg-zinc-100 rounded text-xs font-bold uppercase">Arrow Keys</span> Navigate
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}