import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Pencil, Trash2, ChevronDown, Plus, XCircle, X, Bookmark, Save } from 'lucide-react';
import Layout from '../components/Layout';
import MathTemplateToolbar from '../components/MathTemplateToolbar';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth'; // Firebase Auth
import { doc, collection, getDoc, setDoc, onSnapshot, getDocs, updateDoc, query, addDoc, serverTimestamp } from 'firebase/firestore'; // Firestore imports
import { getQuestionPaperHTML } from '../utils/questionPaperUtils';
import { uploadFile, userStoragePath } from '../utils/fileUpload'; // Import the utility function
import { useRegulations } from '../hooks/useRegulations';
import { useDepartments } from '../hooks/useDepartments';
import { useBatches } from '../hooks/useBatches';
import { useSemesterType } from '../hooks/useSemesterType';
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay, formatDepartmentDisplay } from '../lib/utils';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { typesetMath } from '../utils/mathJaxUtils';

const getQuestionByQNo = (questions, targetQNo) => {
  if (!questions || !targetQNo) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetNorm = norm(targetQNo);
  return questions.find(q => norm(q?.qno) === targetNorm) || null;
};

function deriveSemesterNumber(semStr) {
  if (!semStr) return '';
  const m = String(semStr).match(/(\d+)/);
  return m ? m[1] : '';
};

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};
const sanitizeKeyStrict = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const parseCoEntries = (obj) => Object.entries(obj || {})
  .filter(([code]) => code.toUpperCase().startsWith('CO') || !isNaN(parseInt(code.replace(/\D/g, ''))))
  .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
  .sort((a, b) => (parseInt(a.code.replace(/\D/g, '')) || 0) - (parseInt(b.code.replace(/\D/g, '')) || 0));

const hasRealDesc = (list) => Array.isArray(list) && list.length > 0 && list.some(co => {
  const d = String(co.description || '').trim();
  return d && d.toUpperCase() !== String(co.code || '').toUpperCase();
});

const fetchCOsWithFallback = async (department, regulation, subjectCode, academicYear, progKey, parseFn, hasDescFn, knownRegulations) => {
  const parse = parseFn || parseCoEntries;
  const hasDesc = hasDescFn || hasRealDesc;
  const lc = (v) => String(v || '').toLowerCase();

  const coDocId = `${sanitizeKey(department)}_${sanitizeKey(regulation || '')}_${sanitizeKey(subjectCode)}_${sanitizeKey(academicYear)}`;
  let loadedCOs = [];
  try {
    const snap = await getDoc(doc(db, 'course_outcomes', coDocId));
    if (snap.exists()) loadedCOs = parse(snap.data());
  } catch (_) { /* skip */ }

  if (!hasDesc(loadedCOs)) {
    const deptForms = [...new Set([sanitizeKey(department), sanitizeKeyStrict(department), lc(sanitizeKey(department)), lc(sanitizeKeyStrict(department))].filter(Boolean))];
    const regBase = regulation || '';
    const regFormsRaw = [
      regBase, regBase.replace(/-/g, ' '), regBase.replace(/ /g, '-'),
      sanitizeKey(regBase), sanitizeKeyStrict(regBase), regBase.replace(/[^a-zA-Z0-9]/g, ''),
      lc(regBase), lc(sanitizeKey(regBase)), lc(sanitizeKeyStrict(regBase))
    ].filter(Boolean);
    const regForms = [...new Set(regFormsRaw)];
    if (!regulation && Array.isArray(knownRegulations)) {
      for (const kr of knownRegulations) {
        if (!kr) continue;
        for (const v of [kr, sanitizeKey(kr), sanitizeKeyStrict(kr), lc(kr), lc(sanitizeKey(kr)), lc(sanitizeKeyStrict(kr))]) {
          if (v && !regForms.includes(v)) regForms.push(v);
        }
      }
    }
    const subjFormsRaw = [sanitizeKey(subjectCode), subjectCode, sanitizeKeyStrict(subjectCode), lc(subjectCode), lc(sanitizeKey(subjectCode)), lc(sanitizeKeyStrict(subjectCode))];
    const subjForms = [...new Set(subjFormsRaw.filter(Boolean))];
    const ayForm = sanitizeKey(academicYear);
    const ayLc = lc(ayForm);
    outerCoLoop: for (const d of deptForms) {
      for (const r of regForms) {
        for (const s of subjForms) {
          for (const key of [
            `${d}_${r}_${s}_${ayForm}`, `${d}_${r}_${s}_${ayLc}`,
            `${d}_${r}_${s}`, `${r}_${s}`,
            `${d}_${s}_${ayForm}`, `${d}_${s}_${ayLc}`, `${d}_${s}`
          ]) {
            try {
              const altSnap = await getDoc(doc(db, 'course_outcomes', key));
              if (altSnap.exists()) {
                const cand = parse(altSnap.data());
                if (cand.length > 0) {
                  if (hasDesc(cand)) { loadedCOs = cand; break outerCoLoop; }
                  if (loadedCOs.length === 0) loadedCOs = cand;
                }
              }
            } catch (_) { /* skip */ }
          }
        }
      }
    }
  }

  if (!hasDesc(loadedCOs)) {
    // Try courses collection — include regulation in key (UG_Overall_AU_-_R2025_cs25c08 pattern)
    const progForms = [...new Set([progKey, lc(progKey)].filter(Boolean))];
    const deptCourseForms = [...new Set([sanitizeKey(department), sanitizeKeyStrict(department), 'Overall', 'overall', lc(sanitizeKey(department))].filter(Boolean))];
    // ensure Overall always tried even if dept is Overall already
    if (!deptCourseForms.includes('Overall')) deptCourseForms.push('Overall');
    const regCourseForms = [...new Set([sanitizeKey(regulation||''), sanitizeKeyStrict(regulation||''), lc(sanitizeKey(regulation||'')), lc(sanitizeKeyStrict(regulation||''))].filter(Boolean))];
    if (!regulation && Array.isArray(knownRegulations)) {
      for (const kr of knownRegulations) {
        for (const v of [sanitizeKey(kr), sanitizeKeyStrict(kr), lc(sanitizeKey(kr))]) if (v && !regCourseForms.includes(v)) regCourseForms.push(v);
      }
    }
    const codeForms = [...new Set([subjectCode, sanitizeKey(subjectCode), lc(subjectCode), lc(sanitizeKey(subjectCode))].filter(Boolean))];
    const courseCandidates = [];
    for (const pg of progForms) {
      for (const d of deptCourseForms) {
        for (const r of (regCourseForms.length ? regCourseForms : [''])) {
          for (const s of codeForms) {
            if (r) courseCandidates.push(`${pg}_${d}_${r}_${s}`);
            courseCandidates.push(`${pg}_${d}_${s}`);
          }
        }
      }
    }
    // dedupe
    const seenCourse = new Set();
    const uniqCourseCandidates = courseCandidates.filter(k => { if (seenCourse.has(lc(k))) return false; seenCourse.add(lc(k)); return true; });
    for (const key of uniqCourseCandidates) {
      try {
        const snap = await getDoc(doc(db, 'courses', key));
        if (snap.exists()) {
          const bd = snap.data();
          if (bd.co && Array.isArray(bd.co)) {
            const cand = bd.co.map(c => ({ code: c.id, description: c.description || '' })).sort((a, b) =>
              (parseInt(String(a.code || '').replace(/\D/g, '')) || 0) - (parseInt(String(b.code || '').replace(/\D/g, '')) || 0));
            if (cand.length > 0) {
              if (hasDesc(cand)) { loadedCOs = cand; break; }
              if (loadedCOs.length === 0) loadedCOs = cand;
            }
          }
        }
      } catch (_) { /* skip */ }
      // try lower-cased doc-id variant
      try {
        const snapLc = await getDoc(doc(db, 'courses', lc(key)));
        if (snapLc.exists()) {
          const bd = snapLc.data();
          if (bd.co && Array.isArray(bd.co)) {
            const cand = bd.co.map(c => ({ code: c.id, description: c.description || '' })).sort((a, b) =>
              (parseInt(String(a.code || '').replace(/\D/g, '')) || 0) - (parseInt(String(b.code || '').replace(/\D/g, '')) || 0));
            if (cand.length > 0) {
              if (hasDesc(cand)) { loadedCOs = cand; break; }
              if (loadedCOs.length === 0) loadedCOs = cand;
            }
          }
        }
      } catch (_) { /* skip */ }
      if (hasDesc(loadedCOs)) break;
    }
    // Final fallback: collection scan — find ANY courses doc whose code matches subjectCode case-insensitive
    if (!hasDesc(loadedCOs)) {
      try {
        const snapAll = await getDocs(collection(db, 'courses'));
        let best = null;
        snapAll.forEach(d => {
          const data = d.data();
          const codeField = String(data?.code || '').trim();
          if (lc(codeField) === lc(subjectCode) || lc(d.id).endsWith('_' + lc(subjectCode)) || lc(d.id) === lc(subjectCode)) {
            // prefer doc whose programme/regulation matches when available
            const progMatch = !progKey || lc(data.programme||'') === lc(progKey) || lc(d.id).startsWith(lc(progKey)+'_');
            const regMatch = !regulation || lc(data.regulation||'') === lc(regulation) || lc(d.id).includes(lc(sanitizeKey(regulation))) || lc(d.id).includes(lc(sanitizeKeyStrict(regulation)));
            const deptMatch = !department || lc(data.department||'') === lc(department) || lc(data.department||'') === 'overall' || lc(d.id).includes(lc(sanitizeKey(department))) || lc(d.id).includes('overall');
            if (data.co && Array.isArray(data.co) && data.co.length > 0) {
              const cand = data.co.map(c => ({ code: c.id, description: c.description || '' }));
              if (hasDesc(cand) && (progMatch || regMatch || deptMatch)) {
                if (!best || hasDesc(cand)) best = cand.sort((a,b)=>(parseInt(String(a.code||'').replace(/\D/g,''))||0)-(parseInt(String(b.code||'').replace(/\D/g,''))||0));
              } else if (!best && cand.length>0) {
                best = cand;
              }
            }
          }
        });
        if (best && best.length) {
          if (hasDesc(best)) loadedCOs = best;
          else if (loadedCOs.length===0) loadedCOs = best;
        }
      } catch (_) { /* skip */ }
    }
  }

  if (loadedCOs.length === 0) {
    loadedCOs = [
      { code: 'CO1', description: '' },
      { code: 'CO2', description: '' },
      { code: 'CO3', description: '' },
      { code: 'CO4', description: '' },
      { code: 'CO5', description: '' }
    ];
  }
  return loadedCOs;
};

const getNormalizedCourseType = (typeStr) => {
  if (!typeStr) return 'theory';
  const s = String(typeStr).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('lab') && s.includes('theory')) return 'integrated';
  if (s.includes('cum') || s.includes('integrated') || s.includes('withlab') || s.includes('lit')) return 'integrated';
  if (s.includes('practical') || s.includes('lab')) return 'practical';
  if (s.includes('project')) return 'project';
  if (s.includes('activity')) return 'activity';
  return 'theory';
};

const calculateDuration = (startTime, endTime, timeSlot) => {
  let start = startTime || "";
  let end = endTime || "";

  if ((!start || !end) && timeSlot && String(timeSlot).includes("-")) {
    const parts = String(timeSlot).split("-").map(s => s.trim());
    if (parts.length === 2) {
      start = parts[0];
      end = parts[1];
    }
  }

  const parseMins = (timeStr) => {
    if (!timeStr) return null;
    let s = String(timeStr).trim();
    let isPM = /pm/i.test(s);
    let isAM = /am/i.test(s);
    s = s.replace(/(am|pm)/i, '').trim();
    const parts = s.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    let h = parts[0];
    let m = parts[1];
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const startMins = parseMins(start);
  const endMins = parseMins(end);

  if (startMins !== null && endMins !== null && endMins > startMins) {
    const total = endMins - startMins;
    const hrs = Math.floor(total / 60);
    const mins = total % 60;
    if (hrs > 0 && mins > 0) {
      return `${hrs} Hour${hrs > 1 ? 's' : ''} ${mins} Mins`;
    } else if (hrs > 0 && mins === 0) {
      return `${hrs} Hour${hrs > 1 ? 's' : ''}`;
    } else {
      return `${mins} Mins`;
    }
  }
  return "180 min";
};

const formatExamDateDisplay = (dateVal) => {
  if (!dateVal) return "";
  try {
    let d = null;
    if (typeof dateVal === 'object' && dateVal?.seconds) {
      d = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'string') {
      if (dateVal.includes('-')) {
        const parts = dateVal.split('T')[0].split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
      }
      if (dateVal.includes('/')) {
        const parts = dateVal.split('/');
        if (parts.length === 3) {
          const p0 = parts[0].padStart(2, '0');
          const p1 = parts[1].padStart(2, '0');
          const p2 = parts[2];
          return `${p0}.${p1}.${p2}`;
        }
      }
      d = new Date(dateVal);
    } else if (dateVal instanceof Date) {
      d = dateVal;
    }
    if (d && !isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    }
  } catch (e) { }
  return String(dateVal);
};

export default function QuestionPaperGenerator() {
  const { departments: programToDepartments, durations } = useDepartments();
  const { regulations: allRegulations, getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const compositeKey = searchParams.get('compositeKey');
  const editorRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserSignatureUrl, setCurrentUserSignatureUrl] = useState('');
  const hasLoadedRef = useRef(false);

  const [program, setProgram] = useState('');
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const globalSemesterType = useSemesterType();
  const [selectedSemester, setSelectedSemester] = useState('');
  const [section, setSection] = useState('');
  const [sectionConfigs, setSectionConfigs] = useState({});
  const [subject, setSubject] = useState('');
  const [courseOutcomes, setCourseOutcomes] = useState([]);
  const [coPiMapping, setCoPiMapping] = useState({});
  const [poSummaryMapping, setPoSummaryMapping] = useState({});
  const [poList, setPoList] = useState([]);
  const [savedExamParts, setSavedExamParts] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState([]);
  const [ciaConfigsMap, setCiaConfigsMap] = useState({}); // Map for quick lookup
  const [userRole, setUserRole] = useState(null);
  const [userProgramme, setUserProgramme] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [facultyAssignPrefixes, setFacultyAssignPrefixes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exam, setExam] = useState('');
  const [customExam, setCustomExam] = useState('');
  const [assessmentType, setAssessmentType] = useState('Exam');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [numParts, setNumParts] = useState('');

  const [batches, setBatches] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);

  const [showParts, setShowParts] = useState(false);
  const [partsConfig, setPartsConfig] = useState([]);
  const [assignmentConfig, setAssignmentConfig] = useState([]);
  const [savedAssignmentConfig, setSavedAssignmentConfig] = useState([]);
  const [assignmentQuestionCount, setAssignmentQuestionCount] = useState(1);
  const [assignmentTotalMarks, setAssignmentTotalMarks] = useState(0);

  // Question Builder states
  const [qpQuestions, setQpQuestions] = useState([]);
  const [qbQuestion, setQbQuestion] = useState('');
  const [qbQNo, setQbQNo] = useState('');
  const [qbAvailableQNos, setQbAvailableQNos] = useState([]);
  const [qbKL, setQbKL] = useState('Select');
  // stores selected Bloom domain id (key from RTDB)
  const [qbKLDomain, setQbKLDomain] = useState('');
  const [qbCO, setQbCO] = useState('');
  const [bloomsDomains, setBloomsDomains] = useState({});
  const [allQpMarks, setAllQpMarks] = useState({});
  const [qbPI, setQbPI] = useState('');
  const [qbMarks, setQbMarks] = useState(2);
  const qbQuestionRef = useRef(null);
  const isEditingQbRef = useRef(false);  // Track if we're editing an existing question
  const [showQbEditor, setShowQbEditor] = useState(true);
  const [qbEditorData, setQbEditorData] = useState('');

  // Protect against accidental reloads or navigation when building question paper
  const isQpDirty = useMemo(() => {
    return qpQuestions.length > 0 || (assignmentConfig && assignmentConfig.length > 0) || !!qbQuestion.trim();
  }, [qpQuestions, assignmentConfig, qbQuestion]);
  useUnsavedChanges(isQpDirty);


  // Derive subject code from JSON subject state for Firestore paths
  const subjectCode = useMemo(() => {
    if (!subject) return '';
    let rawCode = '';
    try {
      const p = JSON.parse(subject);
      rawCode = p.code || p.subject_code || p.id || '';
    } catch {
      rawCode = subject;
    }
    if (rawCode && typeof rawCode === 'string') {
      if (rawCode.includes('-')) return rawCode.split('-')[0].trim();
      if (rawCode.includes('(')) return rawCode.split('(')[0].trim();
      return rawCode.trim();
    }
    return String(rawCode).trim();
  }, [subject]);

  const getSubjectCodeFrom = useCallback((subj) => {
    if (!subj) return '';
    let rawCode = '';
    try { const p = JSON.parse(subj); rawCode = p.code || p.subject_code || p.id || ''; } catch { rawCode = subj; }
    if (rawCode && typeof rawCode === 'string') {
      if (rawCode.includes('-')) return rawCode.split('-')[0].trim();
      if (rawCode.includes('(')) return rawCode.split('(')[0].trim();
      return rawCode.trim();
    }
    return String(rawCode).trim();
  }, []);

  const handleCkImageUpload = (editor) => {
    editor.on('fileUploadRequest', function (evt) {
      const fileLoader = evt.data.fileLoader;
      const file = fileLoader.file;
      if (!file) return;
      evt.cancel();
      const uid = auth.currentUser?.uid || 'anonymous';
      const path = userStoragePath(uid, 'ckeditor_images', file.name);
      uploadFile(path, file, file.type).then(downloadUrl => {
        fileLoader.url = downloadUrl;
        fileLoader.uploaded = true;
        fileLoader.fire('uploadDone', { url: downloadUrl, fileName: file.name });
      }).catch(error => {
        console.error('CKEditor image upload failed:', error);
        fileLoader.message = error.message;
        fileLoader.fire('uploadError', { message: error.message });
      });
    });
  };

  const initInlineQbEditor = useCallback(() => {
    try {
      if (!window.CKEDITOR) return;
      const el = document.getElementById('qbEditor');
      if (!el) return;

      // If an existing instance exists and is ready, don't destroy it mid-paste or mid-keystroke
      if (window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor) {
        const existing = window.CKEDITOR.instances.qbEditor;
        if (existing.status === 'ready' && existing.editable && existing.editable()) {
          return;
        }
        try { existing.destroy(true); } catch { /* ignore */ }
      }

      const editor = window.CKEDITOR.replace('qbEditor', {
        removePlugins: 'elementspath',
        resize_enabled: false,
        extraPlugins: 'uploadimage,mathjax',
        mathJaxLib: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-AMS-MML_HTMLorMML',
        filebrowserUploadUrl: '',
        height: 200,
        font_defaultLabel: 'Times New Roman',
        fontSize_defaultLabel: '12pt',
        contentsCss: [window.CKEDITOR.basePath + 'contents.css'],
        contentsStyle: `body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; }`
      });

      editor.on('instanceReady', function () {
        try {
          if (editor.editable && editor.editable()) {
            editor.setData(qbQuestion || qbEditorData || '');
          }
        } catch { /* ignore */ }
      });
      editor.on('change', function () {
        try {
          if (editor.editable && editor.editable()) {
            const data = editor.getData();
            setQbQuestion(data);
            setQbEditorData(data);
          }
        } catch { /* ignore */ }
      });
      handleCkImageUpload(editor);
    } catch (e) {
      console.error('initInlineQbEditor', e);
    }
  }, [qbQuestion, qbEditorData]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  // Keep default Q.No as next index when questions change (only if not editing)
  useEffect(() => {
    if (isEditingQbRef.current) return;

    // Prioritize the expected list of Q.Nos from the layout (normalize "(a)" vs "a")
    if (qbAvailableQNos && qbAvailableQNos.length > 0) {
      const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/\(([a-z])\)$/i, '$1');
      const existingQnosSet = new Set(qpQuestions.map(q => norm(q.qno)));
      const nextAvailable = qbAvailableQNos.find(qno => !existingQnosSet.has(norm(qno)));
      if (nextAvailable) {
        setQbQNo(nextAvailable);
        return;
      }
      // If all expected Q.Nos are filled, suggest the next sequential number after the last expected Q.No
      // This handles cases where the user might want to add questions beyond the defined structure
      const lastExpectedNumMatch = qbAvailableQNos[qbAvailableQNos.length - 1].match(/\d+/);
      if (lastExpectedNumMatch) {
        setQbQNo(String(parseInt(lastExpectedNumMatch[0], 10) + 1));
        return;
      }
    }

    // Fallback: qbAvailableQNos is empty — try to rebuild from partsConfig first
    if (partsConfig && partsConfig.length > 0) {
      const rebuilt = buildExpectedQNosFromParts(partsConfig);
      if (rebuilt.length > 0) {
        setQbAvailableQNos(rebuilt);
        // re-run effect will pick the next available from the rebuilt list
        return;
      }
    }

    // No layout and no questions — default to "1"
    if (!qpQuestions || qpQuestions.length === 0) { setQbQNo('1'); return; }
    // Questions exist but no parts layout — build sequential Q.No list so dropdown isn't empty
    const maxNum = qpQuestions.reduce((max, q) => { const m = String(q?.qno || '').match(/\d+/); return m ? Math.max(max, parseInt(m[0], 10)) : max; }, 0);
    const fallbackNos = [];
    for (let n = 1; n <= maxNum + 1; n++) fallbackNos.push(String(n));
    setQbAvailableQNos(fallbackNos);
    setQbQNo(String(maxNum + 1));
  }, [qpQuestions, qbAvailableQNos, partsConfig, isEditingQbRef]); // Add qbAvailableQNos and partsConfig to dependencies

  // Clear CKEditor & reset question text state whenever qbQNo changes (unless in edit mode)
  useEffect(() => {
    if (isEditingQbRef.current) return;
    setQbQuestion('');
    setQbEditorData('');
    try {
      const inst = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor;
      if (inst && typeof inst.setData === 'function') inst.setData('');
    } catch (_err) { /* ignore */ }
  }, [qbQNo]);

  // Added Effect: Sync qbMarks with partsConfig when qbQNo changes
  useEffect(() => {
    if (!qbQNo || isEditingQbRef.current || assessmentType !== 'Exam' || !partsConfig.length) return;

    const numMatch = qbQNo.match(/\d+/);
    if (!numMatch) return;
    const num = parseInt(numMatch[0], 10);

    let currentTotal = 0;
    for (const part of partsConfig) {
      const count = parseInt(part.numQuestions, 10) || 0;
      const start = currentTotal + 1;
      const end = currentTotal + count;
      if (num >= start && num <= end) {
        setQbMarks(part.marksPerQuestion);
        break;
      }
      currentTotal += count;
    }
  }, [qbQNo, partsConfig, assessmentType]);

  // Ensure editor initializes as soon as modal opens (wait for DOM & CKEditor)
  useEffect(() => {
    if (!showQbEditor) return;
    let cancelled = false;
    const attemptInit = () => {
      if (cancelled) return;
      const el = document.getElementById('qbEditor');
      if (el && window.CKEDITOR) {
        initInlineQbEditor();
      } else {
        setTimeout(attemptInit, 120);
      }
    };
    attemptInit();
    return () => { cancelled = true; };
  }, [showQbEditor]);

  const extractQNosFromHtml = (html) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html || '', 'text/html');
      const tables = Array.from(doc.querySelectorAll('table'));
      const qnos = [];
      tables.forEach(table => {
        const ths = Array.from(table.querySelectorAll('th'));
        if (ths.length && ths[0].textContent && ths[0].textContent.toLowerCase().includes('q. no')) {
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          rows.forEach(row => {
            const td = row.querySelector('td');
            if (td) {
              const txt = td.textContent.trim();
              // capture patterns like: 2, 2a, 2(a), 11(a), 3(b), 4b
              const m = txt.match(/^(\d+)(?:\s*\(?([a-zA-Z])\)?\s*)?/);
              if (m) {
                const num = m[1];
                const suffix = m[2] ? m[2].toLowerCase() : '';
                qnos.push(suffix ? `${num}${suffix}` : `${num}`);
              }
            }
          });
        }
      });
      // unique and sort by numeric then suffix
      const unique = Array.from(new Set(qnos));
      unique.sort((a, b) => {
        const pa = a.match(/^(\d+)([a-z])?$/i);
        const pb = b.match(/^(\d+)([a-z])?$/i);
        if (!pa || !pb) return a.localeCompare(b);
        const na = parseInt(pa[1], 10);
        const nb = parseInt(pb[1], 10);
        if (na !== nb) return na - nb;
        const sa = pa[2] || '';
        const sb = pb[2] || '';
        if (sa === sb) return 0;
        if (!sa) return -1;
        if (!sb) return 1;
        return sa.localeCompare(sb);
      });
      return unique;
    } catch {
      return [];
    }
  };

  const handleAddQuestion = useCallback((e) => {
    if (e && e.preventDefault) e.preventDefault();
    // Prefer rich editor content if available, otherwise fallback to qbQuestion state
    let editorText = '';
    try {
      const inst = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor;
      if (inst && typeof inst.getData === 'function') editorText = inst.getData();
    } catch (_err) {
      console.warn('Could not read qbEditor content', _err);
    }
    let text = (editorText || qbQuestion || '').trim();
    if (!text) return showToast('Please enter a question.', 'error');
    // Preserve CKEditor paragraph line breaks as <br> before stripping wrappers
    text = text.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '').replace(/(<br\s*\/?>\s*)+/gi, '<br>').replace(/^(<br\s*\/?>)+|(<br\s*\/?>)+$/gi, '').trim();
    if (!text) return showToast('Please enter a question.', 'error');
    const marks = parseInt(qbMarks, 10) || 0;
    if (marks <= 0) return showToast('Marks must be greater than zero.', 'error');

    const domainName = (bloomsDomains && qbKLDomain && bloomsDomains[qbKLDomain]) ? bloomsDomains[qbKLDomain].name : '';
    const qnoVal = (qbQNo && String(qbQNo).trim()) ? String(qbQNo).trim() : String((qpQuestions && qpQuestions.length) ? qpQuestions.length + 1 : 1);
    const newQ = { qno: qnoVal, question: text, kl: qbKL === 'Select' ? '' : (qbKL || ''), kldomain: domainName || '', co: qbCO || '', pi: qbPI || '', marks };
    // If PI is not explicitly selected but mapping exists for the selected CO, default to first PI
    if ((!newQ.pi || String(newQ.pi).trim() === '') && qbCO && coPiMapping && Array.isArray(coPiMapping[qbCO]) && coPiMapping[qbCO].length > 0) {
      newQ.pi = coPiMapping[qbCO][0];
    }
    const normalize = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\(([a-z])\)$/i, '$1');
    console.debug('[QB] handleAddQuestion qnoVal ->', qnoVal, 'isEditing ->', isEditingQbRef.current);
    setQpQuestions(prev => {
      // if a question with same normalized qno exists, replace it; otherwise add (handles "11(b)" vs "11b")
      const updated = prev ? prev.slice() : [];
      try {
        const existingQnos = (prev || []).map(p => p && p.qno);
        console.debug('[QB] existing qnos ->', existingQnos, 'normalized:', existingQnos.map(q => normalize(q)));
        const idx = (updated || []).findIndex(p => {
          const pNorm = normalize(p.qno);
          const qNorm = normalize(qnoVal);
          const match = pNorm === qNorm;
          console.debug('[QB] comparing:', pNorm, 'vs', qNorm, '-> match:', match);
          return match;
        });
        console.debug('[QB] found idx ->', idx, '(isEditing ->', isEditingQbRef.current, ')');
        if (idx >= 0) {
          console.debug('[QB] REPLACING at index', idx);
          updated[idx] = newQ;
        } else {
          console.debug('[QB] APPENDING new question');
          updated.push(newQ);
        }
        console.debug('[QB] updated qnos ->', updated.map(p => p && p.qno));
      } catch (_err) {
        console.debug('[QB] handleAddQuestion debug error', _err);
      }
      // Keep questions local; final template render happens only on Finalize.
      return updated;
    });
    setShowFinalPreview(false);
    // Mark editing as done
    isEditingQbRef.current = false;

    // reset builder inputs and focus
    setQbQuestion('');
    setQbPI('');
    setQbCO('');
    setQbMarks(2);

    // Clear the rich text editor content after inserting the question
    try {
      const inst = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor;
      if (inst && typeof inst.setData === 'function') inst.setData('');
    } catch (_err) { /* ignore */ }

    // reset domain to first available or empty
    const keys = Object.keys(bloomsDomains || {});
    setQbKLDomain(keys.length ? keys[0] : '');
    if (qbQuestionRef && qbQuestionRef.current) qbQuestionRef.current.focus();
  }, [qbQuestion, qbMarks, bloomsDomains, qbKLDomain, qbQNo, qpQuestions, qbKL, qbCO, qbPI, coPiMapping]);

  const handleDeleteQuestion = (index) => {
    setQpQuestions(prev => { // This is for Exam type
      const updated = prev.filter((_, i) => i !== index);
      return updated;
    });
    setShowFinalPreview(false);
  };

  const handleEditQuestion = useCallback((index) => {
    const q = qpQuestions && qpQuestions[index];
    if (!q) return;
    isEditingQbRef.current = true;  // Mark that we're in edit mode
    setShowQbEditor(true);
    // Normalize parenthesis format: stored qno is "11(b)" but builder options are "11b"; keep select in sync
    const rawEditQno = String(q.qno || (index + 1)).trim();
    const normEditQno = rawEditQno.toLowerCase().replace(/\s+/g, '').replace(/\(([a-z])\)$/i, '$1');
    const matchedQno = (qbAvailableQNos || []).find(v => String(v).toLowerCase().replace(/\s+/g, '').replace(/\(([a-z])\)$/i, '$1') === normEditQno);
    setQbQNo(matchedQno || normEditQno || rawEditQno);
    const domainKey = Object.keys(bloomsDomains || {}).find(k => k === q.kldomain || (bloomsDomains[k]?.name === q.kldomain)) || '';
    setQbKLDomain(domainKey);
    setQbKL(q.kl || 'Select');
    setQbCO(q.co || '');
    // If the question has no PI but mapping is present, prefill the first PI option
    setQbPI(q.pi || ((q.co && coPiMapping[q.co] && coPiMapping[q.co][0]) ? coPiMapping[q.co][0] : ''));
    setQbMarks(q.marks || 2);
    setQbQuestion(q.question || '');
    setQbEditorData(q.question || '');

    setTimeout(() => {
      try {
        const inst = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor;
        if (inst && typeof inst.getData === 'function') {
          inst.setData(q.question || '');
          try { inst.focus(); } catch { /* ignore */ }
        } else if (qbQuestionRef && qbQuestionRef.current) {
          try { qbQuestionRef.current.focus(); } catch { /* ignore */ }
        }
      } catch (e) {
        console.error('handleEditQuestion', e);
      }
    }, 60);
  }, [qpQuestions, bloomsDomains, coPiMapping, qbAvailableQNos]);

  // AI Modal States
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSyllabus, setAiSyllabus] = useState('');
  const [aiDistribution, setAiDistribution] = useState('Easy: 30%, Medium: 50%, Hard: 20%');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [qpSet, setQpSet] = useState(() => {
    const s = searchParams.get('set') || searchParams.get('qpSet') || searchParams.get('setNumber');
    const m = s ? String(s).match(/\d+/) : null;
    return m ? `Set ${m[0]}` : 'Set 1';
  });
  const [showFinalPreview, setShowFinalPreview] = useState(false);
  const [hodComments, setHodComments] = useState('');
  const [loadedExamName, setLoadedExamName] = useState(''); // New state to preserve human name
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [loadedPaperStatus, setLoadedPaperStatus] = useState('');

  // Trigger MathJax typesetting whenever question list, editor, or preview state changes
  useEffect(() => {
    typesetMath();
  }, [qpQuestions, showFinalPreview, showParts, qbQuestion]);

  const [subjectCourseDetails, setSubjectCourseDetails] = useState(null);

  // Derives subject's course type — authoritative CourseBank type takes precedence over name-guessing
  const subjectCourseType = useMemo(() => {
    if (!subject && !subjectCourseDetails) return '';

    let explicitType = '';
    let explicitFromCourseBank = '';
    let nameStr = '';
    let codeStr = '';

    if (subjectCourseDetails) {
      const detailsType = subjectCourseDetails.category || subjectCourseDetails.type || subjectCourseDetails.courseType || subjectCourseDetails.course_type || '';
      if (detailsType) explicitFromCourseBank = String(detailsType).trim();
      if (!nameStr) nameStr = subjectCourseDetails.name || subjectCourseDetails.title || subjectCourseDetails.course_name || '';
      if (!codeStr) codeStr = subjectCourseDetails.code || subjectCourseDetails.course_code || '';
    }

    if (subject) {
      try {
        const p = typeof subject === 'string' && subject.startsWith('{')
          ? JSON.parse(subject)
          : (typeof subject === 'object' ? subject : {});
        const jsonType = p.category || p.type || p.courseType || p.course_type || p.subjectType || '';
        if (jsonType && !explicitFromCourseBank) explicitType = String(jsonType).trim();
        const jsonName = p.name || p.subjectName || p.courseName || p.title || p.text || '';
        if (jsonName && !nameStr) nameStr = jsonName;
        const jsonCode = p.code || p.subjectCode || p.courseCode || '';
        if (jsonCode && !codeStr) codeStr = jsonCode;
      } catch {
        if (typeof subject === 'string' && !nameStr) nameStr = subject;
      }
    }

    if (!nameStr && typeof subject === 'string') nameStr = subject;

    // 1. Authoritative CourseBank type wins — CourseBank (courses collection) is single source of truth
    if (explicitFromCourseBank) {
      return explicitFromCourseBank;
    }

    // 2. Explicit type from syllabus_data only if not the generic default 'Theory' fallback
    //    (syllabus stamps 'Theory' when category missing — don't let it hide a lab name)
    if (explicitType && String(explicitType).trim() && String(explicitType).trim().toLowerCase() !== 'theory') {
      return String(explicitType).trim();
    }

    // 3. Name-based inference as last resort (only when no CourseBank record exists)
    const normName = String(nameStr || '').toUpperCase();
    const isLabByName = normName.includes('LABORATORY') || normName.includes(' LAB') || normName.endsWith('LAB') || normName.includes('PRACTICAL') || normName.includes('WORKSHOP') || normName.includes('DRAWING');
    const isIntegratedByName = normName.includes('THEORY CUM LAB') || normName.includes('INTEGRATED') || normName.includes('WITH LAB') || normName.includes('WITH LABORATORY');
    const isProjectByName = normName.includes('PROJECT') || normName.includes('VIVA') || normName.includes('DISSERTATION') || normName.includes('THESIS');
    const isActivityByName = normName.includes('ACTIVITY') || normName.includes('VALUE ADDED') || normName.includes('SEMINAR');

    if (isIntegratedByName) return 'Theory Cum Lab';
    if (isLabByName) return 'Laboratory';
    if (isProjectByName) return 'Project Work';
    if (isActivityByName) return 'Activity';

    if (explicitType && String(explicitType).trim()) {
      return String(explicitType).trim();
    }

    return 'Theory';
  }, [subject, subjectCourseDetails]);

  const [courseWeightageData, setCourseWeightageData] = useState({});
  const [aiUnitConstraints, setAiUnitConstraints] = useState('');
  const [aiIncludeImages, setAiIncludeImages] = useState(false);

  // Fetch current user's signature URL
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUserId(null);
        setCurrentUserSignatureUrl('');
        return;
      }
      setCurrentUserId(user.uid);
      const userRef = doc(db, 'users', user.uid); // Firestore doc reference
      const snapshot = await getDoc(userRef); // Use getDoc for Firestore
      if (snapshot.exists()) {
        const userData = snapshot.data(); // Use .data() for Firestore documents
        setCurrentUserSignatureUrl(userData.signatureUrl || '');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    let unsubscribeAssignments = null;
    const userRef = doc(db, 'users', currentUserId);
    getDoc(userRef).then(snapshot => {
      if (snapshot.exists()) {
        const userData = snapshot.data();
        setUserRole(userData.role);
        setUserProgramme(userData.programme || "");
        setUserDepartment(userData.department || "");
        if (userData.role === 'Faculty' || userData.role === 'HOD') {
          const assignmentsRef = collection(db, 'subject_assignments');
          unsubscribeAssignments = onSnapshot(assignmentsRef, (assignSnap) => {
            const prefixes = [];
            assignSnap.forEach(d => {
              if (d.data()?.[currentUserId]) {
                const yearMatch = d.id.match(/\d{4}-\d{4}/);
                if (yearMatch && yearMatch.index >= 2) {
                  prefixes.push(d.id.slice(0, yearMatch.index - 1));
                }
              }
            });
            setFacultyAssignPrefixes(prefixes);
          }, (error) => {
            console.error('[QPG] subject_assignments listener error:', error);
          });
        }
      }
    });
    return () => {
      if (unsubscribeAssignments) unsubscribeAssignments();
    };
  }, [currentUserId]);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  const isAssignmentOrProject = useMemo(() => assessmentType === 'Assignment' || assessmentType === 'Project' || assessmentType === 'Practical' || assessmentType === 'Indirect', [assessmentType]);

  const getCurrentStructureTotalMarks = useCallback(() => {
    if (isAssignmentOrProject) {
      return (assignmentConfig || []).reduce((sum, q) => sum + (parseInt(q?.marks, 10) || 0), 0);
    }
    return (partsConfig || []).reduce((sum, part) => {
      const count = parseInt(part?.numQuestions, 10) || 0;
      const marks = parseInt(part?.marksPerQuestion, 10) || 0;
      return sum + (count * marks);
    }, 0);
  }, [assessmentType, assignmentConfig, partsConfig]);

  const getEffectiveNumSets = useCallback((cfg) => {
    if (!cfg || typeof cfg !== 'object') return 1;
    const ayKey = academicYear ? sanitizeKey(academicYear) : '';
    const ayVal = ayKey ? cfg.numSetsByAy?.[ayKey] : undefined;
    const parsed = parseInt(ayVal ?? cfg.numSets, 10);
    return (!isNaN(parsed) && parsed > 0) ? parsed : 1;
  }, [academicYear]);

  // Resolve the selected exam's cia_config by BOTH document ID and exam name.
  // This keeps the Sets dropdown stable even when the exam identity temporarily
  // shifts between a name string (weightage key) and a Firebase push ID while the
  // async `ciaConfigs` / `courseWeightageData` listeners load in different orders.
  const getExamConfig = useCallback((examId) => {
    if (!examId || examId === 'custom') return null;
    let cfg = ciaConfigs.find(c => c.id === examId);
    if (cfg) return cfg;
    const cleanId = String(examId).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanId) return null;
    const candidates = ciaConfigs.filter(c => {
      const n = String(c.examName || c.exam_name || c.title || c.name || c.exam || c.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return n && n === cleanId;
    });
    if (candidates.length === 0) return null;
    const normReg = String(getRegulationForBatch(formatProgrammeKey(program), batch) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return candidates.find(c => {
      const cr = String(c.regulation || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return cr && normReg && (cr === normReg || cr.includes(normReg) || normReg.includes(cr));
    }) || candidates[0];
  }, [ciaConfigs, program, batch]);

  const getConfiguredExamTotalMarks = useCallback((selectedConfig) => {
    const examId = exam !== 'custom' ? exam : (selectedConfig?.id || null);

    const regulation = getRegulationForBatch(formatProgrammeKey(program), batch);

    const regKey = sanitizeKey(regulation);
    const ayKey = sanitizeKey(academicYear);
    const fullRegKey = ayKey ? `${regKey}_${ayKey}` : regKey;
    const regCleanNorm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normClean = regCleanNorm;
    const regAyCleanNorm = regCleanNorm(`${regulation}_${academicYear}`);
    const regNorm = regCleanNorm(regulation);

    // Resolve the actual weightage doc id with the same fuzzy fallback logic used in
    // availableCategories/filteredExams (Curriculum's sanitizeKey strips spaces/slashes too).
    let regWeightage = courseWeightageData[fullRegKey];
    if (!regWeightage && regAyCleanNorm) {
      const matchAyKey = Object.keys(courseWeightageData || {}).find(k => {
        const kn = regCleanNorm(k);
        return kn === regAyCleanNorm || kn.includes(regAyCleanNorm);
      });
      if (matchAyKey) regWeightage = courseWeightageData[matchAyKey];
    }
    if (!regWeightage) {
      regWeightage = courseWeightageData[regKey];
      if (!regWeightage && regNorm) {
        const matchRegKey = Object.keys(courseWeightageData || {}).find(k => {
          const kn = regCleanNorm(k);
          return (kn === regNorm || kn.includes(regNorm)) && !kn.includes('_20');
        });
        if (matchRegKey) regWeightage = courseWeightageData[matchRegKey];
      }
    }

    const targetCourseTypeNorm = getNormalizedCourseType(subjectCourseType);

    const wDataList = [regWeightage].filter(Boolean);

    for (const wData of wDataList) {
      if (!wData) continue;
      for (const [ct, ctObj] of Object.entries(wData)) {
        if (ct.startsWith('_') || !ctObj || !ctObj._category_config) continue;

        const ctNorm = getNormalizedCourseType(ct);
        if (targetCourseTypeNorm && ctNorm && ctNorm !== targetCourseTypeNorm) continue;

        for (const [cName, cConf] of Object.entries(ctObj._category_config)) {
          if (!cConf || !cConf.exam_marks) continue;

          if (examId && cConf.exam_marks[examId] !== undefined && cConf.exam_marks[examId] !== "") {
            const markVal = parseInt(cConf.exam_marks[examId], 10);
            if (!isNaN(markVal) && markVal > 0) return markVal;
          }

          if (selectedCategory && normClean(cName) === normClean(selectedCategory)) {
            if (cConf.exam_marks && typeof cConf.exam_marks === 'object') {
              const markVals = Object.values(cConf.exam_marks).map(v => parseInt(v, 10)).filter(v => !isNaN(v) && v > 0);
              if (markVals.length > 0) return markVals[0];
            }
          }
        }
      }
    }

    return parseInt(selectedConfig?.totalMarks, 10) || 0;
  }, [exam, program, batch, academicYear, subjectCourseType, selectedCategory, courseWeightageData, getRegulationForBatch]);

  const alertIfMarksMismatchWithConfig = useCallback((selectedConfig, currentTotal) => {
    const configTotal = getConfiguredExamTotalMarks(selectedConfig);
    if (!configTotal) return false; // Nothing to validate (e.g., ESE/Indirect)
    if (currentTotal === configTotal) return false;

    const diff = currentTotal - configTotal;
    const status = diff > 0 ? 'HIGH' : 'LOW';
    const action = diff > 0 ? 'reduce' : 'increase';
    const by = Math.abs(diff);
    alert(
      `Your mark is ${status}.\n` +
      `Configured total marks: ${configTotal}\n` +
      `Your current paper total: ${currentTotal}\n` +
      `Please ${action} by ${by} mark(s) before proceeding.`
    );
    return true;
  }, [getConfiguredExamTotalMarks]);

  useEffect(() => {
    const ciaRef = collection(db, 'cia_configs');
    const unsubscribe = onSnapshot(ciaRef, (snapshot) => {
      const configsArray = [];
      snapshot.forEach(doc => {
        configsArray.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setCiaConfigs(configsArray);
    });

    return () => unsubscribe();
  }, []);

  const [qpSetterAssignmentsData, setQpSetterAssignmentsData] = useState({});
  const [allSyllabusDataList, setAllSyllabusDataList] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'qp_setter_assignments'), (snap) => {
      const data = {};
      snap.forEach(doc => { data[doc.id] = doc.data(); });
      setQpSetterAssignmentsData(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'syllabus_data'), (snap) => {
      const list = [];
      snap.forEach(doc => { list.push({ id: doc.id, data: doc.data() }); });
      setAllSyllabusDataList(list);
    });
    return () => unsub();
  }, []);

  const commonForDisplay = useMemo(() => {
    if (!batch || !selectedSemester || !subject) return "NIL";

    const subjectCode = getSubjectCodeFrom(subject);
    if (!subjectCode) return "NIL";

    const semNum = deriveSemesterNumber(selectedSemester);
    const normCode = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const codeClean = normCode(subjectCode);
    const batchNorm = normCode(batch);
    const deptNorm = normCode(department);

    let matchedAssignment = null;

    Object.values(qpSetterAssignmentsData || {}).forEach(docData => {
      if (matchedAssignment) return;
      const dBatch = normCode(docData.batch || "");
      const dSem = String(docData.semester || "").trim();

      const startYr1 = batch.match(/20\d{2}/)?.[0] || batch.match(/\b\d{2}\b/)?.[0] || "";
      const targetStr = (docData.batch || "") + " " + (docData.id || "");
      const startYr2 = targetStr.match(/20\d{2}/)?.[0] || targetStr.match(/\b\d{2}\b/)?.[0] || "";

      let yearMatches = false;
      if (startYr1 && startYr2) {
        const y1Clean = startYr1.length === 2 ? `20${startYr1}` : startYr1;
        const y2Clean = startYr2.length === 2 ? `20${startYr2}` : startYr2;
        yearMatches = (y1Clean === y2Clean);
      }

      if ((dBatch === batchNorm || dBatch.includes(batchNorm) || batchNorm.includes(dBatch) || yearMatches) && dSem === semNum) {
        if (docData.assignments && typeof docData.assignments === "object") {
          const found = Object.entries(docData.assignments).find(([k, v]) => normCode(k) === codeClean || normCode(v?.code || "") === codeClean);
          if (found && found[1] && Array.isArray(found[1].departments)) {
            matchedAssignment = found[1];
          }
        }
      }
    });

    let deptList = [];
    if (matchedAssignment && Array.isArray(matchedAssignment.departments) && matchedAssignment.departments.length > 0) {
      deptList = matchedAssignment.departments.map(d => d.dept || d.deptKey || d.name || d.progKey || d);
    }

    if (deptList.length <= 1 && allSyllabusDataList && allSyllabusDataList.length > 0) {
      const syllabusDepts = new Set();
      allSyllabusDataList.forEach(sDoc => {
        const parts = String(sDoc.id || '').split('_');
        let deptKey = "";
        if (parts.length >= 3) {
          const deptStartIdx = (['B', 'M'].includes(parts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(parts[1])) ? 2 : 1;
          deptKey = parts.slice(deptStartIdx, parts.length - 1).join('_');
        }
        const subs = sDoc.data?.semesters?.[semNum] || [];
        if (Array.isArray(subs)) {
          const hasSub = subs.some(sub => sub && normCode(sub.code || sub.subjectCode || sub.courseCode || "") === codeClean);
          if (hasSub && deptKey) {
            syllabusDepts.add(deptKey);
          }
        }
      });
      if (syllabusDepts.size > 1) {
        deptList = Array.from(syllabusDepts);
      }
    }

    if (deptList.length <= 1) return "NIL";

    const otherDepts = deptList.filter(d => {
      const dn = normCode(d);
      return dn !== deptNorm && !dn.includes(deptNorm) && !deptNorm.includes(dn);
    });

    if (otherDepts.length === 0) return "NIL";

    return otherDepts.map(d => {
      const formatted = formatDepartmentDisplay(d);
      return formatted.replace(/^(B\.E\.|B\.Tech\.|M\.E\.|M\.Tech\.)\s*/i, '').trim() || d;
    }).join(", ");
  }, [batch, selectedSemester, subject, department, qpSetterAssignmentsData, allSyllabusDataList, getSubjectCodeFrom]);

  const scheduledExamInfo = useMemo(() => {
    if (!batch || !selectedSemester || !subject) return { date: "", duration: "180 min", rawDate: "", startTime: "", endTime: "" };

    const subjectCode = getSubjectCodeFrom(subject);
    if (!subjectCode) return { date: "", duration: "180 min", rawDate: "", startTime: "", endTime: "" };

    const semNum = deriveSemesterNumber(selectedSemester);
    const normCode = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const codeClean = normCode(subjectCode);
    const batchNorm = normCode(batch);

    let matchedAssignment = null;

    Object.values(qpSetterAssignmentsData || {}).forEach(docData => {
      if (matchedAssignment) return;
      const dBatch = normCode(docData.batch || "");
      const dSem = String(docData.semester || "").trim();

      const startYr1 = batch.match(/20\d{2}/)?.[0] || batch.match(/\b\d{2}\b/)?.[0] || "";
      const targetStr = (docData.batch || "") + " " + (docData.id || "");
      const startYr2 = targetStr.match(/20\d{2}/)?.[0] || targetStr.match(/\b\d{2}\b/)?.[0] || "";

      let yearMatches = false;
      if (startYr1 && startYr2) {
        const y1Clean = startYr1.length === 2 ? `20${startYr1}` : startYr1;
        const y2Clean = startYr2.length === 2 ? `20${startYr2}` : startYr2;
        yearMatches = (y1Clean === y2Clean);
      }

      if ((dBatch === batchNorm || dBatch.includes(batchNorm) || batchNorm.includes(dBatch) || yearMatches) && dSem === semNum) {
        if (docData.assignments && typeof docData.assignments === "object") {
          const found = Object.entries(docData.assignments).find(([k, v]) => normCode(k) === codeClean || normCode(v?.code || "") === codeClean);
          if (found && found[1]) {
            matchedAssignment = found[1];
          }
        }
      }
    });

    if (!matchedAssignment) return { date: "", duration: "180 min", rawDate: "", startTime: "", endTime: "" };

    const rawDate = matchedAssignment.examDate || matchedAssignment.exam_date || matchedAssignment.date || matchedAssignment.assignedDate || "";
    const dateDisplay = formatExamDateDisplay(rawDate);
    const startTime = matchedAssignment.startTime || matchedAssignment.start_time || "";
    const endTime = matchedAssignment.endTime || matchedAssignment.end_time || "";
    const timeSlot = matchedAssignment.timeSlot || matchedAssignment.time_slot || "";
    const durationDisplay = calculateDuration(startTime, endTime, timeSlot);

    return {
      date: dateDisplay,
      duration: durationDisplay,
      rawDate: rawDate,
      startTime,
      endTime,
      timeSlot
    };
  }, [batch, selectedSemester, subject, qpSetterAssignmentsData, getSubjectCodeFrom]);

  // Resolve the authoritative per-subject Question Paper Set count from qp_setter_assignments
  // (set in IAScheduleCreation / QPSetterAssignment). This is keyed by the stable subject code,
  // so it does NOT oscillate between name strings and Firebase push IDs like the cia_configs
  // exam identity does — keeping the Sets dropdown visible across async reloads.
  const subjectAssignmentSetCount = useMemo(() => {
    if (!batch || !selectedSemester || !subject) return 0;
    const subjectCode = getSubjectCodeFrom(subject);
    if (!subjectCode) return 0;

    const semNum = deriveSemesterNumber(selectedSemester);
    const normCode = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const codeClean = normCode(subjectCode);
    const batchNorm = normCode(batch);

    let matchedAssignment = null;

    Object.values(qpSetterAssignmentsData || {}).forEach(docData => {
      if (matchedAssignment) return;
      const dBatch = normCode(docData.batch || "");
      const dSem = String(docData.semester || "").trim();

      const startYr1 = batch.match(/20\d{2}/)?.[0] || batch.match(/\b\d{2}\b/)?.[0] || "";
      const targetStr = (docData.batch || "") + " " + (docData.id || "");
      const startYr2 = targetStr.match(/20\d{2}/)?.[0] || targetStr.match(/\b\d{2}\b/)?.[0] || "";

      let yearMatches = false;
      if (startYr1 && startYr2) {
        const y1Clean = startYr1.length === 2 ? `20${startYr1}` : startYr1;
        const y2Clean = startYr2.length === 2 ? `20${startYr2}` : startYr2;
        yearMatches = (y1Clean === y2Clean);
      }

      if ((dBatch === batchNorm || dBatch.includes(batchNorm) || batchNorm.includes(dBatch) || yearMatches) && dSem === semNum) {
        if (docData.assignments && typeof docData.assignments === "object") {
          const found = Object.entries(docData.assignments).find(([k, v]) => normCode(k) === codeClean || normCode(v?.code || "") === codeClean);
          if (found && found[1]) {
            matchedAssignment = found[1];
          }
        }
      }
    });

    if (!matchedAssignment) return 0;
    const raw = matchedAssignment.numSets ?? matchedAssignment.num_set ?? matchedAssignment.sets;
    const parsed = parseInt(raw, 10);
    return (!isNaN(parsed) && parsed > 0) ? parsed : 0;
  }, [batch, selectedSemester, subject, qpSetterAssignmentsData, getSubjectCodeFrom]);

  const effectiveSetCount = useMemo(() => {
    if (subjectAssignmentSetCount > 1) return subjectAssignmentSetCount;
    const cfg = getExamConfig(exam);
    return cfg ? Math.max(getEffectiveNumSets(cfg), subjectAssignmentSetCount) : subjectAssignmentSetCount;
  }, [subjectAssignmentSetCount, getExamConfig, exam, getEffectiveNumSets]);

  // Fetch course_type_weightage for regulation-based dynamic exam categories
  useEffect(() => {
    const wRef = collection(db, 'course_type_weightage');
    const unsub = onSnapshot(wRef, (snap) => {
      const data = {};
      snap.forEach(doc => { data[doc.id] = doc.data(); });
      setCourseWeightageData(data);
    });
    return () => unsub();
  }, []);

  // Load Bloom's taxonomy domains for KL Domain dropdown
  useEffect(() => {
    const bloomsRef = collection(db, 'blooms_taxonomy'); // Firestore collection reference
    const unsub = onSnapshot(bloomsRef, (snapshot) => { // Use onSnapshot for real-time updates
      const data = {}; // Convert QuerySnapshot to object
      snapshot.forEach(doc => { data[doc.id] = doc.data(); });
      setBloomsDomains(data || {});
      // If no domain selected yet, pick first domain available
      if (!qbKLDomain) {
        const keys = Object.keys(data || {});
        if (keys.length) setQbKLDomain(keys[0]);
      }
    });
    return () => unsub();
  }, [qbKLDomain]);

  // Fetch Course Details (including CO content and levels) for AI generation
  useEffect(() => {
    const fetchCourseDetails = async () => {
      if (!program || !department || !batch || !subject) {
        setSubjectCourseDetails(null);
        return;
      }
      const progKey = formatProgrammeKey(program);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!regulation) {
        setSubjectCourseDetails(null);
        return;
      }

      const deptKey = sanitizeKey(department);
      const deptKeyStrict = sanitizeKeyStrict(department);
      const regKey = sanitizeKey(regulation);
      const subjectKey = sanitizeKey(subjectCode);

      let courseData = null;
      try {
        // CourseBank saves as {prog}_{dept}_{reg}_{code} — try regulation-inclusive keys first
        let courseRef = doc(db, 'courses', `${progKey}_${deptKey}_${regKey}_${subjectKey}`);
        let snap = await getDoc(courseRef);
        if (!snap.exists() && deptKeyStrict !== deptKey) {
          courseRef = doc(db, 'courses', `${progKey}_${deptKeyStrict}_${regKey}_${subjectKey}`);
          snap = await getDoc(courseRef);
        }
        if (!snap.exists()) {
          courseRef = doc(db, 'courses', `${progKey}_Overall_${regKey}_${subjectKey}`);
          snap = await getDoc(courseRef);
        }
        // Legacy fallback — docs saved without regulation segment
        if (!snap.exists()) {
          courseRef = doc(db, 'courses', `${progKey}_${deptKey}_${subjectKey}`);
          snap = await getDoc(courseRef);
        }
        if (!snap.exists() && deptKeyStrict !== deptKey) {
          courseRef = doc(db, 'courses', `${progKey}_${deptKeyStrict}_${subjectKey}`);
          snap = await getDoc(courseRef);
        }
        if (!snap.exists()) {
          courseRef = doc(db, 'courses', `${progKey}_Overall_${subjectKey}`);
          snap = await getDoc(courseRef);
        }
        if (snap.exists()) courseData = snap.data();

        // Fallback 1: check course_bank if type/category is missing in courseData
        if (!courseData || (!courseData.type && !courseData.category)) {
          try {
            let cbRef = doc(db, 'course_bank', subjectKey);
            let cbSnap = await getDoc(cbRef);
            if (!cbSnap.exists()) {
              cbRef = doc(db, 'course_bank', `${deptKey}_${subjectKey}`);
              cbSnap = await getDoc(cbRef);
            }
            if (!cbSnap.exists()) {
              cbRef = doc(db, 'course_bank', `${progKey}_${deptKey}_${subjectKey}`);
              cbSnap = await getDoc(cbRef);
            }
            if (cbSnap.exists()) {
              const cbData = cbSnap.data();
              const derivedType = cbData.category || cbData.type || cbData.courseType || cbData.course_type;
              courseData = { ...(courseData || {}), ...cbData, type: derivedType };
            }
          } catch (cbErr) {
            console.warn("course_bank fetch error:", cbErr);
          }
        }

        // Fallback 2: check syllabus_data if type/category is still missing
        if (!courseData || (!courseData.type && !courseData.category)) {
          try {
            const sylRef = doc(db, 'syllabus_data', `${progKey}_${deptKey}_${regKey}`);
            let sylSnap = await getDoc(sylRef);
            if (!sylSnap.exists() && deptKeyStrict !== deptKey) {
              sylSnap = await getDoc(doc(db, 'syllabus_data', `${progKey}_${deptKeyStrict}_${regKey}`));
            }
            if (sylSnap.exists()) {
              const sData = sylSnap.data() || {};
              const semNumStr = String(deriveSemesterNumber(selectedSemester));
              const semList = sData.semesters?.[semNumStr] || sData.semesters?.[Number(semNumStr)] || [];
              const subObj = semList.find(s => s && sanitizeKey(s.code) === subjectKey);
              if (subObj) {
                const derivedType = subObj.category || subObj.type || subObj.courseType;
                if (derivedType) {
                  courseData = { ...(courseData || {}), type: derivedType };
                }
              }
            }
          } catch (err) {
            console.warn("Fallback syllabus_data fetch error:", err);
          }
        }
      } catch (error) { console.error("Error fetching course details for AI:", error); }
      setSubjectCourseDetails(courseData);
    };
    fetchCourseDetails();
  }, [program, department, batch, subject, getRegulationForBatch, selectedSemester]);

  const findCategoryData = useCallback((reg, cType) => {
    if (!reg || !cType) return null;
    const normClean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSubjType = normClean(cType);

    if (reg[cType]) return reg[cType];
    const keys = Object.keys(reg).filter(k => !k.startsWith('_'));
    if (cleanSubjType) {
      const directKey = keys.find(k => normClean(k) === cleanSubjType);
      if (directKey) return reg[directKey];
    }

    const getNormType = (typeStr) => {
      const s = normClean(typeStr);
      if (s.includes('cum') || s.includes('integrated') || s.includes('withlab') || s.includes('lit')) return 'integrated';
      if (s.includes('practical') || s.includes('lab')) return 'practical';
      if (s.includes('project')) return 'project';
      if (s.includes('activity')) return 'activity';
      return 'theory';
    };

    const targetNorm = getNormType(cType);
    const catKey = keys.find(k => {
      const kn = normClean(k);
      if (targetNorm === 'theory' && (kn === 'theory' || kn.includes('theory') || kn.includes('lecture'))) {
        return !kn.includes('lab') && !kn.includes('practical') && !kn.includes('integrated') && !kn.includes('cum') && !kn.includes('lit');
      }
      if (targetNorm === 'practical' && (kn === 'laboratory' || kn === 'practical' || kn.includes('lab') || kn.includes('practical'))) {
        return !kn.includes('theory') && !kn.includes('lit');
      }
      if (targetNorm === 'integrated' && (kn.includes('cum') || kn.includes('integrated') || kn.includes('withlab') || kn.includes('lit') || (kn.includes('theory') && kn.includes('lab')))) {
        return true;
      }
      if (targetNorm === 'project' && (kn.includes('project') || kn.includes('viva'))) return true;
      if (targetNorm === 'activity' && kn.includes('activity')) return true;
      return false;
    });

    return catKey ? reg[catKey] : null;
  }, []);

  const availableCategories = useMemo(() => {
    const regulation = getRegulationForBatch(formatProgrammeKey(program), batch);
    const regSanitized = sanitizeKey(regulation);
    const aySanitized = sanitizeKey(academicYear);
    const regAyKey = `${regSanitized}_${aySanitized}`;
    const regCleanNorm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const regAyCleanNorm = regCleanNorm(`${regulation}_${academicYear}`);
    const regNorm = regCleanNorm(regulation);

    let regWeightage = courseWeightageData[regAyKey];
    if (!regWeightage && regAyCleanNorm) {
      const matchAyKey = Object.keys(courseWeightageData || {}).find(k => {
        const kn = regCleanNorm(k);
        return kn === regAyCleanNorm || kn.includes(regAyCleanNorm);
      });
      if (matchAyKey) regWeightage = courseWeightageData[matchAyKey];
    }
    if (!regWeightage) {
      regWeightage = courseWeightageData[regSanitized];
      if (!regWeightage && regNorm) {
        const matchRegKey = Object.keys(courseWeightageData || {}).find(k => {
          const kn = regCleanNorm(k);
          return (kn === regNorm || kn.includes(regNorm)) && !kn.includes('_20');
        });
        if (matchRegKey) regWeightage = courseWeightageData[matchRegKey];
      }
    }

    const list = [];
    if (regWeightage && subjectCourseType) {
      const catData = findCategoryData(regWeightage, subjectCourseType);
      if (catData && catData._category_config) {
        Object.keys(catData._category_config).forEach(catName => {
          if (catName && !list.includes(catName)) list.push(catName);
        });
      }
    }

    // Also surface categories that have exams configured in cia_configs for this
    // regulation + course type + academic year, even if the weightage doc's
    // _category_config only contains a subset (e.g. only "Written Test").
    const targetCourseTypeNorm = getNormalizedCourseType(subjectCourseType);
    if (ciaConfigs && ciaConfigs.length > 0) {
      const getCategoryForCfg = (cfg) => {
        if (cfg.isAssignment || cfg.isActivity) return "Activity";
        if (cfg.isProject) return "Project";
        if (cfg.isPractical) return "Practical";
        if (cfg.isUniversity) return "ESE";
        if (cfg.isIndirectAssessment) return "Indirect Assessment";
        const nameClean = regCleanNorm(cfg.examName || cfg.exam_name || cfg.title || cfg.name || cfg.exam || cfg.label || '');
        if (nameClean.includes('practical') || nameClean.includes('lab') || nameClean.includes('observation')) return "Practical";
        if (nameClean.includes('project')) return "Project";
        if (nameClean.includes('activity') || nameClean.includes('assignment')) return "Activity";
        if (nameClean.includes('indirect') || nameClean.includes('survey') || nameClean.includes('exit')) return "Indirect Assessment";
        return "Written Test";
      };
      ciaConfigs.forEach(cfg => {
        if (!cfg || !cfg.regulation) return;
        const cfgRegClean = regCleanNorm(cfg.regulation);
        if (cfgRegClean !== regNorm && !cfgRegClean.includes(regNorm) && !regNorm.includes(cfgRegClean)) return;
        const cfgAyNorm = regCleanNorm(cfg.academicYear);
        if (cfgAyNorm && cfgAyNorm !== regCleanNorm(academicYear)) return;
        if (cfg.courseTypes && Array.isArray(cfg.courseTypes) && cfg.courseTypes.length > 0) {
          const cfgCourseTypeNorms = cfg.courseTypes.map(ct => getNormalizedCourseType(ct));
          if (!cfgCourseTypeNorms.includes(targetCourseTypeNorm) && !(targetCourseTypeNorm === 'integrated' && (cfgCourseTypeNorms.includes('theory') || cfgCourseTypeNorms.includes('practical')))) return;
        }
        const cat = getCategoryForCfg(cfg);
        if (cat && !list.includes(cat)) list.push(cat);
      });
    }

    const finalCategories = list;

    // Exclude ESE and Indirect Assessment
    return finalCategories.filter(catName => {
      const cn = String(catName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return !cn.includes('ese') && !cn.includes('indirect');
    });
  }, [program, batch, academicYear, courseWeightageData, subjectCourseType, ciaConfigs, getRegulationForBatch, findCategoryData]);

  useEffect(() => {
    if (!availableCategories || availableCategories.length === 0) return;

    const urlCat = searchParams.get('category') || searchParams.get('cat') || searchParams.get('categoryName');
    const urlExam = searchParams.get('exam') || searchParams.get('examName') || searchParams.get('examId') || searchParams.get('cia');
    const normClean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    let targetCategory = null;

    // 1. Explicit Category URL param match
    if (urlCat) {
      const urlCatClean = normClean(urlCat);
      targetCategory = availableCategories.find(c => {
        const cn = normClean(c);
        return cn === urlCatClean || cn.includes(urlCatClean) || urlCatClean.includes(cn);
      });
    }

    // 2. Exam URL param match (match exam name to best category)
    if (!targetCategory && urlExam) {
      const urlExamClean = normClean(urlExam);
      const testExamCategoryMatch = (examNameStr, catName) => {
        const cn = normClean(catName);
        const en = normClean(examNameStr);
        if (!en || !cn) return false;
        if (en.includes('practical') || en.includes('lab') || en.includes('observation')) {
          return cn.includes('practical') || cn.includes('lab') || cn.includes('observation');
        }
        if (en.includes('project')) return cn.includes('project');
        if (en.includes('activity') || en.includes('assignment')) return cn.includes('activity') || cn.includes('assignment');
        if (en.includes('indirect') || en.includes('survey')) return cn.includes('indirect');
        return cn.includes('written') || cn.includes('test') || cn.includes('cia') || cn.includes('internal') || cn.includes('continuous');
      };

      targetCategory = availableCategories.find(catName => testExamCategoryMatch(urlExamClean, catName));

      if (!targetCategory && ciaConfigs && ciaConfigs.length > 0) {
        const matchingCfg = ciaConfigs.find(cfg => {
          const cfgId = String(cfg.id || '');
          const cfgName = String(cfg.examName || cfg.exam_name || cfg.title || cfg.name || cfg.exam || cfg.label || '');
          return cfgId === String(urlExam) || normClean(cfgName) === urlExamClean || normClean(cfgId) === urlExamClean;
        });

        if (matchingCfg) {
          const cfgName = matchingCfg.examName || matchingCfg.exam_name || matchingCfg.title || matchingCfg.name || matchingCfg.exam || matchingCfg.label || '';
          targetCategory = availableCategories.find(catName => testExamCategoryMatch(cfgName, catName));
        }
      }
    }

    // 3. Subject Course Type match
    if (!targetCategory && subjectCourseType) {
      const sTypeClean = normClean(subjectCourseType);
      if (sTypeClean.includes('lab') || sTypeClean.includes('practical')) {
        targetCategory = availableCategories.find(c => {
          const cn = normClean(c);
          return cn.includes('practical') || cn.includes('lab') || cn.includes('observation');
        });
      } else if (sTypeClean.includes('project')) {
        targetCategory = availableCategories.find(c => normClean(c).includes('project'));
      } else if (sTypeClean.includes('activity')) {
        targetCategory = availableCategories.find(c => normClean(c).includes('activity') || normClean(c).includes('assignment'));
      } else {
        targetCategory = availableCategories.find(c => {
          const cn = normClean(c);
          return cn.includes('written') || cn.includes('test') || cn.includes('cia') || cn.includes('internal') || cn.includes('continuous');
        });
      }
    }

    // 4. Default fallback to first category
    if (!targetCategory) {
      targetCategory = availableCategories[0];
    }

    if (!selectedCategory || !availableCategories.includes(selectedCategory) || (urlExam && targetCategory && selectedCategory !== targetCategory) || (urlCat && targetCategory && selectedCategory !== targetCategory)) {
      handleCategorySelect(targetCategory);
    }
  }, [availableCategories, subjectCourseType, searchParams, ciaConfigs]);

  const handleCategorySelect = (catName) => {
    setSelectedCategory(catName);
    setExam('');
    setCustomExam('');
    setShowParts(false);
    setQbAvailableQNos([]);

    const catClean = (catName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (catClean.includes('activity') || catClean.includes('assignment')) {
      setAssessmentType('Assignment');
    } else if (catClean.includes('project')) {
      setAssessmentType('Project');
    } else if (catClean.includes('practical') || catClean.includes('observation') || catClean.includes('lab')) {
      setAssessmentType('Practical');
    } else if (catClean.includes('indirect') || catClean.includes('survey')) {
      setAssessmentType('Indirect');
    } else {
      setAssessmentType('Exam');
    }
  };

  const filteredExams = useMemo(() => {
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject) return [];

    const semNum = deriveSemesterNumber(selectedSemester);
    const regulation = getRegulationForBatch(formatProgrammeKey(program), batch);
    const norm = (v) => String(v || '').trim().toLowerCase();
    const normClean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const selectedProg = norm(formatProgrammeKey(program));
    const selectedDept = norm(department);
    const selectedBatch = norm(batch);
    const selectedAy = norm(academicYear);

    const targetCourseTypeNorm = getNormalizedCourseType(subjectCourseType);

    const examList = [];
    const seenNames = new Set();

    const isRawFirebaseId = (str) => {
      if (!str) return true;
      const s = String(str).trim();
      if (s.startsWith('-') && s.length > 10) return true;
      if (/^[A-Za-z0-9_-]{18,}$/.test(s) && !s.includes(' ')) return true;
      return false;
    };

    const isActivityExamName = (configObj, nameClean) =>
      (configObj && (configObj.isActivity || configObj.isGroupActivity)) ||
      nameClean.includes('activity') ||
      nameClean.includes('seminar') ||
      nameClean.includes('group discussion') ||
      nameClean.includes('value added');

    const doesExamMatchCategory = (cfg, categoryName) => {
      if (!categoryName) return true;

      const cn = normClean(categoryName);
      const examNameClean = normClean(cfg?.examName || cfg?.exam_name || cfg?.title || cfg?.name || cfg?.exam || cfg?.label || cfg?.eventTitle || cfg?.eventName || '');

      const isAssignmentOrActivity = Boolean(cfg?.isAssignment || cfg?.isActivity || examNameClean.includes('assignment') || examNameClean.includes('activity'));
      const isPractical = Boolean(cfg?.isPractical || examNameClean.includes('practical') || examNameClean.includes('lab') || examNameClean.includes('observation'));
      const isProject = Boolean(cfg?.isProject || examNameClean.includes('project'));
      const isIndirect = Boolean(cfg?.isIndirectAssessment || examNameClean.includes('indirect') || examNameClean.includes('survey') || examNameClean.includes('exit'));
      const isEse = Boolean(cfg?.isUniversity || examNameClean.includes('ese') || examNameClean.includes('endsemester') || examNameClean.includes('university') || examNameClean.includes('endsem') || examNameClean.includes('external'));

      if (cn.includes('activity') || cn.includes('assignment')) return isAssignmentOrActivity && !isProject && !isIndirect && !isEse;
      if (cn.includes('practical') || cn.includes('lab') || cn.includes('observation')) return isPractical && !isEse;
      if (cn.includes('project')) return isProject && !isEse;
      if (cn.includes('indirect') || cn.includes('survey') || cn.includes('exit')) return isIndirect;
      if (cn.includes('ese') || cn.includes('endsemester') || cn.includes('university') || cn.includes('endsem')) return isEse;

      // Default: Written / CIA Test (IA 1, IA 2, IA 3, Model Exam)
      return !isAssignmentOrActivity && !isPractical && !isProject && !isIndirect && !isEse;
    };

    const addExam = (id, rawName, type) => {
      let name = '';
      if (typeof rawName === 'object' && rawName !== null) {
        name = rawName.examName || rawName.exam_name || rawName.title || rawName.name || rawName.exam || rawName.label || '';
      } else {
        name = String(rawName || '').trim();
      }

      if (!name || isRawFirebaseId(name)) return;
      const cleanName = normClean(name);
      if (!cleanName) return;
      const dedupKey = cleanName.replace(/(exam|examination|test|assessment|evaluation|lab|internal|external)$/g, '').trim();
      if (seenNames.has(cleanName) || (dedupKey !== cleanName && seenNames.has(dedupKey))) return;
      seenNames.add(cleanName);
      if (dedupKey !== cleanName) seenNames.add(dedupKey);
      examList.push({ id: id || name, examName: name, type });
    };

    // Pre-compute regWeightage for disabled exam lookup (tries Academic Year specific key first, falls back to regulation default)
    const regSanitized = sanitizeKey(regulation);
    const aySanitized = sanitizeKey(academicYear);
    const regAyKey = `${regSanitized}_${aySanitized}`;
    const regCleanNorm = normClean(regulation);
    const regAyCleanNorm = normClean(`${regulation}_${academicYear}`);

    let regWeightage = courseWeightageData[regAyKey];
    if (!regWeightage && regAyCleanNorm) {
      const matchAyKey = Object.keys(courseWeightageData || {}).find(k => {
        const kn = normClean(k);
        return kn === regAyCleanNorm || kn.includes(regAyCleanNorm);
      });
      if (matchAyKey) regWeightage = courseWeightageData[matchAyKey];
    }
    if (!regWeightage) {
      regWeightage = courseWeightageData[regSanitized];
      if (!regWeightage && regCleanNorm) {
        const matchRegKey = Object.keys(courseWeightageData || {}).find(k => {
          const kn = normClean(k);
          return (kn === regCleanNorm || kn.includes(regCleanNorm)) && !kn.includes('_20');
        });
        if (matchRegKey) regWeightage = courseWeightageData[matchRegKey];
      }
    }

    const ciaConfigById = new Map();
    ciaConfigs.forEach(c => ciaConfigById.set(c.id, c));
    const disabledExamIds = new Set();
    const disabledExamNames = new Set();

    const findCategoryData = (reg) => {
      if (!reg || !subjectCourseType) return null;

      const cleanSubjType = normClean(subjectCourseType);

      // 1. Direct exact key match (e.g. reg["Theory"] or reg["Laboratory"])
      if (reg[subjectCourseType]) return reg[subjectCourseType];

      // 2. Exact normalized key match against reg keys
      const keys = Object.keys(reg).filter(k => !k.startsWith('_'));
      if (cleanSubjType) {
        const directKey = keys.find(k => normClean(k) === cleanSubjType);
        if (directKey) return reg[directKey];
      }

      // 3. Category match based on targetCourseTypeNorm (theory, practical, integrated, project, activity, mandatory)
      const catKey = keys.find(k => {
        const kn = normClean(k);
        if (targetCourseTypeNorm === 'mandatory' && (kn.includes('mandatory') || kn.includes('mc'))) {
          return true;
        }
        if (targetCourseTypeNorm === 'theory' && (kn === 'theory' || kn.includes('theory') || kn.includes('lecture'))) {
          return !kn.includes('lab') && !kn.includes('practical') && !kn.includes('integrated') && !kn.includes('cum') && !kn.includes('lit') && !kn.includes('mandatory');
        }
        if (targetCourseTypeNorm === 'practical' && (kn === 'laboratory' || kn === 'practical' || kn.includes('lab') || kn.includes('practical'))) {
          return !kn.includes('theory') && !kn.includes('lit');
        }
        if (targetCourseTypeNorm === 'integrated' && (kn.includes('cum') || kn.includes('integrated') || kn.includes('withlab') || kn.includes('lit') || (kn.includes('theory') && kn.includes('lab')))) {
          return true;
        }
        if (targetCourseTypeNorm === 'project' && (kn.includes('project') || kn.includes('viva'))) {
          return true;
        }
        if (targetCourseTypeNorm === 'activity' && kn.includes('activity')) {
          return true;
        }
        return false;
      });

      if (catKey) return reg[catKey];
      return null;
    };

    const catDataForLookup = regWeightage ? findCategoryData(regWeightage) : null;
    if (catDataForLookup && catDataForLookup._category_config) {
      Object.values(catDataForLookup._category_config).forEach(cfg => {
        if (cfg && cfg.consider_for_internal === false && cfg.exam_weightage) {
          Object.keys(cfg.exam_weightage).forEach(id => {
            disabledExamIds.add(id);
            const resolvedCfg = ciaConfigById.get(id);
            if (resolvedCfg) {
              const rn = resolvedCfg.examName || resolvedCfg.exam_name || resolvedCfg.title || resolvedCfg.name || resolvedCfg.exam || resolvedCfg.label || resolvedCfg.eventTitle || resolvedCfg.eventName;
              if (rn) disabledExamNames.add(normClean(rn));
            }
          });
        }
      });
    }

    const activeCategoryTarget = selectedCategory || (availableCategories && availableCategories.length > 0 ? availableCategories[0] : 'WRITTEN TEST');

    // 1. Process course_type_weightage from Firestore for current regulation (Curriculum configured exams)
    let addedFromWeightage = false;

    if (regWeightage) {
      const categoryData = findCategoryData(regWeightage);

      if (categoryData && categoryData._category_config) {
        // If Curriculum weightage is configured for this regulation/course type, mark weightage active
        addedFromWeightage = true;

        Object.entries(categoryData._category_config).forEach(([cName, cConf]) => {
          if (!cConf || cConf.consider_for_internal === false) return;

          if (normClean(cName) !== normClean(activeCategoryTarget)) return;

          const candidateExamsMap = new Map();

          // 1. Explicitly configured exams in exam_weightage for this category
          const hasExplicitWeightageExams = cConf.exam_weightage && typeof cConf.exam_weightage === 'object' && Object.keys(cConf.exam_weightage).length > 0;

          if (hasExplicitWeightageExams) {
            Object.keys(cConf.exam_weightage).forEach(id => {
              let cfg = ciaConfigById.get(id);
              if (!cfg) {
                const normId = normClean(id);
                const normReg = normClean(regulation);
                const candidates = ciaConfigs.filter(c => {
                  if (!c) return false;
                  const cName = normClean(c.examName || c.exam_name || c.title || c.name || c.exam || c.label || '');
                  return cName && cName === normId;
                });
                if (candidates.length > 0) {
                  cfg = candidates.find(c => {
                    const cr = normClean(c.regulation || '');
                    return cr === normReg || cr.includes(normReg) || normReg.includes(cr);
                  }) || candidates[0];
                }
              }
              const resolvedId = cfg ? cfg.id : id;
              candidateExamsMap.set(resolvedId, { id: resolvedId, config: cfg, rawName: cfg ? null : id });
            });
          }

          // 2. ALSO include matching ciaConfigs for this regulation, course type, and category so no standard exams are missed
          ciaConfigs.forEach(cfg => {
            if (!cfg || !cfg.regulation) return;
            const cfgRegClean = normClean(cfg.regulation);
            if (cfgRegClean !== normClean(regulation) && !cfgRegClean.includes(normClean(regulation)) && !normClean(regulation).includes(cfgRegClean)) return;

            if (cfg.courseTypes && Array.isArray(cfg.courseTypes) && cfg.courseTypes.length > 0) {
              const cfgCourseTypesNorm = cfg.courseTypes.map(ct => getNormalizedCourseType(ct));
              if (!cfgCourseTypesNorm.includes(targetCourseTypeNorm) && !(targetCourseTypeNorm === 'integrated' && (cfgCourseTypesNorm.includes('theory') || cfgCourseTypesNorm.includes('practical')))) return;
            }

            // Match exam using direct CIA Config flags against selected category
            const matchesCategory = doesExamMatchCategory(cfg, activeCategoryTarget);

            if (matchesCategory && !candidateExamsMap.has(cfg.id)) {
              candidateExamsMap.set(cfg.id, { id: cfg.id, config: cfg, rawName: null });
            }
          });

          candidateExamsMap.forEach(({ id, config: resolvedCfg, rawName }) => {
            const rn = resolvedCfg
              ? (resolvedCfg.examName || resolvedCfg.exam_name || resolvedCfg.title || resolvedCfg.name || resolvedCfg.exam || resolvedCfg.label || resolvedCfg.eventTitle || resolvedCfg.eventName)
              : rawName;

            if (rn && !isRawFirebaseId(rn)) {
              // Every exam MUST match the active category based on its CIA Config flags/type.
              if (resolvedCfg) {
                if (!doesExamMatchCategory(resolvedCfg, activeCategoryTarget)) return;
              } else {
                if (!doesExamMatchCategory({ examName: rn }, activeCategoryTarget)) return;
              }

              addExam(resolvedCfg ? resolvedCfg.id : id, rn, 'weightage');
            }
          });
        });

        // If the selected category is NOT defined in _category_config (e.g. only raw CIA
        // configs exist for it), fall back to matching raw ciaConfigs for that category so
        // the exam dropdown is never empty for categories surfaced in the dropdown.
        const categoryInWeightage = Object.keys(categoryData._category_config).some(cName => normClean(cName) === normClean(activeCategoryTarget));
        if (!categoryInWeightage) {
          ciaConfigs.forEach(cfg => {
            const resolvedName = cfg.examName || cfg.exam_name || cfg.title || cfg.name || cfg.exam || cfg.label || cfg.eventTitle || cfg.eventName;
            if (!resolvedName || isRawFirebaseId(resolvedName)) return;
            if (!cfg || !cfg.regulation) return;
            const cfgRegClean = normClean(cfg.regulation);
            if (cfgRegClean !== normClean(regulation) && !cfgRegClean.includes(normClean(regulation)) && !normClean(regulation).includes(cfgRegClean)) return;
            if (cfg.courseTypes && Array.isArray(cfg.courseTypes) && cfg.courseTypes.length > 0) {
              const cfgCourseTypesNorm = cfg.courseTypes.map(ct => getNormalizedCourseType(ct));
              if (!cfgCourseTypesNorm.includes(targetCourseTypeNorm) && !(targetCourseTypeNorm === 'integrated' && (cfgCourseTypesNorm.includes('theory') || cfgCourseTypesNorm.includes('practical')))) return;
            }
            if (!doesExamMatchCategory(cfg, activeCategoryTarget)) return;
            if (disabledExamIds.has(cfg.id)) return;
            if (disabledExamNames.has(normClean(resolvedName))) return;
            addExam(cfg.id, resolvedName, 'cia_config');
          });
        }
      }
    }

    // 2. Fallback: Process raw ciaConfigs ONLY if regulation weightage is not configured for this regulation/course type
    if (!addedFromWeightage) {
      ciaConfigs.forEach(config => {
        const resolvedName = config.examName || config.exam_name || config.title || config.name || config.exam || config.label || config.eventTitle || config.eventName;
        if (!resolvedName || isRawFirebaseId(resolvedName)) return;

        if (norm(config.program) && norm(formatProgrammeKey(config.program)) !== selectedProg) return;
        if (norm(config.department) && norm(config.department) !== selectedDept) return;
        if (norm(config.batch) && norm(config.batch) !== selectedBatch) return;
        if (config.semester && String(config.semester) !== semNum) return;
        if (norm(config.regulation) && normClean(config.regulation) !== normClean(regulation) && !normClean(config.regulation).includes(normClean(regulation)) && !normClean(regulation).includes(normClean(config.regulation))) return;

        if (!doesExamMatchCategory(config, activeCategoryTarget)) return;

        const examNameClean = normClean(resolvedName);
        const isPracticalExam = config.isPractical || examNameClean.includes('practical') || examNameClean.includes('observation') || examNameClean.includes('record') || examNameClean.includes('lab');
        const isAssignmentOrActivityExam = config.isAssignment || config.isActivity || examNameClean.includes('assignment') || examNameClean.includes('activity');
        const isProjectExam = config.isProject || examNameClean.includes('project');
        const isIndirectExam = config.isIndirectAssessment || examNameClean.includes('indirect') || examNameClean.includes('survey');
        // Treat 'model' as practical ONLY when the exam name clearly indicates a lab/practical exam
        const isModelPracticalExam = examNameClean.includes('model') && (examNameClean.includes('practical') || examNameClean.includes('lab') || examNameClean.includes('record') || examNameClean.includes('observation'));

        // A. ASSESSMENT TYPE Filter
        if (assessmentType === 'Assignment' || assessmentType === 'Activity') {
          if (!isAssignmentOrActivityExam || isProjectExam || isIndirectExam) return;
        } else if (assessmentType === 'Project') {
          if (!isProjectExam) return;
        } else if (assessmentType === 'Practical') {
          if (!(isPracticalExam || isModelPracticalExam)) return;
        } else if (assessmentType === 'Indirect') {
          if (!isIndirectExam) return;
        } else {
          // AssessmentType === 'Exam'
          if (isAssignmentOrActivityExam || isProjectExam || isIndirectExam) return;
          if (targetCourseTypeNorm === 'theory' && (isPracticalExam || isModelPracticalExam)) return;
          if (targetCourseTypeNorm === 'practical' && !(isPracticalExam || isModelPracticalExam)) return;
        }

        // B. COURSE TYPE Filter — ALWAYS enforce that the exam matches the selected subject's course type
        let configCourseTypeNorms = [];
        if (config.courseTypes && Array.isArray(config.courseTypes) && config.courseTypes.length > 0) {
          configCourseTypeNorms = config.courseTypes.map(ct => getNormalizedCourseType(ct));
        } else {
          // No explicit courseTypes metadata → infer from exam name / flags so unrelated
          // course-type exams never leak into this subject's dropdown.
          if (isPracticalExam || isModelPracticalExam) configCourseTypeNorms = ['practical'];
          else if (isProjectExam) configCourseTypeNorms = ['project'];
          else if (isActivityExamName(config, examNameClean)) configCourseTypeNorms = ['activity'];
          else configCourseTypeNorms = ['theory', 'integrated'];
        }

        const isCourseTypeMatch = configCourseTypeNorms.some(cNorm => {
          if (cNorm === targetCourseTypeNorm) return true;
          if (targetCourseTypeNorm === 'integrated') {
            if (cNorm === 'integrated') return true;
            if (assessmentType === 'Exam' && cNorm === 'theory') return true;
            if (assessmentType === 'Practical' && cNorm === 'practical') return true;
          }
          return false;
        });

        if (!isCourseTypeMatch) return;

        // Skip disabled exams
        if (disabledExamIds.has(config.id)) return;
        if (disabledExamNames.has(normClean(resolvedName))) return;

        addExam(config.id, resolvedName, 'cia_config');
      });
    }

    return examList;
  }, [ciaConfigs, courseWeightageData, program, department, batch, academicYear, selectedSemester, assessmentType, subjectCourseType, subject, getRegulationForBatch]);

  // Fetch ALL saved QPs for this subject and compute combined PO marks
  useEffect(() => {
    const fetchAllQpMarks = async () => {
      if (!department || !academicYear || !subject) {
        setAllQpMarks({});
        return;
      }

      const secSuffix = section ? `_${sanitizeKey(section)}` : '';
      const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subjectCode)}${secSuffix}`;
      const summaryEntries = Object.entries(poSummaryMapping || {});

      if (!summaryEntries.length) {
        setAllQpMarks({});
        return;
      }

      try {
        const qpDocSnap = await getDoc(doc(db, 'generated_qps', key));

        if (!qpDocSnap.exists()) {
          setAllQpMarks({});
          return;
        }

        const qpData = qpDocSnap.data();
        const combinedMarks = {};

        Object.values(qpData).forEach((qpField) => {
          if (!qpField || !qpField.assessment_type) return;

          const at = qpField.assessment_type;
          const isAssignment = at === 'Assignment' || at === 'Project' || at === 'Practical';

          if (isAssignment) {
            (qpField.assignment_config || []).forEach((q) => {
              (q?.mappings || []).forEach((m) => {
                const coCode = String(m?.co || '').trim().toUpperCase();
                const selectedPis = Array.isArray(m?.pis) ? m.pis : [];
                const mapMarks = Number(m?.marks) || 0;
                if (!coCode || mapMarks <= 0 || selectedPis.length === 0) return;

                const base = Math.floor(mapMarks / selectedPis.length);
                const rem = mapMarks % selectedPis.length;

                selectedPis.forEach((pi, piIdx) => {
                  const piShare = piIdx < rem ? base + 1 : base;
                  summaryEntries.forEach(([poCode, poData]) => {
                    const mappedPis = (poData?.checked_map && poData.checked_map[coCode]) || [];
                    if (Array.isArray(mappedPis) && mappedPis.includes(pi)) {
                      combinedMarks[poCode] = (combinedMarks[poCode] || 0) + piShare;
                    }
                  });
                });
              });
            });
          } else if (at === 'Exam') {
            const groups = {};
            (qpField.parts || []).forEach((part) => {
              (part?.questions || []).forEach((q) => {
                const qMarks = Number(q?.marks) || 0;
                const coCode = String(q?.co || '').trim().toUpperCase();
                const piCode = String(q?.pi || '').trim();
                const qnoRaw = String(q?.qno || '');

                if (!coCode || !piCode || qMarks <= 0) return;

                let raw = qnoRaw.toLowerCase().replace(/\s+/g, '');
                raw = raw.replace(/\(?[ab]\)/gi, '');
                raw = raw.replace(/^(\d+)[ab](.*)$/i, '$1$2');
                const base = raw;
                if (!base) return;

                if (!groups[base]) groups[base] = { marks: qMarks, pos: new Set() };
                if (!groups[base].marks && qMarks > 0) groups[base].marks = qMarks;

                summaryEntries.forEach(([poCode, poData]) => {
                  const mappedPis = (poData?.checked_map && poData.checked_map[coCode]) || [];
                  if (Array.isArray(mappedPis) && mappedPis.includes(piCode)) {
                    groups[base].pos.add(poCode);
                  }
                });
              });
            });

            Object.values(groups).forEach(group => {
              const marks = Number(group?.marks) || 0;
              if (marks <= 0) return;
              group.pos.forEach(poCode => {
                combinedMarks[poCode] = (combinedMarks[poCode] || 0) + marks;
              });
            });
          }
        });

        setAllQpMarks(combinedMarks);
      } catch (err) {
        console.error('Error fetching all QP marks:', err);
        setAllQpMarks({});
      }
    };

    fetchAllQpMarks();
  }, [department, academicYear, subject, section, poSummaryMapping]);

  const getAssignmentMarksMeta = useCallback((qIdx) => {
    const idx = qIdx || 0;
    const total = parseInt(assignmentConfig?.[idx]?.marks, 10) || 0;
    const used = (assignmentConfig?.[idx]?.mappings || []).reduce((sum, m) => sum + (parseInt(m?.marks, 10) || 0), 0);
    const remaining = Math.max(total - used, 0);
    const exceeded = Math.max(used - total, 0);
    return { total, used, remaining, exceeded, balanced: used === total };
  }, [assignmentConfig]);

  const getBaseQno = useCallback((qno) => {
    let raw = String(qno || '').trim().toLowerCase().replace(/\s+/g, '');
    raw = raw.replace(/\(?[ab]\)/gi, '');
    raw = raw.replace(/^(\d+)[ab](.*)$/i, '$1$2');
    return raw;
  }, []);

  const deriveCOSummaryFromQp = useCallback((qp) => {
    const activeCOs = new Set();
    const coWeightage = {};

    if (!qp) return { activeCOs, coWeightage };

    // Assignment/Project/Practical: each mapping contributes marks directly to its CO
    if (qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical') {
      (qp.assignment_config || []).forEach((q) => {
        const marks = parseInt(q?.marks, 10) || 0;
        if (marks <= 0) return;

        (q.mappings || []).forEach(m => {
          const co = String(m?.co || '').trim();
          if (!co || !co.toUpperCase().startsWith('CO')) return;
          const mapMarks = parseInt(m?.marks, 10) || 0;
          activeCOs.add(co);
          coWeightage[co] = (coWeightage[co] || 0) + mapMarks;
        });
      });
      return { activeCOs, coWeightage };
    }

    // Indirect: each assignment_config item IS a CO with its full marks as weight
    if (qp.assessment_type === 'Indirect') {
      (qp.assignment_config || []).forEach((q, idx) => {
        const marks = parseInt(q?.marks, 10) || 0;
        if (marks <= 0) return;
        const co = `CO${idx + 1}`;
        activeCOs.add(co);
        coWeightage[co] = (coWeightage[co] || 0) + marks;
      });
      return { activeCOs, coWeightage };
    }

    // Exam: group by base Q.No to avoid double-counting either/or mark allocation
    const groups = {}; // { baseQNo: { marks: number, cos: Set<string> } }
    const addToGroup = (qnoRaw, coRaw, marksRaw) => {
      const co = String(coRaw || '').trim();
      const marks = parseInt(marksRaw, 10) || 0;
      if (!co || !co.toUpperCase().startsWith('CO') || marks <= 0) return;

      const base = getBaseQno(qnoRaw);
      if (!base) return;

      activeCOs.add(co);

      if (!groups[base]) groups[base] = { marks, cos: new Set() };
      // Keep the latest marks value if present (should be stable per base qno)
      if (marks > 0) groups[base].marks = marks;
      groups[base].cos.add(co);
    };

    (qp.parts || []).forEach((part) => {
      (part?.questions || []).forEach((q) => {
        addToGroup(q?.qno, q?.co, q?.marks);
      });
    });

    Object.values(groups).forEach((group) => {
      group.cos.forEach((co) => {
        coWeightage[co] = (coWeightage[co] || 0) + group.marks;
      });
    });

    return { activeCOs, coWeightage };
  }, [getBaseQno]);

  const normalizeQNo = useCallback((qno) => {
    const raw = String(qno || '').trim().toLowerCase().replace(/\s+/g, '');
    const m = raw.match(/^(\d+)(?:\(?([a-z])\)?)?$/i);
    return m ? `${m[1]}${m[2] || ''}` : raw;
  }, []);

  // Format PO-CO mapping for table display
  const poCoTableData = useMemo(() => {
    const tableRows = [];
    if (!poSummaryMapping || Object.keys(poSummaryMapping).length === 0) return tableRows;

    Object.entries(poSummaryMapping).forEach(([poCode, poData]) => {
      if (poData && poData.checked_map) {
        Object.entries(poData.checked_map).forEach(([coCode, piArray]) => {
          if (piArray && piArray.length > 0) {
            piArray.forEach(pi => {
              tableRows.push({
                po: poCode,
                pi: pi,
                co: coCode
              });
            });
          }
        });
      }
    });
    return tableRows;
  }, [poSummaryMapping]);

  // Sort PO/PSO codes in ascending numeric order
  const sortedPoCodes = useMemo(() => {
    if (!poCoTableData || poCoTableData.length === 0) return [];

    const uniquePOs = Array.from(new Set(poCoTableData.map(row => row.po)));

    const sortMeta = (code) => {
      const poMatch = String(code || '').match(/^PO(\d+)$/i);
      if (poMatch) return { type: 'PO', num: parseInt(poMatch[1], 10) };
      const psoMatch = String(code || '').match(/^PSO(\d+)$/i);
      if (psoMatch) return { type: 'PSO', num: parseInt(psoMatch[1], 10) };
      return { type: 'OTHER', num: 0 };
    };

    return uniquePOs.sort((a, b) => {
      const metaA = sortMeta(a);
      const metaB = sortMeta(b);
      if (metaA.type !== metaB.type) {
        return metaA.type === 'PO' ? -1 : 1;
      }
      return metaA.num - metaB.num;
    });
  }, [poCoTableData]);

  // Marks calculation helper
  const calculatePoMarks = useCallback((questionsSource) => {
    if (!questionsSource || !Array.isArray(questionsSource) || questionsSource.length === 0) return {};
    if (assessmentType !== 'Exam' && !isAssignmentOrProject) return {};

    const summaryEntries = Object.entries(poSummaryMapping || {});
    if (!summaryEntries.length) return {};

    const poMarks = {};

    if (isAssignmentOrProject) {
      questionsSource.forEach((q) => {
        (q?.mappings || []).forEach((m) => {
          const coCode = String(m?.co || '').trim().toUpperCase();
          const selectedPis = Array.isArray(m?.pis) ? m.pis : [];
          const mapMarks = Number(m?.marks) || 0;

          if (!coCode || mapMarks <= 0 || selectedPis.length === 0) return;

          const piShares = (() => {
            const base = Math.floor(mapMarks / selectedPis.length);
            const rem = mapMarks % selectedPis.length;
            return selectedPis.map((_, i) => i < rem ? base + 1 : base);
          })();

          selectedPis.forEach((pi, piIdx) => {
            const piShare = piShares[piIdx];
            summaryEntries.forEach(([poCode, poData]) => {
              const mappedPis = (poData?.checked_map && poData.checked_map[coCode]) || [];
              if (Array.isArray(mappedPis) && mappedPis.includes(pi)) {
                poMarks[poCode] = (poMarks[poCode] || 0) + piShare;
              }
            });
          });
        });
      });
      return poMarks;
    }

    const groups = {};
    questionsSource.forEach((q) => {
      const base = getBaseQno(q?.qno);
      if (!base) return;

      const coCode = String(q?.co || '').trim().toUpperCase();
      const piCode = String(q?.pi || '').trim();
      const qMarks = Number(q?.marks) || 0;
      if (!coCode || !piCode || qMarks <= 0 || coCode.toUpperCase() === 'CO' || piCode.toUpperCase() === 'PI') return;

      if (!groups[base]) {
        groups[base] = { marks: qMarks, pos: new Set() };
      }

      if (!groups[base].marks && qMarks > 0) groups[base].marks = qMarks;

      summaryEntries.forEach(([poCode, poData]) => {
        const mappedPis = (poData?.checked_map && poData.checked_map[coCode]) || [];
        if (Array.isArray(mappedPis) && mappedPis.includes(piCode)) {
          groups[base].pos.add(poCode);
        }
      });
    });

    Object.values(groups).forEach(group => {
      const marks = Number(group?.marks) || 0;
      if (marks <= 0) return;
      group.pos.forEach(poCode => {
        poMarks[poCode] = (poMarks[poCode] || 0) + marks;
      });
    });

    return poMarks;
  }, [assessmentType, poSummaryMapping, getBaseQno]);

  // Marks strictly from saved/loaded state
  const savedPoMarks = useMemo(() => {
    if (isAssignmentOrProject) {
      return calculatePoMarks(savedAssignmentConfig);
    } else {
      const questions = [];
      if (Array.isArray(savedExamParts) && savedExamParts.length > 0) {
        savedExamParts.forEach(part => {
          (part?.questions || []).forEach(q => questions.push(q));
        });
      }
      return calculatePoMarks(questions);
    }
  }, [savedExamParts, savedAssignmentConfig, assessmentType, calculatePoMarks]);

  // Marks strictly from the current in-memory editor qpQuestions
  const activePoMarks = useMemo(() => {
    if (isAssignmentOrProject) {
      return calculatePoMarks(assignmentConfig);
    }
    return calculatePoMarks(qpQuestions);
  }, [assessmentType, assignmentConfig, qpQuestions, calculatePoMarks]);

  const getSortMeta = useCallback((code) => {
    const poMatch = String(code || '').match(/^PO(\d+)$/i);
    if (poMatch) return { typeOrder: 0, num: parseInt(poMatch[1], 10) || 0 };
    const psoMatch = String(code || '').match(/^PSO(\d+)$/i);
    if (psoMatch) return { typeOrder: 1, num: parseInt(psoMatch[1], 10) || 0 };
    return { typeOrder: 2, num: Number.MAX_SAFE_INTEGER };
  }, []);

  const formatPoPsoCode = useCallback((code) => {
    if (!code) return '';
    const poMatch = String(code).match(/^PO(\d+)$/i);
    if (poMatch) return code.toUpperCase();
    const psoMatch = String(code).match(/^PSO(\d+)$/i);
    if (psoMatch) {
      // Use the actual PO count from curriculum definition if available
      const poCount = poList.length > 0 ? poList.length : 12;
      const num = parseInt(psoMatch[1], 10);
      if (num > poCount) {
        return `PSO${num - poCount}`;
      }
    }
    return code;
  }, [poList]);

  // Build displayed summary (TOP TABLE): use ALL saved QPs marks combined
  const displayedPoSummary = useMemo(() => {
    return (sortedPoCodes || []).map(po => ({
      poCode: po,
      displayCode: formatPoPsoCode(po),
      mappedCos: Object.keys((poSummaryMapping && poSummaryMapping[po] && poSummaryMapping[po].checked_map) || {}),
      marks: Number(allQpMarks[po] || 0)
    }));
  }, [sortedPoCodes, allQpMarks, poSummaryMapping, formatPoPsoCode]);

  // Build active summary (BOTTOM TABLE): use qpQuestions marks
  const presentPoSummary = useMemo(() => {
    const summaryEntries = Object.entries(poSummaryMapping || {});
    if (!summaryEntries.length) return [];

    return summaryEntries
      .map(([poCode]) => ({
        poCode,
        displayCode: formatPoPsoCode(poCode),
        marks: activePoMarks[poCode] || 0
      }))
      .filter(r => (Number(r.marks) || 0) > 0)
      .sort((a, b) => {
        const ma = getSortMeta(a.poCode);
        const mb = getSortMeta(b.poCode);
        if (ma.typeOrder !== mb.typeOrder) return ma.typeOrder - mb.typeOrder;
        if (ma.num !== mb.num) return ma.num - mb.num;
        return String(a.poCode).localeCompare(String(b.poCode));
      });
  }, [activePoMarks, poSummaryMapping, getSortMeta, formatPoPsoCode]);

  // Derive assigned programmes/departments from raw doc prefixes
  const derivedProgs = useMemo(() => {
    if (!facultyAssignPrefixes.length) return [];
    const progs = new Set();
    Object.keys(programToDepartments).forEach(prog => {
      const progKey = formatProgrammeKey(prog);
      if (facultyAssignPrefixes.some(p => p.startsWith(progKey))) {
        progs.add(progKey);
      }
    });
    return Array.from(progs);
  }, [facultyAssignPrefixes, programToDepartments]);

  const derivedDepts = useMemo(() => {
    if (!facultyAssignPrefixes.length || !program) return [];
    const progKey = formatProgrammeKey(program);
    const depts = new Set();
    facultyAssignPrefixes.forEach(prefix => {
      if (prefix.startsWith(progKey)) {
        depts.add(prefix.slice(progKey.length).trim());
      }
    });
    return Array.from(depts);
  }, [facultyAssignPrefixes, program, programToDepartments]);

  const urlProgParam = searchParams.get('prog') || searchParams.get('program') || '';
  const urlDeptParam = searchParams.get('dept') || searchParams.get('department') || '';

  const filteredProgrammes = Object.keys(programToDepartments).filter(prog => {
    if (userRole !== 'Faculty' && userRole !== 'HOD') return true;
    const progKey = formatProgrammeKey(prog);
    if (userRole === 'HOD' && formatProgrammeKey(userProgramme) === progKey) return true;
    // Allow URL-specified programme (e.g. navigation from QP Setter task cards) even when
    // the user has no direct subject-handling assignment there — they may still be the setter.
    if (urlProgParam && formatProgrammeKey(urlProgParam) === progKey) return true;
    return derivedProgs.includes(progKey);
  });

  const displayedBatches = useMemo(() => {
    if (!program || !department) return batches;

    const norm = (v) => String(v || '').trim().toLowerCase();
    const progKey = formatProgrammeKey(program);
    const progKeyNorm = norm(progKey);
    const deptNorm = norm(department);

    if (isAssignmentOrProject || assessmentType === 'Indirect') {
      const checkField = assessmentType === 'Indirect' ? 'isIndirectAssessment' : (assessmentType === 'Project' ? 'isProject' : assessmentType === 'Practical' ? 'isPractical' : 'isAssignment');
      return batches.filter(b => {
        const reg = getRegulationForBatch(progKey, b);
        if (!reg) return false;
        return ciaConfigs.some(config =>
          config[checkField] === true &&
          (!norm(config.program) || norm(formatProgrammeKey(config.program)) === progKeyNorm) &&
          (!norm(config.department) || norm(config.department) === deptNorm) &&
          (!norm(config.regulation) || norm(config.regulation) === norm(reg))
        );
      });
    }

    // For Exam mode: if Indirect Assessment configs exist for this prog/dept, filter by regulation
    const indirectRegs = new Set();
    ciaConfigs.forEach(config => {
      if (config.isIndirectAssessment === true &&
        (!norm(config.program) || norm(formatProgrammeKey(config.program)) === progKeyNorm) &&
        (!norm(config.department) || norm(config.department) === deptNorm) &&
        config.regulation
      ) {
        indirectRegs.add(norm(config.regulation));
      }
    });

    if (indirectRegs.size === 0) return batches;

    return batches.filter(b => {
      const reg = getRegulationForBatch(progKey, b);
      return reg && indirectRegs.has(norm(reg));
    });
  }, [batches, assessmentType, ciaConfigs, program, department, getRegulationForBatch]);

  const filteredDepartments = useMemo(() => {
    const depts = programToDepartments[formatProgrammeKey(program)] || [];
    if (userRole !== 'Faculty' && userRole !== 'HOD') return depts;
    if (!depts.length) return [];
    const normSpace = (v) => sanitizeKey(v).replace(/[_ ]+/g, ' ').trim().toLowerCase();

    // Include a URL-specified department (e.g. QP Setter task card navigation) even when the
    // user has no direct subject-handling assignment there — they may still be the setter.
    const cleanUrlDept = urlDeptParam ? sanitizeKey(urlDeptParam).replace(/[_ ]+/g, ' ').trim().toLowerCase() : '';
    const urlDeptIsValid = cleanUrlDept && depts.some(d => {
      const nd = normSpace(d);
      return nd === cleanUrlDept || nd.includes(cleanUrlDept) || cleanUrlDept.includes(nd);
    });

    if (!derivedDepts.length) {
      if (urlDeptIsValid) return depts.filter(d => {
        const nd = normSpace(d);
        return nd === cleanUrlDept || nd.includes(cleanUrlDept) || cleanUrlDept.includes(nd);
      });
      return depts;
    }
    const normalizedDepts = derivedDepts.map(d => d.replace(/[_ ]+/g, ' ').trim().toLowerCase());
    return depts.filter(dept => {
      const nd = normSpace(dept);
      return normalizedDepts.some(dd => dd === nd || dd.includes(nd) || nd.includes(dd)) ||
        (urlDeptIsValid && (nd === cleanUrlDept || nd.includes(cleanUrlDept) || cleanUrlDept.includes(nd)));
    });
  }, [program, userRole, derivedDepts, programToDepartments, urlDeptParam]);

  const availableSections = useMemo(() => {
    if (!batch || !department || !program) return [];
    const progKey = formatProgrammeKey(program);
    const docId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}`;
    const cfg = sectionConfigs[docId];
    if (!cfg || !cfg.numSections) return [];
    const count = cfg.numSections;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: count }, (_, i) => `Sec-${letters[i]}`);
  }, [batch, department, program, sectionConfigs]);

  useEffect(() => {
    if (isAssignmentOrProject) return; // Don't load exam parts for Activity/Project
    if (exam && exam !== 'custom') {
      const config = getExamConfig(exam);
      if (config && config.parts && config.parts.length > 0) {
        const parts = config.parts.map(p => ({
          numQuestions: p.numberOfQuestions || 1,
          marksPerQuestion: p.marksPerQuestion || 1,
          isEitherOr: !!p.hasInternalChoice
        }));
        setPartsConfig(parts);
        setNumParts(String(parts.length));
        setShowParts(true);
      }
    } // No else, if config has no parts, it means it's a custom exam or assignment, handled by other logic
  }, [exam, ciaConfigs, getExamConfig]);

  const getQuestionPaperHTML = useCallback((qp, cos = courseOutcomes, activeCOs = null, coWeightage = null, facultySignatureUrl = '') => {
    // Compute exam display name (resolve config ID to name)
    let examDisplay = qp.exam_name;
    if (!examDisplay) {
      const configObj = ciaConfigs.find(c => c.id === qp.qpaper_name);
      examDisplay = configObj?.examName || qp.qpaper_name;
    }

    const isAssignment = qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical' || qp.assessment_type === 'Indirect';

    const yearLabel = { "1": "I", "2": "I", "3": "II", "4": "II", "5": "III", "6": "III", "7": "IV", "8": "IV" }[qp.semester] || "";
    const semLabel = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8": "VIII" }[qp.semester] || qp.semester;
    const yearSemester = `${yearLabel} / ${semLabel}`;
    const parsedSubj = (() => { try { const o = JSON.parse(qp.subject || '{}'); return o.code ? o : { code: qp.subject, name: '' }; } catch { return { code: qp.subject || '', name: '' }; } })();
    const subjectDisplay = parsedSubj.name ? `${parsedSubj.code} - ${parsedSubj.name}` : (qp.subject_name ? `${parsedSubj.code} - ${qp.subject_name}` : parsedSubj.code);

    // Prepare signature HTML
    let facultySignatureHtml = '';
    if (facultySignatureUrl) {
      facultySignatureHtml = `<img src="${facultySignatureUrl}" alt="Faculty Signature" style="height: 50px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`;
    } else {
      facultySignatureHtml = `<div style="height: 50px; width: 150px; margin: 0 auto; border-bottom: 1px solid #000;"></div>`; // Placeholder if no signature
    }

    // Placeholder for HOD signature (will be filled when approved)
    let hodSignatureHtml = '';
    if (qp.hod_signature_url) {
      hodSignatureHtml = `<img src="${qp.hod_signature_url}" alt="HOD Signature" style="height: 50px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`;
    } else {
      hodSignatureHtml = `<div style="height: 50px; width: 150px; margin: 0 auto; border-bottom: 1px solid #000;"></div>`;
    }

    let html = `
<!-- Logo + College Info -->
<table cellspacing="0" border="1" style="border-collapse:collapse; font-size:11px; height:80px; width:100%; border:1px solid #000;">
  <tbody>
    <tr>
      <td style="height:70px; text-align:center; width:100%"><img alt="logo" class="logo-img" src="/logo.png" style="height:60px; max-width:100%; width:754px;" /></td>
    </tr>
  </tbody>
</table>
<table style="width: 100%; border-collapse: collapse; margin-top: 10px;" border="1">
  <tr>
    <td style="padding: 4px;"><strong>${isAssignment ? (qp.assessment_type === 'Project' ? 'Project' : qp.assessment_type === 'Practical' ? 'Practical' : qp.assessment_type === 'Indirect' ? 'Indirect Assessment' : 'Assignment') : 'Internal Assessment Test'}</strong></td>
    <td colspan="3" style="padding: 4px;">${examDisplay}</td>
    <td style="padding: 4px;"><strong>Academic Year</strong></td>
    <td style="padding: 4px;">${qp.academic_year}</td>
  </tr>
  <tr>
    <td style="padding: 4px;"><strong>Course Code / Course Title</strong></td>
    <td colspan="5" style="padding: 4px;">${subjectDisplay}</td>
  </tr>
  <tr>
    <td style="padding: 4px;"><strong>Year / Semester</strong></td>
    <td style="padding: 4px;">${yearSemester}</td>
    <td style="padding: 4px;"><strong>Department</strong></td>
    <td style="padding: 4px;">${qp.department}</td>
    <td style="padding: 4px;"><strong>Common for</strong></td>
    <td style="padding: 4px;">${qp.common_for || qp.commonFor || commonForDisplay || 'NIL'}</td>
  </tr>
  <tr>
    <td style="padding: 4px;"><strong>Max Mark</strong></td>
    <td style="padding: 4px;">${qp.total_marks}</td>
    <td style="padding: 4px;"><strong>Duration</strong></td>
    <td style="padding: 4px;">${qp.duration || scheduledExamInfo.duration || '180 min'}</td>
    <td style="padding: 4px;"><strong>Date</strong></td>
    <td style="padding: 4px;">${qp.exam_date_display || scheduledExamInfo.date || (qp.exam_date ? formatExamDateDisplay(qp.exam_date) : '')}</td>
  </tr>
  <tr>
    <td style="padding: 4px;"><strong>Reg. No.</strong></td>
    <td colspan="5" style="padding: 4px;"></td>
  </tr>
</table>
    `;

    let questionCounter = 1;

    if (isAssignment) {
      html += `
<table border="1" style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; text-align: left; font-size: 12px;">
  <thead>
    <tr>
      <th style="width: 8%; text-align: center; padding: 4px;">Q. No.</th>
      <th style="width: 52%; text-align: center; padding: 4px;">Question(s)</th>
      <th style="width: 10%; text-align: center; padding: 4px;">KL</th>
      <th style="width: 10%; text-align: center; padding: 4px;">CO</th>
      <th style="width: 10%; text-align: center; padding: 4px;">PI</th>
      <th style="width: 10%; text-align: center; padding: 4px;">Marks</th>
    </tr>
  </thead>
  <tbody>`;
      if (qp.assignment_config && qp.assignment_config.length > 0) {
        const formatMathTextAssign = (qStr) => {
          if (!qStr) return '';
          let str = String(qStr);
          // Preserve CKEditor line breaks: </p><p> and </div><div> -> <br>, strip remaining wrappers but keep breaks
          str = str.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '');
          str = str.replace(/\[Math Processing Error\]/gi, '');
          str = str.replace(/(?:\\\()?([A-Za-z0-9_\s\^\{\}-]*\s*=\s*)?\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Bmatrix|cases|align|array)\}([\s\S]*?)\\end\{\2\}(?:\\\))?/gi, (match, prefix, envName, innerText) => {
            const cleanPrefix = prefix ? prefix.trim() : '';
            const cleanInner = innerText ? innerText.trim() : '';
            return `\\(${cleanPrefix ? `${cleanPrefix} ` : ''}\\begin{${envName}} ${cleanInner} \\end{${envName}}\\)`;
          });
          str = str.replace(/(?:\\\()?([A-Za-z]\^\{[^{}]+\})(?:\\\))?/gi, (match, powerExp) => `\\(${powerExp}\\)`);
          str = str.replace(/\\\(\s*\\\(/g, '\\(').replace(/\\\)\s*\\\)/g, '\\)');
          str = str.replace(/(?:<span class="math-tex">)?(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])(?:<\/span>)?/gi, (match, mathContent) => `<span class="math-tex">${mathContent}</span>`);
          return str;
        };
        qp.assignment_config.forEach((q, idx) => {
          const allCOs = (q.mappings || []).map(m => `${m.co} (${m.marks || 0})`).join(', ');
          const allPIs = (q.mappings || []).map(m => (m.pis || []).map((pi, i) => `${pi}${m.piMarks && m.piMarks[i] != null ? ` (${m.piMarks[i]})` : ''}`).join(', ')).join(', ');
          html += `
            <tr>
              <td style="text-align: center; padding: 4px;">${idx + 1}</td>
              <td style="padding: 4px;">${formatMathTextAssign(q.question || '')}</td>
              <td contenteditable="true" style="text-align: center; padding: 4px;">${q.kl || ''}</td>
              <td contenteditable="true" style="text-align: center; padding: 4px;">${allCOs}</td>
              <td contenteditable="true" style="text-align: center; padding: 4px;">${allPIs}</td>
              <td style="text-align: center; padding: 4px;">${q.marks}</td>
            </tr>
          `;
        });
      }
      html += `</tbody></table>`;
    } else {
      qp.parts.forEach((part, index) => {
        const partLetter = String.fromCharCode(64 + index + 1);
        const totalMarks = `
<span style="display: inline-flex; align-items: center; gap: 4px;">
  <span>${part.num_questions}</span>
  <span>&times;</span>
  <span>${part.marks_per_question}</span>
  <span>=</span>
  <strong>${part.num_questions * part.marks_per_question}</strong>
</span>`;

        html += `
<table style="width: 100%; border-collapse: collapse; font-weight: bold; font-size: 16px; margin-bottom: 6px; border: 1px solid black; margin-top: 15px;">
  <tr>
    <td style="width: 50%; padding: 6px; border: none;">Part ${partLetter} <span style="font-weight: normal; font-style: italic; font-size: 13px;">(Answer all questions)</span></td>
    <td style="width: 50%; padding: 6px; border: none; text-align: right;">${totalMarks} Marks</td>
  </tr>
</table>
<table border="1" style="width: 100%; border-collapse: collapse; margin-bottom: 15px; text-align: left; font-size: 12px;">
  <thead>
    <tr>
      <th style="width: 8%; text-align: center; padding: 4px;">Q. No.</th>
      <th style="width: 62%; text-align: center; padding: 4px;">Question(s)</th>
      <th style="width: 10%; text-align: center; padding: 4px;">KL</th>
      <th style="width: 10%; text-align: center; padding: 4px;">CO</th>
      <th style="width: 10%; text-align: center; padding: 4px;">PI</th>
    </tr>
  </thead>
  <tbody>`;

        if (part.questions && part.questions.length > 0) {
          const filteredQuestions = (part.questions || []).filter(q =>
            !(q.question && q.question.trim().toLowerCase() === '(or)')
          );

          const formatMathText = (qStr) => {
            if (!qStr) return '';
            let str = String(qStr);
            // Preserve CKEditor line breaks: </p><p> and </div><div> -> <br>
            str = str.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '');
            str = str.replace(/\[Math Processing Error\]/gi, '');
            str = str.replace(/(?:\\\()?([A-Za-z0-9_\s\^\{\}-]*\s*=\s*)?\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Bmatrix|cases|align|array)\}([\s\S]*?)\\end\{\2\}(?:\\\))?/gi, (match, prefix, envName, innerText) => {
              const cleanPrefix = prefix ? prefix.trim() : '';
              const cleanInner = innerText ? innerText.trim() : '';
              return `\\(${cleanPrefix ? `${cleanPrefix} ` : ''}\\begin{${envName}} ${cleanInner} \\end{${envName}}\\)`;
            });
            str = str.replace(/(?:\\\()?([A-Za-z]\^\{[^{}]+\})(?:\\\))?/gi, (match, powerExp) => {
              return `\\(${powerExp}\\)`;
            });
            str = str.replace(/\\\(\s*\\\(/g, '\\(').replace(/\\\)\s*\\\)/g, '\\)');
            str = str.replace(/(?:<span class="math-tex">)?(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])(?:<\/span>)?/gi, (match, mathContent) => {
              return `<span class="math-tex">${mathContent}</span>`;
            });
            return str;
          };

          filteredQuestions.forEach((q, qIdx) => {
            if (q.either_or) {
              if (q.sub === 'a') {
                const nextQ = filteredQuestions[qIdx + 1];
                html += `
                  <tr>
                    <td style="text-align: center; padding: 4px;">${q.qno}</td>
                    <td style="padding: 4px;">${formatMathText(q.question || '')}</td>
                    <td contenteditable="true" style="text-align: center; padding: 4px;">${q.kl || ''}</td>
                    <td contenteditable="true" style="text-align: center; padding: 4px;">${q.co || ''}</td>
                    <td contenteditable="true" style="text-align: center; padding: 4px;">${q.pi || ''}</td>
                  </tr>
                  <tr>
                    <td style="text-align: center; padding: 4px;"></td>
                    <td style="text-align: center; padding: 4px;"><strong>(Or)</strong></td>
                    <td style="text-align: center; padding: 4px;"></td>
                    <td style="text-align: center; padding: 4px;"></td>
                    <td style="text-align: center; padding: 4px;"></td>
                  </tr>
                  <tr>
                    <td style="text-align: center; padding: 4px;">${nextQ?.qno || ""}</td>
                    <td style="padding: 4px;">${formatMathText(nextQ?.question || "")}</td>
                    <td contenteditable="true" style="text-align: center; padding: 4px;">${nextQ?.kl || ''}</td>
                    <td contenteditable="true" style="text-align: center; padding: 4px;">${nextQ?.co || ''}</td>
                    <td contenteditable="true" style="text-align: center; padding: 4px;">${nextQ?.pi || ''}</td>
                  </tr>
                `;
              }
            } else {
              html += `
                <tr>
                  <td style="text-align: center; padding: 4px;">${q.qno}</td>
                  <td style="padding: 4px;">${formatMathText(q.question || '')}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${q.kl || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${q.co || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${q.pi || ''}</td>
                </tr>
              `;
            }
          });
        } else {
          // Generate placeholders
          for (let j = 0; j < part.num_questions; j++) {
            if (part.isEitherOr) {
              html += `
                <tr>
                  <td style="text-align: center; padding: 4px;">${questionCounter}(a)</td>
                  <td style="padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 4px;"></td>
                  <td style="text-align: center; padding: 4px;"><strong>(Or)</strong></td>
                  <td style="text-align: center; padding: 4px;"></td>
                  <td style="text-align: center; padding: 4px;"></td>
                  <td style="text-align: center; padding: 4px;"></td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 4px;">${questionCounter}(b)</td>
                  <td style="padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                </tr>`;
            } else {
              html += `
                <tr>
                  <td style="text-align: center; padding: 4px;">${questionCounter}</td>
                  <td style="padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                </tr>`;
            }
            questionCounter++;
          }
        }
        html += `</tbody></table>`;
      });
    }

    // If not provided, derive from the provided qp data so the table always reflects the questions.
    let derivedSummary = null;
    if (!activeCOs || !coWeightage) {
      derivedSummary = deriveCOSummaryFromQp(qp);
    }
    const activeSet = activeCOs || derivedSummary?.activeCOs || new Set();
    const weightMap = coWeightage || derivedSummary?.coWeightage || {};

    let coRows = '';
    let effectiveCos = cos || [];
    if (effectiveCos.length === 0 && activeSet.size > 0) {
      effectiveCos = Array.from(activeSet).sort((a, b) => {
        const numA = parseInt(String(a).replace(/\D/g, '')) || 0;
        const numB = parseInt(String(b).replace(/\D/g, '')) || 0;
        return numA - numB;
      }).map(code => ({ code, description: '' }));
    }
    if (effectiveCos.length > 0) {
      coRows = effectiveCos
        .filter((co) => activeSet.has(co.code))
        .map((co) => {
          const tick = activeSet.has(co.code) ? '✓' : '';
          const w = weightMap && Object.prototype.hasOwnProperty.call(weightMap, co.code) ? weightMap[co.code] : '';
          const coCode = (co.code || '').toUpperCase();
          const coDesc = (co.description && co.description.trim() && co.description.trim().toUpperCase() !== coCode) ? co.description : '—';

          return `
          <tr>
            <td style="padding: 4px;">${co.code}</td>
            <td style="padding: 4px;">${coDesc}</td>
            <td style="text-align: center; padding: 4px;">${tick}</td>
            <td style="text-align: center; padding: 4px;">${w ? String(w) : ''}</td>
          </tr>
        `;
        }).join('');
    } else {
      coRows = `
        <tr>
          <td style="padding: 4px;">-</td>
          <td style="padding: 4px;">-</td>
          <td style="text-align: center; padding: 4px;">-</td>
          <td style="padding: 4px;"></td>
        </tr>
      `;
    }

    html += `
        <div class="outcomes-summary-section">
                  <h3>Details of Course Outcomes</h3>
          <table border="1" style="border-collapse: collapse; width: 100%; font-size: 11px;">
              <thead>
                  <tr>
                      <th style="padding: 4px;">Course Outcome Code</th>
                      <th style="padding: 4px;">Description</th>
                      <th style="padding: 4px;">Tick the CO's covered in this QP</th>
                      <th style="padding: 4px;">Weightage of marks allotted to each CO</th>
                  </tr>
              </thead>
              <tbody>
                  ${coRows}
              </tbody>
          </table>
        </div>

<table border="1" style="width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 11px;">
  <tr>
    <td style="height: 60px; width: 33.33%;">${facultySignatureHtml}</td>
    <td style="height: 60px; width: 33.33%;"></td>
    <td style="height: 60px; width: 33.33%;">${hodSignatureHtml}</td>
  </tr>
  <tr>
    <td style="text-align: center; padding: 6px;">Subject Faculty Signature</td>
    <td style="text-align: center; padding: 6px;">Academic Coordinator Signature</td>
    <td style="text-align: center; padding: 6px;">HOD Signature</td>
  </tr>
</table>
    `;
    return html; // Removed facultySignatureUrl from deps because it's passed as an arg
  }, [courseOutcomes, ciaConfigs, deriveCOSummaryFromQp, poSummaryMapping]);

  useEffect(() => {
    if (program) {
      const progKey = formatProgrammeKey(program);
      setBatches(getActiveBatches(progKey));
    } else {
      setBatches([]);
    }
  }, [program, getActiveBatches]);

  // Fetch Course Outcomes and Mapping Summary
  useEffect(() => {
    const progKey = formatProgrammeKey(program);
    const regulation = getRegulationForBatch(progKey, batch);
    if (!department || !subject || !academicYear || !program || !selectedSemester) {
      setCourseOutcomes([]);
      setCoPiMapping({});
      window.coPiMappingData = {};
      return;
    }

    const coDocId = `${sanitizeKey(department)}_${sanitizeKey(regulation || '')}_${sanitizeKey(subjectCode)}_${sanitizeKey(academicYear)}`;
    const coRef = doc(db, 'course_outcomes', coDocId); // Firestore doc reference

    const poPsoDocId = `${progKey}_${sanitizeKey(regulation || '')}__${sanitizeKey(department)}`;
    const poPsoRef = doc(db, 'po_pso', poPsoDocId); // Firestore doc reference

    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const mappingDocId = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation || '')}_${sanitizeKey(subjectCode)}_${sanitizeKey(academicYear)}_${sanitizeKey(selectedSemester)}${sectionSuffix}`;
    const mappingRef = doc(db, 'mapping_summary', mappingDocId); // Firestore doc reference

    const unsubscribePoPso = onSnapshot(poPsoRef, (snap) => { // Use onSnapshot for real-time updates
      const data = snap.data() || {}; // Use .data() for Firestore documents
      setPoList(data.po_statements || []);
    });

    const unsubscribeCO = onSnapshot(coRef, async (snapshot) => { // Use onSnapshot for real-time updates
      const data = snapshot.data(); // Use .data() for Firestore documents
      let loadedCOs = [];
      if (data) {
        loadedCOs = Object.entries(data)
          .filter(([code]) => code.toUpperCase().startsWith('CO') || !isNaN(parseInt(code.replace(/\D/g, ''))))
          .map(([code, val]) => ({
            code,
            description: typeof val === 'object' && val !== null ? val.description : val
          }))
          .sort((a, b) => {
            const numA = parseInt(a.code.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.code.replace(/\D/g, '')) || 0;
            return numA - numB;
          });
      }

      // Comprehensive CO resolution across ALL saved key formats (course_outcomes + courses/CourseBank).
      // Handles regulation/department format drift: "AU-R2021" vs "AU - R2021", spaces vs underscores, etc.
      const deptForms = [sanitizeKey(department), sanitizeKeyStrict(department)];
      const regForms = [
        regulation,
        (regulation || '').replace(/-/g, ' '),
        (regulation || '').replace(/ /g, '-'),
        sanitizeKeyStrict(regulation),
        (regulation || '').replace(/[^a-zA-Z0-9]/g, '')
      ];
      if (!regulation && Array.isArray(allRegulations)) {
        for (const kr of allRegulations) {
          if (kr && !regForms.includes(kr)) regForms.push(kr);
          if (kr && !regForms.includes(sanitizeKey(kr))) regForms.push(sanitizeKey(kr));
          if (kr && !regForms.includes(sanitizeKeyStrict(kr))) regForms.push(sanitizeKeyStrict(kr));
        }
      }
      const subjForms = [sanitizeKey(subjectCode), subjectCode, sanitizeKeyStrict(subjectCode)];
      const progForms = [progKey, formatProgrammeKey(program)];
      const ayForm = sanitizeKey(academicYear);

      const parseCoEntries = (obj) => Object.entries(obj || {})
        .filter(([code]) => code.toUpperCase().startsWith('CO') || !isNaN(parseInt(code.replace(/\D/g, ''))))
        .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
        .sort((a, b) => (parseInt(a.code.replace(/\D/g, '')) || 0) - (parseInt(b.code.replace(/\D/g, '')) || 0));

      const hasRealDesc = (list) => Array.isArray(list) && list.length > 0 && list.some(co => {
        const d = String(co.description || '').trim();
        return d && d.toUpperCase() !== String(co.code || '').toUpperCase();
      });

      const coCandidates = [];
      for (const d of deptForms) {
        for (const r of regForms) {
          for (const s of subjForms) {
            coCandidates.push(`${d}_${r}_${s}_${ayForm}`);
            coCandidates.push(`${d}_${r}_${s}`);
            coCandidates.push(`${r}_${s}`);
            coCandidates.push(`${d}_${s}_${ayForm}`);
            coCandidates.push(`${d}_${s}`);
          }
        }
        for (const s of subjForms) coCandidates.push(`${s}`);
      }

      const courseCandidates = [];
      for (const p of progForms) {
        for (const d of deptForms) {
          for (const r of regForms) {
            for (const s of subjForms) {
              courseCandidates.push(`${p}_${d}_${r}_${s}`);
              courseCandidates.push(`${p}_Overall_${r}_${s}`);
              courseCandidates.push(`${p}_${d}_${s}`);
            }
          }
        }
      }

      if (!hasRealDesc(loadedCOs)) {
        for (const key of coCandidates) {
          try {
            const altSnap = await getDoc(doc(db, 'course_outcomes', key));
            if (altSnap.exists()) {
              const cand = parseCoEntries(altSnap.data());
              if (cand.length > 0) {
                if (hasRealDesc(cand)) { loadedCOs = cand; break; }
                if (loadedCOs.length === 0) loadedCOs = cand;
              }
            }
          } catch (_) { /* skip */ }
        }
      }

      if (!hasRealDesc(loadedCOs)) {
        for (const key of courseCandidates) {
          try {
            const snap = await getDoc(doc(db, 'courses', key));
            if (snap.exists()) {
              const bankData = snap.data();
              if (bankData.co && Array.isArray(bankData.co)) {
                const cand = bankData.co.map(c => ({ code: c.id, description: c.description || '' })).sort((a, b) =>
                  (parseInt(String(a.code || '').replace(/\D/g, '')) || 0) - (parseInt(String(b.code || '').replace(/\D/g, '')) || 0));
                if (cand.length > 0) {
                  if (hasRealDesc(cand)) { loadedCOs = cand; break; }
                  if (loadedCOs.length === 0) loadedCOs = cand;
                }
              }
            }
          } catch (_) { /* skip */ }
        }
      }

      if (loadedCOs.length === 0) {
        // Fallback default so the faculty is NEVER blocked — descriptions blank until configured
        loadedCOs = [
          { code: 'CO1', description: '' },
          { code: 'CO2', description: '' },
          { code: 'CO3', description: '' },
          { code: 'CO4', description: '' },
          { code: 'CO5', description: '' }
        ];
      }

      setCourseOutcomes(loadedCOs);
      console.log(`[CO Load] ${subjectCode}: ${loadedCOs.length} COs loaded, sample desc: "${loadedCOs[0]?.description || ''}"`);
      if (isAssignmentOrProject && loadedCOs.length > 0 && !numParts) {
        setNumParts(String(loadedCOs.length));
      }
    });

    const unsubscribeMapping = onSnapshot(mappingRef, (snapshot) => { // Use onSnapshot for real-time updates
      const mappingData = snapshot.data(); // Use .data() for Firestore documents
      if (mappingData && mappingData.summary) {
        setPoSummaryMapping(mappingData.summary || {});
        const newMapping = {};
        Object.entries(mappingData.summary).forEach(([, poData]) => {
          if (poData.checked_map) {
            Object.entries(poData.checked_map).forEach(([coCode, pis]) => {
              if (!newMapping[coCode]) newMapping[coCode] = new Set();
              pis.forEach(pi => newMapping[coCode].add(pi));
            });
          }
        });
        // Convert Sets to Arrays
        const finalMapping = {};
        Object.entries(newMapping).forEach(([coCode, piSet]) => {
          finalMapping[coCode] = Array.from(piSet).sort();
        });
        setCoPiMapping(finalMapping);
        window.coPiMappingData = finalMapping;
      } else {
        setPoSummaryMapping({});
        setCoPiMapping({});
        window.coPiMappingData = {};
      }
    });

    return () => {
      unsubscribePoPso();
      unsubscribeCO();
      unsubscribeMapping();
    };
  }, [department, batch, subject, academicYear, program, selectedSemester, section, getRegulationForBatch, allRegulations]);

  useEffect(() => {
    hasLoadedRef.current = false;
    // Clear previous paper states when configuration changes. `qpSet` is included so
    // switching from Set 1 to Set 2 (dropdown or URL) starts a fresh paper instead of
    // showing the previous set's questions.
    if (!editId) {
      setQpQuestions([]);
      setPartsConfig([]);
      setSavedExamParts([]);
      setAssignmentConfig([]);
      setShowParts(false);
      setShowFinalPreview(false);
      setNumParts('');
      setQbAvailableQNos([]); // Clear available Q.Nos when config changes
      setHodComments(''); // Clear HOD comments when starting a new paper
      setLoadedExamName('');
      setLoadedPaperStatus('');
    }
  }, [editId, compositeKey, program, department, batch, academicYear, selectedSemester, subject, exam, customExam, qpSet]);

  // Auto-load existing paper for this exam if not in explicit edit mode
  useEffect(() => {
    if (editId || compositeKey || hasLoadedRef.current) return;
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) return;

    // Resolve the exam's cia_config by BOTH document ID AND name (regulation-aware) so the
    // set suffix is computed correctly even when `exam` is a name string like "IA 1" instead
    // of a Firebase push ID. Without this, `setSuffix` becomes '' and Set 2 loads Set 1's content.
    const selectedConfig = getExamConfig(exam);
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam); // Use ciaConfigsMap for direct lookup
    // Use the set requested via URL (e.g. &set=Set 2) so the correct saved set loads even if the
    // qpSet state update from the URL effect hasn't propagated yet (avoids loading Set 1 for Set 2).
    const urlSetParam = searchParams.get('set') || searchParams.get('qpSet') || searchParams.get('setNumber');
    const urlSetMatch = urlSetParam ? String(urlSetParam).match(/\d+/) : null;
    const effectiveQpSet = urlSetMatch ? `Set ${urlSetMatch[0]}` : qpSet;
    const setSuffix = (effectiveSetCount > 1) ? `_Set_${effectiveQpSet.replace(' ', '')}` : '';
    // Use a stable composite key that does NOT include the human-editable exam display name.
    // This prevents creating a new DB node when exam display changes after recorrection.
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const docId = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subjectCode)}${sectionSuffix}`;

    const checkExisting = async () => {
      try {
        const existingQpId = exam === 'custom' ? (isAssignmentOrProject ? (assessmentType === 'Project' ? 'Project' : assessmentType === 'Practical' ? 'Practical' : 'Assignment') : assessmentType === 'Indirect' ? 'Indirect' : 'Exam') : `${exam}${setSuffix}`; // This is the field key
        const qpRef = doc(db, 'generated_qps', docId); // Parent doc path
        const snapshot = await getDoc(qpRef); // Use getDoc for Firestore
        const qp = snapshot.data()?.[existingQpId]; // Read from field in parent doc

        if (qp && !hasLoadedRef.current) {
          hasLoadedRef.current = true;
          setLoadedPaperStatus(qp.status || (qp.is_draft ? 'draft' : ''));

          // Resolve kldomain: if saved as name, convert to key; keep line breaks from <p> as <br>
          const resolveConfig = (config) => (config || []).map(q => ({
            ...q,
            kldomain: (() => {
              const saved = q.kldomain || '';
              if (bloomsDomains && bloomsDomains[saved]) return saved;
              const foundKey = Object.keys(bloomsDomains || {}).find(k => bloomsDomains[k]?.name === saved);
              return foundKey || '';
            })(),
            question: (q.question || '').replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '')
          }));

          // Apply state updates
          if (qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical') {
            setNumParts(String(qp.assignment_config?.length || ''));
            setAssignmentConfig(resolveConfig(qp.assignment_config));
            setSavedAssignmentConfig(resolveConfig(qp.assignment_config));
            setSavedExamParts([]);
            setQpQuestions(qp.assignment_config || []);
          } else {
            setNumParts(String(qp.parts?.length || ''));
            const config = qp.parts?.map(p => ({
              numQuestions: p.num_questions,
              marksPerQuestion: p.marks_per_question || p.marksPerQuestion || 0,
              isEitherOr: p.questions?.some(q => q.either_or) || false
            })) || [];
            setPartsConfig(config);
            setQbAvailableQNos(buildExpectedQNosFromParts(config));
            setSavedExamParts(qp.parts || []);
            const qList = [];
            qp.parts?.forEach(p => {
              const questions = (p.questions || []);
              // If stored as object, convert to array
              const qArray = Array.isArray(questions) ? questions : Object.values(questions);
              qArray.forEach(q => {
                if (q.question && q.question.trim().toLowerCase() === '(or)') return;
                // Ensure sub property exists for either_or questions if missing
                if (q.either_or && !q.sub) {
                  if (q.qno && q.qno.toLowerCase().endsWith('(a)')) q.sub = 'a';
                  else if (q.qno && q.qno.toLowerCase().endsWith('(b)')) q.sub = 'b';
                  else if (q.qno && q.qno.toLowerCase().endsWith('a')) q.sub = 'a';
                  else if (q.qno && q.qno.toLowerCase().endsWith('b')) q.sub = 'b';
                }
                qList.push(q);
              });
            });
            setQpQuestions(qList);
          }
          setShowParts(true);

          // Fetch COs explicitly for loading (comprehensive fallback)
          const cProgKey = formatProgrammeKey(qp.programme);
          const cRegulation = getRegulationForBatch(cProgKey, qp.batch);
          const fetchedCOs = await fetchCOsWithFallback(qp.department, cRegulation, getSubjectCodeFrom(qp.subject), qp.academic_year, cProgKey, undefined, undefined, allRegulations);
          setCourseOutcomes(fetchedCOs);

          // Wait for editor to be ready
          const checkEditor = setInterval(() => { // This interval is for loading existing paper on initial load
            if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor && window.CKEDITOR.instances.questionEditor.status === 'ready') {
              clearInterval(checkEditor);
              const html = getQuestionPaperHTML(qp, fetchedCOs);
              window.CKEDITOR.instances.questionEditor.setData(html, () => {
                typesetMath();
              });
              typesetMath();
              showToast(`Existing saved ${assessmentType} loaded for this subject/exam.`, "success");
            }
          }, 500);
        }
      } catch (error) {
        console.error("Error checking for existing paper:", error);
      }
    };

    checkExisting();
  }, [program, department, batch, academicYear, selectedSemester, subject, exam, qpSet, customExam, ciaConfigs, editId, compositeKey, getQuestionPaperHTML, assessmentType, getRegulationForBatch, searchParams, getExamConfig]);

  useEffect(() => {
    const loadSavedPaper = async () => {
      if (!editId || !compositeKey || hasLoadedRef.current) return;

      try {
        hasLoadedRef.current = true; // Mark as loaded
        const qpRef = doc(db, 'generated_qps', compositeKey); // Parent doc path
        const snapshot = await getDoc(qpRef); // Use getDoc for Firestore
        const qp = snapshot.data()?.[editId]; // Read from field in parent doc

        if (qp) {
          setLoadedPaperStatus(qp.status || (qp.is_draft ? 'draft' : ''));
          setAssessmentType(qp.assessment_type || 'Exam');
          setProgram(qp.programme || '');
          setDepartment(qp.department || '');
          setBatch(qp.batch || '');
          setAcademicYear(qp.academic_year || '');
          setSelectedSemester(qp.semester ? `${qp.semester}${qp.semester === '1' ? 'st' : qp.semester === '2' ? 'nd' : qp.semester === '3' ? 'rd' : 'th'} Semester` : '');
          setSubject(qp.subject || '');
          setLoadedExamName(qp.exam_name || ''); // Preserve the human name from DB
          setHodComments(qp.hod_comments || ''); // Load HOD comments
          setExam(qp.qpaper_name || '');

          if (qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical') {
            setNumParts(String(qp.assignment_config?.length || ''));
            const resolved = (qp.assignment_config || []).map(q => ({
              ...q,
              kldomain: (() => {
                const saved = q.kldomain || '';
                if (bloomsDomains && bloomsDomains[saved]) return saved;
                const foundKey = Object.keys(bloomsDomains || {}).find(k => bloomsDomains[k]?.name === saved);
                return foundKey || '';
              })(),
              question: (q.question || '').replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '')
            }));
            setAssignmentConfig(resolved);
            setSavedAssignmentConfig(resolved);
            setSavedExamParts([]);
            setQpQuestions(qp.assignment_config || []);
          } else {
            setNumParts(String(qp.parts?.length || ''));
            const config = qp.parts?.map(p => ({
              numQuestions: p.num_questions,
              marksPerQuestion: p.marks_per_question || p.marksPerQuestion || 0,
              isEitherOr: p.questions?.some(q => q.either_or) || false
            })) || [];
            setPartsConfig(config);
            setQbAvailableQNos(buildExpectedQNosFromParts(config));
            setSavedExamParts(qp.parts || []);
            const qList = [];
            qp.parts?.forEach(p => {
              const questions = (p.questions || []);
              const qArray = Array.isArray(questions) ? questions : Object.values(questions);
              qArray.forEach(q => {
                if (q.question && q.question.trim().toLowerCase() === '(or)') return;
                // Ensure sub property exists for either_or questions if missing
                if (q.either_or && !q.sub) {
                  if (q.qno && q.qno.toLowerCase().endsWith('(a)')) q.sub = 'a';
                  else if (q.qno && q.qno.toLowerCase().endsWith('(b)')) q.sub = 'b';
                  else if (q.qno && q.qno.toLowerCase().endsWith('a')) q.sub = 'a';
                  else if (q.qno && q.qno.toLowerCase().endsWith('b')) q.sub = 'b';
                }
                qList.push(q);
              });
            });
            setQpQuestions(qList);
          }
          setShowParts(true);

          // Fetch COs explicitly for loading (comprehensive fallback)
          const lProgKey = formatProgrammeKey(qp.programme);
          const lRegulation = getRegulationForBatch(lProgKey, qp.batch);
          const fetchedCOs = await fetchCOsWithFallback(qp.department, lRegulation, getSubjectCodeFrom(qp.subject), qp.academic_year, lProgKey, undefined, undefined, allRegulations);
          setCourseOutcomes(fetchedCOs);

          // Wait for editor to be ready
          const checkEditor = setInterval(() => { // This interval is for loading saved paper when editing
            if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor && window.CKEDITOR.instances.questionEditor.status === 'ready') {
              clearInterval(checkEditor);

              const html = getQuestionPaperHTML(qp, fetchedCOs);
              window.CKEDITOR.instances.questionEditor.setData(html, () => {
                typesetMath();
              });
              typesetMath();
              showToast("Saved question paper loaded successfully.", "success");
            }
          }, 500);
        }
      } catch (error) {
        console.error("Error loading saved paper:", error);
        showToast("Failed to load saved question paper.", "error");
      }
    };

    loadSavedPaper();
  }, [editId, compositeKey, getQuestionPaperHTML, getRegulationForBatch]);

  // Auto-select dropdowns from URL params or single option defaults
  useEffect(() => {
    if (editId || compositeKey) return;

    const urlCode = searchParams.get('code') || searchParams.get('subjectCode');
    const urlBatch = searchParams.get('batch');
    const urlSem = searchParams.get('sem') || searchParams.get('semester');
    const urlProg = searchParams.get('prog') || searchParams.get('program');
    const urlDept = searchParams.get('dept') || searchParams.get('department');
    const urlAy = searchParams.get('ay') || searchParams.get('academicYear');
    const urlSec = searchParams.get('sec') || searchParams.get('section');

    // 1. Program
    if (urlProg && filteredProgrammes.length > 0) {
      const normUrlProg = formatProgrammeKey(urlProg);
      const matchP = filteredProgrammes.find(p =>
        formatProgrammeKey(p) === normUrlProg ||
        p.toLowerCase().replace(/[^a-z0-9]/g, '') === urlProg.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (matchP && program !== matchP) {
        setProgram(matchP);
      }
    } else if (!program && filteredProgrammes.length === 1) {
      setProgram(filteredProgrammes[0]);
    }

    // 2. Department
    if (urlDept && filteredDepartments.length > 0) {
      const normDept = sanitizeKey(urlDept).toLowerCase().trim();
      const matchD = filteredDepartments.find(d =>
        sanitizeKey(d).toLowerCase().trim() === normDept ||
        d.toLowerCase().trim() === urlDept.toLowerCase().trim() ||
        d.toLowerCase().includes(urlDept.toLowerCase()) ||
        urlDept.toLowerCase().includes(d.toLowerCase())
      );
      if (matchD && department !== matchD) {
        setDepartment(matchD);
      }
    } else if (!department && filteredDepartments.length === 1) {
      setDepartment(filteredDepartments[0]);
    }

    // 3. Batch
    if (urlBatch && displayedBatches.length > 0) {
      const matchB = displayedBatches.find(b => b === urlBatch || formatBatchDisplay(b) === formatBatchDisplay(urlBatch));
      if (matchB && batch !== matchB) {
        setBatch(matchB);
      }
    } else if (!batch && displayedBatches.length === 1) {
      setBatch(displayedBatches[0]);
    }

    // 4. Academic Year
    if (urlAy && academicYears.length > 0) {
      const matchY = academicYears.find(y => y === urlAy);
      if (matchY && academicYear !== matchY) {
        setAcademicYear(matchY);
      }
    } else if (!academicYear && academicYears.length === 1) {
      setAcademicYear(academicYears[0]);
    }

    // 5. Semester
    if (urlSem && semesters.length > 0) {
      const semNum = deriveSemesterNumber(urlSem);
      const matchS = semesters.find(s => deriveSemesterNumber(s) === semNum);
      if (matchS && selectedSemester !== matchS) {
        setSelectedSemester(matchS);
      }
    } else if (!selectedSemester && semesters.length === 1) {
      setSelectedSemester(semesters[0]);
    }

    // 6. Section (from URL)
    if (urlSec && availableSections.length > 0) {
      const normSec = String(urlSec).toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchSec = availableSections.find(s =>
        String(s).toLowerCase().replace(/[^a-z0-9]/g, '') === normSec ||
        String(s).toLowerCase().endsWith(normSec) ||
        normSec.endsWith(String(s).toLowerCase())
      );
      if (matchSec && section !== matchSec) {
        setSection(matchSec);
      }
    }
  }, [searchParams, filteredProgrammes, filteredDepartments, displayedBatches, academicYears, semesters, availableSections, editId, compositeKey, program, department, batch, academicYear, selectedSemester, section]);

  // Auto-select Section based on faculty subject assignments if not provided via URL
  useEffect(() => {
    if (editId || compositeKey || !program || !department || !batch || !academicYear || !selectedSemester) return;

    const urlSec = searchParams.get('sec') || searchParams.get('section');
    const urlCode = searchParams.get('code') || searchParams.get('subjectCode');

    // If URL has sec and matched, skip
    if (urlSec && section) return;

    if (!availableSections.length) {
      if (section) setSection('');
      return;
    }

    // Single section default
    if (availableSections.length === 1) {
      if (section !== availableSections[0]) setSection(availableSections[0]);
      return;
    }

    // Multiple sections available: check which section has allocated subjects for current faculty
    const autoPickFacultySection = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (!section) setSection(availableSections[0]);
        return;
      }

      const progKey = formatProgrammeKey(program);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const ayKey = sanitizeKey(academicYear);
      const semNum = deriveSemesterNumber(selectedSemester);
      if (!semNum) return;

      for (const secCand of availableSections) {
        const secSuffix = `_${sanitizeKey(secCand)}`;
        const key = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}${secSuffix}`;
        try {
          const snap = await getDoc(doc(db, 'subject_assignments', key));
          if (snap.exists()) {
            const data = snap.data();
            const userAssigned = data[currentUser.uid];
            if (Array.isArray(userAssigned) && userAssigned.length > 0) {
              if (urlCode) {
                if (userAssigned.includes(urlCode) || userAssigned.some(c => String(c).toUpperCase() === String(urlCode).toUpperCase())) {
                  if (section !== secCand) setSection(secCand);
                  return;
                }
              } else {
                if (section !== secCand) setSection(secCand);
                return;
              }
            }
          }
        } catch (e) {
          console.warn("Error checking section assignment:", e);
        }
      }

      // Default to first section if no specific assignment match found
      if (!section && availableSections.length > 0) {
        setSection(availableSections[0]);
      }
    };

    autoPickFacultySection();
  }, [availableSections, program, department, batch, academicYear, selectedSemester, searchParams, section, editId, compositeKey]);

  // Auto-select Exam from URL parameter or single option default
  useEffect(() => {
    if (editId || compositeKey || !filteredExams || filteredExams.length === 0) return;

    const urlExam = searchParams.get('exam') || searchParams.get('examName') || searchParams.get('examId') || searchParams.get('cia');
    const normClean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const normalizeExamKey = (str) => {
      if (!str) return '';
      let s = String(str).toLowerCase().trim();
      s = s.replace(/continuous\s*internal\s*assessment/g, 'cia');
      s = s.replace(/internal\s*assessment/g, 'cia');
      s = s.replace(/internal\s*test/g, 'cia');
      s = s.replace(/cia\s*test/g, 'cia');
      s = s.replace(/test/g, '');
      s = s.replace(/examination/g, 'exam');
      s = s.replace(/assessment/g, '');

      // Convert Roman numerals to digits
      s = s.replace(/\bviii\b/g, '8')
        .replace(/\bvii\b/g, '7')
        .replace(/\bvi\b/g, '6')
        .replace(/\biv\b/g, '4')
        .replace(/\bv\b/g, '5')
        .replace(/\biii\b/g, '3')
        .replace(/\bii\b/g, '2')
        .replace(/\bi\b/g, '1');

      return s.replace(/[^a-z0-9]/g, '');
    };

    if (urlExam) {
      const urlNorm = normalizeExamKey(urlExam);
      const urlRawClean = normClean(urlExam);

      // 1. Direct ID match
      let match = filteredExams.find(e => String(e.id) === String(urlExam));

      // 2. Exact examName / ID match using normalizeExamKey
      if (!match && urlNorm) {
        match = filteredExams.find(e => normalizeExamKey(e.examName) === urlNorm || normalizeExamKey(e.id) === urlNorm);
      }

      // 3. Raw clean match
      if (!match && urlRawClean) {
        match = filteredExams.find(e => {
          const eClean = normClean(e.examName);
          const idClean = normClean(e.id);
          return eClean === urlRawClean || idClean === urlRawClean;
        });
      }

      // 4. Substring / partial match with normalizeExamKey
      if (!match && urlNorm) {
        match = filteredExams.find(e => {
          const eNorm = normalizeExamKey(e.examName);
          const idNorm = normalizeExamKey(e.id);
          return (
            (eNorm && (eNorm.includes(urlNorm) || urlNorm.includes(eNorm))) ||
            (idNorm && (idNorm.includes(urlNorm) || urlNorm.includes(idNorm)))
          );
        });
      }

      if (match) {
        if (exam !== match.id) setExam(match.id);
        return;
      }
    }

    // Fallback: If exam is empty or no longer valid in filteredExams, auto-select first available option ONLY if no urlExam was provided or if single option
    const isCurrentExamValid = filteredExams.some(e => e.id === exam);
    if (!isCurrentExamValid) {
      // Before auto-selecting the first option, try to re-sync a stale exam NAME to its
      // current config ID in filteredExams (the exam identity can shift between a weightage
      // name string and a Firebase push ID while async listeners load in different orders).
      if (exam) {
        const cleanExam = normClean(exam);
        const nameMatch = filteredExams.find(e => normClean(e.examName) === cleanExam);
        if (nameMatch) {
          if (exam !== nameMatch.id) setExam(nameMatch.id);
          return;
        }
      }
      if (filteredExams.length === 1 || (!exam && filteredExams.length > 0 && !urlExam)) {
        setExam(filteredExams[0].id);
      }
    }
  }, [filteredExams, searchParams, editId, compositeKey, exam]);

  // Auto-select the Question Paper Set from URL param (e.g. &set=Set 2) when arriving
  // from Faculty Dashboard QP Setter task cards — first paper opens Set 1, second opens Set 2, etc.
  useEffect(() => {
    if (editId || compositeKey) return;
    const urlSet = searchParams.get('set') || searchParams.get('qpSet') || searchParams.get('setNumber');
    if (!urlSet) return;

    const setNumMatch = String(urlSet).match(/\d+/);
    if (!setNumMatch) return;
    const requestedNum = parseInt(setNumMatch[0], 10);
    if (!requestedNum || requestedNum < 1 || requestedNum > 99) return;
    const target = `Set ${requestedNum}`;
    if (qpSet !== target) setQpSet(target);
  }, [searchParams, editId, compositeKey, qpSet]);

  // Prevent showing stale saved-summary when building a new paper context.
  useEffect(() => {
    if (editId || compositeKey || hasLoadedRef.current) return;
    setSavedExamParts([]);
  }, [program, department, batch, academicYear, selectedSemester, subject, exam, customExam, assessmentType, editId, compositeKey]);

  useEffect(() => {
    if (batch) {
      const years = getAcademicYears(batch);
      setAcademicYears(years);
      if (academicYear && !years.includes(academicYear)) {
        setAcademicYear('');
      }
    } else {
      setAcademicYears([]);
    }
  }, [batch, academicYear]);

  useEffect(() => {
    if (batch && academicYear) {
      const years = getAcademicYears(batch);
      const index = years.indexOf(academicYear);
      if (index >= 0) {
        const sem1 = (index * 2) + 1;
        const sem2 = (index * 2) + 2;

        const allSems = [sem1, sem2];
        const filteredSems = allSems.filter(num => {
          if (globalSemesterType === "Odd") return num % 2 !== 0;
          if (globalSemesterType === "Even") return num % 2 === 0;
          return true; // For "Both" or any other value
        });

        const getOrdinal = (n) => {
          const s = ["th", "st", "nd", "rd"];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        const newSems = filteredSems.map(num => `${getOrdinal(num)} Semester`);
        setSemesters(newSems);
        if (selectedSemester && !newSems.includes(selectedSemester)) {
          setSelectedSemester('');
        }
      } else {
        setSemesters([]);
      }
    } else {
      setSemesters([]);
    }
  }, [batch, academicYear, globalSemesterType, selectedSemester]);

  // Fetch Subjects from Syllabus & Auto-select Subject
  useEffect(() => {
    const fetchSubjects = async () => {
      const progKey = formatProgrammeKey(program);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!program || !department || !regulation || !selectedSemester || !academicYear) {
        setSubjects([]);
        return;
      }

      const deptKey = sanitizeKey(department);
      const regKey = sanitizeKey(regulation);
      const syllabusKey = `${progKey}_${deptKey}_${regKey}`;
      const semNum = deriveSemesterNumber(selectedSemester);

      if (!semNum) return;

      try {
        const syllabusRef = doc(db, 'syllabus_data', syllabusKey);
        const snapshot = await getDoc(syllabusRef);
        const data = snapshot.data();
        let fetchedSubjects = [];

        if (data && data.semesters && data.semesters[semNum]) {
          fetchedSubjects = data.semesters[semNum]
            .filter(s => s != null && s.isActive !== false)
            .map(s => ({
              code: s.code,
              value: JSON.stringify({
                code: s.code,
                name: s.name,
                category: s.category || s.type || s.courseType || 'Theory'
              }),
              text: `${s.code} - ${s.name}`
            }));
        }

        // Filter by HOD Assignments
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setSubjects([]);
          return;
        }

        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userRole = userSnap.exists() ? userSnap.data().role : null;

        let userAssignments = [];
        const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
        const assignmentCompositeKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}${sectionSuffix}`;
        let assignmentSnap = await getDoc(doc(db, 'subject_assignments', assignmentCompositeKey));

        // Fallback 1: If no assignment doc for current section, try base key without section
        if (!assignmentSnap.exists() && section) {
          const baseKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}`;
          assignmentSnap = await getDoc(doc(db, 'subject_assignments', baseKey));
        }

        if (assignmentSnap.exists()) {
          const assignments = assignmentSnap.data();
          userAssignments = assignments[currentUser.uid] || [];
        }

        // Fallback 2: If userAssignments is still empty for Faculty, search all sections for this batch/sem
        if (userAssignments.length === 0 && userRole !== 'Admin' && userRole !== 'Principal' && availableSections.length > 0) {
          for (const secCand of availableSections) {
            const secKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNum}_${sanitizeKey(secCand)}`;
            try {
              const secSnap = await getDoc(doc(db, 'subject_assignments', secKey));
              if (secSnap.exists()) {
                const secData = secSnap.data();
                if (secData[currentUser.uid] && secData[currentUser.uid].length > 0) {
                  userAssignments = secData[currentUser.uid];
                  if (!section) setSection(secCand);
                  break;
                }
              }
            } catch (e) { }
          }
        }

        const filteredSubjects = (userRole === 'Admin' || userRole === 'Principal' || userAssignments.length === 0)
          ? fetchedSubjects
          : fetchedSubjects.filter(s => userAssignments.includes(s.code) || userAssignments.includes(s.value));

        setSubjects(filteredSubjects);

        // Auto-select Subject from URL code parameter
        const urlCode = searchParams.get('code') || searchParams.get('subjectCode');
        if (urlCode && filteredSubjects.length > 0) {
          const matchSub = filteredSubjects.find(s =>
            s.code === urlCode ||
            String(s.code).toUpperCase() === String(urlCode).toUpperCase()
          );
          if (matchSub) {
            setSubject(matchSub.value);
            return;
          }
        }

        // Auto-select Subject if current subject is empty or not in the filtered list
        const currentValid = filteredSubjects.some(s => s.value === subject);
        if (!currentValid && filteredSubjects.length > 0) {
          setSubject(filteredSubjects[0].value);
        } else if (filteredSubjects.length === 0) {
          setSubject('');
        }
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
      }
    };

    fetchSubjects();
  }, [program, department, batch, selectedSemester, academicYear, section, searchParams, getRegulationForBatch, availableSections]);

  useEffect(() => {
    // Load CKEditor script dynamically
    if (!window.CKEDITOR) {
      const script = document.createElement("script");
      script.src = "https://cdn.ckeditor.com/4.22.1/full-all/ckeditor.js";
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (window.CKEDITOR) {
          window.CKEDITOR.config.versionCheck = false;
          window.CKEDITOR.config.font_defaultLabel = 'Times New Roman';
          window.CKEDITOR.config.fontSize_defaultLabel = '12pt';
          window.CKEDITOR.on('log', function (evt) {
            if (evt.data && evt.data.errorCode === 'exportpdf-no-token-url') {
              evt.cancel();
            }
          });
          initEditor();
        }
      };
      script.onerror = () => {
        console.error("Failed to load CKEditor script");
      };
      document.body.appendChild(script);
    } else {
      initEditor();
    }

    return () => {
      // Comprehensive cleanup: destroy ALL CKEditor instances on unmount
      if (window.CKEDITOR && window.CKEDITOR.instances) {
        try {
          Object.keys(window.CKEDITOR.instances).forEach(instanceName => {
            try {
              const instance = window.CKEDITOR.instances[instanceName];
              if (instance) {
                instance.destroy(true);
                delete window.CKEDITOR.instances[instanceName];
              }
            } catch (e) {
              console.warn(`Error destroying CKEditor instance ${instanceName}:`, e);
            }
          });
        } catch (e) {
          console.warn("Error during CKEditor cleanup:", e);
        }
      }
    };
  }, []);

  // ✅ CRITICAL: Cleanup CKEditor instances when showing final preview or resetting
  useEffect(() => {
    // When closing preview or resetting, destroy the editor to prevent conflicts
    return () => {
      if (!showFinalPreview && window.CKEDITOR && window.CKEDITOR.instances) {
        try {
          if (window.CKEDITOR.instances.questionEditor) {
            window.CKEDITOR.instances.questionEditor.destroy(true);
            delete window.CKEDITOR.instances.questionEditor;
          }
        } catch (e) {
          console.warn("Error destroying questionEditor on preview close:", e);
        }
      }
    };
  }, [showFinalPreview]);

  // Also try to initialize when assessmentType changes to Exam
  useEffect(() => {
    if (assessmentType === 'Exam') {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        initEditor();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [assessmentType]);

  // Initialize CKEditor for each assignment question
  useEffect(() => {
    if (!window.CKEDITOR || !showParts || (!isAssignmentOrProject)) return;
    let cancelled = false;

    const attemptInit = () => {
      if (cancelled) return;
      const allReady = assignmentConfig.every((_, qIdx) => document.getElementById(`editorWrapper_${qIdx}`));
      if (allReady && window.CKEDITOR) {
        assignmentConfig.forEach((q, qIdx) => {
          const editorId = `assignmentEditor_${qIdx}`;
          if (window.CKEDITOR.instances && window.CKEDITOR.instances[editorId]) {
            try { window.CKEDITOR.instances[editorId].destroy(true); } catch { }
          }
          const wrapper = document.getElementById(`editorWrapper_${qIdx}`);
          if (!wrapper) return;
          wrapper.innerHTML = '';
          const textarea = document.createElement('textarea');
          textarea.id = editorId;
          wrapper.appendChild(textarea);

          const editor = window.CKEDITOR.replace(editorId, {
            removePlugins: 'elementspath',
            resize_enabled: false,
            extraPlugins: 'uploadimage,mathjax',
            mathJaxLib: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-AMS-MML_HTMLorMML',
            filebrowserUploadUrl: '',
            height: 200,
            font_defaultLabel: 'Times New Roman',
            fontSize_defaultLabel: '12pt',
            contentsCss: [window.CKEDITOR.basePath + 'contents.css'],
            contentsStyle: `body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; }`
          });

          editor.on('instanceReady', function () {
            try { editor.setData(q.question || ''); } catch { }
          });

          editor.on('change', function () {
            try {
              const data = editor.getData().replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '');
              setAssignmentConfig(prev => {
                const updated = [...prev];
                if (updated[qIdx]) updated[qIdx] = { ...updated[qIdx], question: data };
                return updated;
              });
            } catch { }
          });
          handleCkImageUpload(editor);
        });
      } else {
        setTimeout(attemptInit, 120);
      }
    };

    attemptInit();
    return () => { cancelled = true; };
  }, [assignmentConfig.length, showParts, assessmentType]);

  const initEditor = useCallback(() => {
    if (!window.CKEDITOR) return;

    try {
      // ✅ CRITICAL: Destroy old instance if it exists before creating a new one
      if (window.CKEDITOR.instances && window.CKEDITOR.instances.questionEditor) {
        try {
          window.CKEDITOR.instances.questionEditor.destroy(true);
          delete window.CKEDITOR.instances.questionEditor;
        } catch (e) {
          console.warn('Failed to destroy previous CKEditor instance:', e);
        }
      }

      // Remove textarea from DOM if it's been attached to multiple instances
      const element = document.getElementById('questionEditor');
      if (!element) return;

      const editor = window.CKEDITOR.replace('questionEditor', {
        versionCheck: false,
        width: '210mm',
        height: '297mm',
        extraPlugins: 'print,uploadimage,mathjax',
        mathJaxLib: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-AMS-MML_HTMLorMML',
        toolbar: [
          { name: 'document', items: ['Source', '-', 'Print'] },
          { name: 'clipboard', items: ['Undo', 'Redo'] },
          { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', '-', 'RemoveFormat'] },
          { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight'] },
          { name: 'insert', items: ['Image', 'Table', 'HorizontalRule', 'Mathjax'] },
          { name: 'styles', items: ['Format', 'FontSize'] },
          { name: 'colors', items: ['TextColor', 'BGColor'] },
          { name: 'tools', items: ['Maximize'] }
        ],
        contentsCss: [window.CKEDITOR.basePath + 'contents.css'],
        contentsStyle: `
        @page { size: A4; margin: 20mm; }
        html, body { width: 210mm; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; margin: 0; padding: 20mm; line-height: 1.5; box-sizing: border-box; }
        *, *::before, *::after { box-sizing: border-box; }
        p { margin: 0 0 8px 0; }
        img { max-width: 100%; height: auto; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        td, th { padding: 6px; border: 1px solid #333; }
        @media print {
          body { padding: 20mm; }
          table, td, th { border-color: #000 !important; }
        }
      `
      });

      editor.on('instanceReady', function (evt) {
        try {
          evt.editor.container.setStyle('width', '210mm');
          evt.editor.container.setStyle('max-width', '210mm');
          evt.editor.container.setStyle('background', 'transparent');
          evt.editor.container.setStyle('margin', '0 auto');

          // Ensure CKEditor iframe's MathJax instance loads TeX AMSmath extension
          const frameDoc = evt.editor.document?.$;
          if (frameDoc && frameDoc.head) {
            const configScript = frameDoc.createElement('script');
            configScript.type = 'text/x-mathjax-config';
            configScript.text = `
              MathJax.Hub.Config({
                TeX: { extensions: ["AMSmath.js", "AMSsymbols.js", "autobold.js"] },
                tex2jax: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] }
              });
            `;
            frameDoc.head.appendChild(configScript);
          }

          const contents = evt.editor.container.findOne('.cke_contents');
          if (contents) {
            contents.setStyle('height', 'calc(297mm - 40mm)');
            contents.setStyle('overflow', 'auto');
          }

          // ✅ Fix toolbar positioning
          const toolbar = evt.editor.container.findOne('.cke_top');
          if (toolbar) {
            toolbar.setStyle('position', 'relative');
            toolbar.setStyle('z-index', '11');
            toolbar.setStyle('overflow', 'visible');
          }

          // ✅ Close any open panels when clicking on editor content
          evt.editor.editable().attachListener(evt.editor.editable(), 'click', function () {
            const panelElement = document.querySelector('.cke_panel_on');
            if (panelElement && window.CKEDITOR && window.CKEDITOR.ui.panel) {
              panelElement.style.display = 'none';
              panelElement.classList.remove('cke_panel_on');
            }
          });

          window.CKEDITOR.addCss(
            'select{border:1px solid #d1d5db; border-radius:4px; padding:2px 4px; background-color:#f9fafb; font-size:11px; color:#374151; outline:none; cursor:pointer; transition:border-color 0.2s;}' +
            'select:focus{border-color:#3b82f6; background-color:#fff;}'
          );

          evt.editor.document.on('change', function (e) {
            const target = e.data.getTarget();
            if (target.getName() === 'select') {
              const val = target.getValue();
              const options = target.find('option');
              for (let i = 0; i < options.count(); i++) {
                const option = options.getItem(i);
                if (option.getValue() === val) {
                  option.setAttribute('selected', 'selected');
                } else {
                  option.removeAttribute('selected');
                }
              }
              if (target.hasClass('co-select')) {
                const selectedCO = val;
                const tr = target.getAscendant('tr');
                if (tr) {
                  const piSelect = tr.findOne('.pi-select');
                  if (piSelect) {
                    piSelect.setHtml('<option value="">Select PI</option>');
                    const mapping = window.coPiMappingData || {};
                    const pis = mapping[selectedCO] || [];
                    if (pis.length > 0) {
                      pis.forEach(pi => {
                        const option = evt.editor.document.createElement('option');
                        option.setAttribute('value', pi);
                        option.setText(pi);
                        piSelect.append(option);
                      });
                    }
                    piSelect.setValue('');
                    const piOptions = piSelect.find('option');
                    for (let i = 0; i < piOptions.count(); i++) {
                      piOptions.getItem(i).removeAttribute('selected');
                    }
                    if (piOptions.count() > 0) {
                      piOptions.getItem(0).setAttribute('selected', 'selected');
                    }
                  }
                }
              }
              if (typeof window.refreshOutcomesSummary === 'function') {
                setTimeout(() => window.refreshOutcomesSummary(), 100);
              }
              evt.editor.fire('change');
            }
          }, null, null, 1);

          // ✅ Ensure panels are properly hidden on blur
          evt.editor.focusManager.blur(true);
        } catch (e) {
          console.warn('Failed to apply A4 styles to CKEditor instance', e);
        }
      });
      handleCkImageUpload(editor);
    } catch (e) {
      console.error('initEditor error:', e);
    }
  }, []);
  const handleGenerateParts = () => {
    if (assessmentType !== 'Indirect' && !isAssignmentOrProject) {
      if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam || !numParts) {
        showToast("Please fill in all required fields.", "error");
        return;
      }
    } else {
      if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
        showToast("Please fill in all required fields.", "error");
        return;
      }
      if (!assignmentQuestionCount || parseInt(assignmentQuestionCount, 10) < 1) {
        showToast("Please enter a valid number of questions.", "error");
        return;
      }
    }

    if (exam === 'custom' && !customExam) {
      showToast("Please enter the custom exam name.", "error");
      return;
    }

    const count = assessmentType === 'Indirect' ? assignmentQuestionCount : (isAssignmentOrProject ? assignmentQuestionCount : parseInt(numParts, 10));

    if (assessmentType === 'Indirect') {
      setAssignmentTotalMarks(count * 3); // 3 stars per CO
      setAssignmentConfig(Array.from({ length: count }, (_, i) => ({
        question: '',
        marks: 3,
        mappings: [],
        kl: '',
        kldomain: ''
      })));
    } else if (isAssignmentOrProject) {
      setAssignmentConfig(Array.from({ length: count }, (_, i) => {
        const existing = assignmentConfig[i];
        return existing ? { ...existing } : { question: '', marks: '', mappings: [], kl: '', kldomain: '' };
      }));
    } else if (assessmentType === 'Exam') {
      setPartsConfig(Array.from({ length: count }, (_, i) => {
        const existing = partsConfig[i];
        return existing ? { ...existing } : { numQuestions: 1, marksPerQuestion: 2, isEitherOr: false };
      }));
    }
    setShowParts(true);
    setShowFinalPreview(false);
  };

  const handlePartChange = (index, field, value) => {
    const updated = [...partsConfig];
    updated[index][field] = value;
    setPartsConfig(updated);
  };


  const handleAddCOAssignment = (qIdx, coCode) => {
    if (!coCode) return;
    const updated = [...assignmentConfig];
    if (!updated[qIdx].mappings) updated[qIdx].mappings = [];

    if (!updated[qIdx].mappings.some(m => m.co === coCode)) {
      updated[qIdx].mappings.push({ co: coCode, pis: [], marks: '' });
      setAssignmentConfig(updated);
    }
  };

  const handleRemoveCOAssignment = (qIdx, coIndex) => {
    const updated = [...assignmentConfig];
    updated[qIdx].mappings = updated[qIdx].mappings.filter((_, i) => i !== coIndex);
    setAssignmentConfig(updated);
  };

  const handleMappingMarksChange = (qIdx, coIndex, markValue) => {
    const updated = [...assignmentConfig];
    const parsed = parseInt(markValue, 10);
    const nextMark = Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
    const totalAllowed = parseInt(updated?.[qIdx]?.marks, 10) || 0;

    const usedWithoutCurrent = (updated[qIdx].mappings || []).reduce((sum, m, idx) => {
      if (idx === coIndex) return sum;
      return sum + (parseInt(m?.marks, 10) || 0);
    }, 0);

    if (usedWithoutCurrent + nextMark > totalAllowed) {
      alert(`Entered mark exceeds the total marks for Question ${qIdx + 1} (${totalAllowed}). Value cleared.`);
      updated[qIdx].mappings[coIndex].marks = '';
      updated[qIdx].mappings[coIndex].piMarks = [];
      setAssignmentConfig(updated);
      return;
    }

    updated[qIdx].mappings[coIndex].marks = nextMark;
    // Auto-distribute marks equally among PIs
    const piCount = (updated[qIdx].mappings[coIndex].pis || []).length;
    if (nextMark > 0 && piCount > 0) {
      const perPI = Math.floor(nextMark / piCount);
      const remainder = nextMark % piCount;
      updated[qIdx].mappings[coIndex].piMarks = updated[qIdx].mappings[coIndex].pis.map((_, i) => i < remainder ? perPI + 1 : perPI);
    } else {
      updated[qIdx].mappings[coIndex].piMarks = [];
    }
    setAssignmentConfig(updated);
  };

  const handleAddPIAssignment = (qIdx, coIndex, piValue) => {
    if (!piValue) return;
    const updated = [...assignmentConfig];
    const mappings = updated[qIdx].mappings;
    if (!mappings[coIndex].pis.includes(piValue)) {
      mappings[coIndex].pis.push(piValue);
      // Auto-distribute CO marks equally among all PIs
      const totalMarks = parseInt(mappings[coIndex].marks, 10) || 0;
      const piCount = mappings[coIndex].pis.length;
      if (totalMarks > 0 && piCount > 0) {
        const perPI = Math.floor(totalMarks / piCount);
        const remainder = totalMarks % piCount;
        mappings[coIndex].piMarks = mappings[coIndex].pis.map((_, i) => i < remainder ? perPI + 1 : perPI);
      }
      setAssignmentConfig(updated);
    }
  };

  const handleRemovePIAssignment = (qIdx, coIndex, piIndex) => {
    const updated = [...assignmentConfig];
    updated[qIdx].mappings[coIndex].pis = updated[qIdx].mappings[coIndex].pis.filter((_, i) => i !== piIndex);
    // Auto-distribute CO marks equally among remaining PIs
    const totalMarks = parseInt(updated[qIdx].mappings[coIndex].marks, 10) || 0;
    const piCount = updated[qIdx].mappings[coIndex].pis.length;
    if (totalMarks > 0 && piCount > 0) {
      const perPI = Math.floor(totalMarks / piCount);
      const remainder = totalMarks % piCount;
      updated[qIdx].mappings[coIndex].piMarks = updated[qIdx].mappings[coIndex].pis.map((_, i) => i < remainder ? perPI + 1 : perPI);
    } else {
      updated[qIdx].mappings[coIndex].piMarks = [];
    }
    setAssignmentConfig(updated);
  };

  useEffect(() => {
    // Expose mapping data to window for CKEditor to access
    window.coPiMappingData = coPiMapping;
  }, [coPiMapping]);

  const buildExpectedQNosFromParts = (parts) => {
    const out = [];
    let counter = 1;
    (parts || []).forEach(part => {
      const count = parseInt(part?.numQuestions, 10) || 0;
      for (let i = 0; i < count; i++) {
        if (part?.isEitherOr) {
          out.push(`${counter}a`);
          out.push(`${counter}b`);
        } else {
          out.push(String(counter));
        }
        counter += 1;
      }
    });
    return out;
  };

  const getQuestionByQNo = (questions, qnoExpected) => {
    const normalize = (s) => {
      const raw = String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\(([a-z])\)$/i, '$1');
      const m = raw.match(/^(\d+)([a-z])?$/i);
      return m ? `${m[1]}${m[2] || ''}` : raw;
    };
    const target = normalize(qnoExpected);
    return (questions || []).find(q => {
      const qnorm = normalize(q?.qno);
      return qnorm === target;
    }) || null;
  };

  const handleGenerateTable = () => {
    if (isAssignmentOrProject && assessmentType !== 'Indirect') {
      const hasMappings = assignmentConfig[0]?.mappings && assignmentConfig[0].mappings.length > 0;
      if (!hasMappings) {
        showToast("Please ensure at least one CO is mapped to the assignment question.", "error");
        return false;
      }

      const sumMarks = assignmentConfig[0].mappings.reduce((sum, m) => sum + (m.marks || 0), 0);
      if (sumMarks !== assignmentConfig[0].marks) {
        showToast(`The sum of CO marks (${sumMarks}) must equal the total marks (${assignmentConfig[0].marks}).`, "error");
        return false;
      }
    }

    let overallTotal = 0;
    if (isAssignmentOrProject) {
      assignmentConfig.forEach(q => {
        overallTotal += q.marks;
      });
    } else {
      partsConfig.forEach(part => {
        overallTotal += part.numQuestions * part.marksPerQuestion;
      });
    }



    // Do not render to the second CKEditor here.
    // Only prepare Q.No options for builder; final rendering happens on Finalize.
    if (assessmentType === 'Exam') {
      const qnos = buildExpectedQNosFromParts(partsConfig);
      if (qnos.length) setQbAvailableQNos(qnos);
    }
    setShowFinalPreview(false);
    // Validate against CIA Config total marks and offer AI generation option on mismatch
    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    if (assessmentType === 'Exam' && exam !== 'custom' && selectedConfig) {
      const overallTotal = (partsConfig || []).reduce((sum, part) => {
        const count = parseInt(part?.numQuestions, 10) || 0;
        const marks = parseInt(part?.marksPerQuestion, 10) || 0;
        return sum + (count * marks);
      }, 0);
      const configTotal = getConfiguredExamTotalMarks(selectedConfig);
      if (configTotal > 0 && overallTotal !== configTotal) {
        const diff = overallTotal - configTotal;
        const status = diff > 0 ? 'HIGH' : 'LOW';
        const by = Math.abs(diff);
        alert(
          `Your mark is ${status}.\nConfigured total marks: ${configTotal}\nCurrent paper total: ${overallTotal}\nPlease ${diff > 0 ? 'reduce' : 'increase'} by ${by} mark(s) before proceeding.`
        );
        // Do not open AI modal automatically; user must explicitly click "Generate with AI".
        return;
      }
    }

    showToast('Parts ready. Enter questions and click Finalize to generate the paper.', 'success');
  };

  const handleOpenAIModal = () => {
    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    if (assessmentType === 'Exam' && exam !== 'custom' && selectedConfig) {
      const currentTotal = getCurrentStructureTotalMarks();
      const configTotal = getConfiguredExamTotalMarks(selectedConfig);
      if (configTotal > 0 && currentTotal !== configTotal) {
        const diff = currentTotal - configTotal;
        const status = diff > 0 ? 'HIGH' : 'LOW';
        const by = Math.abs(diff);
        alert(
          `Your mark is ${status}.\n` +
          `Configured total marks: ${configTotal}\n` +
          `Current paper total: ${currentTotal}\n` +
          `Please ${diff > 0 ? 'reduce' : 'increase'} by ${by} mark(s) before opening the AI Generator.`
        );
        return; // Do not open AI modal when totals mismatch
      }
    }
    setShowAIModal(true);
  };

  const handleFinalizeQuestions = () => {
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    let overallTotal = 0;
    let finalizedParts = [];

    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    const semesterNum = deriveSemesterNumber(selectedSemester);
    const subjectObj = subjects.find(s => s.value === subject);
    const subjectDisplay = subjectObj ? subjectObj.text : subject;
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam);

    if (assessmentType === 'Indirect') {
      const hasEmptyDescription = assignmentConfig.some((q, idx) => !q.question || !q.question.trim());
      if (hasEmptyDescription) {
        showToast("Please fill in all CO descriptions.", "error");
        return;
      }
      assignmentConfig.forEach(q => {
        overallTotal += (parseInt(q.marks, 10) || 0);
      });
    } else if (isAssignmentOrProject) {
      const hasMappings = assignmentConfig[0]?.mappings && assignmentConfig[0].mappings.length > 0;
      if (!hasMappings) {
        showToast("Please ensure at least one CO is mapped to the assignment question.", "error");
        return;
      }

      const sumMarks = (assignmentConfig[0].mappings || []).reduce((sum, m) => sum + (parseInt(m?.marks, 10) || 0), 0);
      const totalMarks = parseInt(assignmentConfig[0].marks, 10) || 0;
      if (sumMarks !== totalMarks) {
        const warnMsg = sumMarks > totalMarks
          ? `Warning: CO mark split exceeds total by ${sumMarks - totalMarks} mark(s).`
          : `Warning: ${totalMarks - sumMarks} mark(s) still not allocated to COs.`;
        showToast(warnMsg, 'error');
        return;
      }

      assignmentConfig.forEach(q => {
        overallTotal += (parseInt(q.marks, 10) || 0);
      });
    } else {
      if (!numParts) {
        showToast('Please select number of parts.', 'error');
        return;
      }
      (partsConfig || []).forEach(part => {
        overallTotal += (parseInt(part?.numQuestions, 10) || 0) * (parseInt(part?.marksPerQuestion, 10) || 0);
      });

      let counter = 1;
      finalizedParts = (partsConfig || []).map((part) => {
        const count = parseInt(part?.numQuestions, 10) || 0;
        const marks = parseInt(part?.marksPerQuestion, 10) || 0;
        const questions = [];
        for (let i = 0; i < count; i++) {
          if (part?.isEitherOr) {
            const qa = getQuestionByQNo(qpQuestions, `${counter}a`);
            const qb = getQuestionByQNo(qpQuestions, `${counter}b`);
            questions.push({
              qno: `${counter}(a)`,
              sub: 'a',
              either_or: true,
              marks: qa?.marks || marks, // Use marks from qpQuestions if available, else part marks
              question: qa?.question || '',
              co: qa?.co || '',
              kl: qa?.kl || '',
              pi: qa?.pi || ((qa?.co && coPiMapping[qa.co] && coPiMapping[qa.co][0]) ? coPiMapping[qa.co][0] : '')
            });
            questions.push({
              qno: `${counter}(b)`,
              sub: 'b',
              either_or: true,
              marks: qb?.marks || marks, // Use marks from qpQuestions if available, else part marks
              question: qb?.question || '',
              co: qb?.co || '',
              kl: qb?.kl || '',
              pi: qb?.pi || ((qb?.co && coPiMapping[qb.co] && coPiMapping[qb.co][0]) ? coPiMapping[qb.co][0] : '')
            });
          } else {
            const q = getQuestionByQNo(qpQuestions, `${counter}`);
            questions.push({
              qno: `${counter}`,
              sub: '',
              either_or: false,
              marks: q?.marks || marks, // Use marks from qpQuestions if available, else part marks
              question: q?.question || '',
              co: q?.co || '',
              kl: q?.kl || '',
              pi: q?.pi || ((q?.co && coPiMapping[q.co] && coPiMapping[q.co][0]) ? coPiMapping[q.co][0] : '')
            });
          }
          counter += 1;
        }
        return {
          num_questions: count,
          marks_per_question: marks,
          isEitherOr: !!part?.isEitherOr,
          questions
        };
      });
    }

    // Enforce CIA total marks match on finalize as well (AI path bypasses handleGenerateTable)
    if (assessmentType === 'Exam' && exam !== 'custom' && selectedConfig) {
      const configTotal = getConfiguredExamTotalMarks(selectedConfig);
      if (configTotal > 0 && overallTotal !== configTotal) {
        // Alert is required so users can correct mark definition
        alertIfMarksMismatchWithConfig(selectedConfig, overallTotal);
        showToast(`Total marks (${overallTotal}) does not match configured marks (${configTotal}).`, 'error');
        return;
      }
    }

    const qpDataForFinalize = {
      programme: program,
      department,
      batch,
      academic_year: academicYear,
      semester: String(semesterNum || ''),
      subject,
      subject_name: subjectDisplay.split(' - ')[1] || '',
      qpaper_name: exam === 'custom' ? examDisplay : exam,
      total_marks: overallTotal,
      exam_date: selectedConfig ? selectedConfig.examDate : new Date().toISOString(),
      assessment_type: assessmentType,
      parts: finalizedParts,
      assignment_config: assignmentConfig,
      assignment_kl: '',
      assignment_kl_domain: ''
    };

    const coSummary = deriveCOSummaryFromQp(qpDataForFinalize);
    const combinedContent = getQuestionPaperHTML(qpDataForFinalize, courseOutcomes, coSummary.activeCOs, coSummary.coWeightage);

    // Always set preview to true (make the textarea visible)
    setShowFinalPreview(true);

    // Once visible, initialize the editor if needed and set content
    setTimeout(() => {
      try {
        // Initialize editor if it doesn't exist
        if (!window.CKEDITOR || !window.CKEDITOR.instances['questionEditor']) {
          initEditor();
        }

        // Wait for editor to be ready, then set data
        setTimeout(() => {
          const editor = window.CKEDITOR && window.CKEDITOR.instances['questionEditor'];
          if (!editor) return;
          editor.setData(combinedContent, () => {
            try {
              typesetMath();
              const content = editor.getData();
              const qnos = extractQNosFromHtml(content);
              if (qnos && qnos.length) setQbAvailableQNos(qnos);
              if (typeof window.refreshOutcomesSummary === 'function') window.refreshOutcomesSummary(true);
            } catch {
              /* ignore */
            }
          });
          typesetMath();
        }, 100);
      } catch (e) {
        console.error('Error in handleFinalizeQuestions:', e);
      }
    }, 50);

    showToast('Question paper finalized with inserted questions.', 'success');
  };

  const isRefreshingRef = useRef(false);

  const refreshOutcomesSummary = useCallback((silent = false) => {
    if (isRefreshingRef.current) return false;
    const editor = window.CKEDITOR && window.CKEDITOR.instances.questionEditor;
    if (!editor || !editor.document) return false;

    isRefreshingRef.current = true;
    try {
      const activeCOs = new Set();
      const coWeightage = {};
      const currentQuestionGroups = {}; // { qno: { marks: X, cos: Set } }

      const tables = editor.document.find('table');
      let currentPartMarks = 0;

      for (let i = 0; i < tables.count(); i++) {
        const table = tables.getItem(i);
        const tableText = table.getText();
        const rows = table.find('tr');

        if (/Part\s+[A-Z]/i.test(tableText) && /Marks/i.test(tableText)) {
          // Handle both "×" and "x" and tolerate extra whitespace.
          const m = tableText.match(/(\d+)\s*[×x]\s*(\d+)\s*=\s*(\d+)/i);
          if (m && m[2]) {
            currentPartMarks = parseInt(m[2], 10) || 0;
          } else {
            // Fallback: try to find the number after ×/x
            const m2 = tableText.match(/[×x]\s*(\d+)/i);
            if (m2 && m2[1]) currentPartMarks = parseInt(m2[1], 10) || 0;
          }
          continue;
        }

        const firstRow = rows.getItem(0);
        if (!firstRow) continue;
        const headers = firstRow.find('th');
        let coIndex = -1, marksIndex = -1;

        for (let j = 0; j < headers.count(); j++) {
          const hText = headers.getItem(j).getText().trim();
          if (hText === 'CO') coIndex = j;
          if (hText === 'Marks') marksIndex = j;
        }

        if (coIndex !== -1) {
          const isAssignmentTable = marksIndex !== -1;
          let lastQNo = '';

          for (let j = 1; j < rows.count(); j++) {
            const row = rows.getItem(j);
            const cells = row.find('td');
            if (cells.count() === 0) continue;

            let qNoText = '', coText = '', rowMarks = 0;

            if (isAssignmentTable) {
              const tempQNoIndex = 0; // Simplified
              if (cells.count() > tempQNoIndex) qNoText = cells.getItem(tempQNoIndex).getText().trim();
              if (cells.count() > coIndex) {
                const coSelect = cells.getItem(coIndex).findOne('select');
                coText = coSelect ? coSelect.getValue() : cells.getItem(coIndex).getText().trim();
              }
              if (cells.count() > marksIndex) rowMarks = parseInt(cells.getItem(marksIndex).getText().trim()) || 0;
            } else {
              if (cells.count() >= 4) {
                qNoText = cells.getItem(0).getText().trim();
                const coCell = cells.count() === 5 ? cells.getItem(3) : cells.getItem(2);
                const coSelect = coCell.findOne('select');
                coText = coSelect ? coSelect.getValue() : coCell.getText().trim();
                rowMarks = currentPartMarks;
              }
            }

            if (qNoText && qNoText !== '(Or)') {
              const baseQNo = qNoText.replace(/\(a\)|\(b\)/g, '').trim();
              if (baseQNo) lastQNo = baseQNo;
            }

            if (coText && coText.startsWith('CO') && lastQNo) {
              activeCOs.add(coText);
              if (!currentQuestionGroups[lastQNo]) {
                currentQuestionGroups[lastQNo] = { marks: rowMarks, cos: new Set() };
              }
              currentQuestionGroups[lastQNo].cos.add(coText);
              if (isAssignmentTable) {
                currentQuestionGroups[lastQNo].marks = rowMarks;
              }
            }
          }
        }
      }

      Object.values(currentQuestionGroups).forEach(group => {
        group.cos.forEach(co => {
          coWeightage[co] = (coWeightage[co] || 0) + group.marks;
        });
      });

      const summarySection = editor.document.findOne('.outcomes-summary-section');
      if (summarySection) {
        const tbody = summarySection.findOne('tbody');
        if (tbody) {
          const rows = tbody.find('tr');
          for (let i = 0; i < rows.count(); i++) {
            const row = rows.getItem(i);
            const cells = row.find('td');
            if (cells.count() >= 4) {
              const coCode = cells.getItem(0).getText().trim();
              cells.getItem(2).setHtml(activeCOs.has(coCode) ? '✓' : '');
              cells.getItem(2).setStyle('text-align', 'center');
              cells.getItem(3).setHtml(coWeightage[coCode] ? String(coWeightage[coCode]) : '');
              cells.getItem(3).setStyle('text-align', 'center');
            }
          }
        }
        if (!silent) showToast("Outcomes summary refreshed successfully!", "success");
        return true;
      }
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    window.refreshOutcomesSummary = refreshOutcomesSummary;
    return () => {
      delete window.refreshOutcomesSummary;
    };
  }, [refreshOutcomesSummary]);

  const handleSaveAssignment = async (status = 'draft', forwardedToUid = null) => {
    const isFieldsValid = program && department && batch && academicYear && selectedSemester && subject && exam;
    if (!isFieldsValid) {
      showToast("Please fill in all required fields before saving.", "error");
      return false;
    }

    let overallTotal = 0;
    const co_weightage = {};

    if (assessmentType !== 'Indirect') {
      const hasMappings = assignmentConfig[0]?.mappings && assignmentConfig[0].mappings.length > 0;
      if (!hasMappings) {
        showToast("Please ensure the assignment question has at least one CO mapping.", "error");
        return false;
      }

      const sumMarks = assignmentConfig[0].mappings.reduce((sum, m) => sum + (m.marks || 0), 0);
      if (sumMarks !== assignmentConfig[0].marks) {
        showToast(`The sum of CO marks (${sumMarks}) must equal the total marks (${assignmentConfig[0].marks}).`, "error");
        return false;
      }

      assignmentConfig.forEach(q => {
        overallTotal += q.marks;
        (q.mappings || []).forEach(m => {
          if (m.co) {
            const mapMarks = parseInt(m?.marks, 10) || 0;
            if (mapMarks > 0) {
              co_weightage[m.co] = (co_weightage[m.co] || 0) + mapMarks;
            }
          }
        });
      });
      Object.keys(co_weightage).forEach(k => { if (co_weightage[k] <= 0) delete co_weightage[k]; });
    } else {
      assignmentConfig.forEach(q => {
        overallTotal += q.marks;
      });
    }

    const semesterNum = deriveSemesterNumber(selectedSemester);
    // Resolve by BOTH doc ID and name (regulation-aware) so the set suffix is consistently
    // applied whether `exam` is a name string or a Firebase push ID — otherwise Set 1 and
    // Set 2 map to the same key and overwrite/load each other's content.
    const selectedConfig = getExamConfig(exam);
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : (loadedExamName || exam));
    const setSuffix = (effectiveSetCount > 1) ? `_Set_${qpSet.replace(' ', '')}` : '';

    const sanitizeKey = (key) => {
      if (!key) return '';
      return String(key).replace(/[.#$[\]]/g, '_');
    };

    // Use stable composite key not including examDisplay
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subjectCode)}${sectionSuffix}`;
    // Use qpId that includes set suffix so multiple sets do not overwrite each other when forwarded
    const qpId = exam === 'custom' ? (isAssignmentOrProject ? (assessmentType === 'Project' ? 'Project' : assessmentType === 'Practical' ? 'Practical' : 'Assignment') : assessmentType === 'Indirect' ? 'Indirect' : 'Exam') : `${exam}${setSuffix}`;

    const selectedSub = subjects.find(s => s.value === subject);
    const subjectName = selectedSub ? selectedSub.text.split(' - ')[1] : '';

    const payload = {
      academic_year: academicYear,
      department: department,
      programme: program,
      batch: batch,
      section: section || '',
      parts: [],
      assignment_config: assignmentConfig,
      assignment_kl: '',
      assignment_kl_domain: '',
      assessment_type: assessmentType,
      qpaper_name: exam === 'custom' ? examDisplay : exam,
      exam_name: examDisplay,
      saved_at: new Date().toISOString(),
      semester: String(semesterNum || ''),
      subject: subject,
      subject_name: subjectName,
      total_marks: overallTotal,
      co_weightage: co_weightage,
      created_by: auth.currentUser?.uid || null,
      updated_by: auth.currentUser?.uid || null,
      updated_at: new Date().toISOString(),
      status: status,
      forwarded_to: forwardedToUid,
      forwarded_by: status === 'forwarded' ? auth.currentUser?.uid : null,
      forwarded_at: status === 'forwarded' ? new Date().toISOString() : null,
      faculty_signature_url: currentUserSignatureUrl || null,
      hod_comments: (status === 'recorrected') ? hodComments : null, // Clear HOD comments if status changes from recorrected
      courseOutcomes: courseOutcomes || [],
      course_outcomes: courseOutcomes || [],
    };

    try {
      if (editId && compositeKey) {
        await setDoc(doc(db, 'generated_qps', compositeKey), { [editId]: payload }, { merge: true });
      } else {
        await setDoc(doc(db, 'generated_qps', key), { [qpId]: payload }, { merge: true });
      }
      setSavedAssignmentConfig(assignmentConfig || []);
      showToast(`Assignment Saved!`, "success");
      return true;
    } catch (error) {
      console.error('Error saving assignment:', error);
      showToast('Failed to save assignment to database.', "error");
      return false;
    }
  };

  const handleSaveQuestionPaper = async (silentArg = false, status = 'draft', forwardedToUid = null) => {
    const silent = silentArg === true;
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam || !numParts) {
      if (!silent) showToast("Please fill in all required fields before saving.", "error");
      return false;
    }

    refreshOutcomesSummary(true);

    let content = '';
    if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor) {
      content = window.CKEDITOR.instances.questionEditor.getData();
    }

    if (!content || content.trim() === '') {
      if (!silent) showToast('No content found. Please generate and submit the question paper first.', "error");
      return false;
    }

    // Extract data from HTML
    const extractedData = {};
    const parser = new DOMParser();
    const contentDoc = parser.parseFromString(content, 'text/html');
    const tables = contentDoc.querySelectorAll('table');

    const invalidEntries = [];

    tables.forEach(table => {
      const headers = table.querySelectorAll('th');
      if (headers.length >= 5 && headers[0].textContent.includes('Q. No.')) {
        const rows = table.querySelectorAll('tbody tr');
        let currentQno = '';

        let questionIndex = -1;
        let klIndex = -1;
        let coIndex = -1;
        let piIndex = -1;

        headers.forEach((h, idx) => {
          const txt = (h.textContent || '').trim().toLowerCase();
          if (txt.includes('question')) questionIndex = idx;
          if (txt === 'kl') klIndex = idx;
          if (txt === 'co') coIndex = idx;
          if (txt === 'pi') piIndex = idx;
        });

        const getCellValue = (cell) => {
          const select = cell.querySelector('select');
          if (select) {
            // Prefer the select.value (works if the option is actually selected),
            // fall back to option[selected], option[selected="selected"], or first option.
            try {
              if (select.value && select.value.trim() !== '') return select.value;
            } catch {
              // ignore and continue to fallbacks
            }

            const selectedOption = select.querySelector('option[selected]') || select.querySelector('option[selected="selected"]');
            if (selectedOption && selectedOption.value) return selectedOption.value;
            const firstOption = select.querySelector('option');
            if (firstOption) return firstOption.value || firstOption.textContent.trim();
          }
          return cell.textContent.trim();
        };

        const getQuestionHtml = (cell) => {
          if (!cell) return '';
          // Preserve line breaks from CKEditor: <p> blocks and <br> inside the paper table cell
          let html = cell.innerHTML || '';
          // Keep math spans intact, convert block boundaries to <br>
          html = html.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '');
          // Normalize multiple <br> to single
          html = html.replace(/(<br\s*\/?>\s*)+/gi, '<br>');
          // Trim leading/trailing <br>
          html = html.replace(/^(<br\s*\/?>)+|(<br\s*\/?>)+$/gi, '').trim();
          return html;
        };

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length === 0) return;

          const texts = Array.from(cells).map(c => c.textContent.trim());

          // Match digits or digits+(a), digits+(b) etc. specifically from first cell (Q. No. column)
          let rowQ = '';
          const firstCellText = (texts[0] || '').trim();

          // Skip separator rows like '(Or)' or empty first cell rows
          const isOrSeparator = texts.some(t => t.toLowerCase() === '(or)');
          if (isOrSeparator) return;

          const cleanCellText = firstCellText.replace(/\s+/g, '');
          const m = cleanCellText.match(/^(\d+)(?:\(?([a-zA-Z])\)?)?$/i) || firstCellText.match(/^(\d+)\s*(?:\(?([a-zA-Z])\)?)?$/i);
          if (m && m[1]) {
            rowQ = m[2] ? `${m[1]}(${m[2].toLowerCase()})` : `${m[1]}`;
          }

          if (rowQ) {
            currentQno = rowQ;
          }

          // Heuristics to find question text, KL, CO, PI within the row
          let questionText = '';
          if (questionIndex >= 0 && cells.length > questionIndex) {
            questionText = getQuestionHtml(cells[questionIndex]);
          } else if (cells.length >= 2) {
            questionText = getQuestionHtml(cells[1]);
          }
          // fallback: pick the longest text cell that doesn't look like KL/CO/PI
          if (!questionText) {
            let candidate = '';
            for (let i = 0; i < texts.length; i++) {
              const t = texts[i];
              if (!/^L[1-6]$/i.test(t) && !/^CO\d+/i.test(t) && !/^PI/i.test(t) && t.length > candidate.length) {
                candidate = t;
              }
            }
            questionText = candidate;
          }

          // find KL/CO/PI by scanning cells and using getCellValue for selects
          let kl = '';
          let co = '';
          let pi = '';

          // Prefer header-index based extraction when available.
          if (klIndex >= 0 && cells.length > klIndex) kl = getCellValue(cells[klIndex]);
          if (coIndex >= 0 && cells.length > coIndex) co = getCellValue(cells[coIndex]);
          if (piIndex >= 0 && cells.length > piIndex) pi = getCellValue(cells[piIndex]);

          for (let i = 0; i < cells.length; i++) {
            const val = getCellValue(cells[i]);
            if (!kl && /^L[1-6]$/i.test(val)) kl = val;
            if (!co && /^CO\d+/i.test(val)) co = val;
            if (!pi && val && val.trim() !== '' && !/^select\s*pi$/i.test(val)) pi = val;
          }

          // If CO or PI missing, peek at next row only if it's a continuation row (not an (Or) row or next question row)
          if ((!co || !pi) && row.nextElementSibling) {
            const nextRowText = row.nextElementSibling.textContent.trim().toLowerCase();
            const nextFirstCell = row.nextElementSibling.querySelector('td')?.textContent.trim() || '';
            const isNextRowOr = nextRowText.includes('(or)');
            const hasNextRowQNo = /^\d+/.test(nextFirstCell);

            if (!isNextRowOr && !hasNextRowQNo) {
              const nextCells = row.nextElementSibling.querySelectorAll('td');
              if (nextCells && nextCells.length > 0) {
                if (!co && coIndex >= 0 && nextCells.length > coIndex) {
                  const nextCo = getCellValue(nextCells[coIndex]);
                  if (/^CO\d+/i.test(nextCo)) co = nextCo;
                }
                if (!pi && piIndex >= 0 && nextCells.length > piIndex) {
                  const nextPi = getCellValue(nextCells[piIndex]);
                  if (nextPi && nextPi.trim() !== '' && !/^select\s*pi$/i.test(nextPi)) pi = nextPi;
                }

                for (let i = 0; i < nextCells.length; i++) {
                  const val = getCellValue(nextCells[i]);
                  if (!co && /^CO\d+/i.test(val)) co = val;
                  if (!pi && val && val.trim() !== '' && !/^select\s*pi$/i.test(val)) pi = val;
                  if (co && pi) break;
                }
              }
            }
          }

          // Basic validation
          const qKey = rowQ || '';
          const displayQKey = qKey.replace(/^(\d+)([a-zA-Z])$/, '$1($2)');
          if (qKey) {
            if (!questionText || questionText.toLowerCase().includes('enter your question here') || questionText.trim() === '') {
              invalidEntries.push(`Question ${displayQKey} text is empty`);
            }
            if (!co || co.trim() === '' || co.toUpperCase() === 'CO') {
              invalidEntries.push(`CO for Question ${displayQKey} is empty`);
            }
            if (!pi || pi.trim() === '' || pi.toUpperCase() === 'PI' || /^select\s*pi$/i.test(pi)) {
              invalidEntries.push(`PI for Question ${displayQKey} is empty`);
            }
          }

          // Store extracted data
          if (qKey) {
            extractedData[qKey] = { question: questionText || '', kl: kl || '', co: co || '', pi: pi || '' };
          }
        });
      }
    });

    if (invalidEntries.length > 0) {
      if (!silent) showToast(`Validation Error: ${invalidEntries[0]}`, "error");
      return false;
    }

    let overallTotal = 0;
    if (isAssignmentOrProject) {
      assignmentConfig.forEach(q => {
        overallTotal += q.marks;
      });
    } else {
      partsConfig.forEach(part => {
        overallTotal += part.numQuestions * part.marksPerQuestion;
      });
    }

    const semesterNum = deriveSemesterNumber(selectedSemester);
    // Resolve by BOTH doc ID and name (regulation-aware) so the set suffix is consistently
    // applied whether `exam` is a name string or a Firebase push ID — otherwise Set 1 and
    // Set 2 map to the same key and overwrite/load each other's content.
    const selectedConfig = getExamConfig(exam);
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : (loadedExamName || exam));

    const partsForPayload = [];
    let payloadQuestionCounter = 1;

    if (assessmentType === 'Exam') {
      partsConfig.forEach((part, index) => {
        const partLetter = String.fromCharCode(64 + index + 1);
        const qs = [];

        for (let j = 0; j < part.numQuestions; j++) {
          if (part.isEitherOr) {
            const qnoA = `${payloadQuestionCounter}(a)`;
            const qnoAAlt = `${payloadQuestionCounter}a`;
            const qnoB = `${payloadQuestionCounter}(b)`;
            const qnoBAlt = `${payloadQuestionCounter}b`;

            const dataA = extractedData[qnoA] || extractedData[qnoAAlt] || {};
            const dataB = extractedData[qnoB] || extractedData[qnoBAlt] || {};

            qs.push({
              qno: qnoA, sub: "a", either_or: true, marks: part.marksPerQuestion,
              question: dataA.question || "",
              co: dataA.co || "",
              kl: dataA.kl || "",
              pi: (dataA.pi && dataA.pi.toUpperCase() !== 'PI') ? dataA.pi : ""
            });
            qs.push({
              qno: qnoB, sub: "b", either_or: true, marks: part.marksPerQuestion,
              question: dataB.question || "",
              co: dataB.co || "",
              kl: dataB.kl || "",
              pi: (dataB.pi && dataB.pi.toUpperCase() !== 'PI') ? dataB.pi : ""
            });
          } else {
            const qno = `${payloadQuestionCounter}`;
            const dataQ = extractedData[qno] || {};
            qs.push({
              qno: qno, either_or: false, marks: part.marksPerQuestion,
              question: dataQ.question || "",
              co: dataQ.co || "",
              kl: dataQ.kl || "",
              pi: (dataQ.pi && dataQ.pi.toUpperCase() !== 'PI') ? dataQ.pi : ""
            });
          }
          payloadQuestionCounter++;
        }

        partsForPayload.push({
          part: partLetter,
          num_questions: part.numQuestions || 0,
          marks_per_question: part.marksPerQuestion || 0,
          questions: qs
        });
      });
    }

    const setSuffix = (effectiveSetCount > 1) ? `_Set_${qpSet.replace(' ', '')}` : '';
    // Use stable composite key not including examDisplay
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subjectCode)}${sectionSuffix}`;
    // Use qpDocId that includes set suffix so multiple sets do not overwrite each other when forwarded. This is the document ID.
    const qpDocId = exam === 'custom' ? (isAssignmentOrProject ? (assessmentType === 'Project' ? 'Project' : assessmentType === 'Practical' ? 'Practical' : 'Assignment') : assessmentType === 'Indirect' ? 'Indirect' : 'Exam') : `${exam}${setSuffix}`;

    const selectedSub = subjects.find(s => s.value === subject); // Find subject from available subjects
    const subjectName = selectedSub ? selectedSub.text.split(' - ')[1] : '';

    // Extract CO weightage from summary table
    const co_weightage = {};
    const summarySection = contentDoc.querySelector('.outcomes-summary-section');
    if (summarySection) {
      const rows = summarySection.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          const coCode = cells[0].textContent.trim();
          const weightage = parseInt(cells[3].textContent.trim()) || 0;
          if (weightage > 0) {
            co_weightage[coCode] = weightage;
          }
        }
      });
    }

    const payload = {
      academic_year: academicYear,
      department: department,
      programme: program,
      batch: batch,
      section: section || '',
      qp_set: qpSet,
      parts: partsForPayload,
      assignment_config: (isAssignmentOrProject || assessmentType === 'Indirect') ? assignmentConfig : [],
      assessment_type: assessmentType,
      qpaper_name: exam === 'custom' ? examDisplay : exam,
      exam_name: examDisplay,
      saved_at: new Date().toISOString(),
      semester: String(semesterNum || ''),
      subject: subject,
      subject_name: subjectName,
      total_marks: overallTotal,
      co_weightage: co_weightage,
      courseOutcomes: courseOutcomes || [],
      course_outcomes: courseOutcomes || [],
      created_by: auth.currentUser?.uid || null,
      updated_by: auth.currentUser?.uid || null,
      updated_at: new Date().toISOString(),
      status: status,
      forwarded_to: forwardedToUid,
      forwarded_by: status === 'forwarded' ? auth.currentUser?.uid : null,
      forwarded_at: status === 'forwarded' ? new Date().toISOString() : null,
      faculty_signature_url: currentUserSignatureUrl || null,
      hod_comments: (status === 'recorrected') ? hodComments : null,
      assignment_kl: '',
      assignment_kl_domain: '',
      common_for: commonForDisplay,
      exam_date: scheduledExamInfo.rawDate || '',
      exam_date_display: scheduledExamInfo.date || '',
      duration: scheduledExamInfo.duration || '180 min',
      start_time: scheduledExamInfo.startTime || '',
      end_time: scheduledExamInfo.endTime || '',
    };

    try {
      if (editId && compositeKey) {
        await setDoc(doc(db, 'generated_qps', compositeKey), { [editId]: payload }, { merge: true });
      } else {
        await setDoc(doc(db, 'generated_qps', key), { [qpDocId]: payload }, { merge: true });
      }
      if (assessmentType === 'Exam') {
        setSavedExamParts(partsForPayload || []);
      } else {
        setSavedExamParts([]);
      }
      if (!silent) showToast(`Question Paper Saved!`, "success");
      return true;
    } catch (error) {
      console.error('Error saving question paper:', error);
      if (!silent) showToast('Failed to save question paper structure to database.', "error");
      return false;
    }
  };

  const handleSaveDraft = async () => {
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
      showToast("Please fill in the required header fields (Programme, Department, Batch, Semester, Subject, Exam) before saving draft.", "error");
      return false;
    }

    setIsSavingDraft(true);
    try {
      // 1. Capture in-progress question from qbEditor if user was in the middle of typing
      let currentQuestions = [...qpQuestions];
      try {
        let currentEditorText = '';
        const inst = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor;
        if (inst && typeof inst.getData === 'function') {
          currentEditorText = inst.getData().trim();
        } else {
          const el = document.getElementById('qbEditor');
          if (el) currentEditorText = el.value.trim();
        }

        if (currentEditorText && qbQNo) {
          // Preserve line breaks from CKEditor <p> blocks as <br>
          currentEditorText = currentEditorText.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '').replace(/(<br\s*\/?>\s*)+/gi, '<br>').replace(/^(<br\s*\/?>)+|(<br\s*\/?>)+$/gi, '').trim();
          const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\(([a-z])\)$/i, '$1');
          const existingIdx = currentQuestions.findIndex(q => norm(q.qno || '') === norm(qbQNo));
          const newQ = {
            qno: qbQNo,
            question: currentEditorText,
            kl: qbKL || 'L1',
            kldomain: qbKLDomain || '',
            co: qbCO || '',
            pi: qbPI || '',
            marks: qbMarks || 2,
            sub: qbQNo.toLowerCase().replace(/\s+/g,'').replace(/\(([a-z])\)$/i,'$1').endsWith('a') ? 'a' : qbQNo.toLowerCase().replace(/\s+/g,'').replace(/\(([a-z])\)$/i,'$1').endsWith('b') ? 'b' : '',
            either_or: (()=>{ const n = qbQNo.toLowerCase().replace(/\s+/g,'').replace(/\(([a-z])\)$/i,'$1'); return n.endsWith('a') || n.endsWith('b'); })()
          };
          if (existingIdx !== -1) {
            currentQuestions[existingIdx] = newQ;
          } else {
            currentQuestions.push(newQ);
          }
          setQpQuestions(currentQuestions);
        }
      } catch (e) {
        console.warn("Could not capture in-progress qbEditor question:", e);
      }

      // 2. Extract HTML table data if preview CKEditor is active
      const extractedData = {};
      if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor) {
        try {
          const content = window.CKEDITOR.instances.questionEditor.getData();
          if (content && content.trim()) {
            const parser = new DOMParser();
            const contentDoc = parser.parseFromString(content, 'text/html');
            const tables = contentDoc.querySelectorAll('table');
            tables.forEach(table => {
              const headers = table.querySelectorAll('th');
              if (headers.length >= 4 && headers[0].textContent.includes('Q. No.')) {
                const rows = table.querySelectorAll('tbody tr');
                let questionIndex = -1, klIndex = -1, coIndex = -1, piIndex = -1;
                headers.forEach((h, idx) => {
                  const txt = (h.textContent || '').trim().toLowerCase();
                  if (txt.includes('question')) questionIndex = idx;
                  if (txt === 'kl') klIndex = idx;
                  if (txt === 'co') coIndex = idx;
                  if (txt === 'pi') piIndex = idx;
                });
                const getCellValue = (cell) => {
                  const select = cell.querySelector('select');
                  if (select) {
                    try { if (select.value && select.value.trim() !== '') return select.value; } catch { }
                    const selectedOption = select.querySelector('option[selected]') || select.querySelector('option[selected="selected"]');
                    if (selectedOption && selectedOption.value) return selectedOption.value;
                    const firstOption = select.querySelector('option');
                    if (firstOption) return firstOption.value || firstOption.textContent.trim();
                  }
                  return cell.textContent.trim();
                };
                const getQuestionHtml = (cell) => {
                  if (!cell) return '';
                  let html = cell.innerHTML || '';
                  html = html.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '').replace(/(<br\s*\/?>\s*)+/gi, '<br>').replace(/^(<br\s*\/?>)+|(<br\s*\/?>)+$/gi, '').trim();
                  return html;
                };
                rows.forEach(row => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length === 0) return;
                  const texts = Array.from(cells).map(c => c.textContent.trim());
                  if (texts.some(t => t.toLowerCase() === '(or)')) return;
                  const firstCellText = (texts[0] || '').trim();
                  const cleanCellText = firstCellText.replace(/\s+/g, '');
                  const m = cleanCellText.match(/^(\d+)(?:\(?([a-zA-Z])\)?)?$/i) || firstCellText.match(/^(\d+)\s*(?:\(?([a-zA-Z])\)?)?$/i);
                  let rowQ = '';
                  if (m && m[1]) rowQ = m[2] ? `${m[1]}(${m[2].toLowerCase()})` : `${m[1]}`;
                  if (!rowQ) return;
                  let questionText = questionIndex >= 0 && cells.length > questionIndex ? getQuestionHtml(cells[questionIndex]) : (getQuestionHtml(cells[1]) || '');
                  let kl = klIndex >= 0 && cells.length > klIndex ? getCellValue(cells[klIndex]) : '';
                  let co = coIndex >= 0 && cells.length > coIndex ? getCellValue(cells[coIndex]) : '';
                  let pi = piIndex >= 0 && cells.length > piIndex ? getCellValue(cells[piIndex]) : '';
                  for (let i = 0; i < cells.length; i++) {
                    const val = getCellValue(cells[i]);
                    if (!kl && /^L[1-6]$/i.test(val)) kl = val;
                    if (!co && /^CO\d+/i.test(val)) co = val;
                    if (!pi && val && val.trim() !== '' && !/^select\s*pi$/i.test(val)) pi = val;
                  }
                  extractedData[rowQ] = { question: questionText || '', kl: kl || '', co: co || '', pi: pi || '' };
                });
              }
            });
          }
        } catch (e) {
          console.warn("Error reading from questionEditor for draft:", e);
        }
      }

      // 3. Build parts payload
      const partsForPayload = [];
      let overallTotal = 0;
      let payloadQuestionCounter = 1;

      if (assessmentType === 'Exam') {
        (partsConfig || []).forEach((part, index) => {
          const partLetter = String.fromCharCode(64 + index + 1);
          const qs = [];
          const count = parseInt(part?.numQuestions, 10) || 0;
          const marks = parseInt(part?.marksPerQuestion, 10) || 0;

          for (let j = 0; j < count; j++) {
            if (part?.isEitherOr) {
              const qnoA = `${payloadQuestionCounter}(a)`;
              const qnoAAlt = `${payloadQuestionCounter}a`;
              const qnoB = `${payloadQuestionCounter}(b)`;
              const qnoBAlt = `${payloadQuestionCounter}b`;

              const qa = getQuestionByQNo(currentQuestions, `${payloadQuestionCounter}a`) || getQuestionByQNo(currentQuestions, qnoA);
              const qb = getQuestionByQNo(currentQuestions, `${payloadQuestionCounter}b`) || getQuestionByQNo(currentQuestions, qnoB);

              const dataA = extractedData[qnoA] || extractedData[qnoAAlt] || {};
              const dataB = extractedData[qnoB] || extractedData[qnoBAlt] || {};

              qs.push({
                qno: qnoA,
                sub: "a",
                either_or: true,
                marks: qa?.marks || marks,
                question: dataA.question || qa?.question || "",
                co: dataA.co || qa?.co || "",
                kl: dataA.kl || qa?.kl || "",
                kldomain: qa?.kldomain || "",
                pi: (dataA.pi && dataA.pi.toUpperCase() !== 'PI') ? dataA.pi : (qa?.pi || "")
              });

              qs.push({
                qno: qnoB,
                sub: "b",
                either_or: true,
                marks: qb?.marks || marks,
                question: dataB.question || qb?.question || "",
                co: dataB.co || qb?.co || "",
                kl: dataB.kl || qb?.kl || "",
                kldomain: qb?.kldomain || "",
                pi: (dataB.pi && dataB.pi.toUpperCase() !== 'PI') ? dataB.pi : (qb?.pi || "")
              });
            } else {
              const qno = `${payloadQuestionCounter}`;
              const q = getQuestionByQNo(currentQuestions, `${payloadQuestionCounter}`) || getQuestionByQNo(currentQuestions, qno);
              const dataQ = extractedData[qno] || {};

              qs.push({
                qno: qno,
                either_or: false,
                marks: q?.marks || marks,
                question: dataQ.question || q?.question || "",
                co: dataQ.co || q?.co || "",
                kl: dataQ.kl || q?.kl || "",
                kldomain: q?.kldomain || "",
                pi: (dataQ.pi && dataQ.pi.toUpperCase() !== 'PI') ? dataQ.pi : (q?.pi || "")
              });
            }
            payloadQuestionCounter++;
          }

          overallTotal += count * marks;

          partsForPayload.push({
            part: partLetter,
            num_questions: count,
            marks_per_question: marks,
            isEitherOr: !!part?.isEitherOr,
            questions: qs
          });
        });
      } else if (isAssignmentOrProject || assessmentType === 'Indirect') {
        (assignmentConfig || []).forEach(q => {
          overallTotal += (parseInt(q?.marks, 10) || 0);
        });
      }

      const semesterNum = deriveSemesterNumber(selectedSemester);
      const selectedConfig = getExamConfig(exam);
      const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : (loadedExamName || exam));
      const setSuffix = (effectiveSetCount > 1) ? `_Set_${qpSet.replace(' ', '')}` : '';
      const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
      const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subjectCode)}${sectionSuffix}`;
      const qpDocId = exam === 'custom' ? (isAssignmentOrProject ? (assessmentType === 'Project' ? 'Project' : assessmentType === 'Practical' ? 'Practical' : 'Assignment') : assessmentType === 'Indirect' ? 'Indirect' : 'Exam') : `${exam}${setSuffix}`;

      const selectedSub = subjects.find(s => s.value === subject);
      const subjectName = selectedSub ? selectedSub.text.split(' - ')[1] : '';

      // Calculate co_weightage
      const co_weightage = {};
      if (assessmentType === 'Exam') {
        partsForPayload.forEach(p => {
          (p.questions || []).forEach(q => {
            if (q.co && q.marks) {
              co_weightage[q.co] = (co_weightage[q.co] || 0) + (parseInt(q.marks, 10) || 0);
            }
          });
        });
      } else {
        (assignmentConfig || []).forEach(q => {
          (q.mappings || []).forEach(m => {
            if (m.co && m.marks) {
              co_weightage[m.co] = (co_weightage[m.co] || 0) + (parseInt(m.marks, 10) || 0);
            }
          });
        });
      }

      const payload = {
        academic_year: academicYear,
        department: department,
        programme: program,
        batch: batch,
        section: section || '',
        qp_set: qpSet,
        parts: partsForPayload,
        assignment_config: (isAssignmentOrProject || assessmentType === 'Indirect') ? assignmentConfig : [],
        assessment_type: assessmentType,
        qpaper_name: exam === 'custom' ? examDisplay : exam,
        exam_name: examDisplay,
        saved_at: new Date().toISOString(),
        semester: String(semesterNum || ''),
        subject: subject,
        subject_name: subjectName,
        total_marks: overallTotal,
        co_weightage: co_weightage,
        created_by: auth.currentUser?.uid || null,
        updated_by: auth.currentUser?.uid || null,
        updated_at: new Date().toISOString(),
        status: 'draft',
        is_draft: true,
        forwarded_to: null,
        forwarded_by: null,
        forwarded_at: null,
        faculty_signature_url: currentUserSignatureUrl || null,
        hod_comments: hodComments || null,
        assignment_kl: '',
        assignment_kl_domain: '',
        common_for: commonForDisplay || 'NIL',
        exam_date: scheduledExamInfo?.rawDate || '',
        exam_date_display: scheduledExamInfo?.date || '',
        duration: scheduledExamInfo?.duration || '180 min',
        start_time: scheduledExamInfo?.startTime || '',
        end_time: scheduledExamInfo?.endTime || '',
        courseOutcomes: courseOutcomes || [],
        course_outcomes: courseOutcomes || [],
      };

      if (editId && compositeKey) {
        await setDoc(doc(db, 'generated_qps', compositeKey), { [editId]: payload }, { merge: true });
      } else {
        await setDoc(doc(db, 'generated_qps', key), { [qpDocId]: payload }, { merge: true });
      }

      if (assessmentType === 'Exam') {
        setSavedExamParts(partsForPayload || []);
      } else {
        setSavedAssignmentConfig(assignmentConfig || []);
      }

      setLoadedPaperStatus('draft');
      typesetMath();
      showToast("Draft saved successfully! You can resume editing anytime.", "success");
      return true;
    } catch (error) {
      console.error('Error saving draft:', error);
      showToast('Failed to save draft.', 'error');
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleForwardPaper = async () => {
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
      showToast("Please fill in all required fields before forwarding.", "error");
      return;
    }

    let sigUrl = currentUserSignatureUrl;
    if (!sigUrl && auth.currentUser?.uid) {
      try {
        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userSnap.exists()) {
          sigUrl = userSnap.data()?.signatureUrl || '';
          if (sigUrl) setCurrentUserSignatureUrl(sigUrl);
        }
      } catch (e) {
        console.error("Error fetching live user signature:", e);
      }
    }

    if (!sigUrl) {
      showToast("Please upload your digital signature in your profile before forwarding.", "error");
      return;
    }

    // 1. Construct qpData with actual current questions to ensure HTML is complete for extraction
    let finalizedParts = [];
    let overallTotal = 0;
    const semesterNum = deriveSemesterNumber(selectedSemester);

    if (assessmentType === 'Exam') {
      let counter = 1;
      finalizedParts = (partsConfig || []).map((part, index) => {
        const count = parseInt(part?.numQuestions, 10) || 0;
        const marks = parseInt(part?.marksPerQuestion, 10) || 0;
        const questions = [];
        for (let i = 0; i < count; i++) {
          if (part?.isEitherOr) {
            const qa = getQuestionByQNo(qpQuestions, `${counter}a`);
            const qb = getQuestionByQNo(qpQuestions, `${counter}b`);
            questions.push({
              qno: `${counter}(a)`, sub: 'a', either_or: true, marks,
              question: qa?.question || '', co: qa?.co || '', kl: qa?.kl || '', pi: qa?.pi || ''
            });
            questions.push({
              qno: `${counter}(b)`, sub: 'b', either_or: true, marks,
              question: qb?.question || '', co: qb?.co || '', kl: qb?.kl || '', pi: qb?.pi || ''
            });
          } else {
            const q = getQuestionByQNo(qpQuestions, `${counter}`);
            questions.push({
              qno: `${counter}`, sub: '', either_or: false, marks,
              question: q?.question || '', co: q?.co || '', kl: q?.kl || '', pi: q?.pi || ''
            });
          }
          counter += 1;
        }
        overallTotal += count * marks;
        const partLetter = String.fromCharCode(64 + index + 1);
        return { part: partLetter, num_questions: count, marks_per_question: marks, questions };
      });
    } else if (assessmentType === 'Indirect') {
      overallTotal = assignmentConfig.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 0), 0);
    } else {
      overallTotal = (assignmentConfig[0]?.marks || 0);
    }

    const qpDataForForward = {
      programme: program,
      department,
      batch,
      academic_year: academicYear,
      semester: String(semesterNum || ''),
      subject,
      subject_name: subjects.find(s => s.value === subject)?.text.split(' - ')[1] || '',
      qpaper_name: exam, // Keep ID as the pointer
      exam_name: exam === 'custom' ? customExam : (ciaConfigs.find(c => c.id === exam)?.examName || (loadedExamName || exam)),
      total_marks: overallTotal,
      exam_date: ciaConfigs.find(c => c.id === exam)?.examDate || new Date().toISOString(),
      assessment_type: assessmentType,
      parts: finalizedParts,
      assignment_config: (isAssignmentOrProject || assessmentType === 'Indirect') ? assignmentConfig : [],
      assignment_kl: '',
      assignment_kl_domain: ''
    };

    const contentWithSignature = getQuestionPaperHTML(qpDataForForward, courseOutcomes, null, null, sigUrl);

    // 2. Find Academic Coordinator for the paper (department-based for non-common, setter-based for common)
    let acUid = null;
    let targetDept = department;
    try {
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      if (!usersSnapshot.empty) {
        const allUsers = {};
        usersSnapshot.forEach(d => { allUsers[d.id] = { uid: d.id, ...d.data() }; });
        const norm = (v) => String(v || '').toLowerCase().replace(/[._\s\-]+/g, ' ').trim();

        // Common subjects (shared across departments in IAScheduleCreation) route to the
        // Academic Coordinator of the department whose faculty was set as the QP setter.
        try {
          const semNumStr = String(semesterNum || '');
          const assignKey = `${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semNumStr}`;
          const assignSnap = await getDoc(doc(db, 'qp_setter_assignments', assignKey));
          const assign = assignSnap.exists() ? (assignSnap.data()?.assignments || {})[subjectCode] : null;
          if (assign && Array.isArray(assign.departments) && assign.departments.length > 1 && assign.setterUid) {
            const setterUser = allUsers[assign.setterUid];
            if (setterUser?.department) {
              targetDept = setterUser.department;
            }
          }
        } catch (e) {
          console.error("Error reading qp_setter_assignments for AC routing:", e);
        }

        const targetNorm = norm(targetDept);
        const acs = Object.values(allUsers).filter(
          user => norm(user.role) === 'academic coordinator' && user.isApproved !== false
        );

        const isDeptMatch = (userDept, target) => {
          const uNorm = norm(userDept);
          const tNorm = norm(target);
          if (!uNorm || !tNorm) return false;
          if (uNorm === tNorm) return true;
          if (uNorm.includes(tNorm) || tNorm.includes(uNorm)) return true;
          const uClean = uNorm.replace(/[^a-z0-9]/g, '');
          const tClean = tNorm.replace(/[^a-z0-9]/g, '');
          if (uClean === tClean || uClean.includes(tClean) || tClean.includes(uClean)) return true;
          const getAcronym = (s) => s.split(/\s+/).filter(w => !['and', '&', 'of', 'in', 'the', 'b.e.', 'b.tech', 'm.e.', 'm.tech', 'department'].includes(w)).map(w => w[0]).join('');
          const uAcro = getAcronym(uNorm);
          const tAcro = getAcronym(tNorm);
          if (uAcro && tAcro && (uAcro === tAcro || uAcro === tClean || tAcro === uClean)) return true;
          return false;
        };

        const matchedAc = acs.find(u => isDeptMatch(u.department, targetDept)) ||
          (acs.length === 1 ? acs[0] : null);

        if (matchedAc) {
          acUid = matchedAc.uid || matchedAc.id;
        }
      }
    } catch (error) {
      console.error("Error finding Academic Coordinator:", error);
      showToast("Failed to find Academic Coordinator for the department.", "error");
      return;
    }

    if (!acUid) {
      showToast(`No Academic Coordinator found for ${targetDept}. Cannot forward.`, "error");
      return;
    }

    // 3. Update the editor with the content including signature before saving
    if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor) {
      window.CKEDITOR.instances.questionEditor.setData(contentWithSignature, async () => {
        // 4. Save the paper with 'forwarded' status
        const isSaved = isAssignmentOrProject ? await handleSaveAssignment('forwarded', acUid) : await handleSaveQuestionPaper(true, 'forwarded', acUid);
        if (isSaved) {
          try {
            await addDoc(collection(db, 'notifications'), {
              type: 'qp_forwarded',
              targetUid: acUid,
              targetName: "Academic Coordinator",
              subjectCode: subjectCode || '',
              subjectName: subjects.find(s => s.value === subject)?.text.split(' - ')[1] || '',
              examName: exam === 'custom' ? customExam : (ciaConfigs.find(c => c.id === exam)?.examName || exam),
              forwardedBy: auth.currentUser?.uid,
              forwardedByName: auth.currentUser?.displayName || "Faculty",
              createdAt: serverTimestamp(),
              read: false
            });
          } catch (notifErr) {
            console.error("Error sending forward notification:", notifErr);
          }
          showToast("Question paper forwarded to Academic Coordinator successfully!", "success");
        } else {
          showToast("Failed to forward question paper.", "error");
        }
      });
    } else {
      const isSaved = isAssignmentOrProject ? await handleSaveAssignment('forwarded', acUid) : await handleSaveQuestionPaper(true, 'forwarded', acUid);
      if (isSaved) {
        showToast("Question paper forwarded to Academic Coordinator successfully!", "success");
      } else {
        showToast("Failed to forward question paper.", "error");
      }
    }
  };

  const downloadQuestionPaperDocx = async () => { // Kept for now, but will be removed from UI
    try {
      // Ensure the editor content is up-to-date with any active changes
      refreshOutcomesSummary(true);

      let content = '';
      if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor) {
        content = window.CKEDITOR.instances.questionEditor.getData();
      }

      if (!content || content.trim() === '') {
        showToast('No content found. Please generate and submit the question paper first.', "error");
        return;
      }

      const isSaved = isAssignmentOrProject ? await handleSaveAssignment('draft') : await handleSaveQuestionPaper(true);
      if (!isSaved) return;

      function getImageDimensions(imgTag) {
        const widthMatch = imgTag.match(/width=["']?(\d+)["']?/);
        const heightMatch = imgTag.match(/height=["']?(\d+)["']?/);
        const styleWidthMatch = imgTag.match(/style=["'][^"']*width:\s*(\d+)px/);
        const styleHeightMatch = imgTag.match(/style=["'][^"']*height:\s*(\d+)px/);

        return {
          width: widthMatch ? widthMatch[1] : (styleWidthMatch ? styleWidthMatch[1] : null),
          height: heightMatch ? heightMatch[1] : (styleHeightMatch ? styleHeightMatch[1] : null)
        };
      }

      content = content.replace(/<img[^>]+>/gi, function (imgTag) {
        const dims = getImageDimensions(imgTag);
        const isLogo = imgTag.includes('logo-img');

        let newTag = imgTag
          .replace(/style=["'][^"']*["']/gi, '')
          .replace(/width=["']?\d+["']?/gi, '')
          .replace(/height=["']?\d+["']?/gi, '');

        if (isLogo) {
          // Force a reasonable size for the logo in Word
          newTag = newTag.replace(/<img/i,
            `<img width="600" style="width:600px; height:auto;"`);
        } else if (dims.width && dims.height) {
          newTag = newTag.replace(/<img/i,
            `<img width="${dims.width}" height="${dims.height}" style="width:${dims.width}px; height:${dims.height}px;"`);
        }

        return newTag;
      });

      const wordHTML = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset='utf-8'>
    <title>Question Paper</title>
    <style>
        @page { size: A4; margin: 0.75in; }
        body { font-family: Arial, sans-serif; font-size: 11px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
        th, td { border: 1px solid #333; padding: 4px; text-align: center; }
        th { background-color: #f2f2f2; }
        sup { vertical-align: super; font-size: smaller; }
        .footer {
            margin-top: 20px;
            padding-top: 10px;
            font-size: 10px;
            border-top: 1px solid #999;
        }
    </style>
</head>
<body>
    ${content}
    <div class="footer">
        <strong>Knowledge Level (KL):</strong> L1 - Remember, L2 - Understand, L3 - Apply, L4 - Analyze, L5 - Evaluate, L6 - Create<br>
        <strong>Form No.:</strong> AC26 &nbsp;&nbsp;&nbsp;&nbsp; <strong>Rev. No.:</strong> 00 &nbsp;&nbsp;&nbsp;&nbsp; <strong>Effective:</strong>
    </div>
</body>
</html>`;

      const blob = new Blob(['\ufeff', wordHTML], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "QuestionPaper.doc";
      document.body.appendChild(link);
      link.click();

      showToast("Question paper downloaded successfully!", "success");

      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 1000);
    } catch (err) {
      console.error('Word export failed:', err);
      showToast('Export failed: ' + (err?.message || err), "error");
    }
  };

  // Helper to validate and correct PI for a single question object
  const validateAndCorrectPI = (q) => {
    const chosenCO = q.co;
    const chosenPI = q.pi;
    const validPIsForCO = coPiMapping[chosenCO] || [];

    if (chosenCO && validPIsForCO.length > 0) {
      if (!validPIsForCO.includes(chosenPI)) {
        // If AI picked an invalid PI, replace with the first valid one
        q.pi = validPIsForCO[0];
        console.warn(`AI generated invalid PI '${chosenPI}' for CO '${chosenCO}'. Replaced with '${validPIsForCO[0]}'.`);
      }
    } else if (chosenCO && validPIsForCO.length === 0) {
      // If CO is chosen but has no mapped PIs, clear PI
      q.pi = '';
      console.warn(`CO '${chosenCO}' has no mapped PIs. PI field cleared.`);
    } else {
      // If CO is invalid or missing, clear PI
      q.pi = '';
    }
    return q;
  };

  const handleGenerateAI = async () => {
    // Marks sanity-check BEFORE calling AI
    if (assessmentType === 'Exam' && exam && exam !== 'custom') {
      const selectedConfig = ciaConfigs.find(c => c.id === exam);
      if (selectedConfig) {
        const currentTotal = getCurrentStructureTotalMarks();
        if (alertIfMarksMismatchWithConfig(selectedConfig, currentTotal)) {
          return;
        }
      }
    }

    if (!aiSyllabus.trim()) {
      if (!subjectCourseDetails || !Array.isArray(subjectCourseDetails.co) || subjectCourseDetails.co.length === 0) {
        showToast("No syllabus content found for the selected subject. Please ensure COs are defined in the Course Bank.", "error");
        return;
      }
    }

    let syllabusContentForAI = "No specific syllabus content provided in the course node.";
    if (subjectCourseDetails && Array.isArray(subjectCourseDetails.co)) {
      syllabusContentForAI = subjectCourseDetails.co.map(co => {
        let coText = `CO ${co.id}: ${co.description}`;
        if (co.content) coText += `\n  Content: ${co.content}`;
        if (co.domain) coText += `\n  Domain: ${co.domain}`;
        if (co.level) coText += `\n  Level: ${co.level}`;
        return coText;
      }).join('\n\n');
    }

    setIsGeneratingAI(true);
    try {
      const mappingContext = {};
      courseOutcomes.forEach(co => {
        mappingContext[co.code] = {
          description: co.description,
          pis: coPiMapping[co.code] || []
        };
      });

      const { GoogleGenAI, Type } = await import('@google/genai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please add VITE_GEMINI_API_KEY to your .env file and restart the server.");
      }
      const ai = new GoogleGenAI({ apiKey });

      // ✅ FIXED: Properly formatted prompt as a single string
      const prompt = `You are an expert Question Paper Setter for an engineering college.
Based on the following syllabus/topics, generate a high-quality assessment paper.

DETAILED COURSE OUTCOMES & SYLLABUS CONTENT:
${syllabusContentForAI}

UNIT & PART CONSTRAINTS:
${aiUnitConstraints || 'No specific unit constraints provided. Extract evenly from the syllabus.'}

STRUCTURE TO FOLLOW:
${JSON.stringify(isAssignmentOrProject ? assignmentConfig : partsConfig, null, 2)}

COURSE OUTCOMES & PERFORMANCE INDICATORS (MAPPING CONTEXT):
${JSON.stringify(mappingContext, null, 2)}

INSTRUCTIONS:
1. For each part, generate exactly the requested number of questions.
2. If "isEitherOr" is true, generate an 'a' and 'b' option for each question number.
3. Strictly adhere to the requested marks per question.
4. Each question must be assigned a valid KL (Knowledge Level, e.g., L1, L2, L3, L4, L5, L6), a single valid CO (from the MAPPING CONTEXT), and a single valid PI that is explicitly listed as mapped to that CO within the MAPPING CONTEXT. You MUST select a PI from the 'pis' array associated with the chosen 'coCode' in the MAPPING CONTEXT. Do NOT invent PIs or use PIs not present in the provided mapping for the chosen CO.
5. When generating questions, consider the Bloom's Taxonomy Level (KL) specified for each CO in the DETAILED COURSE OUTCOMES & SYLLABUS CONTENT section. Generate questions that primarily align with or are slightly below the CO's specified level to ensure comprehensive assessment. For example, if a CO is L3 (Apply), questions should be L3 or L2.
${aiIncludeImages ? `6. VISUAL DIAGRAMS REQUIRED: The user has strictly requested to generate diagrams (graphs, circuits, architecture, meshes, mechanical parts) for SOME of the questions if the syllabus topic implies it. For these questions, you MUST generate a valid HTML5 inline <svg> element to represent the diagram. Append or prepend the raw <svg>...</svg> code directly inside the "question" string, together with the question text. Use responsive widths (e.g. width="300" height="200") and clear styling inside the SVG. Remember to escape quotes properly for JSON output! Do NOT skip this step; we need at least a few diagrams when applicable.` : `6. Do NOT include any images, SVG, or HTML diagrams. Output plain text questions only.`}
`;

      // ✅ FIXED: Changed model to working Gemini model
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',  // Changed from 'gemini-pro'
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              parts: {
                type: Type.ARRAY,
                description: "Array of parts for the exam paper",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    partLetter: { type: Type.STRING },
                    questions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          qnoText: { type: Type.STRING, description: "E.g., '1' or '11(a)'" },
                          eitherOrSub: { type: Type.STRING, description: "Empty string, or 'a' or 'b'" },
                          question: { type: Type.STRING },
                          kl: { type: Type.STRING },
                          co: { type: Type.STRING },
                          pi: { type: Type.STRING },
                          marks: { type: Type.NUMBER }
                        },
                        required: ["qnoText", "question", "kl", "co", "pi", "marks"]
                      }
                    }
                  },
                  required: ["partLetter", "questions"]
                }
              }
            },
            required: ["parts"]
          }
        }
      });

      const responseData = response.text;
      if (!responseData) throw new Error("Empty response from AI");
      const data = JSON.parse(responseData);

      let overallTotal = 0;
      let finalizedParts = [];

      const selectedConfig = ciaConfigs.find(c => c.id === exam);
      const semesterNum = deriveSemesterNumber(selectedSemester);
      const subjectObj = subjects.find(s => s.value === subject);
      const subjectDisplay = subjectObj ? subjectObj.text : subject;
      const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam);

      const qpData = {
        programme: program,
        department: department,
        batch: batch,
        academic_year: academicYear,
        semester: String(semesterNum || ''),
        subject: subject,
        subject_name: subjectDisplay.split(' - ')[1] || '',
        qpaper_name: exam === 'custom' ? examDisplay : exam,
        total_marks: overallTotal,
        exam_date: selectedConfig ? selectedConfig.examDate : new Date().toISOString(),
        assessment_type: assessmentType,
        parts: [],
        assignment_config: []
      };

      if (assessmentType === 'Exam') {
        let questionCounter = 1;
        const newQpQuestions = [];
        data.parts.forEach((p, index) => {
          const originalPart = partsConfig[index];
          if (!originalPart) return;

          let aiQuestionIdx = 0;
          for (let i = 0; i < originalPart.numQuestions; i++) {
            if (originalPart.isEitherOr) {
              const qa = p.questions[aiQuestionIdx] || { question: "AI missed this question", kl: "L4", co: "CO1", pi: "", marks: originalPart.marksPerQuestion };
              const qb = p.questions[aiQuestionIdx + 1] || { question: "AI missed this question", kl: "L4", co: "CO1", pi: "", marks: originalPart.marksPerQuestion };
              newQpQuestions.push({
                qno: `${questionCounter}(a)`,
                sub: 'a',
                either_or: true,
                marks: originalPart.marksPerQuestion,
                question: qa.question,
                co: qa.co || "CO1",
                kl: qa.kl || "L1",
                pi: qa.pi || (coPiMapping[qa.co]?.[0] || "")
              });
              newQpQuestions.push({
                qno: `${questionCounter}(b)`,
                sub: 'b',
                either_or: true,
                marks: originalPart.marksPerQuestion,
                question: qb.question,
                co: qb.co || "CO1",
                kl: qb.kl || "L1",
                pi: qb.pi || (coPiMapping[qb.co]?.[0] || "")
              });
              aiQuestionIdx += 2;
            } else {
              const q = p.questions[aiQuestionIdx] || { question: "AI missed this question", kl: "L1", co: "CO1", pi: "", marks: originalPart.marksPerQuestion };
              newQpQuestions.push({
                qno: `${questionCounter}`,
                sub: '',
                either_or: false,
                marks: originalPart.marksPerQuestion,
                question: q.question,
                co: q.co || "CO1",
                kl: q.kl || "L1",
                pi: q.pi || (coPiMapping[q.co]?.[0] || "")
              });
              aiQuestionIdx += 1;
            }
            questionCounter++;
          }
        });
        setQpQuestions(newQpQuestions);
        showToast("Questions generated by AI! Review and click 'Finalize Question Paper' to see the full preview.", "success");
      }

      setShowAIModal(false);
    } catch (err) {
      console.error(err);
      if (err && err.status === 429) {
        showToast("API Quota Exceeded. Please check API usage.", "error");
      } else {
        showToast(err.message || "Failed to generate questions", "error");
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <Layout title="Question Paper Generator">
      <style>{`
        .question-paper-page input[type='number']::-webkit-outer-spin-button,
        .question-paper-page input[type='number']::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .question-paper-page input[type='number'] {
          -moz-appearance: textfield;
          appearance: textfield;
        }

        /* ✅ CKEditor UI Bug Fixes */
        .cke_wrapper {
          position: relative !important;
          z-index: 10 !important;
        }

        .cke_top {
          position: relative !important;
          z-index: 11 !important;
          overflow: visible !important;
        }

        .cke_toolbox {
          overflow: visible !important;
          z-index: 11 !important;
        }

        .cke_toolbar {
          overflow: visible !important;
          z-index: 11 !important;
          position: relative !important;
        }

        /* ✅ Fix dropdown/panel positioning to appear below toolbar, not overlapping */
        .cke_panel {
          position: absolute !important;
          z-index: 1200 !important;
          overflow: visible !important;
          top: auto !important;
          left: auto !important;
        }

        .cke_combo_panel {
          position: absolute !important;
          z-index: 1200 !important;
          overflow: visible !important;
          background: white !important;
          border: 1px solid #d1d5db !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        }

        .cke_combo_panel .cke_panel_list {
          overflow-y: auto !important;
          max-height: 300px !important;
        }

        /* ✅ Ensure editor content is not obscured */
        .cke_contents {
          position: relative !important;
          z-index: 1 !important;
          clear: both !important;
          overflow-y: auto !important;
        }

        /* ✅ Fix toolbar button states and prevent sticky dropdowns */
        .cke_button__format_label,
        .cke_button__fontsize_label,
        .cke_button__style_label {
          cursor: pointer !important;
        }

        .cke_combo_button {
          z-index: 11 !important;
          position: relative !important;
        }

        /* ✅ Prevent menu from sticking to top of editor */
        .cke_panel {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          transition: opacity 0.2s !important;
        }

        .cke_panel.cke_panel_on {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* ✅ Ensure proper containment */
        .cke_voice_label {
          clip: rect(0, 0, 0, 0) !important;
        }

        /* ✅ Fix container overflow issues */
        .cke {
          position: relative !important;
          overflow: visible !important;
        }
      `}</style>
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[1000] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      {hodComments && (
        <div className="mb-6 p-4 rounded-xl flex items-center gap-3 font-medium border bg-amber-50 text-amber-700 border-amber-200">
          <AlertCircle size={20} />
          <span className="font-bold">HOD Comments:</span>
          <span>{hodComments}</span>
        </div>
      )}

      <div className="question-paper-page container mx-auto p-6 max-w-7xl">
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">Assessment & Subject Configuration</h2>
              {loadedPaperStatus === 'draft' && (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300 flex items-center gap-1.5 shadow-sm">
                  <Bookmark size={13} className="text-amber-600" />
                  Draft Saved
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Program</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  value={program}
                  onChange={e => { setProgram(e.target.value); setDepartment(''); setSection(''); setQbAvailableQNos([]); }}
                >
                  <option value="">Select Program</option>
                  {filteredProgrammes.map(progKey => (
                    <option key={progKey} value={progKey}>{formatProgDisplay(progKey)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  value={department}
                  onChange={e => { setDepartment(e.target.value); setSection(''); }}
                  disabled={!filteredDepartments.length}
                >
                  <option value="">Select Department</option>
                  {filteredDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  value={batch}
                  onChange={e => { setBatch(e.target.value); setSection(''); }}
                  disabled={!displayedBatches.length}
                >
                  <option value="">Select Batch</option>
                  {displayedBatches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  value={academicYear}
                  onChange={e => setAcademicYear(e.target.value)}
                  disabled={!academicYears.length}
                >
                  <option value="">Select Year</option>
                  {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Semester</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  value={selectedSemester}
                  onChange={e => setSelectedSemester(e.target.value)}
                  disabled={!semesters.length}
                >
                  <option value="">Select Semester</option>
                  {semesters.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Section</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  value={section}
                  onChange={e => setSection(e.target.value)}
                  disabled={!department || !batch || availableSections.length === 0}
                >
                  <option value="">{availableSections.length === 0 && department && batch ? "No sections configured" : "Select Section"}</option>
                  {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                <span>Subject</span>
                {subjectCourseType && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 uppercase tracking-tighter">
                    {subjectCourseType}
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  value={subject}
                  onChange={e => { setSubject(e.target.value); setSelectedCategory(''); setExam(''); }}
                >
                  <option value="">Select Subject</option>
                  {subjects.map((s, i) => (
                    <option key={i} value={s.value}>
                      {s.text}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                <span>Category</span>
                {selectedCategory && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-100 uppercase tracking-tighter">
                    {selectedCategory}
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-700"
                  value={selectedCategory}
                  onChange={e => handleCategorySelect(e.target.value)}
                  disabled={!subject}
                >
                  <option value="">-- All Categories --</option>
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                <span>Exam</span>
                {filteredExams.length > 0 && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                    {filteredExams.length} Available
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  value={exam}
                  onChange={e => setExam(e.target.value)}
                >
                  <option value="">Select Exam</option>
                  {filteredExams.map((e, i) => (
                    <option key={i} value={e.id}>
                      {e.examName}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
              {exam === 'custom' && (
                <input
                  type="text"
                  className="w-full mt-2 bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  placeholder="Enter custom name"
                  value={customExam}
                  onChange={e => setCustomExam(e.target.value)}
                />
              )}
            </div>

            {exam && exam !== 'custom' && effectiveSetCount > 1 && (
              <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest ml-1">Choose Question Paper Set</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-black text-blue-700"
                    value={qpSet}
                    onChange={e => setQpSet(e.target.value)}
                  >
                    {Array.from({ length: effectiveSetCount }, (_, i) => `Set ${i + 1}`).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">{assessmentType === 'Indirect' ? 'Number of COs' : isAssignmentOrProject ? 'Questions' : 'Parts'}</label>
              <div className="relative">
                {assessmentType === 'Indirect' || isAssignmentOrProject ? (
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    value={assessmentType === 'Indirect' ? assignmentQuestionCount : assignmentQuestionCount}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      if (assessmentType === 'Indirect') {
                        setAssignmentQuestionCount(val);
                      } else {
                        setAssignmentQuestionCount(val);
                      }
                    }}
                    placeholder={assessmentType === 'Indirect' ? "Enter number of COs (default 5)" : "Enter number of questions"}
                  />
                ) : (
                  <>
                    <select
                      className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      value={numParts}
                      onChange={e => setNumParts(e.target.value)}
                    >
                      <option value="">Select</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => {
                if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
                  showToast("Please fill in all required fields.", "error");
                  return;
                }
                // ✅ CRITICAL: Clean up old CKEditor instances before generating new layout
                if (window.CKEDITOR && window.CKEDITOR.instances) {
                  try {
                    if (window.CKEDITOR.instances.questionEditor) {
                      window.CKEDITOR.instances.questionEditor.destroy(true);
                      delete window.CKEDITOR.instances.questionEditor;
                    }
                  } catch (e) {
                    console.warn("Error cleaning up CKEditor before generating layout:", e);
                  }
                }
                setShowFinalPreview(false);
                handleGenerateParts();
              }}
              className="group relative inline-flex items-center justify-center px-8 py-3 font-bold text-white transition-all duration-200 bg-[#120c7a] font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#120c7a] hover:bg-[#1a1494] shadow-lg shadow-blue-900/20"
            >
              Generate Layout
            </button>
          </div>
        </div>

        {showParts && assessmentType === 'Exam' && (
          <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-slate-100">
            <h3 className="text-xl font-bold text-[#120c7a] mb-6 flex items-center gap-2">
              <div className="w-2 h-8 bg-[#120c7a] rounded-full"></div>
              Parts Configuration
            </h3>
            <div className="space-y-4">
              {partsConfig.map((part, index) => (
                <div key={index} className="p-6 rounded-2xl bg-slate-50/50 border border-slate-100 flex flex-wrap gap-6 items-center">
                  <h4 className="font-bold text-slate-700 text-lg w-full md:w-auto min-w-[100px]">Part {String.fromCharCode(64 + index + 1)}</h4>
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Questions</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="w-24 bg-white border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      value={part.numQuestions === '' ? '' : part.numQuestions}
                      onChange={e => handlePartChange(index, 'numQuestions', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Marks Each</label>
                    <input
                      type="number"
                      min="1"
                      className="w-24 bg-white border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      value={part.marksPerQuestion === '' ? '' : part.marksPerQuestion}
                      onChange={e => handlePartChange(index, 'marksPerQuestion', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div className="space-y-2.5">
                    <div className="h-4 hidden md:block"></div> {/* Spacer to align with input labels */}
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 mt-0">
                      <input
                        type="checkbox"
                        id={`eitherOr-${index}`}
                        className="w-5 h-5 cursor-pointer text-[#120c7a] rounded border-slate-300 focus:ring-[#120c7a]"
                        checked={part.isEitherOr}
                        onChange={e => handlePartChange(index, 'isEitherOr', e.target.checked)}
                      />
                      <label htmlFor={`eitherOr-${index}`} className="text-sm font-semibold text-slate-600 cursor-pointer select-none">Either/Or Choice</label>
                    </div>
                  </div>
                </div>

              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <button
                onClick={handleGenerateTable}
                className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-900/20 flex items-center gap-2"
              >
                <CheckCircle2 size={20} />
                Generate Table
              </button>
              {assessmentType !== 'Indirect' && (
                <button
                  onClick={handleOpenAIModal}
                  className="px-8 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-900/20 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Generate with AI
                </button>
              )}
            </div>
          </div>
        )}

        {showParts && (isAssignmentOrProject || assessmentType === 'Indirect') && assignmentConfig.length > 0 && (
          <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#120c7a] flex items-center gap-2">
                <div className="w-2 h-8 bg-[#120c7a] rounded-full"></div>
                {assessmentType === 'Indirect' ? 'CO Descriptions' : `Assignment Questions (${assignmentConfig.length})`}
              </h3>
              <div className="flex gap-4 items-start">
                {assessmentType !== 'Indirect' && <span className="text-xs text-slate-400 font-medium mt-2">Each question has its own Domain &amp; KL below</span>}
                {assessmentType === 'Indirect' && <span className="text-xs text-slate-400 font-medium mt-2">Describe each CO for student rating (3-star scale)</span>}
              </div>
            </div>

            <div className="space-y-6">
              {sortedPoCodes && sortedPoCodes.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-700 text-sm">Overall Mapped PO / PSO</h3>
                  </div>
                  <div className="p-2 overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          {displayedPoSummary.map((r) => (
                            <th key={r.poCode} className="px-3 py-2 text-center font-bold text-slate-700 uppercase tracking-wide text-[11px]">
                              {r.displayCode}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {displayedPoSummary.map((r) => (
                            <td key={r.poCode} className="px-3 py-2 text-center">
                              {r.marks === 0 ? (
                                <span className="inline-flex items-center px-2 py-1 bg-red-50 text-red-700 rounded-lg font-bold text-[11px]">{r.marks}</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-[11px]">{r.marks}</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {presentPoSummary && presentPoSummary.length > 0 && (
                    <div className="p-2 border-t border-slate-100">
                      <div className="text-sm font-semibold text-slate-600 mb-2">POs present in current question paper (Active Changes)</div>
                      <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr>
                              {presentPoSummary.map(p => (
                                <th key={p.poCode} className="px-3 py-2 text-center font-bold text-slate-700 uppercase tracking-wide text-[11px]">{p.displayCode}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {presentPoSummary.map(p => (
                                <td key={p.poCode} className="px-3 py-2 text-center">
                                  <span className="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-[11px]">{p.marks}</span>
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {assignmentConfig.map((q, qIdx) => {
                if (assessmentType === 'Indirect') {
                  return (
                    <div key={qIdx} className="p-6 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-4">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-700 text-lg">CO{qIdx + 1}</h4>
                        <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-xl border border-slate-200">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rating Scale:</span>
                          <span className="text-sm font-bold text-[#120c7a]">1 - 3 Stars</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">CO Description / Question for Students</label>
                        <textarea
                          value={q.question}
                          onChange={e => {
                            const updated = [...assignmentConfig];
                            updated[qIdx] = { ...updated[qIdx], question: e.target.value };
                            setAssignmentConfig(updated);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium min-h-[100px]"
                          placeholder={`Describe what CO${qIdx + 1} measures and what students should rate themselves on...`}
                        />
                      </div>
                    </div>
                  );
                }
                const qMeta = getAssignmentMarksMeta(qIdx);
                return (
                  <div key={qIdx} className="p-6 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <h4 className="font-bold text-slate-700 text-lg">Question {qIdx + 1}</h4>
                        <div className="h-8 w-px bg-slate-200"></div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Domain</label>
                          <div className="relative">
                            <select
                              value={assignmentConfig[qIdx].kldomain || ''}
                              onChange={e => {
                                const updated = [...assignmentConfig];
                                updated[qIdx] = { ...updated[qIdx], kldomain: e.target.value, kl: '' };
                                setAssignmentConfig(updated);
                              }}
                              className="w-36 appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 pr-8 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-xs"
                            >
                              <option value="">Select domain</option>
                              {Object.keys(bloomsDomains || {}).map(key => (
                                <option key={key} value={key}>{bloomsDomains[key]?.name || key}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">KL</label>
                          <div className="relative">
                            <select
                              value={assignmentConfig[qIdx].kl || ''}
                              onChange={e => {
                                const updated = [...assignmentConfig];
                                updated[qIdx] = { ...updated[qIdx], kl: e.target.value };
                                setAssignmentConfig(updated);
                              }}
                              className="w-28 appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 pr-8 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-xs"
                              disabled={!assignmentConfig[qIdx].kldomain}
                            >
                              {(() => {
                                const domainKey = assignmentConfig[qIdx].kldomain;
                                const domain = domainKey ? bloomsDomains[domainKey] : null;
                                if (domain && Array.isArray(domain.levels) && domain.levels.length > 0) {
                                  return (
                                    <>
                                      <option value="">Select KL</option>
                                      {domain.levels.map((lvl, i) => (
                                        <option key={i} value={lvl.code || lvl.name}>{lvl.code || lvl.name}</option>
                                      ))}
                                    </>
                                  );
                                }
                                return ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map(l => <option key={l} value={l}>{l}</option>);
                              })()}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Marks:</span>
                        <input
                          type="number" min="1"
                          value={assignmentConfig[qIdx].marks}
                          onChange={e => {
                            const updated = [...assignmentConfig];
                            updated[qIdx] = { ...updated[qIdx], marks: parseInt(e.target.value, 10) || 0 };
                            setAssignmentConfig(updated);
                          }}
                          className="w-20 text-center font-bold text-[#120c7a] bg-transparent border border-slate-200 rounded-lg px-2 py-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Question Content</label>
                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                        <MathTemplateToolbar editorId={`assignmentEditor_${qIdx}`} />
                        <div id={`editorWrapper_${qIdx}`} className="min-h-[150px]"></div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h5 className="font-bold text-slate-700 text-sm">CO-wise Mark Distribution</h5>
                          <p className="text-[10px] text-slate-400 font-medium">Split the marks ({assignmentConfig[qIdx].marks}) across mapped COs</p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${qMeta.balanced ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                            {qMeta.balanced ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                            <span>Remaining Mark: {qMeta.remaining}</span>
                          </div>

                          <div className="relative">
                            <button className="px-4 py-2 bg-[#120c7a] text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#0e0960] transition-all shadow-sm">
                              <Plus size={14} /> Add CO Mapping
                            </button>
                            <select
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              value=""
                              onChange={e => handleAddCOAssignment(qIdx, e.target.value)}
                            >
                              <option value="">Select CO to add</option>
                              {courseOutcomes.map(co => (
                                <option key={co.code} value={co.code}>{co.code}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(assignmentConfig[qIdx].mappings || []).map((mapping, coIdx) => (
                          <div key={coIdx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100 uppercase">
                                {mapping.co}
                              </span>
                              <button
                                onClick={() => handleRemoveCOAssignment(qIdx, coIdx)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Assigned Marks</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max={assignmentConfig[qIdx].marks}
                                  value={mapping.marks === 0 || mapping.marks === '0' || mapping.marks === '' || mapping.marks === null || mapping.marks === undefined ? '' : mapping.marks}
                                  onChange={(e) => handleMappingMarksChange(qIdx, coIdx, e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm text-[#120c7a]"
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="relative">
                                <button className="w-full px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-all border border-blue-100">
                                  <Plus size={12} /> Add PI for {mapping.co}
                                </button>
                                <select
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  value=""
                                  onChange={e => handleAddPIAssignment(qIdx, coIdx, e.target.value)}
                                >
                                  <option value="">Select PI</option>
                                  {coPiMapping[mapping.co]?.map(pi => (
                                    <option key={pi} value={pi}>{pi}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {(mapping.pis || []).map((pi, piIdx) => (
                                  <span key={piIdx} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-200 group">
                                    {pi}{mapping.piMarks && mapping.piMarks[piIdx] != null ? ` (${mapping.piMarks[piIdx]})` : ''}
                                    <button onClick={() => handleRemovePIAssignment(qIdx, coIdx, piIdx)}>
                                      <XCircle size={10} className="text-slate-300 group-hover:text-red-500 transition-colors" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                        {(assignmentConfig[qIdx].mappings || []).length === 0 && (
                          <div className="md:col-span-2 py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                            No Course Outcomes mapped yet. Select a CO above.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-center items-center gap-4 mt-8">
              <button
                type="button"
                disabled={isSavingDraft}
                onClick={handleSaveDraft}
                className="px-8 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Bookmark size={18} />
                {isSavingDraft ? "Saving Draft..." : "Save as Draft"}
              </button>
              <button
                onClick={handleFinalizeQuestions}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
              >
                <CheckCircle2 size={20} />
                Finalize & Preview
              </button>
              <button
                onClick={() => { setShowParts(false); setAssignmentConfig([]); }}
                className="px-8 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-all flex items-center gap-2"
              >
                <XCircle size={20} />
                Cancel
              </button>
            </div>
          </div>
        )}

        {assessmentType === 'Exam' && (
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100 mb-8">
            {/* PO-CO Mapping Reference */}
            {sortedPoCodes && sortedPoCodes.length > 0 && (
              <div className="mb-8 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <h3 className="font-bold text-slate-700 text-sm">Overall Mapped PO / PSO</h3>
                </div>
                <div className="p-2 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        {displayedPoSummary.map((r) => (
                          <th key={r.poCode} className="px-3 py-2 text-center font-bold text-slate-700 uppercase tracking-wide text-[11px]">
                            {r.displayCode}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {displayedPoSummary.map((r) => (
                          <td key={r.poCode} className="px-3 py-2 text-center">
                            {r.marks === 0 ? (
                              <span className="inline-flex items-center px-2 py-1 bg-red-50 text-red-700 rounded-lg font-bold text-[11px]">{r.marks}</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-[11px]">{r.marks}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Current Paper PO Summary: show only POs present in active paper (editor) */}
                {presentPoSummary && presentPoSummary.length > 0 && (
                  <div className="mt-4 p-2 border-t border-slate-100">
                    <div className="text-sm font-semibold text-slate-600 mb-2">POs present in current question paper (Active Changes)</div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr>
                            {presentPoSummary.map(p => (
                              <th key={p.poCode} className="px-3 py-2 text-center font-bold text-slate-700 uppercase tracking-wide text-[11px]">{p.displayCode}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {presentPoSummary.map(p => (
                              <td key={p.poCode} className="px-3 py-2 text-center">
                                <span className="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-[11px]">{p.marks}</span>
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            <h4 className="text-2xl font-bold text-[#120c7a] mb-6 flex items-center gap-3">
              <div className="w-2 h-8 bg-[#120c7a] rounded-full"></div>
              Enter Questions
            </h4>


            {showQbEditor && (
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 w-full mb-8">
                <div className="mb-4 bg-white rounded-xl overflow-hidden border border-slate-200">
                  <MathTemplateToolbar editorId="qbEditor" />
                  <textarea id="qbEditor" ref={qbQuestionRef} style={{ width: '100%' }} />
                </div>
              </div>
            )}

            <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 mb-8">
              <form onSubmit={(e) => { e.preventDefault(); handleAddQuestion(); }}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 items-end">
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">QNo</label>
                    <div className="relative">
                      <select
                        value={qbQNo}
                        onChange={e => setQbQNo(e.target.value)}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      >
                        {qbAvailableQNos && qbAvailableQNos.length > 0 ? (
                          <>
                            <option value="">Select</option>
                            {qbAvailableQNos.map(v => <option key={v} value={v}>{v}</option>)}
                            {qbQNo && !qbAvailableQNos.includes(qbQNo) && !qbAvailableQNos.some(v => String(v).toLowerCase().replace(/\s+/g,'').replace(/\(([a-z])\)$/i,'$1') === String(qbQNo).toLowerCase().replace(/\s+/g,'').replace(/\(([a-z])\)$/i,'$1')) ? (
                              <option value={qbQNo}>{qbQNo}</option>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <option value="">Generate Layout First</option>
                            {qbQNo ? <option value={qbQNo}>{qbQNo}</option> : null}
                          </>
                        )}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">CO Mapping</label>
                    <div className="relative">
                      <select
                        value={qbCO}
                        onChange={e => { const v = e.target.value; setQbCO(v); setQbPI((coPiMapping[v] && coPiMapping[v][0]) || ''); }}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      >
                        <option value="">Select CO</option>
                        {courseOutcomes && courseOutcomes.map(co => (
                          <option key={co.code} value={co.code}>{co.code}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">KL Domain</label>
                    <div className="relative">
                      <select
                        value={qbKLDomain}
                        onChange={e => { setQbKLDomain(e.target.value); setQbKL(''); }}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-xs md:text-sm"
                      >
                        <option value="">Select domain</option>
                        {Object.keys(bloomsDomains || {}).map(key => (
                          <option key={key} value={key}>{bloomsDomains[key]?.name || key}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Knowledge Level</label>
                    <div className="relative">
                      <select
                        value={qbKL}
                        onChange={e => setQbKL(e.target.value)}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      >
                        {(() => {
                          const domain = bloomsDomains[qbKLDomain];
                          if (domain && Array.isArray(domain.levels) && domain.levels.length > 0) {
                            return domain.levels.map((lvl, i) => (
                              <option key={i} value={lvl.code || lvl.name}>{lvl.code || lvl.name}</option>
                            ));
                          }
                          return ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map(l => <option key={l} value={l}>{l}</option>);
                        })()}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">PI Mapping</label>
                    <div className="relative">
                      <select
                        value={qbPI}
                        onChange={e => setQbPI(e.target.value)}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                        disabled={!qbCO}
                      >
                        <option value="">Select PI</option>
                        {(coPiMapping[qbCO] || []).map(pi => (
                          <option key={pi} value={pi}>{pi}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-8 pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const inst = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor;
                        if (inst && typeof inst.getData === 'function') {
                          handleAddQuestion();
                        } else {
                          const data = document.getElementById('qbEditor') ? document.getElementById('qbEditor').value : qbQuestion;
                          setQbQuestion(data);
                          handleAddQuestion();
                        }
                      } catch (e) {
                        console.error('Error inserting rich question', e);
                      }
                    }}
                    className="px-8 py-3 bg-[#120c7a] text-white font-bold rounded-xl hover:bg-[#1a1494] transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Insert / Update Question
                  </button>
                </div>
              </form>

              {qpQuestions && qpQuestions.length > 0 && (
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-700">Added Questions Summary</h4>
                    <span className="text-[10px] font-black bg-blue-100 text-[#120c7a] px-2 py-1 rounded-md uppercase tracking-wider">
                      {qpQuestions.length} Questions Added
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="overflow-auto max-h-[300px]">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">#</th>
                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Question</th>
                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">KL</th>
                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">CO</th>
                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">PI</th>
                            <th className="px-4 py-3 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {qpQuestions.map((q, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-400">
                                {q.qno || (idx + 1)}
                                {q.either_or && (
                                  <span className="ml-1 text-[9px] px-1 bg-slate-100 text-slate-500 rounded uppercase">
                                    Choice {q.sub?.toUpperCase() || ''}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="qp-question-content text-xs md:text-sm text-slate-800 leading-relaxed font-medium overflow-auto max-h-48" dangerouslySetInnerHTML={{ __html: q.question }}></div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 font-medium">{q.kl}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg font-bold text-[10px]">
                                  {formatPoPsoCode(q.co)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-[10px]">{q.pi}</span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => handleEditQuestion(idx)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                    title="Edit question"
                                  >
                                    <Pencil size={18} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteQuestion(idx)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                    title="Delete question"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-8 flex flex-wrap justify-center items-center gap-4">
                    <button
                      type="button"
                      disabled={isSavingDraft}
                      onClick={handleSaveDraft}
                      className="px-8 py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2 text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      <Bookmark size={18} />
                      {isSavingDraft ? "Saving Draft..." : "Save as Draft"}
                    </button>
                    <button
                      onClick={handleFinalizeQuestions}
                      className="px-10 py-3.5 bg-blue-700 text-white font-black rounded-xl hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/30 flex items-center gap-3 uppercase tracking-widest text-xs"
                    >
                      <CheckCircle2 size={18} />
                      Finalize Question Paper
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showFinalPreview ? (
          <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 md:p-12 mb-8 overflow-auto flex justify-center">
            <div className="bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] rounded-sm overflow-hidden" style={{ width: '210mm', minHeight: '297mm' }}>
              <MathTemplateToolbar editorId="questionEditor" />
              <textarea name="ckeditor" id="questionEditor" ref={editorRef}></textarea>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-12 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[2rem] mb-8 group">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-slate-300 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </div>
            <p className="text-slate-400 font-bold tracking-tight uppercase text-xs">Preview Area</p>
            <p className="text-slate-400 mt-1 max-w-[200px]">Click Finalize button after adding questions to see the preview.</p>
          </div>
        )}

        {showFinalPreview && (
          <div className="flex flex-wrap justify-center gap-6 pb-8">
            <button
              onClick={() => refreshOutcomesSummary(false)}
              className="px-8 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh Outcomes
            </button>
            <button
              type="button"
              disabled={isSavingDraft}
              onClick={handleSaveDraft}
              className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2 disabled:opacity-50"
            >
              <Bookmark size={18} />
              {isSavingDraft ? "Saving Draft..." : "Save Draft"}
            </button>
            <button
              onClick={() => {
                if (!currentUserSignatureUrl) {
                  showToast("Please upload your digital signature in your profile before forwarding.", "error");
                  return;
                }
                handleForwardPaper();
              }}
              className={`px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 ${!currentUserSignatureUrl ? 'opacity-60' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Forward to Academic Coordinator
            </button>
            <button
              onClick={() => isAssignmentOrProject ? handleSaveAssignment() : handleSaveQuestionPaper()}
              className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Save Paper
            </button>
          </div>
        )}
      </div>

      {showAIModal && assessmentType !== 'Indirect' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-100 animate-in zoom-in duration-300">
            <h2 className="text-2xl font-bold text-[#120c7a] mb-6 flex items-center gap-3">
              <div className="w-2 h-8 bg-purple-600 rounded-full"></div>
              Generate with AI
              <span className="text-sm font-normal text-slate-500 ml-2">(Syllabus fetched automatically)</span>
            </h2>

            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-sm flex items-center gap-3">
                <AlertCircle size={20} className="shrink-0" />
                <p>Syllabus content and CO Bloom's levels are automatically fetched from the selected subject's Course Bank entry to guide AI generation.</p>
              </div>

              {/* Removed aiDistribution input, AI will infer from CO levels */}
              {/* <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Difficulty & Distribution (AI will infer from CO levels)</label>
                <input
                  type="text"
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-medium"
                  value={aiDistribution}
                  onChange={(e) => setAiDistribution(e.target.value)}
                  placeholder="E.g. 50% Easy (L1-L2), 30% Medium (L3), 20% Hard (L4-L6)"
                />
              </div> */}

              <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Unit & Topic Requirements (Optional)</label>
                <textarea
                  className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-xl resize-y focus:ring-2 focus:ring-purple-500 outline-none transition-all font-medium"
                  rows="3"
                  value={aiUnitConstraints}
                  onChange={(e) => setAiUnitConstraints(e.target.value)}
                  placeholder="E.g. Take 5 questions from Unit 1, and 5 from Unit 2."
                />
                <p className="text-xs text-slate-400 mt-1 ml-1 font-medium">Write simple instructions for the AI on how many questions to pick from which unit.</p>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100">
                <input
                  type="checkbox"
                  id="aiIncludeImages"
                  className="w-5 h-5 cursor-pointer text-purple-600 rounded border-slate-300 focus:ring-purple-600"
                  checked={aiIncludeImages}
                  onChange={(e) => setAiIncludeImages(e.target.value === 'on' || e.target.checked)}
                />
                <label htmlFor="aiIncludeImages" className="text-sm font-semibold text-slate-600 cursor-pointer select-none">
                  Generate Subject Diagrams/Images (SVGs for circuits, graphs, etc)
                </label>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
                <button
                  onClick={() => setShowAIModal(false)}
                  className="w-full sm:w-auto px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
                  disabled={isGeneratingAI}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateAI}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-10 py-2.5 font-bold rounded-xl transition-all shadow-lg shadow-purple-900/20 ${isGeneratingAI ? 'opacity-70 cursor-not-allowed' : 'hover:bg-purple-700'}`}
                  disabled={isGeneratingAI}
                >
                  {isGeneratingAI ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent"></div>
                      Generating...
                    </>
                  ) : (
                    'Generate Output'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}