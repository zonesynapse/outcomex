import { useEffect, useMemo, useState, useCallback, Fragment, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, getDocs, addDoc, updateDoc, onSnapshot, setDoc, deleteField, query, where } from "firebase/firestore";
import { serverTimestamp } from "firebase/firestore";
import {
  Eye, Loader2, ClipboardList, User, X, FileText, CheckCircle2, Edit2,
  Clock, BookOpen, TrendingUp, Search, Filter, School, ChevronRight,
  Sparkles, BarChart3, ArrowUpRight, Zap, Bell, AlertCircle, Calendar,
  Users, GraduationCap, CalendarCheck2, AlertTriangle, RefreshCw, Award, Check,
  Download, FileSpreadsheet
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Layout from "../components/Layout";
import DepartmentFeeDueModal from "../components/DepartmentFeeDueModal";
import { auth, db } from "../firebase";
import { fetchAllCourseNamesMap, getCourseName } from "../utils/courseUtils";
import { getQuestionPaperHTML } from '../utils/questionPaperUtils';
import { useRegulations } from "../hooks/useRegulations";
import { sanitizeKey, formatProgrammeKey, formatDepartmentDisplay, formatBatchDisplay, getAttendanceRecords, parseSubjectField, formatQPSetDisplay, getAllCandidateAttendanceDocIds, parseStudentAttendanceVal, extractPureDate, isDeptMatch } from "../lib/utils";
import { typesetMath } from "../utils/mathJaxUtils";

function bsKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]/]/g, '_');
}

// Module-level attendance document cache for sub-second dashboard rendering
const dashboardAttDocCache = new Map(); // docId -> { exists: boolean, records: object, ts: number }

async function getCachedAttendanceDoc(dbInstance, docId) {
  if (!docId) return { exists: false, records: {}, ts: Date.now() };
  const cached = dashboardAttDocCache.get(docId);
  if (cached && (Date.now() - cached.ts < 60000)) {
    return cached;
  }
  try {
    const snap = await getDoc(doc(dbInstance, "attendance", docId));
    const exists = snap.exists();
    const records = exists ? (getAttendanceRecords(snap.data()) || {}) : {};
    const entry = { exists, records, ts: Date.now() };
    dashboardAttDocCache.set(docId, entry);
    return entry;
  } catch {
    return { exists: false, records: {}, ts: Date.now() };
  }
}

const formatDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getBase64ImageFromUrl = async (imageUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};

const createdAtMillis = (val) => {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null) {
    if (typeof val.toMillis === "function") return val.toMillis();
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    if (val._seconds) return val._seconds * 1000;
  }
  const t = new Date(val).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// isDeptMatch is imported dynamically from ../lib/utils (Firestore-backed registry)

const subjectStatPct = (st) => {
  const t = st?.total || 0;
  const od = st?.od || 0;
  const a = st?.attended || 0;
  const active = t - od;
  return active > 0 ? ((a / active) * 100).toFixed(1) : "0.0";
};

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

// IA Consolidation helpers
const deriveIAReportSemesterNumber = (semStr) => {
  if (!semStr) return null;
  const match = String(semStr).match(/\d+/);
  return match ? parseInt(match[0]) : null;
};

const parseIAReportSubjectCode = (val) => {
  if (!val) return '';
  if (typeof val === 'object') val = val.code || val.CODE || val.subjectCode || val.courseCode || '';
  let str = String(val).trim();
  if (!str || str.startsWith('{') || str.startsWith('[') || str.includes('OBJECT')) return '';
  if (str.includes(' - ')) str = str.split(' - ')[0].trim();
  return str.split(/\s+/)[0].trim().toUpperCase();
};

const extractIAReportMarksMeta = (d) => {
  if (!d) return {};
  const data = typeof d.data === 'function' ? d.data() : (d || {});
  const m = data._meta || {};
  const qm = data.qpaper_meta || {};
  return {
    programme: data.programme || m.programme || qm.programme || '',
    department: data.department || m.department || qm.department || '',
    batch: data.batch || m.batch || qm.batch || '',
    academicYear: data.academic_year || m.academic_year || qm.academic_year || data.academicYear || '',
    semesterLabel: data.semester_label || qm.semester_label || m.semester_label || data.semester || m.semester || qm.semester || '',
    section: data.section || qm.section || m.section || '',
    subject: data.subject || qm.subject || m.subject || '',
    exam: data.exam || m.exam || qm.exam || '',
    examName: data.exam_name || m.exam_name || qm.exam_name || '',
    students: data.students || {}
  };
};

const extractIAReportStudentTotal = (s) => {
  if (s == null) return { total: 0, absent: false, hasRecord: false };
  if (typeof s === 'number') return { total: s, absent: false, hasRecord: true };
  if (typeof s === 'string') {
    const t = s.trim();
    if (t.toUpperCase() === 'A' || t.toLowerCase() === 'absent') return { total: 0, absent: true, hasRecord: true };
    if (t === '') return { total: 0, absent: false, hasRecord: false };
    const num = Number(t);
    return { total: isNaN(num) ? 0 : num, absent: false, hasRecord: true };
  }
  const isAbsent = Boolean(s.absent === true || s.absent === 'true' || s.isAbsent === true || s.status === 'absent' || String(s.total || '').toUpperCase() === 'A' || String(s.mark || '').toUpperCase() === 'A' || String(s.score || '').toUpperCase() === 'A');

  let total = 0;
  let hasExplicitValue = false;

  if (s.total !== undefined && s.total !== null && s.total !== '' && String(s.total).toUpperCase() !== 'A') {
    total = Number(s.total) || 0;
    hasExplicitValue = true;
  } else if (s.overall !== undefined && s.overall !== null && s.overall !== '') {
    total = Number(s.overall) || 0;
    hasExplicitValue = true;
  } else if (s.mark !== undefined && s.mark !== null && s.mark !== '') {
    total = Number(s.mark) || 0;
    hasExplicitValue = true;
  } else if (s.marks !== undefined && s.marks !== null && s.marks !== '') {
    total = Number(s.marks) || 0;
    hasExplicitValue = true;
  } else if (s.score !== undefined && s.score !== null && s.score !== '') {
    total = Number(s.score) || 0;
    hasExplicitValue = true;
  }

  if (!hasExplicitValue && total <= 0 && !isAbsent) {
    const coKeys = Object.keys(s).filter(k => /^CO\d+/i.test(k));
    if (coKeys.length > 0) {
      total = coKeys.reduce((acc, k) => acc + (Number(s[k]) || 0), 0);
      hasExplicitValue = true;
    }
  }

  if (!hasExplicitValue && total <= 0 && !isAbsent) {
    ['partA', 'partB', 'partC'].forEach(partKey => {
      if (s[partKey] && typeof s[partKey] === 'object') {
        Object.values(s[partKey]).forEach(item => {
          if (typeof item === 'number' && !isNaN(item)) { total += item; hasExplicitValue = true; }
          else if (typeof item === 'string' && item.trim() !== '' && !isNaN(Number(item))) { total += Number(item); hasExplicitValue = true; }
          else if (item && typeof item === 'object') {
            const mv = item.mark ?? item.marks ?? item.score ?? item.value;
            if (typeof mv === 'number' && !isNaN(mv)) { total += mv; hasExplicitValue = true; }
            else if (typeof mv === 'string' && mv.trim() !== '' && !isNaN(Number(mv))) { total += Number(mv); hasExplicitValue = true; }
          }
        });
      }
    });
  }

  if (!hasExplicitValue && total <= 0 && !isAbsent && s.assignment && typeof s.assignment === 'object') {
    Object.values(s.assignment).forEach(mark => {
      const num = Number(mark);
      if (!isNaN(num)) { total += num; hasExplicitValue = true; }
    });
  }

  return { total, absent: isAbsent, hasRecord: true };
};

const lookupStudentScoreInMap = (scoreMap, stInfo, fallbackKey) => {
  if (!scoreMap) return null;
  const candidateKeys = Array.from(new Set([
    stInfo.reg,
    stInfo.admNo,
    stInfo.admissionNo,
    stInfo.rollNo,
    stInfo.uid,
    fallbackKey
  ].filter(Boolean).map(k => String(k).trim().toUpperCase())));

  for (const ck of candidateKeys) {
    if (scoreMap.has(ck)) {
      return scoreMap.get(ck);
    }
  }

  if (scoreMap.size > 0) {
    const scoreKeys = Array.from(scoreMap.keys());
    for (const ck of candidateKeys) {
      const matchedKey = scoreKeys.find(sk => sk === ck || sk.endsWith(ck) || ck.endsWith(sk));
      if (matchedKey) {
        return scoreMap.get(matchedKey);
      }
    }
  }
  return null;
};

const iaReportYearStartOf = (s) => String(s || '').match(/(19|20)\d{2}/)?.[0] || '';

const iaReportMatchMeta = (docMeta, { programme, department, batch, academicYear, semester, subject, section }) => {
  const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (programme && docMeta.programme && norm(docMeta.programme) !== norm(programme)) return false;
  if (department && docMeta.department && norm(docMeta.department) !== norm(department)) return false;
  if (batch && docMeta.batch) {
    const y1 = iaReportYearStartOf(docMeta.batch), y2 = iaReportYearStartOf(batch);
    if (y1 && y2) { if (y1 !== y2) return false; }
    else if (norm(docMeta.batch) !== norm(batch)) return false;
  }
  if (academicYear && docMeta.academicYear) {
    const y1 = iaReportYearStartOf(docMeta.academicYear), y2 = iaReportYearStartOf(academicYear);
    if (y1 && y2) { if (y1 !== y2) return false; }
    else if (norm(docMeta.academicYear) !== norm(academicYear)) return false;
  }
  if (semester && docMeta.semesterLabel) {
    const n1 = deriveIAReportSemesterNumber(docMeta.semesterLabel), n2 = deriveIAReportSemesterNumber(semester);
    if (n1 && n2) { if (Number(n1) !== Number(n2)) return false; }
    else if (norm(docMeta.semesterLabel) !== norm(semester)) return false;
  }
  if (section && docMeta.section && docMeta.section !== 'all' && norm(docMeta.section) !== norm(section)) return false;
  if (subject && docMeta.subject) {
    const selCode = parseIAReportSubjectCode(subject);
    const docCode = parseIAReportSubjectCode(docMeta.subject);
    if (selCode && docCode && selCode !== docCode) return false;
  }
  return true;
};

const resolveExamMaxMark = (ciaConfigs, targetExamName, targetAY, docMeta, courseWeightageData = {}) => {
  if (!targetExamName) return 100;
  const normExamName = String(targetExamName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetAyYear = iaReportYearStartOf(targetAY);

  // Helper to extract exam mark from a category's exam_marks map
  const getMarkFromExamMarksMap = (examMarksMap) => {
    if (!examMarksMap || typeof examMarksMap !== 'object') return null;
    for (const [eKey, mVal] of Object.entries(examMarksMap)) {
      if (mVal !== undefined && mVal !== null && mVal !== '' && Number(mVal) > 0) {
        const eKeyClean = String(eKey).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (eKeyClean === normExamName) {
          return Number(mVal);
        }

        const ciaObj = ciaConfigs?.[eKey] || ciaConfigs?.[String(eKey).trim()];
        if (ciaObj) {
          const ciaNameClean = String(ciaObj.examName || ciaObj.exam_name || ciaObj.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (ciaNameClean === normExamName) {
            return Number(mVal);
          }
        }

        const ciaEntries = Object.entries(ciaConfigs || {});
        const foundEntry = ciaEntries.find(([cId, cVal]) => {
          if (cId === eKey || String(cId).trim() === String(eKey).trim()) return true;
          const cName = String(cVal?.examName || cVal?.exam_name || cVal?.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          return cName && cName === eKeyClean;
        });

        if (foundEntry) {
          const ciaNameClean = String(foundEntry[1]?.examName || foundEntry[1]?.exam_name || foundEntry[1]?.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (ciaNameClean === normExamName) {
            return Number(mVal);
          }
        }
      }
    }
    return null;
  };

  // Helper to search a course_type_weightage doc object
  const searchDocForExamMark = (docVal) => {
    if (!docVal || typeof docVal !== 'object') return null;
    for (const [ctKey, ctVal] of Object.entries(docVal)) {
      if (!ctVal || typeof ctVal !== 'object' || ctKey.startsWith('_')) continue;

      const catConfig = ctVal._category_config;
      if (catConfig && typeof catConfig === 'object') {
        for (const catVal of Object.values(catConfig)) {
          const m = getMarkFromExamMarksMap(catVal?.exam_marks);
          if (m) return m;
        }
      }

      if (ctVal.exam_marks) {
        const m = getMarkFromExamMarksMap(ctVal.exam_marks);
        if (m) return m;
      }

      for (const [k, v] of Object.entries(ctVal)) {
        if (!k.startsWith('_') && v && typeof v === 'object' && v.exam_marks) {
          const m = getMarkFromExamMarksMap(v.exam_marks);
          if (m) return m;
        }
      }
    }
    return null;
  };

  // 1. Scan course_type_weightage (Curriculum Course Categories & Weightage per AY as configured in Image 2)
  if (courseWeightageData && Object.keys(courseWeightageData).length > 0) {
    for (const [docId, docVal] of Object.entries(courseWeightageData)) {
      const docIdClean = String(docId).toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetAyClean = String(targetAY || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetAyStart = targetAyYear ? String(targetAyYear).toLowerCase() : '';

      const matchesAy = targetAY && ((targetAyClean && docIdClean.includes(targetAyClean)) || (targetAyStart && docIdClean.includes(targetAyStart)));
      if (matchesAy) {
        const m = searchDocForExamMark(docVal);
        if (m) return m;
      }
    }

    for (const [, docVal] of Object.entries(courseWeightageData)) {
      const m = searchDocForExamMark(docVal);
      if (m) return m;
    }
  }

  // 2. Check docMeta if max_marks / maxMarks / totalMarks is explicitly recorded on the marks doc
  const docMax = Number(
    docMeta?.max_marks ||
    docMeta?.maxMarks ||
    docMeta?.max_mark ||
    docMeta?.totalMarks ||
    docMeta?.qpaper_meta?.max_marks ||
    docMeta?.qpaper_meta?.max_marks_total ||
    docMeta?._meta?.max_marks ||
    0
  );
  if (docMax > 0) return docMax;

  // 3. Search in cia_configs for matching examName and academicYear
  const ciaEntries = Object.entries(ciaConfigs || {});

  const matchedEntry = ciaEntries.find(([id, cfg]) => {
    if (!cfg) return false;
    const cfgName = String(cfg.examName || cfg.exam_name || cfg.name || id || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cfgName !== normExamName) return false;

    const cfgAy = cfg.academicYear || cfg.academic_year || cfg.ay || '';
    if (cfgAy && targetAyYear) {
      const cfgAyYear = iaReportYearStartOf(cfgAy);
      return cfgAyYear === targetAyYear;
    }
    return true;
  });

  if (matchedEntry) {
    const matchedConfig = matchedEntry[1];
    if (matchedConfig.maxMarksByAy && targetAY && matchedConfig.maxMarksByAy[targetAY]) {
      return Number(matchedConfig.maxMarksByAy[targetAY]);
    }
    const sanAy = String(targetAY || '').replace(/[.#$[\]]/g, '_');
    if (matchedConfig.maxMarksByAy && sanAy && matchedConfig.maxMarksByAy[sanAy]) {
      return Number(matchedConfig.maxMarksByAy[sanAy]);
    }
    if (matchedConfig.totalMarks && Number(matchedConfig.totalMarks) > 0) {
      return Number(matchedConfig.totalMarks);
    }
    if (matchedConfig.maxMarks && Number(matchedConfig.maxMarks) > 0) {
      return Number(matchedConfig.maxMarks);
    }
  }

  // 4. Fallback search across all cia_configs
  const anyEntry = ciaEntries.find(([id, cfg]) => {
    if (!cfg) return false;
    const cfgName = String(cfg.examName || cfg.exam_name || cfg.name || id || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return cfgName === normExamName && (cfg.totalMarks || cfg.maxMarks || cfg.max_marks);
  });

  if (anyEntry) {
    return Number(anyEntry[1].totalMarks || anyEntry[1].maxMarks || anyEntry[1].max_marks || 100);
  }

  return 100;
};

export default function AcademicCoordinatorDashboard() {
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
  const [feeDueModalOpen, setFeeDueModalOpen] = useState(false);

  const [hodDepartment, setHodDepartment] = useState("");
  const [hodProgramme, setHodProgramme] = useState("");
  const [deptMetadata, setDeptMetadata] = useState({});
  const [approvedStudentsList, setApprovedStudentsList] = useState([]);
  const [allStudentNames, setAllStudentNames] = useState({});
  const [academicEvents, setAcademicEvents] = useState({});
  const [attendanceOverview, setAttendanceOverview] = useState({});
  const [attendanceOverviewLoading, setAttendanceOverviewLoading] = useState(false);
  const [reloadAttendanceTrigger, setReloadAttendanceTrigger] = useState(0);
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
  const [rawApprovedCandidates, setRawApprovedCandidates] = useState([]);
  const rawApprovedSnapDataRef = useRef([]);
  const rawEnquiriesSnapDataRef = useRef([]);
  const rawUnassignedStudentsSnapDataRef = useRef([]);
  const assignedStudentsMapRef = useRef({});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [batchStrengthModal, setBatchStrengthModal] = useState({ open: false });
  const [sectionStudents, setSectionStudents] = useState([]);

  const [pendingActivities, setPendingActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [reviewActivity, setReviewActivity] = useState(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [dutyIndents, setDutyIndents] = useState([]);
  const [dutyIndentsLoading, setDutyIndentsLoading] = useState(true);
  const [allocWfId, setAllocWfId] = useState(null);
  const [allocSelected, setAllocSelected] = useState([]);
  const [allocSaving, setAllocSaving] = useState(false);

  // HOD Batch Attendance Report state
  const [reportBatch, setReportBatch] = useState("");
  const [reportSection, setReportSection] = useState("");
  const [reportFromDate, setReportFromDate] = useState(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return formatDateKey(startOfMonth);
  });
  const [reportToDate, setReportToDate] = useState(() => formatDateKey(new Date()));
  const [generatedReport, setGeneratedReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showReportPdfPreview, setShowReportPdfPreview] = useState(false);
  const [reportPdfUrl, setReportPdfUrl] = useState("");
  const [reportPdfDoc, setReportPdfDoc] = useState(null);
  const [reportPdfFilename, setReportPdfFilename] = useState("");
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [reportAcademicYear, setReportAcademicYear] = useState("");
  const [reportSemester, setReportSemester] = useState("");
  const [selectedReportSubjects, setSelectedReportSubjects] = useState([]);
  const [pendingAttendanceModal, setPendingAttendanceModal] = useState({ open: false, items: [] });
  const [exportingPendingPdf, setExportingPendingPdf] = useState(false);

  // IA Consolidation Report state
  const [iaReportLoading, setIaReportLoading] = useState(false);
  const [iaReportData, setIaReportData] = useState(null);
  const [iaReportExam, setIaReportExam] = useState("");
  const [nonObeSubjectCodes, setNonObeSubjectCodes] = useState(new Set());

  const averageAttendance = useMemo(() => {
    if (!generatedReport || generatedReport.students.length === 0) return "0.0";
    const total = generatedReport.students.reduce((sum, s) => sum + parseFloat(s.percentage || 0), 0);
    return (total / generatedReport.students.length).toFixed(1);
  }, [generatedReport]);

  const countBelow75 = useMemo(() => {
    if (!generatedReport) return 0;
    return generatedReport.students.filter(s => parseFloat(s.percentage || 0) < 75).length;
  }, [generatedReport]);

  const filteredReportStudents = useMemo(() => {
    if (!generatedReport) return [];
    if (!reportSearchQuery.trim()) return generatedReport.students;
    const q = reportSearchQuery.toLowerCase();
    return generatedReport.students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.reg.toLowerCase().includes(q)
    );
  }, [generatedReport, reportSearchQuery]);

  const handleGenerateBatchReport = async () => {
    if (!reportBatch) {
      alert("Please select a batch.");
      return;
    }

    let effectiveFrom = reportFromDate;
    let effectiveTo = reportToDate;

    // Inverted dates protection: automatically swap if fromDate > toDate
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      const temp = effectiveFrom;
      effectiveFrom = effectiveTo;
      effectiveTo = temp;
      setReportFromDate(effectiveFrom);
      setReportToDate(effectiveTo);
    }

    if (reportDateRange.min && reportDateRange.max) {
      if (effectiveFrom < reportDateRange.min) {
        effectiveFrom = reportDateRange.min;
        setReportFromDate(effectiveFrom);
      }
      if (effectiveTo > reportDateRange.max) {
        effectiveTo = reportDateRange.max;
        setReportToDate(effectiveTo);
      }
    }

    setGeneratingReport(true);
    try {
      // Find students in batch/section
      const targetStudents = sectionStudents.filter(s => {
        if (s.batch !== reportBatch) return false;
        if (reportSection) {
          const parts = s.docId.split('_');
          const secPart = parts.find(p => p.startsWith('Sec-'));
          return secPart === reportSection;
        }
        return true;
      });

      if (targetStudents.length === 0) {
        alert("No students found in this batch/section.");
        setGeneratedReport(null);
        setGeneratingReport(false);
        return;
      }

      // Collect attendance records from already-loaded resolvedAttendanceOverview
      const batchItems = (resolvedAttendanceOverview[reportBatch] || []).filter(item => {
        if (reportAcademicYear && item.ay && item.ay.replace(/_/g, '-') !== reportAcademicYear.replace(/_/g, '-')) return false;
        const itemSem = String(item.sem || '').match(/\d+/)?.[0] || String(item.sem || '');
        const repSem = String(reportSemester || '').match(/\d+/)?.[0] || String(reportSemester || '');
        if (repSem && itemSem && itemSem !== repSem) return false;
        if (reportSection && item.section && item.section !== reportSection && item.section !== '') return false;
        if (selectedReportSubjects.length > 0 && !selectedReportSubjects.map(s => s.toLowerCase()).includes(item.subjectCode?.toLowerCase())) return false;
        return true;
      });

      // ─── Direct Firestore Attendance Candidate Probing for Target Batch & Subjects ───
      const isSubjectSpecific = selectedReportSubjects.length > 0;
      const allBatchCodes = [...new Set([
        ...(availableReportSubjects || []).map(s => s.code),
        ...batchItems.map(i => i.subjectCode)
      ])].filter(Boolean);
      const targetCodes = isSubjectSpecific
        ? selectedReportSubjects
        : (allBatchCodes.length > 0 ? allBatchCodes : [...new Set(batchItems.map(i => i.subjectCode).filter(Boolean))]);

      const probeResults = await Promise.all(
        targetCodes.map(async (code) => {
          const candidateIds = getAllCandidateAttendanceDocIds({
            programme: hodProgramme || 'UG',
            department: hodDepartment || '',
            batch: reportBatch,
            academicYear: reportAcademicYear,
            semester: reportSemester,
            subjectCode: code,
            section: reportSection || ''
          });

          const probeIds = candidateIds.slice(0, 25);
          let foundRecs = {};
          try {
            const snaps = await Promise.allSettled(probeIds.map(id => getDoc(doc(db, "attendance", id))));
            for (const res of snaps) {
              if (res.status === 'fulfilled' && res.value && res.value.exists()) {
                const rec = getAttendanceRecords(res.value.data());
                if (rec && Object.keys(rec).length > 0) {
                  foundRecs = { ...foundRecs, ...rec };
                }
              }
            }
          } catch { /* skip */ }
          return { subjectCode: code, records: foundRecs };
        })
      );

      const probedRecordsBySubject = {};
      probeResults.forEach(r => {
        probedRecordsBySubject[r.subjectCode.toLowerCase()] = r.records;
      });

      const recordsMap = {};
      const periodInfoMap = {};
      const matchedPeriodsSet = new Set();

      const addRecordToMap = (rk, recordVal, subCode) => {
        if (!rk || !recordVal) return;
        const datePart = extractPureDate(rk);
        if (datePart >= effectiveFrom && datePart <= effectiveTo) {
          matchedPeriodsSet.add(rk);
          if (!recordsMap[rk]) recordsMap[rk] = [];
          recordsMap[rk].push({
            ...recordVal,
            subjectCode: subCode
          });
          if (!periodInfoMap[rk]) periodInfoMap[rk] = { subjectCodes: new Set(), eventNames: new Set() };
          if (recordVal?.isEvent) {
            periodInfoMap[rk].eventNames.add(recordVal.eventName || 'Event');
          } else {
            periodInfoMap[rk].subjectCodes.add(subCode);
          }
        }
      };

      // 1. Merge probed direct Firestore records
      Object.entries(probedRecordsBySubject).forEach(([codeLower, recs]) => {
        const matchedItem = availableReportSubjects.find(s => s.code.toLowerCase() === codeLower) ||
          batchItems.find(i => i.subjectCode?.toLowerCase() === codeLower);
        const actualCode = matchedItem?.code || matchedItem?.subjectCode || codeLower.toUpperCase();
        Object.entries(recs || {}).forEach(([rk, recordVal]) => {
          addRecordToMap(rk, recordVal, actualCode);
        });
      });

      // 2. Merge preloaded batchItems records
      batchItems.forEach(item => {
        Object.entries(item.attRecords || {}).forEach(([rk, recordVal]) => {
          addRecordToMap(rk, recordVal, item.subjectCode);
        });
      });

      // 3. Fallback: If zero periods found so far, perform a comprehensive scan on attendance collection
      if (matchedPeriodsSet.size === 0) {
        try {
          const allAttSnap = await getDocs(collection(db, "attendance"));
          const batchNorm = reportBatch.replace(/[^a-z0-9]/gi, '').toLowerCase();
          const semNorm = String(reportSemester || '').match(/\d+/)?.[0] || '';
          const secClean = reportSection ? sanitizeKey(reportSection).toLowerCase() : '';

          allAttSnap.docs.forEach(docSnap => {
            const dId = docSnap.id;
            const dIdNorm = dId.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (!dIdNorm.includes(batchNorm)) return;
            if (semNorm && !dIdNorm.includes(semNorm)) return;
            if (secClean && !dIdNorm.includes(secClean) && !dIdNorm.includes('sec')) return;

            const dData = docSnap.data();
            const recs = getAttendanceRecords(dData);
            const subCodeMatch = dId.match(/(WL\w+|\b[A-Z]{2,4}\d{3,5}[A-Z]?\b)/i);
            const fallbackCode = subCodeMatch ? subCodeMatch[1].toUpperCase() : "GENERAL";

            if (isSubjectSpecific && !selectedReportSubjects.map(s => s.toLowerCase()).includes(fallbackCode.toLowerCase())) {
              return;
            }

            Object.entries(recs || {}).forEach(([rk, recordVal]) => {
              addRecordToMap(rk, recordVal, fallbackCode);
            });
          });
        } catch (e) {
          console.warn('[handleGenerateBatchReport] fallback attendance scan error:', e);
        }
      }

      // ─── CHECK PENDING / UNMARKED ATTENDANCE IN DATE RANGE (Only for past and today's dates) ───
      const pendingList = [];
      const dayScheduleMap = timetableAllocation[reportBatch] || {};
      const curDate = new Date(effectiveFrom + 'T00:00:00');
      const endDateObj = new Date(effectiveTo + 'T00:00:00');
      const todayStr = formatDateKey(new Date());

      const normSubCode = (s) => String(s || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      while (curDate <= endDateObj) {
        const dStr = formatDateKey(curDate);
        // Future dates have not occurred yet, they can never be pending!
        if (dStr > todayStr) {
          curDate.setDate(curDate.getDate() + 1);
          continue;
        }

        const dayName = curDate.toLocaleDateString('en-US', { weekday: 'long' });
        const isSunday = curDate.getDay() === 0;
        const isHoliday = academicEvents[dStr]?.some(e => e.type === 'Holiday');

        if (!isSunday && !isHoliday) {
          const rawDaySchedule = dayScheduleMap[dayName];
          if (rawDaySchedule) {
            const expandedDaySchedule = {};
            Object.entries(rawDaySchedule).forEach(([pStart, rawEntries]) => {
              const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
              entries.forEach(entry => {
                const parts = String(entry || '').split('|');
                const code = parts[0].trim();
                const span = parseInt(parts[1], 10) || 1;
                if (!code) return;
                for (let p = parseInt(pStart), endP = p + span; p < endP; p++) {
                  const pStr = String(p);
                  if (!expandedDaySchedule[pStr]) expandedDaySchedule[pStr] = [];
                  if (!expandedDaySchedule[pStr].includes(code)) expandedDaySchedule[pStr].push(code);
                }
              });
            });

            Object.entries(expandedDaySchedule).forEach(([periodNum, codes]) => {
              codes.forEach(code => {
                const normC = normSubCode(code);
                if (isSubjectSpecific) {
                  const isMatch = selectedReportSubjects.some(s => {
                    const normS = normSubCode(s);
                    return normS === normC || normC.includes(normS) || normS.includes(normC);
                  });
                  if (!isMatch) return;
                }

                const recordKey = `${dStr}_P${periodNum}`;
                const hasEvent = recordsMap[recordKey]?.some(r => r.isEvent);
                const hasSubjectRecord =
                  recordsMap[recordKey]?.some(r => {
                    const rCode = normSubCode(r.subjectCode);
                    return rCode === normC || rCode.includes(normC) || normC.includes(rCode);
                  }) ||
                  batchItems.some(i => {
                    const bCode = normSubCode(i.subjectCode);
                    return (bCode === normC || bCode.includes(normC) || normC.includes(bCode)) && i.attRecords?.[recordKey];
                  }) ||
                  !!probedRecordsBySubject[code.toLowerCase()]?.[recordKey] ||
                  !!probedRecordsBySubject[normC]?.[recordKey];

                const hasRecord = hasEvent || hasSubjectRecord;

                if (!hasRecord) {
                  // Resilient faculty and subject name resolution
                  const subjObj = batchItems.find(i => {
                    const bCode = normSubCode(i.subjectCode);
                    return bCode === normC || bCode.includes(normC) || normC.includes(bCode);
                  });
                  const anyBatchSubj = !subjObj
                    ? Object.values(resolvedAttendanceOverview || {}).flat().find(i => {
                      const bCode = normSubCode(i.subjectCode);
                      return bCode === normC || bCode.includes(normC) || normC.includes(bCode);
                    })
                    : null;
                  const targetSubj = subjObj || anyBatchSubj;
                  const facultyUid = targetSubj?.facultyUid || targetSubj?.uid;

                  let facultyName = "";
                  if (facultyUid && usersMap[facultyUid]) {
                    const u = usersMap[facultyUid];
                    facultyName = u.facultyName || u.displayName || u.name || u.email || "";
                  }
                  if (!facultyName && targetSubj?.facultyName && targetSubj.facultyName !== facultyUid) {
                    facultyName = targetSubj.facultyName;
                  }
                  if (!facultyName) {
                    const matchedUser = Object.values(usersMap || {}).find(u => {
                      return (u.assignedCourses || u.courses || []).some(c => {
                        const cCode = normSubCode(c.code || c);
                        return cCode === normC || cCode.includes(normC) || normC.includes(cCode);
                      });
                    });
                    if (matchedUser) {
                      facultyName = matchedUser.facultyName || matchedUser.displayName || matchedUser.name || "";
                    }
                  }
                  if (!facultyName) {
                    facultyName = "Faculty Not Assigned";
                  }

                  const subjectName = targetSubj?.subjectName || getCourseName(subjectNamesMap, code, hodDepartment, hodProgramme) || subjectNamesMap[code] || code;

                  pendingList.push({
                    date: dStr,
                    day: dayName,
                    period: periodNum,
                    subjectCode: code,
                    subjectName: subjectName,
                    facultyName: facultyName
                  });
                }
              });
            });
          }
        }
        curDate.setDate(curDate.getDate() + 1);
      }

      if (pendingList.length > 0) {
        setGeneratingReport(false);
        setGeneratedReport(null);
        setPendingAttendanceModal({ open: true, items: pendingList });
        return;
      }

      // Label each period with subject code or event name
      const periodInfo = {};
      Object.entries(periodInfoMap).forEach(([rk, info]) => {
        const label = info.eventNames.size > 0
          ? [...info.eventNames][0]
          : [...info.subjectCodes].filter(Boolean).join(', ');
        if (label) periodInfo[rk] = label;
      });

      const sortedPeriods = [...matchedPeriodsSet].sort((a, b) => {
        const dateA = extractPureDate(a);
        const dateB = extractPureDate(b);
        const periodA = a.match(/_P(\d+)/i)?.[1] || '0';
        const periodB = b.match(/_P(\d+)/i)?.[1] || '0';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (parseInt(periodA) || 0) - (parseInt(periodB) || 0);
      });

      // Group period keys by date for the date-wise map
      const groupedPeriods = [];
      sortedPeriods.forEach(rk => {
        const date = extractPureDate(rk);
        const last = groupedPeriods[groupedPeriods.length - 1];
        if (last && last.date === date) {
          last.periods.push(rk);
        } else {
          groupedPeriods.push({ date, periods: [rk] });
        }
      });

      const normClean = str => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      const studentStats = targetStudents.map(student => {
        let attended = 0;
        let absent = 0;
        let odCount = 0;
        let totalClasses = 0;
        const dailyRecords = {};
        const subjectStats = {};

        const aliasList = [
          student.reg,
          student.name,
          student.raw?.admissionNo,
          student.raw?.admNo,
          student.raw?.admission_no,
          student.raw?.rollNo,
          student.raw?.roll_no,
          student.raw?.regNo,
          student.raw?.registerNo,
          student.raw?.reg_no,
          student.raw?.studentId,
          student.raw?.student_id,
          student.raw?.id
        ].filter(Boolean);

        const aliasSet = new Set(aliasList.map(a => String(a).trim().toLowerCase()));
        const aliasCleanList = aliasList.map(a => normClean(a)).filter(c => c && c.length >= 3);
        const aliasCleanSet = new Set(aliasCleanList);
        const idTargets = aliasCleanList.filter(t => t.length >= 6);
        const endsWithIdMatch = (candidate) => {
          const c = normClean(candidate);
          if (!c || c.length < 6) return false;
          return idTargets.some(t => {
            if (c === t) return true;
            if (Math.abs(c.length - t.length) > 4) return false;
            return c.endsWith(t) || t.endsWith(c);
          });
        };

        const resolveStudentVal = (studentsMap) => {
          if (!studentsMap) return undefined;
          let mapObj = studentsMap;
          if (typeof mapObj === 'string') {
            try { mapObj = JSON.parse(mapObj); } catch { return undefined; }
          }
          if (!mapObj || typeof mapObj !== 'object') return undefined;
          if (mapObj.students && typeof mapObj.students === 'object') {
            mapObj = mapObj.students;
          }

          if (Array.isArray(mapObj)) {
            return mapObj.find(item => {
              if (!item) return false;
              const itemReg = String(
                item.reg || item.regNo || item.registerNo || item.register_number ||
                item.reg_no || item.admNo || item.admissionNo || item.adm_no ||
                item.admission_no || item.studentId || item.student_id ||
                item.rollNo || item.roll_no || item.id || ''
              ).trim().toLowerCase();
              const itemClean = normClean(itemReg);
              const itemName = String(item.name || item.studentName || '').trim().toLowerCase();
              return aliasSet.has(itemReg) || aliasCleanSet.has(itemClean) || endsWithIdMatch(itemReg) || (itemName && aliasSet.has(itemName));
            });
          }

          for (const a of aliasList) {
            if (mapObj[a] !== undefined && mapObj[a] !== null) return mapObj[a];
          }
          for (const a of aliasSet) {
            if (mapObj[a] !== undefined && mapObj[a] !== null) return mapObj[a];
          }

          const keys = Object.keys(mapObj);
          for (const k of keys) {
            if (k.startsWith('_')) continue;
            const kLower = String(k).trim().toLowerCase();
            const kClean = normClean(k);
            if (aliasSet.has(kLower) || aliasCleanSet.has(kClean) || endsWithIdMatch(k)) {
              if (mapObj[k] !== undefined && mapObj[k] !== null) return mapObj[k];
            }
          }

          if (student.name) {
            const sNameNorm = String(student.name).trim().toLowerCase();
            for (const [k, v] of Object.entries(mapObj)) {
              if (k.startsWith('_')) continue;
              if (typeof v === 'object' && v !== null) {
                const vName = String(v.name || v.studentName || '').trim().toLowerCase();
                if (vName && vName === sNameNorm) return v;
              }
            }
          }
          return undefined;
        };

        const jd = student.raw?.joiningDate || student.raw?._joiningDate || '';

        sortedPeriods.forEach(rk => {
          const matchedRecords = recordsMap[rk] || [];
          if (matchedRecords.length === 0) {
            dailyRecords[rk] = '—';
            return;
          }

          const rkDate = extractPureDate(rk);
          if (jd && rkDate && rkDate < jd) {
            dailyRecords[rk] = '—';
            return;
          }

          // Event period handling (aligned with Attendance.jsx)
          const isEvent = matchedRecords.some(r => r.isEvent);
          if (isEvent) {
            let eventParsed = null;
            for (const rec of matchedRecords) {
              const rawH = resolveStudentVal(rec.students);
              if (rawH !== undefined) {
                const p = parseStudentAttendanceVal(rawH);
                if (p) { eventParsed = p; break; }
              }
            }
            const isPresent = eventParsed ? (eventParsed.status === 'P' || eventParsed.hours > 0) : true;
            dailyRecords[rk] = eventParsed ? (eventParsed.isNA ? '—' : eventParsed.status) : (isPresent ? 'P' : '—');
            return;
          }

          // Regular academic period
          let conductedRecord = null;
          let foundStatus = undefined;
          let recordSubject = "";

          for (const rec of matchedRecords) {
            const allEntries = rec.students && typeof rec.students === 'object'
              ? Object.entries(rec.students).filter(([k]) => !k.startsWith('_'))
              : [];
            if (allEntries.length === 0) continue;

            if (!conductedRecord) conductedRecord = rec;

            const isCorruptedAllHyphen = allEntries.every(([, v]) => {
              const p = parseStudentAttendanceVal(v);
              return p?.status === '-' || p?.isNA;
            });

            const rawH = resolveStudentVal(rec.students);
            if (rawH !== undefined) {
              const parsed = parseStudentAttendanceVal(rawH);
              if (parsed) {
                if (isCorruptedAllHyphen) {
                  foundStatus = 'P';
                  recordSubject = rec.subjectCode || "";
                  break;
                } else if (parsed.status === '-' || parsed.isNA || parsed.status === '—') {
                  if (foundStatus === undefined) {
                    foundStatus = '—';
                    recordSubject = rec.subjectCode || "";
                  }
                } else {
                  foundStatus = parsed.status;
                  recordSubject = rec.subjectCode || "";
                  break;
                }
              }
            } else {
              if (isCorruptedAllHyphen) {
                foundStatus = 'P';
                recordSubject = rec.subjectCode || "";
                break;
              }
            }
          }

          if (conductedRecord) {
            if (foundStatus === undefined) {
              // Unmarked / unlisted student in conducted class defaults to Present 'P' (standard in Attendance.jsx)
              foundStatus = 'P';
              recordSubject = conductedRecord.subjectCode || "";
            }
          } else {
            foundStatus = '—';
          }

          dailyRecords[rk] = foundStatus;

          if (foundStatus === 'P' || foundStatus === 'A' || foundStatus === 'OD') {
            if (recordSubject) {
              if (!subjectStats[recordSubject]) {
                subjectStats[recordSubject] = { attended: 0, absent: 0, od: 0, total: 0 };
              }
              if (foundStatus === 'P') {
                subjectStats[recordSubject].attended++;
                subjectStats[recordSubject].total++;
              } else if (foundStatus === 'A') {
                subjectStats[recordSubject].absent++;
                subjectStats[recordSubject].total++;
              } else if (foundStatus === 'OD') {
                subjectStats[recordSubject].od++;
                subjectStats[recordSubject].total++;
              }
            }

            if (foundStatus === 'P') {
              attended++;
              totalClasses++;
            } else if (foundStatus === 'A') {
              absent++;
              totalClasses++;
            } else if (foundStatus === 'OD') {
              odCount++;
              totalClasses++;
            }
          }
        });

        const activeClasses = totalClasses - odCount;
        const percentage = activeClasses > 0
          ? ((attended / activeClasses) * 100).toFixed(1)
          : (odCount > 0 ? "100.0" : "0.0");

        return {
          reg: student.reg,
          name: student.name,
          section: student.docId.split('_').find(p => p.startsWith('Sec-')) || 'Sec-A',
          attended,
          absent,
          od: odCount,
          total: totalClasses,
          percentage,
          dailyRecords,
          subjectStats
        };
      });

      studentStats.sort((a, b) => a.reg.localeCompare(b.reg));

      setGeneratedReport({
        periods: sortedPeriods,
        groupedPeriods,
        periodInfo,
        students: studentStats,
        fromDate: effectiveFrom,
        toDate: effectiveTo,
        batch: reportBatch,
        section: reportSection || "All Sections",
        academicYear: reportAcademicYear,
        semester: reportSemester,
        selectedSubjects: selectedReportSubjects,
        unmarkedPeriods: pendingList
      });

      showToast("Report generated successfully!", "success");
    } catch (err) {
      console.error("Error generating report:", err);
      alert("Failed to generate report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExportCSV = () => {
    if (!generatedReport) return;
    const { periods, students, batch, section, fromDate, toDate } = generatedReport;
    const selectedSubjects = generatedReport.selectedSubjects || [];

    const subjHeaders = selectedSubjects.length > 0
      ? selectedSubjects.flatMap(code => [`${code} Total`, `${code} Present`, `${code} Absent`, `${code} %`])
      : [];

    let headers, rows;
    headers = ["Register No", "Student Name", "Section", ...periods.map(p => {
      const pNum = p.includes('_P') ? p.slice(p.lastIndexOf('_P') + 2) : p;
      const info = generatedReport.periodInfo?.[p];
      return info ? `P${pNum} (${info})` : `P${pNum}`;
    }), "Total Classes", "Present", "OD", "Absent", "Percentage (%)", ...subjHeaders];
    rows = students.map(s => {
      const dailyVals = periods.map(p => s.dailyRecords[p]);
      const subjVals = selectedSubjects.flatMap(code => {
        const st = s.subjectStats?.[code] || { attended: 0, absent: 0, od: 0, total: 0 };
        return [st.total, st.attended, st.absent, subjectStatPct(st)];
      });
      return [
        s.reg,
        s.name,
        s.section,
        ...dailyVals,
        s.total,
        s.attended,
        s.od,
        s.absent,
        s.percentage,
        ...subjVals
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_Report_${batch}_${section}_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (!generatedReport) return;
    const { students, batch, section, fromDate, toDate } = generatedReport;
    const groupedPeriods = generatedReport.groupedPeriods || [];

    let logoDataUrl = null;
    try {
      const resp = await fetch('/logo.png');
      const blob = await resp.blob();
      logoDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch { }

    const doc = new jsPDF({ orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginL = 14;
    const marginR = 14;
    const usableW = pageW - marginL - marginR;

    const drawHeader = (isFirst = false) => {
      let y = 10;
      if (isFirst && logoDataUrl) {
        try {
          const logoW = usableW;
          const logoH = logoW * 0.065;
          doc.addImage(logoDataUrl, 'PNG', marginL, y, logoW, logoH);
          y += logoH + 3;
        } catch { }
      }
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Batch Attendance Report', marginL, y);
      y += 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Department: ${hodDepartment}  |  Batch: ${batch}  |  Section: ${section}  |  Range: ${fromDate} to ${toDate}`, marginL, y);
      return y + 5;
    };

    let yPos = drawHeader(true);

    const selectedSubjects = generatedReport.selectedSubjects || [];

    // ── Overall Attendance Summary Table (only in Overall mode) ──
    if (selectedSubjects.length === 0) {
      const summaryHeaders = ['Reg No', 'Student Name', 'Sec', 'Total', 'Present', 'OD', 'Absent', '%'];
      const summaryRows = students.map(s => [
        s.reg,
        s.name,
        s.section.replace('Sec-', ''),
        s.total,
        s.attended,
        s.od,
        s.absent,
        s.percentage + '%'
      ]);
      const colStyles = {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: 10 },
        3: { cellWidth: 14 },
        4: { cellWidth: 15 },
        5: { cellWidth: 12 },
        6: { cellWidth: 15 },
        7: { fontStyle: 'bold', cellWidth: 15 }
      };

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Overall Attendance Summary', marginL, yPos);
      yPos += 4;

      autoTable(doc, {
        head: [summaryHeaders],
        body: summaryRows,
        startY: yPos,
        margin: { left: marginL, right: marginR },
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
        columnStyles: colStyles,
        headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold' },
        didParseCell: (data) => {
          const pctColIndex = summaryHeaders.length - 1;
          if (data.section === 'body' && data.column.index === pctColIndex) {
            const val = parseFloat(data.cell.raw);
            if (val < 75) {
              data.cell.styles.textColor = [200, 30, 30];
            } else {
              data.cell.styles.textColor = [16, 128, 80];
            }
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 8;
    }

    // ── Subject-wise Attendance Summary Table (when specific subjects selected) ──
    if (selectedSubjects.length > 0) {
      if (yPos + 25 > pageH) {
        doc.addPage();
        yPos = drawHeader(false);
      }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Subject-wise Attendance Summary', marginL, yPos);
      yPos += 4;

      const subjHeaders = ['Reg No', 'Student Name', ...selectedSubjects.flatMap(code => [`${code} Total`, `${code} P`, `${code} A`, `${code} %`])];
      const subjRows = students.map(s => [
        s.reg,
        s.name,
        ...selectedSubjects.flatMap(code => {
          const st = s.subjectStats?.[code] || { attended: 0, absent: 0, od: 0, total: 0 };
          return [st.total, st.attended, st.absent, subjectStatPct(st) + '%'];
        })
      ]);

      autoTable(doc, {
        head: [subjHeaders],
        body: subjRows,
        startY: yPos,
        margin: { left: marginL, right: marginR },
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
          1: { halign: 'left', fontStyle: 'bold' },
        },
        headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold' },
        didParseCell: (data) => {
          const { section, column } = data;
          if (section === 'body' && column.index >= 2) {
            const colInGroup = (column.index - 2) % 4;
            if (colInGroup === 3) {
              const val = parseFloat(data.cell.raw);
              data.cell.styles.textColor = val < 75 ? [200, 30, 30] : [16, 128, 80];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 8;
    }

    // Show daily period breakdown (filtered to the selected subjects' periods)
    if (groupedPeriods.length > 0) {
      if (yPos + 25 > pageH) {
        doc.addPage();
        yPos = drawHeader(false);
      }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Daily Period-wise Breakdown', marginL, yPos);
      yPos += 5;

      groupedPeriods.forEach((group, gi) => {
        const dateLabel = group.date;
        const dayName = new Date(group.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

        // Check if we have enough space; otherwise new page
        const headerH = 8;
        const tableRowH = 5.5;
        const neededForHeader = headerH + 15;
        const neededForTable = students.length * tableRowH + 10;
        if (yPos + neededForHeader > pageH - 10) {
          doc.addPage();
          yPos = drawHeader(false);
        }

        // Date section header
        doc.setFillColor(18, 12, 122);
        doc.rect(marginL, yPos, usableW, 7, 'F');
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(`${dateLabel}  (${dayName})  —  ${group.periods.length} period(s)`, marginL + 2, yPos + 5);
        doc.setTextColor(0, 0, 0);
        yPos += 8;

        // Build table: Reg No | Name | P1 | P2 | ... | Pn
        const headers = ['Reg No', 'Student Name', ...group.periods.map(p => {
          const pNum = p.includes('_P') ? p.slice(p.lastIndexOf('_P') + 2) : p;
          const info = generatedReport.periodInfo?.[p];
          return info ? `P${pNum} (${info})` : `P${pNum}`;
        })];
        const rows = students.map(s => {
          const vals = group.periods.map(p => {
            const v = s.dailyRecords[p];
            return v || '—';
          });
          return [s.reg, s.name, ...vals];
        });

        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: yPos,
          margin: { left: marginL, right: marginR },
          theme: 'grid',
          styles: { fontSize: 6.5, cellPadding: 1.2, halign: 'center', overflow: 'linebreak' },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
            1: { halign: 'left', cellWidth: 45 },
          },
          headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
          didParseCell: (data) => {
            const { section, column, cell, row } = data;
            if (section === 'body') {
              const ci = column.index;
              if (ci >= 2) {
                const val = cell.raw;
                if (val === 'P') {
                  cell.styles.textColor = [16, 128, 80];
                  cell.styles.fontStyle = 'bold';
                } else if (val === 'A') {
                  cell.styles.textColor = [200, 30, 30];
                  cell.styles.fontStyle = 'bold';
                  cell.styles.fillColor = [254, 226, 226];
                } else if (val === 'OD') {
                  cell.styles.textColor = [30, 100, 200];
                  cell.styles.fontStyle = 'bold';
                }
              }
              if (row.index % 2 === 1 && cell.styles.fillColor === undefined) {
                cell.styles.fillColor = [245, 245, 255];
              }
            }
          },
        });

        yPos = doc.lastAutoTable.finalY + 4;

        // Date summary row
        const totalStudents = students.length;
        let dateP = 0, dateA = 0, dateOD = 0;
        students.forEach(s => {
          group.periods.forEach(p => {
            const v = s.dailyRecords[p];
            if (v === 'P') dateP++;
            else if (v === 'A') dateA++;
            else if (v === 'OD') dateOD++;
          });
        });
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(`P: ${dateP}  |  A: ${dateA}  |  OD: ${dateOD}  |  Total Records: ${group.periods.length * totalStudents}`, marginL, yPos + 3);
        yPos += 8;
      });
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    setReportPdfUrl(url);
    setReportPdfDoc(doc);
    setReportPdfFilename(`Attendance_Report_${batch}_${section}_${fromDate}_to_${toDate}.pdf`);
    setShowReportPdfPreview(true);
  };

  const handleExportPendingAttendancePDF = async () => {
    if (!pendingAttendanceModal.items || pendingAttendanceModal.items.length === 0) return;
    setExportingPendingPdf(true);
    try {
      const items = pendingAttendanceModal.items;

      // Load /logo.png as base64
      let logoBase64 = null;
      try {
        logoBase64 = await getBase64ImageFromUrl('/logo.png');
      } catch (e) {
        console.warn('getBase64ImageFromUrl failed:', e);
      }
      if (!logoBase64) {
        try {
          const resp = await fetch('/logo.png');
          const blob = await resp.blob();
          logoBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch { }
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginL = 12;
      const marginR = 12;
      const usableW = pageW - marginL - marginR;

      const drawHeader = (pageNum = 1) => {
        let y = 8;
        if (pageNum === 1 && logoBase64) {
          try {
            // /logo.png aspect ratio is 9.496 (1206 x 127)
            const logoW = Math.min(usableW, 180);
            const logoH = logoW / 9.496;
            const logoX = (pageW - logoW) / 2;
            doc.addImage(logoBase64, 'PNG', logoX, y, logoW, logoH);
            y += logoH + 4;
          } catch (e) {
            console.warn('Could not render logo:', e);
          }
        }

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(185, 28, 28); // Crimson red
        doc.text("UNMARKED / PENDING ATTENDANCE REPORT", pageW / 2, y + 2, { align: "center" });
        y += 6;

        // Subtitle & Metadata Box
        doc.setFillColor(254, 242, 242); // Rose-50
        doc.setDrawColor(254, 205, 211); // Rose-200
        doc.roundedRect(marginL, y, usableW, 14, 2, 2, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(159, 18, 57); // Rose-900
        const line1 = `Department: ${hodDepartment || 'All Departments'}    |    Batch: ${reportBatch || 'All'}    |    Section: ${reportSection || 'All'}${selectedReportSubjects.length > 0 ? `    |    Subjects: ${selectedReportSubjects.join(', ')}` : ''}`;
        doc.text(line1, marginL + 4, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(75, 85, 99); // Zinc-600
        const line2 = `Date Range: ${reportFromDate} to ${reportToDate}    |    Total Pending Classes: ${items.length}    |    Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        doc.text(line2, marginL + 4, y + 10.5);

        y += 18;
        return y;
      };

      const startY = drawHeader(1);

      // Prepare Table Rows
      const tableRows = items.map((item, idx) => [
        idx + 1,
        `${item.date}\n(${item.day})`,
        `Period ${item.period}`,
        item.subjectName && item.subjectName !== item.subjectCode
          ? `${item.subjectCode}\n${item.subjectName}`
          : item.subjectCode,
        item.facultyName || "Faculty Not Assigned",
        "Pending"
      ]);

      autoTable(doc, {
        head: [['S.No', 'Date & Day', 'Period', 'Subject Code & Title', 'Assigned Faculty', 'Status']],
        body: tableRows,
        startY: startY,
        margin: { left: marginL, right: marginR, bottom: 15 },
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          valign: 'middle',
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [185, 28, 28], // Crimson red
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8,
          cellPadding: 2.5
        },
        alternateRowStyles: {
          fillColor: [255, 250, 250]
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 20, halign: 'center', fontStyle: 'bold', textColor: [29, 78, 216] },
          3: { cellWidth: 62, halign: 'left' },
          4: { cellWidth: 44, halign: 'left', fontStyle: 'bold', textColor: [15, 23, 42] },
          5: { cellWidth: 20, halign: 'center', fontStyle: 'bold', textColor: [185, 28, 28] }
        },
        didDrawPage: (data) => {
          const pageCount = doc.internal.getNumberOfPages();
          const currPage = data.pageNumber;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${currPage} of ${pageCount}  •  Batch Attendance Pending Verification  •  CKCET ERP`,
            pageW / 2,
            pageH - 6,
            { align: 'center' }
          );
        }
      });

      // Faculty Summary Table (at the end)
      let finalY = doc.lastAutoTable.finalY + 8;
      const facultySummaryMap = {};
      items.forEach(item => {
        const fName = item.facultyName || "Faculty Not Assigned";
        facultySummaryMap[fName] = (facultySummaryMap[fName] || 0) + 1;
      });
      const facultySummaryList = Object.entries(facultySummaryMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      const summaryTableRows = facultySummaryList.map((f, i) => [
        i + 1,
        f.name,
        `${f.count} class(es)`
      ]);

      const neededHeight = summaryTableRows.length * 6 + 25;
      if (finalY + neededHeight > pageH - 15) {
        doc.addPage();
        finalY = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text("Faculty-wise Unmarked Summary", marginL, finalY);
      finalY += 3;

      autoTable(doc, {
        head: [['#', 'Faculty Member Name', 'Unmarked Classes']],
        body: summaryTableRows,
        startY: finalY,
        margin: { left: marginL, right: marginR, bottom: 20 },
        theme: 'grid',
        tableWidth: 120,
        styles: {
          fontSize: 7.5,
          cellPadding: 1.8,
          valign: 'middle',
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [71, 85, 105], // Slate-600
          textColor: 255,
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 75, halign: 'left', fontStyle: 'bold' },
          2: { cellWidth: 35, halign: 'center', fontStyle: 'bold', textColor: [185, 28, 28] }
        },
        didDrawPage: (data) => {
          const pageCount = doc.internal.getNumberOfPages();
          const currPage = data.pageNumber;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${currPage} of ${pageCount}  •  Batch Attendance Pending Verification  •  CKCET ERP`,
            pageW / 2,
            pageH - 6,
            { align: 'center' }
          );
        }
      });

      // Signature section
      let signY = doc.lastAutoTable.finalY + 14;
      if (signY + 20 > pageH - 10) {
        doc.addPage();
        signY = 25;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Academic Coordinator", marginL + 10, signY);
      doc.text("Head of the Department", pageW / 2 - 15, signY);
      doc.text("Principal", pageW - marginR - 30, signY);

      const filename = `Pending_Attendance_${reportBatch || 'Batch'}_${reportFromDate}_to_${reportToDate}.pdf`;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setReportPdfUrl(url);
      setReportPdfDoc(doc);
      setReportPdfFilename(filename);
      setShowReportPdfPreview(true);

      // Direct download trigger
      doc.save(filename);
    } catch (err) {
      console.error("Error generating pending attendance PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setExportingPendingPdf(false);
    }
  };

  useEffect(() => {
    setActivitiesLoading(true);
    let list1 = [];
    let list2 = [];

    // Mirror HOD logic: show Pending + HOD_Pending (and AC_Pending) so AC sees same cards as HOD
    const q1 = query(collection(db, "activity_entries"));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const st = String(data.status || "").trim();
        const isPending = st === "HOD_Pending" || st === "Pending" || st === "HOD Pending" || st === "AC_Pending";
        if (isPending && isDeptMatch(data.department, hodDepartment)) {
          list1.push({ id: d.id, ...data });
        }
      });
      combineAndSet();
    }, (err) => { console.error("Error loading activity_entries:", err); setActivitiesLoading(false); });

    const q2 = query(collection(db, "step_activities"));
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const st = String(data.status || "").trim();
        const isPending = st === "HOD_Pending" || st === "Pending" || st === "HOD Pending" || st === "AC_Pending";
        if (isPending && isDeptMatch(data.department, hodDepartment)) {
          list2.push({ id: d.id, isStep: true, ...data });
        }
      });
      combineAndSet();
    }, (err) => { console.error("Error loading step_activities:", err); setActivitiesLoading(false); });

    const combineAndSet = () => {
      const combined = [...list1, ...list2].sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt));
      setPendingActivities(combined);
      setActivitiesLoading(false);
    };

    return () => {
      unsub1();
      unsub2();
    };
  }, [hodDepartment]);

  // ─── Duty Indents (from Exam Cell) for this department ───
  useEffect(() => {
    setDutyIndentsLoading(true);
    const ref = doc(db, 'exam_cell_settings', 'faculty_duty_roster');
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { setDutyIndents([]); setDutyIndentsLoading(false); return; }
      const workflows = snap.data().dutyWorkflows || [];
      const filtered = workflows.filter((wf) => {
        if (!wf) return false;
        const st = String(wf.status || "");
        if (st !== "Indent Sent to HODs" && st !== "Nominations In Progress" && st !== "Draft") return false;
        const quotaEntry = Object.entries(wf.deptQuotas || {}).find(([k]) => isDeptMatch(k, hodDepartment));
        if (!quotaEntry) return false;
        const q = quotaEntry[1];
        if (!q || (q.requiredCount || 0) <= 0) return false;
        const nominated = (q.nominatedFacultyIds || []).length;
        const required = q.requiredCount || 0;
        if (st === "Indent Sent to HODs") return true;
        if (st === "Nominations In Progress" && nominated < required) return true;
        return false;
      }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      setDutyIndents(filtered);
      setDutyIndentsLoading(false);
    }, () => { setDutyIndents([]); setDutyIndentsLoading(false); });
    return () => unsub();
  }, [hodDepartment]);

  const handleApproveActivity = async (act) => {
    if (!act) return;
    setIsActioning(true);
    try {
      const docRef = doc(db, act.isStep ? "step_activities" : "activity_entries", act.id);
      await setDoc(docRef, {
        status: "Approved",
        comments: "Approved by Academic Coordinator",
        reviewedBy: currentUid || "",
        reviewedByName: hodName || "Academic Coordinator",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity approved successfully!");
      setReviewActivity(null);
      setShowActivityModal(false);
    } catch (err) {
      console.error("Error approving activity:", err);
      alert("Failed to approve activity.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturnActivity = async (act) => {
    if (!act) return;
    if (!returnComment.trim()) {
      alert("Please enter comments explaining the corrections needed.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, act.isStep ? "step_activities" : "activity_entries", act.id);
      await setDoc(docRef, {
        status: "Returned",
        comments: returnComment,
        reviewedBy: currentUid || "",
        reviewedByName: hodName || "Academic Coordinator",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity returned for correction.");
      setReviewActivity(null);
      setShowActivityModal(false);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error returning activity:", err);
      alert("Failed to return activity.");
    } finally {
      setIsActioning(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  const [courseWeightageData, setCourseWeightageData] = useState({});

  useEffect(() => {
    const wRef = collection(db, 'course_type_weightage');
    const unsub = onSnapshot(wRef, (snap) => {
      const data = {};
      snap.forEach(doc => { data[doc.id] = doc.data(); });
      setCourseWeightageData(data);
    }, (err) => {
      console.warn('course_type_weightage listener error:', err);
      setCourseWeightageData({});
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const ciaRef = collection(db, 'cia_configs');
    const unsubscribe = onSnapshot(ciaRef, (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data(); });
      setCiaConfigs(data);
    }, (err) => {
      console.warn('cia_configs listener error:', err);
      setCiaConfigs({});
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
            console.log('[AcademicCoordinatorDashboard] User doc fields:', Object.keys(ud).join(', '), '| Full:', ud);
            setCurrentHodSignature(ud.signatureUrl || '');
            setHodName(ud.facultyName || ud.displayName || ud.email || "Academic Coordinator");
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

  const dutyFacultyList = useMemo(() => {
    const adminEmails = [import.meta.env.VITE_MASTER_ADMIN_EMAIL, import.meta.env.VITE_DEFAULT_ADMIN_EMAIL]
      .map(e => String(e || '').toLowerCase().trim())
      .filter(Boolean);
    return Object.entries(usersMap || {})
      .map(([uid, u]) => ({ uid, ...(u || {}) }))
      .filter(u => u.isApproved === true || u.isApproved === 'Approved' || u.status === 'Approved')
      .filter(u => isDeptMatch(u.department, hodDepartment))
      .filter(u => !adminEmails.includes(String(u.email || '').toLowerCase().trim()))
      .filter(u => String(u.role || '').toLowerCase() !== 'student')
      .sort((a, b) => String(a.facultyName || a.displayName || a.name || '').localeCompare(String(b.facultyName || b.displayName || b.name || '')));
  }, [usersMap, hodDepartment]);

  const handleToggleAlloc = (wf) => {
    if (allocWfId === wf.id) { setAllocWfId(null); setAllocSelected([]); return; }
    const entry = Object.entries(wf.deptQuotas || {}).find(([k]) => isDeptMatch(k, hodDepartment));
    setAllocSelected((entry && entry[1]?.nominatedFacultyIds) || []);
    setAllocWfId(wf.id);
  };

  const handleSaveAlloc = async (wf) => {
    if (!allocSelected.length) { alert("Select at least one faculty to nominate."); return; }
    try {
      setAllocSaving(true);
      const entry = Object.entries(wf.deptQuotas || {}).find(([k]) => isDeptMatch(k, hodDepartment));
      const quotaKey = entry ? entry[0] : null;
      if (!quotaKey) { alert("Department quota not found for this indent."); return; }
      const rosterRef = doc(db, 'exam_cell_settings', 'faculty_duty_roster');
      const snap = await getDoc(rosterRef);
      const data = snap.exists() ? snap.data() : {};
      const workflows = Array.isArray(data.dutyWorkflows) ? data.dutyWorkflows.map(w => ({ ...w, deptQuotas: { ...(w.deptQuotas || {}) } })) : [];
      const updated = workflows.map(w => {
        if (String(w.id) === String(wf.id)) {
          const deptQuotas = { ...w.deptQuotas };
          deptQuotas[quotaKey] = {
            ...(deptQuotas[quotaKey] || {}),
            department: quotaKey,
            requiredCount: deptQuotas[quotaKey]?.requiredCount || wf.deptQuotas?.[quotaKey]?.requiredCount || allocSelected.length,
            nominatedFacultyIds: allocSelected,
            hodStatus: allocSelected.length >= (deptQuotas[quotaKey]?.requiredCount || allocSelected.length) ? 'Nominated' : 'Pending',
            hodRemarks: 'Faculty nominated from AC dashboard',
            nominatedAt: new Date().toISOString(),
          };
          return { ...w, deptQuotas, status: 'Nominations In Progress' };
        }
        return w;
      });
      await setDoc(rosterRef, { dutyWorkflows: updated }, { merge: true });
      setAllocWfId(null);
      setAllocSelected([]);
      alert("Faculty nominated successfully!");
    } catch (err) {
      console.error("Failed to save faculty nomination:", err);
      alert("Could not save nominations. Check Firestore permissions.");
    } finally {
      setAllocSaving(false);
    }
  };

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
        Object.entries(data).forEach(([compositeKey, docData]) => {
          if (!docData || typeof docData !== 'object') return;
          // Flat-doc QP (top-level payload after 1MB fallback): push the whole
          // doc — mirroring FacultyDashboard. Without this the forwarded paper
          // fragments into scalar fields and never matches the filter below.
          const isFlatDoc = docData.subject || docData.subject_code || docData.parts || docData.assignment_config || docData.qpaper_name;
          if (isFlatDoc) {
            all.push({
              ...docData,
              id: docData.id || docData.qpId || 'Exam',
              compositeKey,
              _isFlatDoc: true
            });
          } else {
            Object.entries(docData).forEach(([vId, qp]) => {
              if (qp && typeof qp === 'object' && !Array.isArray(qp)) {
                if (qp.subject || qp.subject_code || qp.parts || qp.assignment_config || qp.status || qp.created_by) {
                  all.push({ ...qp, id: vId, compositeKey, _isFlatDoc: false });
                }
              }
            });
          }
        });
        const myUid = String(currentUid || '').trim();
        const forwarded = all
          .filter((qp) => String(qp?.status || '').toLowerCase().trim() === "forwarded" && qp?.forwarded_to && String(qp.forwarded_to).trim() === myUid)
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

  const updateApprovedStudents = useCallback(() => {
    const assignedMap = assignedStudentsMapRef.current || {};
    const seenRegs = new Set();
    const all = [];

    // 1) From approved_admissions
    (rawApprovedSnapDataRef.current || []).forEach(({ docId, data }) => {
      const metaDept = data._meta?.department || "";
      let batch = data._meta?.batch || "";
      if (!batch) {
        const bm = docId.match(/(\d{4}-\d{4})/);
        if (bm) batch = bm[1];
      }
      const progKey = data._meta?.programme || (docId.includes('_PG_') ? 'PG' : 'UG');

      Object.entries(data).forEach(([key, val]) => {
        if (key === '_order' || key.startsWith('_')) return;
        if (assignedMap[key]) return; // already in a section
        if (seenRegs.has(key)) return;
        seenRegs.add(key);

        const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
        all.push({
          reg: key,
          name,
          batch: batch || "2026-2028",
          programme: progKey,
          department: metaDept,
          docId,
          source: 'approved_admissions',
          raw: typeof val === 'object' && val !== null ? val : {}
        });
      });
    });

    // 2) From admitted enquiries (status Approved or Admitted)
    (rawEnquiriesSnapDataRef.current || []).forEach(enq => {
      const reg = enq.applicationNo || enq.enquiryId || enq.id;
      if (!reg) return;
      if (enq.section) return; // already allotted
      if (assignedMap[reg]) return; // already in students section doc
      if (seenRegs.has(reg)) return;
      seenRegs.add(reg);

      const enqDept = enq.department || enq.departmentName || "";
      const name = [enq.firstName, enq.lastName].filter(Boolean).join(" ").trim() || enq.studentName || "-";
      const rawProg = enq.programme || "";
      const isPG = /pg|mba|mca|me|mtech/i.test(rawProg) || /business\s+administration|management/i.test(enqDept);
      const progKey = isPG ? "PG" : "UG";

      let batch = enq.batch || "";
      if (!batch || !batch.includes("-")) {
        const yearMatch = String(reg || enq.enquiryDate || enq.admissionDate || new Date().getFullYear()).match(/\d{4}/);
        const startYear = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
        const duration = progKey === "PG" ? 2 : 4;
        batch = `${startYear}-${startYear + duration}`;
      }

      const cleanBatch = String(batch).replace(/[.#$[\]/]/g, '_');
      const cleanDept = String(enqDept || "Department").replace(/[.#$[\]/]/g, '_');
      const docId = `${cleanBatch}_${progKey}_${cleanDept}`;

      all.push({
        reg,
        name,
        batch,
        programme: progKey,
        department: enqDept,
        docId,
        source: 'enquiries',
        enquiryDocId: enq.id || enq.enquiryId,
        raw: enq
      });
    });

    // 3) From unassigned students doc (written without section)
    (rawUnassignedStudentsSnapDataRef.current || []).forEach(({ docId, data }) => {
      const metaDept = data._meta?.department || "";
      let batch = data._meta?.batch || "";
      if (!batch) {
        const bm = docId.match(/(\d{4}-\d{4})/);
        if (bm) batch = bm[1];
      }
      const progKey = data._meta?.programme || (docId.includes('_PG_') ? 'PG' : 'UG');

      Object.entries(data).forEach(([key, val]) => {
        if (key.startsWith('_')) return;
        if (assignedMap[key]) return;
        if (seenRegs.has(key)) return;
        seenRegs.add(key);

        const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
        all.push({
          reg: key,
          name,
          batch: batch || "2026-2028",
          programme: progKey,
          department: metaDept,
          docId,
          source: 'students',
          raw: typeof val === 'object' && val !== null ? val : {}
        });
      });
    });

    all.sort((a, b) => String(a.reg).localeCompare(String(b.reg), undefined, { numeric: true, sensitivity: 'base' }));
    setRawApprovedCandidates(all);

    let filtered = all;
    if (hodDepartment) {
      filtered = all.filter(c => {
        return isDeptMatch(c.department, hodDepartment) || (c.docId && isDeptMatch(c.docId, hodDepartment));
      });
    }
    setApprovedStudentsList(filtered);
    setStudentsLoading(false);
  }, [hodDepartment]);

  // Reactive re-filter when hodDepartment or candidates change
  useEffect(() => {
    if (hodDepartment) {
      setApprovedStudentsList(rawApprovedCandidates.filter(c => {
        return isDeptMatch(c.department, hodDepartment) || (c.docId && isDeptMatch(c.docId, hodDepartment));
      }));
    } else {
      setApprovedStudentsList(rawApprovedCandidates);
    }
  }, [hodDepartment, rawApprovedCandidates]);

  // Listener 1: approved_admissions
  useEffect(() => {
    setStudentsLoading(true);
    const unsub = onSnapshot(
      collection(db, 'approved_admissions'),
      (snap) => {
        const list = [];
        snap.forEach(docSnap => {
          list.push({ docId: docSnap.id, data: docSnap.data() });
        });
        rawApprovedSnapDataRef.current = list;
        updateApprovedStudents();
      },
      (err) => {
        console.warn("Error loading approved_admissions:", err);
        rawApprovedSnapDataRef.current = [];
        updateApprovedStudents();
      }
    );
    return () => unsub();
  }, [updateApprovedStudents]);

  // Listener 2: enquiries (status in ['Approved', 'Admitted'])
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'enquiries'), where('status', 'in', ['Approved', 'Admitted'])),
      (snap) => {
        const list = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        rawEnquiriesSnapDataRef.current = list;
        updateApprovedStudents();
      },
      (err) => {
        console.warn("Error loading admitted enquiries:", err);
        rawEnquiriesSnapDataRef.current = [];
        updateApprovedStudents();
      }
    );
    return () => unsub();
  }, [updateApprovedStudents]);

  // Listener 3: students collection (tracks section assignments and unassigned docs)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const map = {};
      const assignedMap = {};
      const unassignedList = [];
      snap.forEach(docSnap => {
        const docId = docSnap.id;
        const isSectionDoc = /_Sec-[A-Za-z0-9]+/i.test(docId);
        const data = docSnap.data();
        if (!isSectionDoc) {
          unassignedList.push({ docId, data });
        }
        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
          if (name && typeof name === 'string') {
            map[key] = name;
            if (isSectionDoc) assignedMap[key] = docId;
          }
        });
      });
      setAllStudentNames(map);
      assignedStudentsMapRef.current = assignedMap;
      rawUnassignedStudentsSnapDataRef.current = unassignedList;
      updateApprovedStudents();
    }, () => {
      setAllStudentNames({});
      assignedStudentsMapRef.current = {};
      rawUnassignedStudentsSnapDataRef.current = [];
      updateApprovedStudents();
    });
    return () => unsub();
  }, [updateApprovedStudents]);

  // Fetch section-assigned students per batch for this dept
  useEffect(() => {
    if (!hodDepartment) { setSectionStudents([]); return; }
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
        const docId = docSnap.id;
        if (!/_Sec-[A-Za-z0-9]+/i.test(docId)) return;
        const data = docSnap.data();

        let deptMatch = false;
        if (data._meta?.department) {
          deptMatch = isDeptMatch(data._meta.department, hodDepartment);
        }
        if (!deptMatch) {
          deptMatch = isDeptMatch(docId, hodDepartment);
        }
        if (!deptMatch) return;

        let batch = "";
        const batchMatch = docId.match(/(\d{4}-\d{4})/);
        if (batchMatch) batch = batchMatch[1];

        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
          if (name && typeof name === 'string') list.push({
            reg: key,
            name,
            batch,
            docId,
            raw: typeof val === 'object' && val !== null ? val : {}
          });
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
    }, (err) => {
      console.warn('batch_sections listener error:', err);
      setSectionConfigs({});
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      const configs = [];
      snap.forEach(d => { configs.push({ id: d.id, ...d.data() }); });
      setSemesterConfigs(configs);
    }, (err) => {
      console.warn('semester_config listener error:', err);
      setSemesterConfigs([]);
    });
    return () => unsub();
  }, []);

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
    }, (err) => {
      console.warn('academic_calendar_events listener error:', err);
      setAcademicEvents({});
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'department_metadata'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setDeptMetadata(data);
      setDeptMetadataLoaded(true);
    }, (err) => {
      console.warn('department_metadata listener error:', err);
      setDeptMetadata({});
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

      // Pro-Level Fast-Path Attendance Resolver:
      // 1. Probes the canonical defaultDocId first (covers ~98% of subjects in 1 read).
      // 2. Checks baseDocId if section was given.
      // 3. Only falls back to candidate aliases if primary doc is missing.
      // 4. Uses shared in-memory document cache to avoid re-fetching unchanged docs.
      const fetchSubjectAttendance = async (a) => {
        const sectionSuffix = a.section ? `_${sanitizeKey(a.section)}` : "";
        const defaultDocId = `${a.progKey}_${a.attDeptKey}_${sanitizeKey(a.batch)}_${sanitizeKey(a.ay)}_${a.sem}_${a.subjectCode}${sectionSuffix}`;
        let attRecords = {};
        let finalDocId = defaultDocId;

        // FAST-PATH 1: Check canonical defaultDocId first
        const primary = await getCachedAttendanceDoc(db, defaultDocId);
        if (primary.exists && Object.keys(primary.records).length > 0) {
          attRecords = primary.records;
          return { ...a, attRecords, facultyUid: a.uid, attDocId: finalDocId };
        }

        // FAST-PATH 2: If a section was given, check counterpart without section
        if (a.section) {
          const baseDocId = `${a.progKey}_${a.attDeptKey}_${sanitizeKey(a.batch)}_${sanitizeKey(a.ay)}_${a.sem}_${a.subjectCode}`;
          const baseEntry = await getCachedAttendanceDoc(db, baseDocId);
          if (baseEntry.exists && Object.keys(baseEntry.records).length > 0) {
            attRecords = baseEntry.records;
            finalDocId = baseDocId;
            return { ...a, attRecords, facultyUid: a.uid, attDocId: finalDocId };
          }
        }

        // TARGETED FALLBACK: Only if primary doc is missing or empty, probe top 4 candidates
        const candidateDocIds = getAllCandidateAttendanceDocIds({
          programme: a.progKey || hodProgramme,
          department: a.attDeptKey || hodDepartment,
          batch: a.batch,
          academicYear: a.ay,
          semester: a.sem,
          subjectCode: a.subjectCode,
          section: a.section || ''
        });

        const fallbackIds = candidateDocIds.filter(id => id !== defaultDocId).slice(0, 4);
        for (const fbId of fallbackIds) {
          const fbEntry = await getCachedAttendanceDoc(db, fbId);
          if (fbEntry.exists && Object.keys(fbEntry.records).length > 0) {
            attRecords = fbEntry.records;
            finalDocId = fbId;
            break;
          }
        }

        return { ...a, attRecords, facultyUid: a.uid, attDocId: finalDocId };
      };

      const syllabusPromise = fetchAllCourseNamesMap().catch(e => {
        console.warn('[AttendanceOverview] course names fetch error:', e);
        return {};
      });

      // Controlled parallel batching (chunks of 10) to prevent browser network socket exhaustion
      const BATCH_SIZE = 10;
      const results = [];
      for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const chunk = unique.slice(i, i + BATCH_SIZE);
        const chunkResults = await Promise.all(chunk.map(fetchSubjectAttendance));
        results.push(...chunkResults);
      }

      const nameMap = await syllabusPromise;

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
  }, [hodDepartment, hodProgramme, currentUid, deptMetadata, deptMetadataLoaded, reloadAttendanceTrigger]);

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

  const attendanceDateEvents = useMemo(() => academicEvents[attendanceDate] || [], [academicEvents, attendanceDate]);
  const attendanceDateIsHoliday = useMemo(() => attendanceDateEvents.some(e => e.type === 'Holiday'), [attendanceDateEvents]);
  const attendanceDateIsSunday = useMemo(() => new Date(attendanceDate + 'T00:00:00').getDay() === 0, [attendanceDate]);

  const availablePeriods = useMemo(() => Array.from({ length: 8 }, (_, i) => String(i + 1)), []);

  const [detailModal, setDetailModal] = useState({ open: false, title: '', students: [] });
  const [subjectEnrollments, setSubjectEnrollments] = useState({}); // enrolDocId → Set<regNo>

  // Load course enrollment data for all subjects in attendance overview (backward compat)
  useEffect(() => {
    const items = Object.values(resolvedAttendanceOverview).flat();
    if (items.length === 0) { setSubjectEnrollments({}); return; }
    let cancelled = false;
    const fetchEnrollments = async () => {
      const map = {};
      await Promise.all(items.map(async (item) => {
        const enrolDocId = `${item.progKey}_${sanitizeKey(item.attDeptKey)}_${sanitizeKey(item.batch)}_${sanitizeKey(item.ay)}_${item.sem}_${sanitizeKey(item.subjectCode)}`;
        try {
          const snap = await getDoc(doc(db, 'course_enrolments', enrolDocId));
          if (snap.exists()) {
            const data = snap.data();
            map[enrolDocId] = new Set(Object.keys(data).filter(k => data[k]));
          }
        } catch (e) { /* enrollment doc may not exist */ }
      }));
      if (!cancelled) setSubjectEnrollments(map);
    };
    fetchEnrollments();
    return () => { cancelled = true; };
  }, [resolvedAttendanceOverview]);

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
    const isHoliday = academicEvents[attendanceDate]?.some(e => e.type === 'Holiday');
    if (dayName === 'Sunday' || isHoliday) {
      Object.entries(resolvedAttendanceOverview).forEach(([batch, items]) => {
        result[batch] = { items: [], section: items[0]?.section || '', sem: items[0]?.sem || '', hasTimetable: false, isHoliday: true };
      });
      return result;
    }
    Object.entries(resolvedAttendanceOverview).forEach(([batch, items]) => {
      const rows = [];
      let daySchedule = (timetableAllocation[batch] || {})[dayName];
      // Expand continuous periods into individual entries
      if (daySchedule) {
        const expanded = {};
        Object.entries(daySchedule).forEach(([period, rawEntries]) => {
          const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
          entries.forEach(entry => {
            const parts = String(entry || '').split('|');
            const code = parts[0].trim();
            const span = parseInt(parts[1], 10) || 1;
            if (!code) return;
            for (let p = parseInt(period), end = p + span; p < end; p++) {
              const pStr = String(p);
              if (!expanded[pStr]) expanded[pStr] = [];
              if (!expanded[pStr].includes(code)) expanded[pStr].push(code);
            }
          });
        });
        daySchedule = expanded;
      }
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
            // Filter by course enrollment for backward compat (old data may include non-enrolled students)
            const subj = actualItem || item;
            if (!subj) { console.warn('[AcademicCoordinatorDash] No matching subject for timetable entry:', { code, period: attendanceDate + '_P' + period, batch }); return null; }
            const enrolDocId = `${subj.progKey}_${sanitizeKey(subj.attDeptKey)}_${sanitizeKey(subj.batch)}_${sanitizeKey(subj.ay)}_${subj.sem}_${sanitizeKey(subj.subjectCode)}`;
            const enrolledSet = subjectEnrollments[enrolDocId];
            const entries2 = Object.entries(stuMap).filter(([reg]) => !enrolledSet || enrolledSet.has(reg));
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
                subjectCode: rec?.isEvent ? '-' : subjectCode,
                subjectName: rec?.isEvent ? (rec?.eventName || 'Event') : subjectName,
                section, facultyName,
                presentCount: present.length, absentCount: absent.length, odCount: od.length,
                presentStudents: present, absentStudents: absent, odStudents: od,
                substituteFaculty, substituteSubjectCode,
                isEvent: rec?.isEvent || false,
              });
            } else {
              rows.push({
                period, hasRecord: false,
                subjectCode, subjectName,
                section, facultyName,
                presentCount: 0, absentCount: 0, odCount: 0,
                presentStudents: [], absentStudents: [], odStudents: [],
                substituteFaculty: '', substituteSubjectCode: '',
                isEvent: false,
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
                  subjectCode: rec?.isEvent ? '-' : item.subjectCode,
                  subjectName: rec?.isEvent ? (rec?.eventName || 'Event') : item.subjectName,
                  section: item.section, facultyName: item.facultyName,
                  presentCount: present.length, absentCount: absent.length, odCount: od.length,
                  presentStudents: present, absentStudents: absent, odStudents: od,
                  substituteFaculty, substituteSubjectCode: '',
                  isEvent: rec?.isEvent || false,
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
                subjectCode: rec?.isEvent ? '-' : item.subjectCode,
                subjectName: rec?.isEvent ? (rec?.eventName || 'Event') : item.subjectName,
                section: item.section, facultyName: item.facultyName,
                presentCount: present.length, absentCount: absent.length, odCount: od.length,
                presentStudents: present, absentStudents: absent, odStudents: od,
                substituteFaculty, substituteSubjectCode: '',
                isEvent: rec?.isEvent || false,
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
  }, [resolvedAttendanceOverview, attendanceDate, availablePeriods, timetableAllocation, activeSemesters, usersMap, academicEvents]);

  // Available batches for HOD
  const availableReportBatches = useMemo(() => {
    return Object.keys(attendanceWithPeriods).sort();
  }, [attendanceWithPeriods]);

  // Available sections for chosen batch
  const availableReportSections = useMemo(() => {
    if (!reportBatch) return [];
    const sections = new Set();
    sectionStudents.forEach(s => {
      if (s.batch === reportBatch) {
        const parts = s.docId.split('_');
        const secPart = parts.find(p => p.startsWith('Sec-'));
        if (secPart) sections.add(secPart);
      }
    });
    return [...sections].sort();
  }, [reportBatch, sectionStudents]);

  const reportBatchItems = useMemo(() => resolvedAttendanceOverview[reportBatch] || [], [resolvedAttendanceOverview, reportBatch]);

  // Compute the semester number for a SPECIFIC batch from its semester_config,
  // using the same formula as AcademicCalendar (batch start year + config dates).
  // Stored cfg.semesterNumber is computed from the config's FIRST batch only, so it is
  // wrong for other batches sharing the same config — always recompute per batch.
  const semesterNumFor = useCallback((batch, cfg) => {
    if (!batch || !cfg || !cfg.startDate) return cfg?.semesterNumber || cfg?.semester || undefined;
    const batchStart = parseInt(String(batch).split('-')[0], 10);
    const startYear = new Date(cfg.startDate).getFullYear();
    if (!batchStart || !startYear) return cfg?.semesterNumber || cfg?.semester || undefined;
    const isOdd = cfg.semesterType !== 'Even';
    const academicYearStart = isOdd ? startYear : startYear - 1;
    const yearNumber = academicYearStart - batchStart + 1;
    if (yearNumber < 1) return cfg?.semesterNumber || cfg?.semester || undefined;
    const base = (yearNumber - 1) * 2;
    return String(isOdd ? base + 1 : base + 2);
  }, []);

  const availableReportAcademicYears = useMemo(() => {
    if (!reportBatch) return [];
    const fromItems = [...new Set(reportBatchItems.map(i => i.ay).filter(Boolean))];
    const fromConfigs = semesterConfigs
      .filter(cfg => (Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch]).some(b => String(b) === reportBatch))
      .map(c => c.academicYear)
      .filter(Boolean);
    return [...new Set([...fromItems, ...fromConfigs])].sort();
  }, [reportBatch, reportBatchItems, semesterConfigs]);

  const availableReportSemesters = useMemo(() => {
    if (!reportBatch || !reportAcademicYear) return [];
    const fromItems = [...new Set(reportBatchItems.filter(i => i.ay === reportAcademicYear).map(i => i.sem).filter(Boolean))];
    const fromConfigs = semesterConfigs
      .filter(cfg =>
        (Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch]).some(b => String(b) === reportBatch) &&
        cfg.academicYear === reportAcademicYear
      )
      .map(c => semesterNumFor(reportBatch, c))
      .filter(Boolean);
    return [...new Set([...fromItems, ...fromConfigs])].sort((a, b) => parseInt(a) - parseInt(b));
  }, [reportBatch, reportAcademicYear, reportBatchItems, semesterConfigs, semesterNumFor]);

  const availableReportSubjects = useMemo(() => {
    if (!reportBatch || !reportSemester) return [];
    const filtered = reportBatchItems.filter(item => {
      if (item.sem !== reportSemester) return false;
      if (reportSection && item.section && item.section !== reportSection) return false;
      return true;
    });
    const unique = [];
    const seen = new Set();
    filtered.forEach(item => {
      const code = item.subjectCode;
      if (!seen.has(code)) {
        seen.add(code);
        const name = subjectNamesMap[code] || item.subjectName || code;
        unique.push({ code, name });
      }
    });
    return unique.sort((a, b) => a.code.localeCompare(b.code));
  }, [reportBatch, reportSemester, reportSection, reportBatchItems, subjectNamesMap]);

  const availableReportExams = useMemo(() => {
    if (!reportSemester) return [];
    const ciaArray = Array.isArray(ciaConfigs) ? Object.values(ciaConfigs) : Object.values(ciaConfigs || {});
    const exams = [];
    const seen = new Set();
    ciaArray.forEach(cfg => {
      if (!cfg) return;
      if (cfg.isPractical || cfg.isAssignment || cfg.isActivity || cfg.isProject || cfg.isIndirectAssessment || cfg.isUniversity) return;
      const examName = cfg.examName || cfg.exam_name || cfg.name || '';
      if (!examName || seen.has(examName)) return;
      const cfgSem = deriveIAReportSemesterNumber(cfg.semester);
      if (cfgSem && cfgSem !== Number(reportSemester)) return;
      seen.add(examName);
      const maxForExam = resolveExamMaxMark(ciaConfigs, examName, reportAcademicYear, null, courseWeightageData);
      exams.push({ id: cfg.id || examName, name: examName, totalMarks: maxForExam });
    });
    if (exams.length === 0) {
      ['IA 1', 'IA 2', 'IA 3', 'Model Exam'].forEach(name => {
        const maxForExam = resolveExamMaxMark(ciaConfigs, name, reportAcademicYear, null, courseWeightageData);
        exams.push({ id: name, name, totalMarks: maxForExam });
      });
    }
    return exams;
  }, [ciaConfigs, reportSemester, reportAcademicYear, courseWeightageData]);

  // Determine current academic year (Jul→Dec = current+next, Jan→Jun = prev-current)
  const currentAcademicYear = useMemo(() => {
    const today = new Date();
    const m = today.getMonth() + 1;
    const y = today.getFullYear();
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }, []);

  useEffect(() => {
    if (semesterConfigs.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const activeCfg = semesterConfigs.find(cfg => {
        if (!cfg.startDate || !cfg.endDate) return false;
        return today >= cfg.startDate && today <= cfg.endDate;
      });
      if (activeCfg) {
        const batches = Array.isArray(activeCfg.batch) ? activeCfg.batch : [activeCfg.batch];
        const firstBatch = batches[0] || "";
        if (firstBatch && !reportBatch) {
          setReportBatch(firstBatch);
        }
        if (activeCfg.academicYear && !reportAcademicYear) {
          setReportAcademicYear(activeCfg.academicYear);
        }
        if (!reportSemester) {
          const sem = semesterNumFor(firstBatch, activeCfg);
          if (sem) setReportSemester(sem);
        }
      } else {
        if (availableReportBatches.length > 0 && !reportBatch) {
          setReportBatch(availableReportBatches[0]);
        }
      }
    }
  }, [semesterConfigs, availableReportBatches, semesterNumFor]);

  useEffect(() => {
    if (!reportBatch) return;
    const today = new Date().toISOString().split('T')[0];
    const batchConfigs = semesterConfigs.filter(cfg => {
      const batches = Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch];
      return batches.some(b => String(b) === reportBatch);
    });
    // Prefer the active (today) config for this batch, else current academic year
    const activeCfg = batchConfigs.find(cfg => today >= cfg.startDate && today <= cfg.endDate);
    const targetAY = activeCfg?.academicYear
      || (availableReportAcademicYears.includes(currentAcademicYear) ? currentAcademicYear : undefined)
      || (batchConfigs.map(c => c.academicYear).filter(Boolean).sort().slice(-1)[0])
      || (reportBatchItems.map(i => i.ay).filter(Boolean).sort().slice(-1)[0]);
    if (targetAY) {
      setReportAcademicYear(targetAY);
      const aySems = availableReportSemesters.length > 0
        ? [...new Set([...(batchConfigs.filter(c => c.academicYear === targetAY).map(c => semesterNumFor(reportBatch, c)).filter(Boolean)),
        ...reportBatchItems.filter(i => i.ay === targetAY).map(i => i.sem).filter(Boolean)])].sort((a, b) => parseInt(a) - parseInt(b))
        : [];
      const activeSem = batchConfigs.find(c => c.academicYear === targetAY && today >= c.startDate && today <= c.endDate);
      const targetSem = activeSem
        ? semesterNumFor(reportBatch, activeSem)
        : (aySems.length > 0 ? aySems[aySems.length - 1] : undefined);
      if (targetSem) setReportSemester(targetSem);
    }
  }, [reportBatch, semesterConfigs, availableReportAcademicYears, availableReportSemesters, reportBatchItems, currentAcademicYear, semesterNumFor]);

  useEffect(() => {
    if (reportBatch && reportAcademicYear) {
      const today = new Date().toISOString().split('T')[0];
      const batchAYConfigs = semesterConfigs.filter(cfg =>
        (Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch]).some(b => String(b) === reportBatch) && cfg.academicYear === reportAcademicYear
      );
      const itemSems = [...new Set(reportBatchItems.filter(i => i.ay === reportAcademicYear).map(i => i.sem).filter(Boolean))];
      const uniqueSems = [...new Set([...batchAYConfigs.map(c => semesterNumFor(reportBatch, c)), ...itemSems].filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));
      const activeCfg = batchAYConfigs.find(cfg => today >= cfg.startDate && today <= cfg.endDate);
      const targetSem = activeCfg ? semesterNumFor(reportBatch, activeCfg)
        : (uniqueSems.includes(semesterNumFor(reportBatch, batchAYConfigs[0])) ? semesterNumFor(reportBatch, batchAYConfigs[0]) : (uniqueSems[uniqueSems.length - 1]));
      if (uniqueSems.length > 0 && targetSem) {
        setReportSemester(prev => (prev && uniqueSems.includes(prev)) ? prev : targetSem);
      }
    }
  }, [reportAcademicYear, reportBatch, semesterConfigs, reportBatchItems, semesterNumFor]);

  // Date range allowed by semester_config (AcademicCalendar) for the selected batch
  // Reuses activeSemesters (filtered by today's date, same as attendance status)
  const reportDateRange = useMemo(() => {
    const active = activeSemesters.filter(cfg => {
      if (!reportBatch) return true;
      const batches = Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch];
      return batches.some(b => String(b) === reportBatch);
    });
    let min = null;
    let max = null;
    active.forEach(cfg => {
      if (!min || cfg.startDate < min) min = cfg.startDate;
      if (!max || cfg.endDate > max) max = cfg.endDate;
    });
    return { min, max };
  }, [activeSemesters, reportBatch]);

  const reportDatesOutsideSemester = useMemo(() => {
    if (!reportDateRange.min || !reportDateRange.max) return false;
    return reportFromDate < reportDateRange.min || reportToDate > reportDateRange.max;
  }, [reportDateRange, reportFromDate, reportToDate]);

  // Clamp initial report dates into the semester-config range once configs load
  useEffect(() => {
    if (!reportDateRange.min || !reportDateRange.max) return;
    const todayStr = formatDateKey(new Date());
    const validMax = todayStr <= reportDateRange.max ? todayStr : reportDateRange.max;
    setReportFromDate(prev => (prev && prev >= reportDateRange.min && prev <= reportDateRange.max ? prev : reportDateRange.min));
    setReportToDate(prev => (prev && prev <= reportDateRange.max && prev >= reportDateRange.min ? prev : validMax));
  }, [reportDateRange]);

  // ═══ IA Consolidation Report — fetch non-OBE subject codes from syllabus_data ═══
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { collection, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const unsub = onSnapshot(collection(db, 'syllabus_data'), (snap) => {
          if (cancelled) return;
          const setOfCodes = new Set();
          snap.docs.forEach(doc => {
            const data = doc.data();
            const semesters = data.semesters || {};
            Object.values(semesters).forEach(subs => {
              const arr = Array.isArray(subs) ? subs : Object.values(subs);
              arr.forEach(sub => {
                if (sub && (sub.isNonOBE === true || sub.isNonOBE === 'true' || sub.nonObe === true || sub.isNonObe === true) && sub.code) {
                  setOfCodes.add(String(sub.code).trim().toUpperCase());
                }
              });
            });
          });
          if (!cancelled) setNonObeSubjectCodes(setOfCodes);
        }, err => console.warn('syllabus_data listener error:', err));
        return () => unsub();
      } catch (e) {
        console.warn('syllabus_data fetch error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ═══ IA Consolidation Report — load marks from Firestore (Exam mode) ═══
  useEffect(() => {
    if (!iaReportExam) { setIaReportData(null); return; }
    let cancelled = false;
    (async () => {
      setIaReportLoading(true);
      try {
        const { collection, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('../firebase');

        const colRef = collection(db, 'marks');

        const studentMap = new Map();
        sectionStudents.forEach(st => {
          if (!st.reg && !st.admNo) return;
          if (reportBatch && st.batch !== reportBatch) return;
          if (reportSection) {
            const stSec = st.docId?.split('_').find(p => p.startsWith('Sec-'));
            if (stSec && stSec !== reportSection) return;
          }
          const key = st.reg || st.admNo || '';
          if (key) {
            studentMap.set(key, {
              reg: st.reg || '',
              admNo: st.admNo || st.admissionNo || st.rollNo || '',
              admissionNo: st.admissionNo || '',
              rollNo: st.rollNo || '',
              uid: st.uid || '',
              name: st.name || allStudentNames[st.reg] || '',
              batch: st.batch || '',
              section: st.docId?.split('_').find(p => p.startsWith('Sec-')) || ''
            });
          }
        });

        const unsub = onSnapshot(colRef, async (snap) => {
          if (cancelled) return;

          const defaultExamMax = resolveExamMaxMark(ciaConfigs, iaReportExam, reportAcademicYear, null, courseWeightageData) || 100;

          const subjectMap = new Map();
          const subjectStudentScores = new Map();

          snap.docs.forEach(doc => {
            const meta = extractIAReportMarksMeta(doc);
            if (!iaReportMatchMeta(meta, { department: hodDepartment || '', batch: reportBatch, academicYear: reportAcademicYear, semester: reportSemester })) return;

            const docExamName = meta.examName || meta.exam || '';
            if (docExamName !== iaReportExam && doc.id !== iaReportExam) return;

            const rawSub = meta.subject || '';
            const subCode = parseIAReportSubjectCode(rawSub);
            if (!subCode) return;
            const normSubCode = String(subCode).trim().toUpperCase();

            // EXCLUDE NON-OBE SUBJECTS
            if (nonObeSubjectCodes.has(normSubCode)) return;

            const studentsObj = meta.students || {};
            const hasMarks = Object.values(studentsObj).some(val => val != null);
            if (!hasMarks) return;

            const maxForExam = resolveExamMaxMark(ciaConfigs, iaReportExam, reportAcademicYear, meta, courseWeightageData) || defaultExamMax;

            if (!subjectMap.has(subCode)) {
              const matchedSubject = availableReportSubjects.find(s => s.code === subCode);
              const subName = matchedSubject?.name || subjectNamesMap[subCode] || rawSub;
              subjectMap.set(subCode, { id: subCode, code: subCode, name: subName, max: maxForExam });
            } else {
              const existingSub = subjectMap.get(subCode);
              if (maxForExam && maxForExam > 0) {
                existingSub.max = maxForExam;
              }
            }

            if (!subjectStudentScores.has(subCode)) {
              subjectStudentScores.set(subCode, new Map());
            }
            const scoreMap = subjectStudentScores.get(subCode);

            Object.entries(studentsObj).forEach(([rawKey, val]) => {
              if (val == null) return;
              const normKey = String(rawKey).trim().toUpperCase();
              const { total, absent, hasRecord } = extractIAReportStudentTotal(val);
              if (!hasRecord) return;
              const isAb = Boolean(absent || (val && (val.absent || val.isAbsent || String(val.total || '').toUpperCase() === 'A' || String(val.mark || '').toUpperCase() === 'A' || String(val.score || '').toUpperCase() === 'A')));
              const existing = scoreMap.get(normKey);
              if (!existing || total > existing.score || (!isAb && existing.isAbsent)) {
                scoreMap.set(normKey, { score: total, max: maxForExam, isAbsent: isAb, hasRecord: true });
              }
            });
          });

          const subjectColumns = Array.from(subjectMap.values())
            .filter(sub => !nonObeSubjectCodes.has(String(sub.code).trim().toUpperCase()))
            .sort((a, b) => a.code.localeCompare(b.code));

          subjectColumns.forEach(sub => {
            if (!subjectStudentScores.has(sub.code)) {
              subjectStudentScores.set(sub.code, new Map());
            }
          });

          const studentData = [];
          studentMap.forEach((stInfo, key) => {
            const marks = {};
            let totalScored = 0;
            let totalMax = 0;
            let hasAnyRecord = false;
            let allAbsent = true;
            let hasAnyFail = false;

            subjectColumns.forEach(sub => {
              const scoreMap = subjectStudentScores.get(sub.code);
              const val = lookupStudentScoreInMap(scoreMap, stInfo, key);
              marks[sub.code] = val;
              if (val && val.hasRecord) {
                hasAnyRecord = true;
                const effMax = val.max || sub.max || defaultExamMax;
                if (!val.isAbsent) {
                  totalScored += val.score;
                  allAbsent = false;
                  if (val.score < effMax * 0.5) {
                    hasAnyFail = true;
                  }
                } else {
                  hasAnyFail = true;
                }
                totalMax += effMax;
              }
            });
            if (studentMap.size > 0) {
              const avgNum = totalMax > 0 ? (totalScored / totalMax) * 100 : 0;
              const isPass = hasAnyRecord && !allAbsent && !hasAnyFail && avgNum >= 50;
              studentData.push({
                reg: stInfo.reg || key,
                name: stInfo.name || allStudentNames[key] || '',
                marks,
                total: totalScored,
                max: totalMax,
                avg: totalMax > 0 ? avgNum.toFixed(1) : '0.0',
                status: !hasAnyRecord ? 'N/A' : (allAbsent ? 'ABSENT' : (isPass ? 'PASSED' : 'FAILED')),
                batch: stInfo.batch,
                section: stInfo.section
              });
            }
          });

          studentData.sort((a, b) => (a.reg || '').localeCompare(b.reg || '', undefined, { numeric: true }));

          // Calculate subject-wise statistics
          const subjectStats = {};
          subjectColumns.forEach(sub => {
            const scoreMap = subjectStudentScores.get(sub.code);
            let present = 0;
            let absent = 0;
            let pass = 0;
            let fail = 0;

            studentMap.forEach((stInfo, key) => {
              const val = lookupStudentScoreInMap(scoreMap, stInfo, key);
              if (!val || !val.hasRecord || val.isAbsent) {
                absent++;
              } else {
                present++;
                const effMax = val.max || sub.max || defaultExamMax;
                if (val.score >= effMax * 0.5) {
                  pass++;
                } else {
                  fail++;
                }
              }
            });

            const totalStr = studentData.length;
            const passPct = present > 0 ? ((pass / present) * 100).toFixed(2) : "0.00";

            subjectStats[sub.code] = {
              totalStrength: totalStr,
              presentCount: present,
              absentCount: absent,
              passCount: pass,
              failCount: fail,
              passPercentage: passPct
            };
          });

          let overallPresent = 0;
          let overallAbsent = 0;
          let overallPass = 0;
          let overallFail = 0;

          studentData.forEach(st => {
            if (st.status === 'PASSED') overallPass++;
            else if (st.status === 'FAILED') overallFail++;
            else if (st.status === 'ABSENT') overallAbsent++;

            if (st.status !== 'ABSENT' && st.status !== 'N/A') overallPresent++;
          });

          const overallPassPct = overallPresent > 0 ? ((overallPass / overallPresent) * 100).toFixed(2) : "0.00";

          const overallStats = {
            totalStrength: studentData.length,
            presentCount: overallPresent,
            absentCount: overallAbsent,
            passCount: overallPass,
            failCount: overallFail,
            passPercentage: overallPassPct
          };

          // Fetch Faculty Names for subjects from subject_assignments & users
          const facultyMap = {};
          try {
            const assignSnap = await getDocs(collection(db, 'subject_assignments'));
            const userSnap = await getDocs(collection(db, 'users'));
            const userNames = {};
            userSnap.forEach(d => {
              const ud = d.data();
              userNames[d.id] = ud?.facultyName || ud?.displayName || ud?.name || '';
            });

            assignSnap.forEach(doc => {
              const data = doc.data();
              Object.entries(data).forEach(([uid, subs]) => {
                if (Array.isArray(subs) && userNames[uid]) {
                  subs.forEach(s => {
                    const sCode = parseIAReportSubjectCode(s);
                    if (sCode) {
                      if (!facultyMap[sCode]) {
                        facultyMap[sCode] = userNames[uid];
                      } else if (!facultyMap[sCode].includes(userNames[uid])) {
                        facultyMap[sCode] += `, ${userNames[uid]}`;
                      }
                    }
                  });
                }
              });
            });
          } catch (err) {
            console.warn('Faculty map resolution error:', err);
          }

          setIaReportData({
            type: 'exam',
            students: studentData,
            columns: subjectColumns,
            exam: iaReportExam,
            batch: reportBatch,
            section: reportSection || 'All',
            academicYear: reportAcademicYear,
            semester: reportSemester,
            subjectStats,
            overallStats,
            facultyMap
          });
          setIaReportLoading(false);
        }, (error) => {
          console.warn('IA Report exam marks listener error:', error);
          if (!cancelled) setIaReportLoading(false);
        });

        return () => { cancelled = true; unsub(); };
      } catch (err) {
        console.error('IA Report error:', err);
        if (!cancelled) setIaReportLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [iaReportExam, reportBatch, reportAcademicYear, reportSemester, reportSection, hodDepartment, sectionStudents, allStudentNames, ciaConfigs, availableReportSubjects, subjectNamesMap, nonObeSubjectCodes, courseWeightageData]);

  const handleExportIAReportPDF = async () => {
    if (!iaReportData || !iaReportData.students || iaReportData.students.length === 0) return;

    try {
      const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;

      // Load logo from /logo.png
      const logoBase64 = await getBase64ImageFromUrl('/logo.png');
      let headerStartY = 10;

      if (logoBase64) {
        const logoWidth = 100;
        const logoHeight = 16;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(logoBase64, 'PNG', logoX, margin, logoWidth, logoHeight);
        headerStartY = margin + logoHeight + 4;
      }

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(18, 12, 122); // #120c7a
      const titleText = `IA CONSOLIDATION REPORT — ${iaReportExam || 'EXAM OVERVIEW'}`;
      doc.text(titleText, pageWidth / 2, headerStartY, { align: 'center' });

      // Metadata Subtitle
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      const metaText = `Department: ${hodDepartment || 'All'}   |   Batch: ${reportBatch || '—'}   |   Academic Year: ${reportAcademicYear || '—'}   |   Semester: ${reportSemester || '—'}   |   Section: ${reportSection || 'All'}`;
      doc.text(metaText, pageWidth / 2, headerStartY + 4.5, { align: 'center' });

      doc.setDrawColor(210, 210, 210);
      doc.line(margin, headerStartY + 7, pageWidth - margin, headerStartY + 7);

      // Table Header
      const head = [
        [
          'S.No',
          'Reg No',
          'Student Name',
          ...iaReportData.columns.map(col => `${col.code}\n(Max: ${col.max})`),
          'Status'
        ]
      ];

      // Table Body
      const body = iaReportData.students.map((st, idx) => {
        const row = [
          idx + 1,
          st.reg,
          st.name || '—'
        ];

        iaReportData.columns.forEach(col => {
          const key = iaReportData.type === 'exam' ? col.code : col.name;
          const val = st.marks[key];
          if (!val) {
            row.push('—');
          } else if (val.isAbsent) {
            row.push('AB');
          } else {
            row.push(String(val.score));
          }
        });

        row.push(st.status);
        return row;
      });

      // Table Footer (8 summary rows matching Image 3)
      const foot = [
        [
          { content: 'Total Strength', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: String(iaReportData.subjectStats?.[col.code]?.totalStrength ?? iaReportData.students.length), styles: { halign: 'center', fontStyle: 'bold' } })),
          { content: String(iaReportData.overallStats?.totalStrength ?? iaReportData.students.length), colSpan: 1, styles: { halign: 'center', fontStyle: 'bold' } }
        ],
        [
          { content: 'Number of Present', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: String(iaReportData.subjectStats?.[col.code]?.presentCount ?? 0), styles: { halign: 'center', fontStyle: 'bold' } })),
          { content: String(iaReportData.overallStats?.presentCount ?? 0), colSpan: 1, styles: { halign: 'center', fontStyle: 'bold' } }
        ],
        [
          { content: 'Number of Absent', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: String(iaReportData.subjectStats?.[col.code]?.absentCount ?? 0), styles: { halign: 'center', fontStyle: 'bold', textColor: [225, 29, 72] } })),
          { content: String(iaReportData.overallStats?.absentCount ?? 0), colSpan: 1, styles: { halign: 'center', fontStyle: 'bold', textColor: [225, 29, 72] } }
        ],
        [
          { content: 'Number of Pass', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: String(iaReportData.subjectStats?.[col.code]?.passCount ?? 0), styles: { halign: 'center', fontStyle: 'bold', textColor: [16, 185, 129] } })),
          { content: String(iaReportData.overallStats?.passCount ?? 0), colSpan: 1, styles: { halign: 'center', fontStyle: 'bold', textColor: [16, 185, 129] } }
        ],
        [
          { content: 'Number of Fail', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: String(iaReportData.subjectStats?.[col.code]?.failCount ?? 0), styles: { halign: 'center', fontStyle: 'bold', textColor: [225, 29, 72] } })),
          { content: String(iaReportData.overallStats?.failCount ?? 0), colSpan: 1, styles: { halign: 'center', fontStyle: 'bold', textColor: [225, 29, 72] } }
        ],
        [
          { content: 'Pass Percentage', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: `${iaReportData.subjectStats?.[col.code]?.passPercentage ?? "0.00"}%`, styles: { halign: 'center', fontStyle: 'bold', textColor: [67, 56, 202] } })),
          { content: `${iaReportData.overallStats?.passPercentage ?? "0.00"}%`, colSpan: 1, styles: { halign: 'center', fontStyle: 'bold', textColor: [67, 56, 202] } }
        ],
        [
          { content: 'Faculty Name', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(col => ({ content: iaReportData.facultyMap?.[col.code] || '—', styles: { halign: 'center', fontStyle: 'bold', fontSize: 6.5 } })),
          { content: '—', colSpan: 1, styles: { halign: 'center' } }
        ],
        [
          { content: 'Faculty Signature', colSpan: 3, styles: { halign: 'left', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          ...iaReportData.columns.map(() => ({ content: '', styles: { halign: 'center' } })),
          { content: '', colSpan: 1, styles: { halign: 'center' } }
        ]
      ];

      autoTable(doc, {
        startY: headerStartY + 10,
        head: head,
        body: body,
        foot: foot,
        showFoot: 'lastPage',
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          valign: 'middle',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [18, 12, 122],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 7
        },
        footStyles: {
          fillColor: [248, 250, 252],
          textColor: [30, 41, 59],
          fontSize: 6.5
        },
        didParseCell: function (data) {
          if (data.section === 'body') {
            const colIdx = data.column.index;
            if (colIdx >= 3 && colIdx < 3 + iaReportData.columns.length) {
              data.cell.styles.halign = 'center';
              const val = data.cell.raw;
              if (val === 'AB') {
                data.cell.styles.textColor = [225, 29, 72];
                data.cell.styles.fontStyle = 'bold';
              } else if (val !== '—') {
                const numVal = Number(val);
                const colObj = iaReportData.columns[colIdx - 3];
                if (colObj && numVal < colObj.max * 0.5) {
                  data.cell.styles.textColor = [225, 29, 72];
                } else {
                  data.cell.styles.textColor = [16, 185, 129];
                }
              }
            }
          }
        }
      });

      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error("PDF export error:", err);
    }
  };

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

  const resolveForwardedByName = (uid) => {
    if (!uid) return "-";
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || uid;
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

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t => {
        const p = parseSubjectField(t.subject);
        const subjCode = p.code || t.subject || '';
        const subjName = p.name || t.subject_name || '';
        return subjCode.toLowerCase().includes(q) ||
          subjName.toLowerCase().includes(q) ||
          (resolveForwardedByName(t.forwarded_by) || "").toLowerCase().includes(q) ||
          (resolveExamDisplay(t) || "").toLowerCase().includes(q);
      });
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

      // First priority for COs: use saved course_outcomes stored directly on the paper
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
        const snap = await getDoc(doc(db, 'users', selectedQP.forwarded_by));
        if (snap.exists()) setFacultySignatureForQP(snap.data().signatureUrl || '');
      }
      setSelectedQPHodSignature(selectedQP.hod_signature_url || '');
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    const acSig = qp?.ac_signature_url || qp?.academic_coordinator_signature_url || '';
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs, null, '', acSig);
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs]);

  // Resilient QP updater: if parent doc size > 1MB, automatically migrates set to a standalone flat doc
  const saveQPStatusUpdate = async (qp, updates) => {
    if (!qp) return;
    const isFlat = qp._isFlatDoc || (qp.id && String(qp.id).includes('__')) || String(qp.compositeKey || '').includes('__');
    const compKey = qp.compositeKey || qp.id;
    const sId = qp.id || 'Exam';
    const flatDocId = compKey.includes('__') ? compKey : `${compKey}__${sId}`;

    if (isFlat) {
      await setDoc(doc(db, 'generated_qps', flatDocId), updates, { merge: true });
      return;
    }

    try {
      await setDoc(doc(db, 'generated_qps', compKey), { [sId]: updates }, { merge: true });
    } catch (err) {
      const errStr = String(err?.message || err || '');
      const isSizeError = errStr.includes('exceeds the maximum allowed size') || errStr.includes('size') || errStr.includes('1,048,576') || errStr.includes('bytes');
      if (!isSizeError) {
        throw err;
      }
      console.warn(`[saveQPStatusUpdate] Parent document ${compKey} exceeds 1MB Firestore limit. Automatically extracting set ${sId} into standalone flat document ${flatDocId}...`);

      const sourceQP = (fullQPForModal && fullQPForModal.id === qp.id) ? { ...fullQPForModal, ...qp } : qp;
      const flatPayload = {
        ...sourceQP,
        ...updates,
        id: sId,
        compositeKey: compKey,
        _isFlatDoc: true
      };
      delete flatPayload.draft_html;

      await setDoc(doc(db, 'generated_qps', flatDocId), flatPayload, { merge: true });

      try {
        await updateDoc(doc(db, 'generated_qps', compKey), {
          [sId]: deleteField()
        });
        console.log(`[saveQPStatusUpdate] Successfully extracted and removed ${sId} from bloated parent doc ${compKey}.`);
      } catch (cleanErr) {
        console.warn(`[saveQPStatusUpdate] Parent doc field cleanup skipped:`, cleanErr);
      }
    }
  };

  const handleRevoke = async () => {
    if (!selectedQP || !recorrectComments.trim()) {
      showToast("Please provide comments for revoking the paper.", "error");
      return;
    }
    try {
      const now = new Date().toISOString();
      const updates = {
        status: 'recorrected',
        forwarded_to: selectedQP.forwarded_by,
        forwarded_by: null,
        ac_comments: recorrectComments.trim(),
        ac_signature_url: null,
        updated_at: now
      };
      await saveQPStatusUpdate(selectedQP, updates);

      // Notify the faculty (person below the Academic Coordinator in the chain)
      if (selectedQP.forwarded_by) {
        try {
          await addDoc(collection(db, 'notifications'), {
            type: 'qp_revoked',
            targetUid: selectedQP.forwarded_by,
            targetName: selectedQP.forwarded_by_name || "Faculty",
            subjectCode: selectedQP.code || selectedQP.subjectCode || '',
            subjectName: selectedQP.name || selectedQP.subjectName || selectedQP.subject || '',
            reason: recorrectComments.trim(),
            revokedBy: hodName || "Academic Coordinator",
            revokedByUid: currentUid,
            assignedBy: currentUid,
            createdAt: serverTimestamp(),
            read: false
          });
        } catch (err) {
          console.error("Error sending revoke notification:", err);
        }
      }

      showToast("Question paper revoked and sent back to the faculty.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
    } catch (error) {
      console.error("Error revoking paper:", error);
      showToast("Failed to revoke question paper.", "error");
    }
  };

  const handleMoveToHOD = async () => {
    if (!selectedQP) return;
    if (!currentHodSignature) {
      showToast("Please upload your digital signature in your profile before moving to HOD.", "error");
      return;
    }
    try {
      // Find HOD for the QP's department (or the coordinator's own department as fallback)
      let hodUid = null;
      let hodName = '';
      const hodDept = selectedQP.department || hodDepartment;
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        if (!usersSnapshot.empty) {
          const allUsers = {};
          usersSnapshot.forEach(d => { allUsers[d.id] = d.data(); });
          const norm = (v) => String(v || '').toLowerCase().replace(/[._\s]+/g, ' ').trim();
          const targetNorm = norm(hodDept);
          const hods = Object.values(allUsers).filter(
            user => user.role === 'HOD' && user.isApproved
          );
          const matched = hods.find(u => norm(u.department) === targetNorm) ||
            hods.find(u => norm(u.department).includes(targetNorm) || targetNorm.includes(norm(u.department)));
          if (matched) {
            hodUid = matched.uid;
            hodName = matched.name || matched.displayName || matched.facultyName || '';
          }
        }
      } catch (err) {
        console.error("Error finding HOD:", err);
      }

      if (!hodUid) {
        showToast(`No HOD found for ${hodDept}. Cannot move to HOD.`, "error");
        return;
      }

      const now = new Date().toISOString();
      const updates = {
        status: 'forwarded',
        forwarded_to: hodUid,
        forwarded_to_name: hodName || undefined,
        hod_name: hodName || undefined,
        forwarded_at: now,
        ac_approved: true,
        ac_approved_by: currentUid,
        ac_approved_at: now,
        ac_signature_url: currentHodSignature,
        ac_comments: null,
        updated_at: now
      };
      await saveQPStatusUpdate(selectedQP, updates);
      showToast("Question paper moved to HOD for review.", "success");
      setShowQPModal(false);
    } catch (error) {
      console.error("Error moving paper to HOD:", error);
      showToast("Failed to move question paper to HOD.", "error");
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

  // Typeset MathJax whenever the QP review modal opens (math equations stored as math-tex spans)
  useEffect(() => {
    if (!showQPModal || !(fullQPForModal || selectedQP)) return;
    const container = document.querySelector('.qp-print-wrapper');
    typesetMath(container);
  }, [showQPModal, fullQPForModal, selectedQP]);

  return (
    <Layout title="Academic Coordinator Dashboard">
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
                {taskCount > 0 ? (
                  <>
                    You have <strong className="text-white font-bold">{taskCount}</strong> question paper{taskCount > 1 ? "s" : ""} awaiting your review.
                  </>
                ) : (
                  "All caught up! No question papers pending your review."
                )}
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
              <button
                onClick={() => setFeeDueModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400/20 text-amber-300 text-sm font-bold hover:bg-amber-400/30 transition-all border border-amber-400/30 cursor-pointer active:scale-95 shadow-sm"
                title="View Department Fee Dues"
              >
                <GraduationCap size={16} />
                <span className="hidden sm:inline">Fee Due</span>
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

        {/* ═══ Tasks & Approvals Grid ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 mt-8">

          {/* Column 1: Forwarded Question Papers */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col h-[580px]">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4 shrink-0">
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <ClipboardList size={18} className="text-[#120c7a]" />
                Forwarded Question Papers
                {taskCount > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{taskCount}</span>
                )}
              </h2>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${showFilters ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"}`}>
                <Filter size={12} /> Filters
              </button>
            </div>

            {/* Search Input inside Card */}
            <div className="mb-4 shrink-0">
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 focus-within:border-[#120c7a] focus-within:bg-white transition-all shadow-sm">
                <Search size={16} className="text-zinc-400" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-zinc-400 text-zinc-700"
                  placeholder="Search subject, faculty, or exam..." />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                    <X size={12} className="text-zinc-400" />
                  </button>
                )}
              </div>

              {showFilters && (
                <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-zinc-100">
                  <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-600 outline-none focus:border-[#120c7a]">
                    <option value="">All Batches</option>
                    {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-600 outline-none focus:border-[#120c7a]">
                    <option value="">All Semesters</option>
                    {semesterOptions.map((s) => <option key={s} value={s}>Sem {s}</option>)}
                  </select>
                  {(filterBatch || filterSemester) && (
                    <button onClick={() => { setFilterBatch(""); setFilterSemester(""); }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1.5">
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable list content */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {tasksLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-zinc-50/50 rounded-2xl border border-zinc-150 p-4 shadow-sm animate-pulse h-28" />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col justify-center items-center h-full min-h-[250px]">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <Sparkles size={24} />
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900">
                    {searchQuery || filterBatch || filterSemester ? "No matching papers" : "All caught up!"}
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">
                    {searchQuery || filterBatch || filterSemester
                      ? "Try adjusting your search query or dropdown filter choices."
                      : "No question papers waiting for your review."}
                  </p>
                </div>
              ) : (
                filteredTasks.map((qp) => {
                  const name = resolveForwardedByName(qp.forwarded_by);
                  const initial = (name || "?").charAt(0).toUpperCase();
                  const examDisplay = resolveExamDisplay(qp);
                  const sentTime = timeAgo(qp.forwarded_at || qp.saved_at);
                  const colorIdx = Math.abs((qp.subject || "").length) % 6;
                  const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
                  const dotColor = dotColors[colorIdx];

                  return (
                    <div key={`${qp.compositeKey}-${qp.id}`}
                      className="group bg-zinc-50/40 rounded-2xl border border-zinc-150 p-4 hover:shadow-md hover:bg-white transition-all duration-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-[#120c7a]/15 text-[#120c7a] flex items-center justify-center text-xs font-black shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-zinc-800 truncate">{name}</span>
                              <span className="text-[10px] text-zinc-300">•</span>
                              <span className="text-[10px] text-zinc-400">{sentTime}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-xs font-black text-zinc-800 truncate">{(() => { const p = parseSubjectField(qp.subject); return p.code || qp.subject; })()}</span>
                              {(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })() && (
                                <span className="text-[10px] text-zinc-400 truncate max-w-[130px] font-medium">{(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })()}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50/50 text-blue-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-blue-100/40">
                                {examDisplay}
                              </span>
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">
                                {qp.batch || "-"}
                              </span>
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">
                                Sem {qp.semester || "-"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
                          className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#120c7a] text-white text-[11px] font-extrabold hover:bg-[#0f0a66] transition-all shadow-sm cursor-pointer">
                          <Eye size={12} /> Review
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Pending Activity Approvals */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col h-[580px]">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4 shrink-0">
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Award size={18} className="text-[#120c7a]" />
                Pending Activity Approvals
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                  {pendingActivities.length}
                </span>
              </h2>
            </div>

            {/* Scrollable list content */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {activitiesLoading ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col justify-center items-center h-full">
                  <Loader2 className="animate-spin text-zinc-400 mb-2" size={24} />
                  <span className="text-xs text-zinc-400 font-medium">Checking pending activities...</span>
                </div>
              ) : pendingActivities.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col justify-center items-center h-full min-h-[250px]">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900">All caught up!</h3>
                  <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">No activities currently waiting for Academic Coordinator verification.</p>
                </div>
              ) : (
                pendingActivities.map((act) => {
                  const dateParts = (act.date || act.fromDate || "").split('-');
                  const displayDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : (act.date || act.fromDate || "-");
                  return (
                    <div key={act.id} className="bg-zinc-50/40 rounded-2xl border border-zinc-150 p-4 hover:shadow-md hover:bg-white transition-all duration-200">
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-800 leading-tight">{act.studentName || act.facultyName || "N/A"}</p>
                          <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{act.regNo || act.facultyId || ""}</p>
                        </div>
                        <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-black uppercase tracking-wider shrink-0">
                          {act.activityCode || "STEP"}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-zinc-700 mb-1 leading-normal line-clamp-1">{act.activityName || act.title || "Unnamed Activity"}</p>
                      <p className="text-[10px] text-zinc-400 font-extrabold uppercase">{act.batch} &bull; {act.section || "Sec-A"}</p>

                      <div className="mt-4 flex items-center justify-between border-t border-zinc-150/60 pt-3">
                        <span className="text-[10px] text-zinc-500 font-semibold flex items-center gap-1">
                          <Calendar size={11} /> {displayDate}
                        </span>
                        <button
                          onClick={() => {
                            setReviewActivity(act);
                            setReturnComment("");
                            setShowReturnInput(false);
                            setShowActivityModal(true);
                          }}
                          className="px-3 py-1.5 bg-[#120c7a]/15 hover:bg-[#120c7a]/25 text-[#120c7a] rounded-xl text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={12} /> Verify
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ═══ Duty Indents (Exam Cell → AC/HOD) ═══ */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 mt-6">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4">
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardList size={18} className="text-[#120c7a]" />
              Duty Indents for Your Department
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{dutyIndents.length}</span>
            </h2>
          </div>
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {dutyIndentsLoading ? (
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col items-center"><Loader2 className="animate-spin text-zinc-400 mb-2" size={24} /><span className="text-xs text-zinc-400">Loading indents...</span></div>
            ) : dutyIndents.length === 0 ? (
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col items-center min-h-[140px] justify-center"><div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3"><CheckCircle2 size={24} /></div><h3 className="text-xs font-bold text-zinc-900">No pending indents</h3><p className="text-[11px] text-zinc-400 mt-1">Exam Cell has not sent a duty requisition for {hodDepartment || "your department"} yet.</p></div>
            ) : (
              dutyIndents.map((wf) => {
                const entry = Object.entries(wf.deptQuotas || {}).find(([k]) => isDeptMatch(k, hodDepartment));
                const q = entry ? entry[1] : null;
                const required = q?.requiredCount || 0;
                const nominated = (q?.nominatedFacultyIds || []).length;
                const deadline = wf.deadlineDate ? `${wf.deadlineDate} ${wf.deadlineTime || ''}` : "-";
                const isOverdue = wf.deadlineDate && new Date(wf.deadlineDate) < new Date(new Date().toISOString().split('T')[0]);
                return (
                  <div key={wf.id} className="bg-zinc-50/40 rounded-2xl border border-zinc-200 p-4 hover:shadow-md hover:bg-white transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-xs font-bold text-zinc-800">{wf.date} ({wf.session}) — {wf.timeSlot || ""}</p><p className="text-[10px] text-zinc-500 mt-0.5">Halls: {wf.noOfHalls} • Required: {wf.totalRequired} (Dept quota: {required}) {isOverdue ? <span className="text-rose-600 font-bold">• DEADLINE EXPIRED</span> : ""}</p><p className="text-[10px] text-zinc-400 mt-1">Deadline: {deadline} • Nominated: {nominated}/{required} • Status: {wf.status}</p></div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${nominated >= required ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{nominated >= required ? 'Ready' : 'Pending'}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">Allocate {required} faculty for your department</span>
                      <button onClick={() => handleToggleAlloc(wf)} className="px-3 py-1.5 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-[#0f0a66]">{allocWfId === wf.id ? 'Cancel' : 'Allocate Faculty'}</button>
                    </div>
                    {allocWfId === wf.id && (
                      <div className="mt-3 pt-3 border-t border-zinc-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Select Faculty ({allocSelected.length}/{required})</span>
                          {allocSelected.length > 0 && <button onClick={() => setAllocSelected([])} className="text-[10px] font-bold text-rose-500 hover:underline">Clear</button>}
                        </div>
                        <div className="max-h-[180px] overflow-y-auto space-y-1.5 rounded-xl border border-zinc-200 bg-white p-2">
                          {dutyFacultyList.length === 0 ? (
                            <div className="text-[11px] text-zinc-400 text-center py-4">No approved faculty found under {hodDepartment || "your department"}.</div>
                          ) : dutyFacultyList.map((f) => {
                            const fid = f.facultyId || f.facultyCode || f.uid || "";
                            const isSel = allocSelected.includes(f.uid);
                            return (
                              <button key={f.uid} onClick={() => setAllocSelected(prev => isSel ? prev.filter(x => x !== f.uid) : [...prev, f.uid])} className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${isSel ? 'bg-[#120c7a] text-white border-[#120c7a]' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
                                {f.facultyName || f.displayName || f.name || String(f.email || '').split('@')[0]}
                                {fid ? <span className={isSel ? 'text-blue-200' : 'text-zinc-400'}>{' '}({fid})</span> : ""}
                              </button>
                            );
                          })}
                        </div>
                        <button onClick={() => handleSaveAlloc(wf)} disabled={allocSaving || allocSelected.length === 0} className="mt-3 w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40">
                          {allocSaving ? <Loader2 className="animate-spin mx-auto" size={16} /> : `Save Nominations (${allocSelected.length})`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ Activity Review Modal ═══ */}
        {showActivityModal && reviewActivity && (
          <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
              <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Award className="text-yellow-400" size={24} />
                  <div>
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                      Activity Verification Board (Academic Coordinator Review)
                    </h4>
                    <p className="text-base font-bold truncate mt-0.5">
                      {reviewActivity.studentName || reviewActivity.facultyName}
                      ({reviewActivity.regNo || reviewActivity.facultyId || "N/A"})
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowActivityModal(false); setReviewActivity(null); }} className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Fields */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Code</span>
                    <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityCode || "STEP"}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Name</span>
                    <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityName || reviewActivity.title}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Date</span>
                    <span className="text-sm font-bold text-zinc-700">{reviewActivity.date || reviewActivity.fromDate}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Points Claimed</span>
                    <span className="text-sm font-extrabold text-[#120c7a]">{reviewActivity.points || reviewActivity.totalPoints || "-"} Pts</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Department / Batch / Section</span>
                    <span className="text-sm font-bold text-zinc-800">{formatDepartmentDisplay(reviewActivity.department, reviewActivity.programme)} / {formatBatchDisplay(reviewActivity.batch) || reviewActivity.batch} / {reviewActivity.section || "Sec-A"}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">NBA / NAAC Mapping</span>
                    <span className="text-xs font-semibold text-zinc-700">
                      {reviewActivity.nbaCriterion ? `NBA: ${reviewActivity.nbaCriterion}` : ""}
                      {reviewActivity.naacCriterion ? ` | NAAC: ${reviewActivity.naacCriterion}` : ""}
                    </span>
                  </div>
                </div>

                {/* Additional fields based on activity type */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 space-y-4 text-xs">
                  {Object.entries(reviewActivity).filter(([k, v]) =>
                    v && !["id", "status", "createdAt", "updatedAt", "activityCode", "activityName", "title", "studentName", "facultyName", "regNo", "facultyId", "studentId", "userId", "uid", "student_id", "user_id", "department", "batch", "section", "date", "fromDate", "points", "totalPoints", "evidenceUrl", "comments", "reviewedBy", "reviewedByName", "submittedById", "submittedByRole", "isStep"].includes(k)
                  ).map(([key, value]) => {
                    if (key === "formData") {
                      if (Array.isArray(value) && value.length > 0) {
                        const basicInfoKeys = new Set(["programme", "department", "batch", "academicYear", "semester", "section", "date", "submittedBy", "month"]);
                        const headers = Object.keys(value[0]).filter(hk => !basicInfoKeys.has(hk));
                        return (
                          <div key={key} className="space-y-2 w-full">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                              Activity Record List
                            </span>
                            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="bg-zinc-50 border-b border-zinc-200">
                                    {headers.map(h => (
                                      <th key={h} className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">
                                        {h.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {value.map((row, rIdx) => (
                                    <tr key={rIdx} className="hover:bg-zinc-50/50">
                                      {headers.map(h => (
                                        <td key={h} className="px-3 py-2 text-zinc-700 font-medium">
                                          {row[h] || "—"}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }

                    if (key === "evidenceFiles") {
                      if (Array.isArray(value) && value.length > 0) {
                        return (
                          <div key={key} className="space-y-2 w-full">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                              Attached Files Info
                            </span>
                            <div className="flex flex-col gap-3">
                              {value.map((file, fIdx) => {
                                const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) || (file.type && file.type.startsWith('image/'));
                                const isPDF = /\.pdf$/i.test(file.name) || (file.type && file.type === 'application/pdf');
                                const hasUrl = !!file.url;
                                return (
                                  <div key={fIdx} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                                      {isImage ? (
                                        <div className="w-6 h-6 rounded bg-purple-50 flex items-center justify-center shrink-0">
                                          <span className="text-[8px] font-bold text-purple-600">IMG</span>
                                        </div>
                                      ) : isPDF ? (
                                        <div className="w-6 h-6 rounded bg-red-50 flex items-center justify-center shrink-0">
                                          <span className="text-[8px] font-bold text-red-600">PDF</span>
                                        </div>
                                      ) : (
                                        <FileText size={14} className="text-blue-500 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[11px] font-semibold text-zinc-700 block truncate">{file.name}</span>
                                        <span className="text-[9px] text-zinc-400">{(file.size / 1024).toFixed(1)} KB</span>
                                      </div>
                                    </div>
                                    {hasUrl && isImage && (
                                      <div className="p-2 bg-zinc-50 flex items-center justify-center">
                                        <img
                                          src={file.url}
                                          alt={file.name}
                                          className="max-h-48 max-w-full object-contain rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                          referrerPolicy="no-referrer"
                                          onClick={() => window.open(file.url, '_blank')}
                                        />
                                      </div>
                                    )}
                                    {hasUrl && isPDF && (
                                      <div className="bg-zinc-50">
                                        <iframe
                                          src={file.url}
                                          className="w-full h-72 rounded-b-lg border-0"
                                          title={file.name}
                                        />
                                      </div>
                                    )}
                                    {!hasUrl && (
                                      <div className="px-3 py-2 bg-zinc-50 text-[9px] text-zinc-400 italic">File not available for preview</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }

                    if (["submittedBy", "month", "academicYear", "semester", "programme"].includes(key)) {
                      return null;
                    }

                    return (
                      <div key={key} className="flex gap-4">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-40 shrink-0">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </span>
                        <span className="text-zinc-700 font-medium">
                          {typeof value === 'object' ? JSON.stringify(value) : value}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Evidence Review */}
                {reviewActivity.evidenceUrl && (
                  <div>
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Uploaded Evidence</span>
                    <div className="border border-zinc-200 bg-zinc-50 rounded-2xl p-2 flex items-center justify-center min-h-60 overflow-hidden shadow-inner">
                      {reviewActivity.evidenceUrl.endsWith('.pdf') ? (
                        <iframe src={reviewActivity.evidenceUrl} className="w-full h-96 rounded-xl" title="Evidence PDF" />
                      ) : (
                        <img src={reviewActivity.evidenceUrl} alt="Evidence" className="max-w-full max-h-96 object-contain rounded-xl shadow-md" referrerPolicy="no-referrer" />
                      )}
                    </div>
                  </div>
                )}

                {/* Return for correction input */}
                {showReturnInput && (
                  <div className="space-y-2 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                    <label className="block text-xs font-extrabold text-rose-800 uppercase tracking-wider">Correction Feedback comments:</label>
                    <textarea
                      rows={3}
                      placeholder="Provide details of corrections required..."
                      value={returnComment}
                      onChange={e => setReturnComment(e.target.value)}
                      className="w-full rounded-xl border border-rose-200 p-3 text-xs font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowReturnInput(false)} className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-lg cursor-pointer">Cancel</button>
                      <button onClick={() => handleReturnActivity(reviewActivity)} disabled={isActioning} className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                        {isActioning ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />} Return for Correction
                      </button>
                    </div>
                  </div>
                )}

                {reviewActivity.comments && (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block mb-1">Previous comments:</span>
                    <p className="text-sm text-blue-700">{reviewActivity.comments}</p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
                <button onClick={() => { setShowActivityModal(false); setReviewActivity(null); }} className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                  Close
                </button>
                {!showReturnInput && (
                  <>
                    <button onClick={() => setShowReturnInput(true)} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer">
                      <X size={14} /> Return for Correction
                    </button>
                    <button onClick={() => handleApproveActivity(reviewActivity)} disabled={isActioning} className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-1 cursor-pointer">
                      {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                      Approve & Grant Points
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Batch Attendance Report ═══ */}
        <div className="mt-8 bg-white rounded-[2rem] border border-zinc-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg mb-8">
          <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 px-5 md:px-7 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                <CalendarCheck2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">Batch Attendance Report Generator</h2>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">Department-level Student Analytics</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Row 1 */}
              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Select Batch</label>
                <select
                  value={reportBatch}
                  onChange={(e) => { setReportBatch(e.target.value); setReportSection(""); setSelectedReportSubjects([]); setGeneratedReport(null); }}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer"
                >
                  <option value="">-- Choose Batch --</option>
                  {availableReportBatches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Academic Year</label>
                <select
                  value={reportAcademicYear}
                  onChange={(e) => { setReportAcademicYear(e.target.value); setReportSemester(""); setSelectedReportSubjects([]); setGeneratedReport(null); }}
                  disabled={!reportBatch}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose AY --</option>
                  {availableReportAcademicYears.map(ay => (
                    <option key={ay} value={ay}>{ay}</option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Semester</label>
                <select
                  value={reportSemester}
                  onChange={(e) => { setReportSemester(e.target.value); setSelectedReportSubjects([]); setGeneratedReport(null); }}
                  disabled={!reportAcademicYear}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Semester --</option>
                  {availableReportSemesters.map(sem => (
                    <option key={sem} value={sem}>Semester {sem}</option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Select Section (Optional)</label>
                <select
                  value={reportSection}
                  onChange={(e) => { setReportSection(e.target.value); setGeneratedReport(null); }}
                  disabled={!reportBatch}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">All Sections</option>
                  {availableReportSections.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              {/* Row 2 */}
              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205 col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Select Subjects</label>
                  {selectedReportSubjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelectedReportSubjects([]); setGeneratedReport(null); }}
                      className="text-[10px] font-bold text-red-500 hover:underline"
                    >
                      Overall (All Subjects)
                    </button>
                  )}
                </div>
                <select
                  value=""
                  disabled={!reportSemester}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !selectedReportSubjects.includes(val)) {
                      setSelectedReportSubjects(prev => [...prev, val]);
                      setGeneratedReport(null);
                    }
                  }}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 pr-8 text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-[#120c7a]/20 transition-all appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Add Subject --</option>
                  {availableReportSubjects.map(sub => (
                    <option key={sub.code} value={sub.code} disabled={selectedReportSubjects.includes(sub.code)}>
                      {sub.code} - {sub.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedReportSubjects.length === 0 ? (
                    <span className="px-2.5 py-1 bg-white text-zinc-400 text-[10px] font-bold rounded-full border border-zinc-200 uppercase tracking-tighter">
                      Overall (All Subjects)
                    </span>
                  ) : (
                    selectedReportSubjects.map(code => (
                      <span
                        key={code}
                        title={availableReportSubjects.find(s => s.code === code)?.name || code}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-full flex items-center gap-1 border border-blue-100 uppercase tracking-tighter"
                      >
                        {code}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReportSubjects(prev => prev.filter(c => c !== code));
                            setGeneratedReport(null);
                          }}
                          className="hover:text-red-500 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">From Date</label>
                <input
                  type="date"
                  value={reportFromDate}
                  min={reportDateRange.min || undefined}
                  max={reportDateRange.max || undefined}
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    setReportFromDate(newFrom);
                    if (newFrom && reportToDate && newFrom > reportToDate) {
                      setReportToDate(newFrom);
                    }
                    setGeneratedReport(null);
                  }}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none [color-scheme:light]"
                />
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">To Date</label>
                <input
                  type="date"
                  value={reportToDate}
                  min={reportDateRange.min || undefined}
                  max={reportDateRange.max || undefined}
                  onChange={(e) => {
                    const newTo = e.target.value;
                    setReportToDate(newTo);
                    if (newTo && reportFromDate && newTo < reportFromDate) {
                      setReportFromDate(newTo);
                    }
                    setGeneratedReport(null);
                  }}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none [color-scheme:light]"
                />
              </div>
            </div>

            {reportDateRange.min && reportDateRange.max && (
              <div className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-[11px] font-semibold text-blue-700 flex items-center gap-2 flex-wrap">
                <CalendarCheck2 size={14} className="text-blue-500" />
                <span>Academic semester range: <strong>{reportDateRange.min}</strong> to <strong>{reportDateRange.max}</strong>. Report dates must fall within this range.</span>
                {reportDatesOutsideSemester && (
                  <span className="ml-auto inline-flex items-center gap-1 text-rose-600 bg-rose-100/60 px-2.5 py-0.5 rounded-full border border-rose-200/50 text-[10px] font-bold">
                    <AlertCircle size={12} /> Outside Semester Range
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
              <button
                onClick={handleGenerateBatchReport}
                disabled={generatingReport || !reportBatch}
                className="px-6 py-3 bg-[#120c7a] hover:bg-[#0f0a66] text-white text-xs font-extrabold rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98"
              >
                {generatingReport ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Analyzing database records...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    <span>Generate Report</span>
                  </>
                )}
              </button>
            </div>

            {/* Generated Report Preview */}
            {generatedReport && (
              <div className="mt-8 border-t border-zinc-200 pt-6 space-y-6">

                {/* Visual Analytics Dashboard */}
                {generatedReport.students.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Students</span>
                        <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg"><Users size={14} /></div>
                      </div>
                      <p className="text-2xl font-black text-zinc-800">{generatedReport.students.length}</p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Classes Tracked</span>
                        <div className="p-1.5 bg-sky-100 text-sky-700 rounded-lg"><Clock size={14} /></div>
                      </div>
                      <p className="text-2xl font-black text-zinc-800">{generatedReport.periods.length}</p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Class Average</span>
                        <div className={`p-1.5 rounded-lg ${parseFloat(averageAttendance) >= 75 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}><TrendingUp size={14} /></div>
                      </div>
                      <p className={`text-2xl font-black ${parseFloat(averageAttendance) >= 75 ? "text-emerald-600" : "text-rose-600"}`}>{averageAttendance}%</p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Defaulters (&lt;75%)</span>
                        <div className={`p-1.5 rounded-lg ${countBelow75 > 0 ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-zinc-400"}`}><AlertTriangle size={14} /></div>
                      </div>
                      <p className={`text-2xl font-black ${countBelow75 > 0 ? "text-rose-600" : "text-zinc-600"}`}>{countBelow75}</p>
                    </div>
                  </div>
                )}

                {/* Progress bar indicator */}
                {generatedReport.students.length > 0 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold text-zinc-500 uppercase">Batch Average Attendance Progress</span>
                      <span className="text-xs font-black text-indigo-700">{averageAttendance}%</span>
                    </div>
                    <div className="w-full bg-zinc-200 rounded-full h-3 overflow-hidden shadow-inner">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${parseFloat(averageAttendance) >= 75 ? "from-emerald-400 to-teal-500" : "from-rose-400 to-amber-500"}`}
                        style={{ width: `${averageAttendance}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center flex-wrap gap-4 border-t border-zinc-200 pt-6">
                  <div>
                    <h3 className="text-sm font-black text-zinc-800">
                      Report Preview: {generatedReport.batch} ({generatedReport.section})
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">
                      Range: {generatedReport.fromDate} to {generatedReport.toDate} &middot; {generatedReport.groupedPeriods ? generatedReport.groupedPeriods.length : 0} Days · {generatedReport.periods.length} Periods Found
                      {generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 && (
                        <span className="text-indigo-600 font-extrabold"> &middot; Subjects: {generatedReport.selectedSubjects.join(", ")}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleExportCSV}
                      className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98"
                    >
                      <Download size={14} />
                      <span>Export PDF</span>
                    </button>
                  </div>
                </div>

                {generatedReport.periods.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-50 border border-zinc-100 rounded-2xl">
                    <AlertTriangle className="mx-auto text-amber-500 mb-2" size={24} />
                    <h4 className="text-xs font-bold text-zinc-700">No periods found</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">No attendance was marked for this batch in the selected date range.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Premium Search / Table filter input */}
                    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10 transition-all max-w-md shadow-sm">
                      <Search size={16} className="text-zinc-400" />
                      <input
                        value={reportSearchQuery}
                        onChange={(e) => setReportSearchQuery(e.target.value)}
                        className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-zinc-400 text-zinc-700"
                        placeholder="Search student by name or register number..."
                      />
                      {reportSearchQuery && (
                        <button onClick={() => setReportSearchQuery("")} className="p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                          <X size={14} className="text-zinc-400" />
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-inner bg-zinc-50 max-h-[450px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <>
                          <thead className="bg-zinc-100 border-b border-zinc-200 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider min-w-[100px]">Reg No</th>
                              <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider min-w-[150px]">Student Name</th>
                              <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center w-12">Sec</th>
                              {(generatedReport.groupedPeriods || []).map(({ date, periods }, gi) => (
                                <th key={date} colSpan={periods.length} className={`px-1.5 py-2.5 text-[9px] font-extrabold uppercase text-center border-l-[3px] border-[#120c7a]/60 ${gi % 2 === 1 ? "bg-amber-50/80 text-amber-800" : "bg-sky-50/80 text-sky-800"}`} title={date}>
                                  {date.slice(5).replace('-', '/')}
                                </th>
                              ))}
                              {generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? (
                                generatedReport.selectedSubjects.map(code => (
                                  <th key={`sh_${code}`} colSpan={4} className={`px-1.5 py-2.5 text-[9px] font-extrabold uppercase text-center border-l-[3px] border-[#120c7a]/60 bg-indigo-50/80 text-indigo-700`} title={code}>
                                    {code}
                                  </th>
                                ))
                              ) : (
                                <>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-300 min-w-[60px] bg-zinc-150">Total</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-200 min-w-[50px] bg-zinc-150">P</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-200 min-w-[50px] bg-zinc-150">OD</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-200 min-w-[50px] bg-zinc-150">A</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-300 min-w-[60px] bg-zinc-150">Pct</th>
                                </>
                              )}
                            </tr>
                            <tr className="border-b border-zinc-200 bg-zinc-50/50">
                              <th className="bg-transparent" colSpan={3}></th>
                              {(generatedReport.groupedPeriods || []).map(({ date, periods }, gi) => periods.map(p => {
                                const pNum = p.includes('_P') ? p.slice(p.lastIndexOf('_P') + 2) : p;
                                const info = generatedReport.periodInfo?.[p];
                                return (
                                  <th key={p} className={`px-1.5 py-1.5 text-[9px] font-extrabold text-zinc-500 uppercase text-center border-l border-zinc-250/60 ${gi % 2 === 1 ? "bg-amber-50/30" : "bg-sky-50/20"}`} title={p}>
                                    <span className="block">P{pNum}</span>
                                    {info && <span className="block text-[8px] text-[#120c7a] font-black mt-0.5 normal-case tracking-normal">({info})</span>}
                                  </th>
                                );
                              }))}
                              <th className="bg-transparent" colSpan={generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? generatedReport.selectedSubjects.length * 4 : 5}></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 bg-white">
                            {filteredReportStudents.length === 0 ? (
                              <tr>
                                <td colSpan={3 + generatedReport.periods.length + (generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? generatedReport.selectedSubjects.length * 4 : 5)} className="px-6 py-10 text-center text-xs text-zinc-400 italic font-medium">
                                  No students match your search query.
                                </td>
                              </tr>
                            ) : (
                              filteredReportStudents.map((student) => (
                                <tr key={student.reg} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-3 py-2.5 text-xs font-semibold text-zinc-700">{student.reg}</td>
                                  <td className="px-3 py-2.5 text-xs font-bold text-zinc-800">{student.name}</td>
                                  <td className="px-3 py-2.5 text-xs text-zinc-500 text-center">{student.section.replace('Sec-', '')}</td>
                                  {(generatedReport.groupedPeriods || []).map(({ date, periods }, gi) => periods.map(p => {
                                    const val = student.dailyRecords[p];
                                    let cellBg = "";
                                    let cellText = "";
                                    if (val === 'P') { cellBg = "bg-emerald-50 text-emerald-700 border-emerald-100"; cellText = "P"; }
                                    else if (val === 'A') { cellBg = "bg-rose-50 text-rose-700 border-rose-100"; cellText = "A"; }
                                    else if (val === 'OD') { cellBg = "bg-blue-50 text-blue-700 border-blue-100"; cellText = "OD"; }
                                    else { cellBg = "text-zinc-300"; cellText = "—"; }

                                    const isGroupStart = p === periods[0];
                                    const groupBgClass = gi % 2 === 1
                                      ? "bg-amber-50/50"
                                      : "bg-sky-50/40";
                                    const borderClass = isGroupStart && gi > 0
                                      ? "border-l-[3px] border-l-[#120c7a]/60"
                                      : "border-l border-l-zinc-200/50";

                                    return (
                                      <td key={p} className={`px-1 py-1.5 text-center ${groupBgClass} ${borderClass}`}>
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${cellBg} shadow-sm`}>
                                          {cellText}
                                        </span>
                                      </td>
                                    );
                                  }))}
                                  {generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? (
                                    generatedReport.selectedSubjects.map(code => {
                                      const st = student.subjectStats?.[code] || { attended: 0, absent: 0, od: 0, total: 0 };
                                      const spct = subjectStatPct(st);
                                      return (
                                        <Fragment key={`sc_${student.reg}_${code}`}>
                                          <td className="px-2 py-2.5 text-xs font-bold text-zinc-800 text-center border-l border-zinc-300 bg-zinc-50">{st.total}</td>
                                          <td className="px-2 py-2.5 text-xs font-bold text-emerald-600 text-center border-l border-zinc-200 bg-zinc-50">{st.attended}</td>
                                          <td className="px-2 py-2.5 text-xs font-bold text-rose-600 text-center border-l border-zinc-200 bg-zinc-50">{st.absent}</td>
                                          <td className={`px-2 py-2.5 text-xs font-black text-center border-l border-zinc-300 bg-zinc-100 ${parseFloat(spct) < 75 ? "text-rose-600" : "text-indigo-700"}`}>
                                            {spct}%
                                          </td>
                                        </Fragment>
                                      );
                                    })
                                  ) : (
                                    <>
                                      <td className="px-3 py-2.5 text-xs font-bold text-zinc-800 text-center border-l border-zinc-300 bg-zinc-50">{student.total}</td>
                                      <td className="px-3 py-2.5 text-xs font-bold text-emerald-600 text-center border-l border-zinc-200 bg-zinc-50">{student.attended}</td>
                                      <td className="px-3 py-2.5 text-xs font-bold text-blue-600 text-center border-l border-zinc-200 bg-zinc-50">{student.od}</td>
                                      <td className="px-3 py-2.5 text-xs font-bold text-rose-600 text-center border-l border-zinc-200 bg-zinc-50">{student.absent}</td>
                                      <td className={`px-3 py-2.5 text-xs font-black text-center border-l border-zinc-300 bg-zinc-100 ${parseFloat(student.percentage) < 75 ? "text-rose-600" : "text-indigo-700"}`}>
                                        {student.percentage}%
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Department Fee Due Modal (Exam Fee Due & Academics Fee Due) ═══ */}
        <DepartmentFeeDueModal
          isOpen={feeDueModalOpen}
          onClose={() => setFeeDueModalOpen(false)}
          department={hodDepartment}
          programme={hodProgramme}
          userRole="Academic Coordinator"
          userName={hodName}
        />

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
              <button
                type="button"
                onClick={() => {
                  dashboardAttDocCache.clear();
                  setAttendanceOverviewLoading(true);
                  setReloadAttendanceTrigger(prev => prev + 1);
                }}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-all flex items-center gap-1 cursor-pointer"
                title="Refresh Attendance Status"
              >
                <RefreshCw size={14} className={attendanceOverviewLoading ? "animate-spin" : ""} />
              </button>
              <button onClick={() => navigate("/attendance")}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold rounded-xl transition-all backdrop-blur-sm border border-white/20">
                Go to Attendance
              </button>
            </div>
          </div>

          {attendanceOverviewLoading && Object.keys(attendanceOverview).length === 0 ? (
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
          ) : attendanceDateIsSunday ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <Calendar size={28} />
              </div>
              <p className="text-lg font-bold text-amber-700">Sunday — Weekly Off</p>
              <p className="text-xs text-zinc-400 mt-2">No classes scheduled on Sundays.</p>
            </div>
          ) : attendanceDateOutsideSemester ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={28} />
              </div>
              <p className="text-lg font-bold text-rose-700">Outside Semester Range</p>
              <p className="text-xs text-zinc-400 mt-2">This date is not within any configured semester period. Attendance cannot be marked.</p>
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
                                      <td className="px-3 py-2.5 text-xs font-semibold text-zinc-800">
                                        {row.isEvent ? <span className="text-amber-700">-</span> : row.subjectCode}
                                        {row.isEvent && <span className="ml-1 text-[9px] text-amber-600 font-bold">(Event)</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs max-w-[200px] truncate" title={row.substituteSubjectCode ? `${row.subjectName} (entered under ${row.substituteSubjectCode})` : row.subjectName || ""}>
                                        <span className={row.isEvent ? 'text-amber-600 font-medium' : 'text-zinc-600'}>{row.subjectName || "—"}</span>
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

      {/* ═══ IA Consolidation Report ═══ */}
      <div className="mt-8 bg-white rounded-[2rem] border border-zinc-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg mb-8">
        <div className="bg-gradient-to-r from-violet-800 via-purple-900 to-indigo-950 px-5 md:px-7 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
              <FileSpreadsheet size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">IA Consolidation Report</h2>
              <p className="text-violet-200 text-[10px] font-bold uppercase tracking-widest">Internal Assessment Marks Overview</p>
            </div>
          </div>
          {iaReportData && iaReportData.students && iaReportData.students.length > 0 && (
            <button
              onClick={handleExportIAReportPDF}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border border-white/20 hover:border-white/40 cursor-pointer"
            >
              <Download size={15} />
              <span>Export PDF</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-violet-300 hover:bg-white transition-all duration-200">
              <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Batch</label>
              <select value={reportBatch} onChange={(e) => { setReportBatch(e.target.value); setIaReportSubject(""); setIaReportExam(""); setIaReportData(null); }} className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer">
                <option value="">-- Choose Batch --</option>
                {availableReportBatches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-violet-300 hover:bg-white transition-all duration-200">
              <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Academic Year</label>
              <select value={reportAcademicYear} onChange={(e) => { setReportAcademicYear(e.target.value); setIaReportSubject(""); setIaReportExam(""); setIaReportData(null); }} disabled={!reportBatch} className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <option value="">-- Choose AY --</option>
                {availableReportAcademicYears.map(ay => <option key={ay} value={ay}>{ay}</option>)}
              </select>
            </div>
            <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-violet-300 hover:bg-white transition-all duration-200">
              <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Semester</label>
              <select value={reportSemester} onChange={(e) => { setReportSemester(e.target.value); setIaReportSubject(""); setIaReportExam(""); setIaReportData(null); }} disabled={!reportAcademicYear} className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <option value="">-- Choose Semester --</option>
                {availableReportSemesters.map(sem => <option key={sem} value={sem}>Semester {sem}</option>)}
              </select>
            </div>
            <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-violet-300 hover:bg-white transition-all duration-200">
              <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Exam</label>
              <select value={iaReportExam} onChange={(e) => { setIaReportExam(e.target.value); setIaReportData(null); }} disabled={!reportSemester} className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <option value="">-- Choose Exam --</option>
                {availableReportExams.map(ex => <option key={ex.id} value={ex.name}>{ex.name}</option>)}
              </select>
            </div>
          </div>

          {/* Loading State */}
          {iaReportLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-violet-600">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs font-bold">Loading IA marks data...</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!iaReportLoading && !iaReportData && (
            <div className="text-center py-16 bg-zinc-50 rounded-2xl border border-dashed border-zinc-300">
              <FileSpreadsheet size={40} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-sm font-bold text-zinc-400">
                Select an Exam to view IA Consolidation Report
              </p>
              <p className="text-[10px] text-zinc-300 mt-1">Marks from all internal assessments will be displayed</p>
            </div>
          )}

          {/* Marks Table */}
          {!iaReportLoading && iaReportData && iaReportData.students.length > 0 && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Students</span>
                    <div className="p-1.5 bg-violet-100 text-violet-700 rounded-lg"><Users size={14} /></div>
                  </div>
                  <p className="text-2xl font-black text-zinc-800">{iaReportData.students.length}</p>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      {iaReportData.type === 'exam' ? 'Total Subjects' : 'Exams Tracked'}
                    </span>
                    <div className="p-1.5 bg-sky-100 text-sky-700 rounded-lg"><Award size={14} /></div>
                  </div>
                  <p className="text-2xl font-black text-zinc-800">{iaReportData.columns.length}</p>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Class Average</span>
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg"><TrendingUp size={14} /></div>
                  </div>
                  <p className="text-2xl font-black text-emerald-600">
                    {iaReportData.students.length > 0
                      ? (iaReportData.students.reduce((sum, s) => sum + parseFloat(s.avg || 0), 0) / iaReportData.students.length).toFixed(1)
                      : '0.0'}%
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Absent Students</span>
                    <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg"><AlertTriangle size={14} /></div>
                  </div>
                  <p className="text-2xl font-black text-rose-600">
                    {iaReportData.students.filter(s => s.status === 'ABSENT').length}
                  </p>
                </div>
              </div>

              {/* Info Banner */}
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <Award size={14} className="text-violet-600 shrink-0" />
                <p className="text-[11px] text-violet-700 font-bold">
                  {iaReportData.type === 'exam' ? (
                    <>{iaReportData.exam} &middot; Batch {iaReportData.batch} &middot; AY {iaReportData.academicYear} &middot; Sem {iaReportData.semester} &middot; Section: {iaReportData.section} &middot; {iaReportData.columns.length} Subjects &middot; {iaReportData.students.length} Students</>
                  ) : (
                    <>{iaReportData.subjectCode} &middot; Batch {iaReportData.batch} &middot; AY {iaReportData.academicYear} &middot; Sem {iaReportData.semester} &middot; Section: {iaReportData.section} &middot; {iaReportData.columns.length} Exams &middot; {iaReportData.students.length} Students</>
                  )}
                </p>
              </div>
              <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-violet-800 text-white">
                      <th className="px-3 py-2.5 text-left font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">S.No</th>
                      <th className="px-3 py-2.5 text-left font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">Reg No</th>
                      <th className="px-3 py-2.5 text-left font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">Student Name</th>
                      {iaReportData.columns.map(col => (
                        <th key={col.id || col.code} className="px-3 py-2.5 text-center font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">
                          <div>{col.code || col.name}</div>
                          <div className="text-[9px] font-bold text-violet-200">(Max: {col.max})</div>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-center font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">Total</th>
                      <th className="px-3 py-2.5 text-center font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">Max Total</th>
                      <th className="px-3 py-2.5 text-center font-extrabold text-[10px] uppercase tracking-wider border-r border-violet-600">Avg %</th>
                      <th className="px-3 py-2.5 text-center font-extrabold text-[10px] uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iaReportData.students.map((st, idx) => (
                      <tr key={st.reg || idx} className={`border-b border-zinc-100 hover:bg-violet-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}`}>
                        <td className="px-3 py-2.5 text-zinc-500 font-bold border-r border-zinc-100">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-mono font-extrabold text-zinc-800 border-r border-zinc-100">{st.reg}</td>
                        <td className="px-3 py-2.5 text-zinc-700 font-medium max-w-[180px] truncate border-r border-zinc-100" title={st.name}>{st.name || '—'}</td>
                        {iaReportData.columns.map(col => {
                          const key = iaReportData.type === 'exam' ? col.code : col.name;
                          const val = st.marks[key];
                          if (!val) {
                            return (
                              <td key={col.id || col.code} className="px-3 py-2.5 text-center font-bold border-r border-zinc-100">
                                <span className="text-zinc-300">—</span>
                              </td>
                            );
                          }
                          if (val.isAbsent) {
                            return (
                              <td key={col.id || col.code} className="px-3 py-2.5 text-center font-bold border-r border-zinc-100">
                                <span className="text-rose-600 font-extrabold bg-rose-50 px-1.5 py-0.5 rounded text-xs">AB</span>
                              </td>
                            );
                          }
                          return (
                            <td key={col.id || col.code} className="px-3 py-2.5 text-center font-bold border-r border-zinc-100">
                              <span className={val.score >= col.max * 0.5 ? 'text-emerald-700' : 'text-rose-600 font-bold'}>{val.score}</span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center font-extrabold text-zinc-800 border-r border-zinc-100">{st.total}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-zinc-500 border-r border-zinc-100">{st.max}</td>
                        <td className="px-3 py-2.5 text-center border-r border-zinc-100">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${parseFloat(st.avg) >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>{st.avg}%</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${st.status === 'PASSED' ? 'bg-emerald-100 text-emerald-700'
                              : st.status === 'FAILED' ? 'bg-rose-100 text-rose-700'
                                : st.status === 'ABSENT' ? 'bg-rose-100 text-rose-700'
                                  : 'bg-zinc-100 text-zinc-600'
                            }`}>{st.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {iaReportData.type === 'exam' && (
                    <tfoot className="border-t-2 border-zinc-300 bg-zinc-50/90 font-bold text-xs">
                      {/* Row 1: Total Strength */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Total Strength</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2 text-center font-extrabold text-zinc-800 border-r border-b border-zinc-200">
                            {iaReportData.subjectStats?.[col.code]?.totalStrength ?? iaReportData.students.length}
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2 text-center font-extrabold text-zinc-800 bg-zinc-100/60 border-l border-b border-zinc-200">
                          {iaReportData.overallStats?.totalStrength ?? iaReportData.students.length}
                        </td>
                      </tr>

                      {/* Row 2: Number of Present */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Number of Present</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2 text-center font-extrabold text-zinc-800 border-r border-b border-zinc-200">
                            {iaReportData.subjectStats?.[col.code]?.presentCount ?? 0}
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2 text-center font-extrabold text-zinc-800 bg-zinc-100/60 border-l border-b border-zinc-200">
                          {iaReportData.overallStats?.presentCount ?? 0}
                        </td>
                      </tr>

                      {/* Row 3: Number of Absent */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Number of Absent</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2 text-center font-extrabold text-rose-600 border-r border-b border-zinc-200">
                            {iaReportData.subjectStats?.[col.code]?.absentCount ?? 0}
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2 text-center font-extrabold text-rose-600 bg-zinc-100/60 border-l border-b border-zinc-200">
                          {iaReportData.overallStats?.absentCount ?? 0}
                        </td>
                      </tr>

                      {/* Row 4: Number of Pass */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Number of Pass</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2 text-center font-extrabold text-emerald-700 bg-emerald-50/40 border-r border-b border-zinc-200">
                            {iaReportData.subjectStats?.[col.code]?.passCount ?? 0}
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2 text-center font-extrabold text-emerald-700 bg-emerald-50/40 border-l border-b border-zinc-200">
                          {iaReportData.overallStats?.passCount ?? 0}
                        </td>
                      </tr>

                      {/* Row 5: Number of Fail */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Number of Fail</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2 text-center font-extrabold text-rose-700 bg-rose-50/40 border-r border-b border-zinc-200">
                            {iaReportData.subjectStats?.[col.code]?.failCount ?? 0}
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2 text-center font-extrabold text-rose-700 bg-rose-50/40 border-l border-b border-zinc-200">
                          {iaReportData.overallStats?.failCount ?? 0}
                        </td>
                      </tr>

                      {/* Row 6: Pass Percentage */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Pass Percentage</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2 text-center font-extrabold text-indigo-700 bg-indigo-50/40 border-r border-b border-zinc-200">
                            {iaReportData.subjectStats?.[col.code]?.passPercentage ?? "0.00"}%
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2 text-center font-extrabold text-indigo-700 bg-indigo-50/40 border-l border-b border-zinc-200">
                          {iaReportData.overallStats?.passPercentage ?? "0.00"}%
                        </td>
                      </tr>

                      {/* Row 7: Faculty Name */}
                      <tr className="border-b border-zinc-200">
                        <td colSpan={3} className="px-3 py-2.5 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Faculty Name</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-2.5 text-center font-bold text-zinc-800 border-r border-b border-zinc-200 text-[11px] max-w-[140px] truncate" title={iaReportData.facultyMap?.[col.code] || '—'}>
                            {iaReportData.facultyMap?.[col.code] || '—'}
                          </td>
                        ))}
                        <td colSpan={4} className="px-3 py-2.5 text-center text-zinc-400 bg-zinc-100/60 border-l border-b border-zinc-200">—</td>
                      </tr>

                      {/* Row 8: Faculty Signature */}
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-left font-extrabold text-zinc-700 bg-zinc-100/90 border-r border-b border-zinc-200">Faculty Signature</td>
                        {iaReportData.columns.map(col => (
                          <td key={col.id || col.code} className="px-3 py-4 text-center border-r border-b border-zinc-200"></td>
                        ))}
                        <td colSpan={4} className="px-3 py-4 text-center bg-zinc-100/60 border-l border-b border-zinc-200"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {!iaReportLoading && iaReportData && iaReportData.students.length === 0 && (
            <div className="text-center py-12 bg-zinc-50 rounded-2xl border border-dashed border-zinc-300">
              <Users size={40} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-sm font-bold text-zinc-400">No students found for the selected filters</p>
              <p className="text-[10px] text-zinc-300 mt-1">Try changing batch, semester, or subject selection</p>
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

      {/* PDF Preview Modal */}
      {showReportPdfPreview && reportPdfUrl && (
        <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">Batch Attendance Report PDF Preview</h3>
                  <p className="text-xs text-zinc-500">{reportPdfFilename}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (reportPdfDoc) {
                      reportPdfDoc.save(reportPdfFilename);
                    }
                  }}
                  className="inline-flex items-center gap-2 bg-[#120c7a] hover:bg-[#0f0a66] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer"
                >
                  <Download size={16} /> Download PDF
                </button>
                <button
                  onClick={() => {
                    setShowReportPdfPreview(false);
                    URL.revokeObjectURL(reportPdfUrl);
                    setReportPdfUrl("");
                    setReportPdfDoc(null);
                  }}
                  className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-zinc-100 p-4 overflow-hidden">
              <iframe src={reportPdfUrl} className="w-full h-full rounded-2xl border border-zinc-200 shadow-inner" title="PDF Preview" />
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
                  <p className="text-xs text-zinc-500">{(() => { const p = parseSubjectField(selectedQP.subject); return p.code || selectedQP.subject; })()} &middot; {(() => { const p = parseSubjectField(selectedQP.subject); return p.name || selectedQP.subject_name; })()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleMoveToHOD}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <CheckCircle2 size={16} /> Move to HOD
                </button>
                <button onClick={() => setShowRecorrectModal(true)}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <Edit2 size={16} /> Revoke
                </button>
                <button onClick={() => setShowQPModal(false)}
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
                        const sDept = s.department || hodDepartment || "";
                        const parts = (s.docId || "").split('_');
                        const progKey = s.programme || parts[1] || "PG";
                        const batchKey = s.batch || parts[0] || "2026-2028";
                        const configDocId = `${progKey}_${bsKey(sDept)}_${batchKey}`;
                        const cfg = sectionConfigs[configDocId] || Object.entries(sectionConfigs || {}).find(([k]) => isDeptMatch(k, sDept))?.[1];
                        const numSections = cfg?.numSections || 0;
                        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                        const sections = numSections > 0
                          ? Array.from({ length: numSections }, (_, si) => `Sec-${letters[si]}`)
                          : ["Sec-A", "Sec-B", "Sec-C"];
                        const selected = sectionAssignments[`${s.docId}-${s.reg}`] || "";

                        return (
                          <tr key={`${s.docId}-${s.reg}`} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-zinc-500">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                              {s.name}
                              {s.department && s.department !== hodDepartment && (
                                <span className="block text-[10px] text-zinc-400 font-normal">{s.department}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-600 font-mono">{s.reg}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.batch}</td>
                            <td className="px-4 py-3">
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
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={async () => {
                                  const sec = sectionAssignments[`${s.docId}-${s.reg}`];
                                  if (!sec) { showToast("Please select a section", "error"); return; }
                                  setSavingSection(true);
                                  try {
                                    const now = new Date().toISOString();
                                    const todayStr = now.slice(0, 10);

                                    // 1) Clean up from approved_admissions if present
                                    try {
                                      const currentSnap = await getDoc(doc(db, 'approved_admissions', s.docId));
                                      if (currentSnap.exists()) {
                                        const currentData = currentSnap.data();
                                        const { [s.reg]: studentVal, ...rest } = currentData;
                                        const newOrder = (currentData._order || []).filter(r => r !== s.reg);
                                        await setDoc(doc(db, 'approved_admissions', s.docId), { ...rest, _order: newOrder });
                                      }
                                    } catch (e) {
                                      console.warn("Could not clean from approved_admissions:", e);
                                    }

                                    // 2) Clean up from unassigned students doc if present
                                    try {
                                      const unassignedSnap = await getDoc(doc(db, 'students', s.docId));
                                      if (unassignedSnap.exists()) {
                                        const unassignedData = unassignedSnap.data();
                                        const { [s.reg]: studentVal, ...rest } = unassignedData;
                                        const newOrder = (unassignedData._order || []).filter(r => r !== s.reg);
                                        await setDoc(doc(db, 'students', s.docId), { ...rest, _order: newOrder });
                                      }
                                    } catch (e) {
                                      console.warn("Could not clean from unassigned students:", e);
                                    }

                                    // 3) Update enquiry if originated from enquiries
                                    try {
                                      const enqId = s.enquiryDocId || s.reg;
                                      await updateDoc(doc(db, 'enquiries', enqId), {
                                        section: sec,
                                        sectionAllottedAt: now,
                                        status: "Approved"
                                      });
                                    } catch (e) {
                                      try {
                                        const eqSnap = await getDocs(query(collection(db, 'enquiries'), where('enquiryId', '==', s.reg)));
                                        eqSnap.forEach(d => {
                                          updateDoc(d.ref, { section: sec, sectionAllottedAt: now, status: "Approved" });
                                        });
                                      } catch (err2) { }
                                    }

                                    // 4) Save to target section doc: students/${s.docId}_${sec}
                                    const secDocId = `${s.docId}_${sanitizeKey(sec)}`;
                                    const secSnap = await getDoc(doc(db, 'students', secDocId));
                                    const secData = secSnap.exists() ? secSnap.data() : {};
                                    const secOrder = secData._order || [];
                                    if (!secOrder.includes(s.reg)) secOrder.push(s.reg);
                                    const secJoiningAY = secData._joiningAY || {};
                                    const secJoiningDate = secData._joiningDate || {};

                                    await setDoc(doc(db, 'students', secDocId), {
                                      ...secData,
                                      [s.reg]: s.name,
                                      _order: secOrder,
                                      _meta: {
                                        ...(secData._meta || {}),
                                        department: s.department || hodDepartment,
                                        programme: s.programme || "PG",
                                        batch: s.batch
                                      },
                                      _joiningAY: { ...secJoiningAY, [s.reg]: s.batch || "" },
                                      _joiningDate: { ...secJoiningDate, [s.reg]: todayStr }
                                    }, { merge: true });

                                    // 5) Write to student_index for dual-ID lookup
                                    await setDoc(doc(db, 'student_index', s.reg), {
                                      canonicalId: s.reg,
                                      admissionNo: s.reg,
                                      regNo: "",
                                      name: s.name,
                                      studentDocId: secDocId,
                                      batch: s.batch,
                                      _createdAt: now,
                                      _updatedAt: now
                                    }, { merge: true });

                                    // 6) Update section-level mapping for bulk lookup
                                    const sectionIndexRef = doc(db, 'student_section_index', secDocId);
                                    const sectionIndexSnap = await getDoc(sectionIndexRef);
                                    const sectionIndexData = sectionIndexSnap.exists() ? sectionIndexSnap.data() : {};
                                    await setDoc(sectionIndexRef, {
                                      ...sectionIndexData,
                                      [s.reg]: { admissionNo: s.reg, regNo: "", name: s.name },
                                      _updatedAt: now
                                    }, { merge: true });

                                    setSectionAssignments(prev => { const n = { ...prev }; delete n[`${s.docId}-${s.reg}`]; return n; });
                                    setApprovedStudentsList(prev => prev.filter(item => item.reg !== s.reg));
                                    setRawApprovedCandidates(prev => prev.filter(item => item.reg !== s.reg));
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

      {/* Revoke Modal */}
      {showRecorrectModal && (
        <div className="fixed inset-0 bg-black/60 z-[190] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Revoke Question Paper</h3>
                  <p className="text-xs text-zinc-500">Send the paper back to the faculty</p>
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
                placeholder="Enter your reasons/suggestions for the faculty..." />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowRecorrectModal(false); setRecorrectComments(""); }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleRevoke} disabled={!recorrectComments.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
                  Revoke Paper
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Pending Attendance Warning Modal for Report Generator */}
      {pendingAttendanceModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[220] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPendingAttendanceModal({ open: false, items: [] })}>
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-rose-100" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-rose-700 via-red-800 to-rose-950 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-sm text-white">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">Pending Attendance Found</h3>
                  <p className="text-rose-200 text-[11px] font-semibold">Report generation blocked until attendance is completed for these periods</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPendingAttendancePDF}
                  disabled={exportingPendingPdf}
                  title="Export PDF Report in A4"
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/30 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {exportingPendingPdf ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  <span>{exportingPendingPdf ? "Generating..." : "PDF Report"}</span>
                </button>
                <button
                  onClick={() => setPendingAttendanceModal({ open: false, items: [] })}
                  className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2.5">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>There are <strong>{pendingAttendanceModal.items.length} pending period(s)</strong> in the selected date range ({reportFromDate} to {reportToDate}). Please complete these attendance entries first.</span>
              </div>

              <div className="border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-zinc-100/80 sticky top-0 border-b border-zinc-200 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Date & Day</th>
                        <th className="py-2.5 px-3">Period</th>
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3">Faculty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150 font-medium text-zinc-700">
                      {pendingAttendanceModal.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-zinc-900">
                            {item.date}
                            <span className="block text-[10px] text-zinc-400 font-normal">{item.day}</span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-blue-700">
                            Period {item.period}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-zinc-800">{item.subjectCode}</span>
                            <span className="block text-[10px] text-zinc-500 font-normal line-clamp-1">{item.subjectName}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 font-bold border border-amber-200 text-xs">
                              <User size={12} className="text-amber-600" />
                              {item.facultyName}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-zinc-500">Total Pending: <strong className="text-rose-600">{pendingAttendanceModal.items.length}</strong></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPendingAttendancePDF}
                  disabled={exportingPendingPdf}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-md hover:shadow-lg active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {exportingPendingPdf ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  <span>{exportingPendingPdf ? "Generating..." : "Download PDF Report (A4)"}</span>
                </button>
                <button
                  onClick={() => setPendingAttendanceModal({ open: false, items: [] })}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Close & Complete Attendance</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
