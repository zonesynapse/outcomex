import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Pencil, Trash2, ChevronDown, Plus, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { auth, rtdb } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, onValue } from 'firebase/database';
import { useRegulations } from '../hooks/useRegulations';
import { useDepartments } from '../hooks/useDepartments';
import { useBatches } from '../hooks/useBatches';
import { useSemesterType } from '../hooks/useSemesterType';
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from '../lib/utils';

function deriveSemesterNumber(semStr) {
  if (!semStr) return '';
  const romanToNum = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10 };
  if (romanToNum[semStr]) return String(romanToNum[semStr]);
  const match = String(semStr).match(/\d+/);
  return match ? match[0] : '';
}

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function QuestionPaperGenerator() {
  const { departments: programToDepartments, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
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
  const [subject, setSubject] = useState('');
  const [courseOutcomes, setCourseOutcomes] = useState([]);
  const [coPiMapping, setCoPiMapping] = useState({});
  const [poSummaryMapping, setPoSummaryMapping] = useState({});
  const [savedExamParts, setSavedExamParts] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [assignedProgs, setAssignedProgs] = useState([]);
  const [assignedDepts, setAssignedDepts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exam, setExam] = useState('');
  const [customExam, setCustomExam] = useState('');
  const [assessmentType, setAssessmentType] = useState('Exam');
  const [numParts, setNumParts] = useState('');

  const [batches, setBatches] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);

  const [showParts, setShowParts] = useState(false);
  const [partsConfig, setPartsConfig] = useState([]);
  const [assignmentConfig, setAssignmentConfig] = useState([]);
  const [savedAssignmentConfig, setSavedAssignmentConfig] = useState([]);

  const [assignmentKL, setAssignmentKL] = useState('L1');
  const [assignmentKLDomain, setAssignmentKLDomain] = useState('');
  // Question Builder states
  const [qpQuestions, setQpQuestions] = useState([]);
  const [qbQuestion, setQbQuestion] = useState('');
  const [qbQNo, setQbQNo] = useState('');
  const [qbAvailableQNos, setQbAvailableQNos] = useState([]);
  const [qbKL, setQbKL] = useState('L1');
  // stores selected Bloom domain id (key from RTDB)
  const [qbKLDomain, setQbKLDomain] = useState('');
  const [qbCO, setQbCO] = useState('');
  const [bloomsDomains, setBloomsDomains] = useState({});
  const [qbPI, setQbPI] = useState('');
  const [qbMarks, setQbMarks] = useState(2);
  const qbQuestionRef = useRef(null);
  const isEditingQbRef = useRef(false);  // Track if we're editing an existing question
  const [showQbEditor, setShowQbEditor] = useState(true);
  const [qbEditorData, setQbEditorData] = useState('');

  const initInlineQbEditor = useCallback(() => {
    try {
      if (!window.CKEDITOR) return;
      // If an existing instance exists, destroy it first
      if (window.CKEDITOR.instances && window.CKEDITOR.instances.qbEditor) {
        try { window.CKEDITOR.instances.qbEditor.destroy(true); } catch { /* ignore */ }
      }
      const editor = window.CKEDITOR.replace('qbEditor', {
        removePlugins: 'elementspath',
        resize_enabled: false,
        extraPlugins: 'uploadimage',
        filebrowserUploadUrl: '',
        height: 200,
        contentsCss: [window.CKEDITOR.basePath + 'contents.css']
      });

      editor.on('instanceReady', function () {
        try { 
          editor.setData(qbQuestion || qbEditorData || ''); 
          try { editor.focus(); } catch { /* ignore focus errors */ }
        } catch { /* ignore */ }
      });
    } catch (e) {
      console.error('initInlineQbEditor', e);
    }
  }, [qbQuestion, qbEditorData]);

  const initAssignmentEditor = useCallback(() => {
    try {
      if (!window.CKEDITOR) return;
      if (window.CKEDITOR.instances && window.CKEDITOR.instances.assignmentEditor) {
        try { window.CKEDITOR.instances.assignmentEditor.destroy(true); } catch { /* ignore */ }
      }
      const editor = window.CKEDITOR.replace('assignmentEditor', {
        removePlugins: 'elementspath',
        resize_enabled: false,
        extraPlugins: 'uploadimage',
        filebrowserUploadUrl: '',
        height: 200,
        contentsCss: [window.CKEDITOR.basePath + 'contents.css']
      });

      editor.on('instanceReady', function () {
        try { 
          editor.setData(assignmentConfig[0]?.question || ''); 
        } catch { /* ignore */ }
      });

      editor.on('change', function() {
        const data = editor.getData();
        setAssignmentConfig(prev => {
          if (!prev || !prev.length) return prev;
          const updated = [...prev];
          if (updated[0].question !== data) {
            updated[0] = { ...updated[0], question: data };
            return updated;
          }
          return prev;
        });
      });
    } catch (e) {
      console.error('initAssignmentEditor', e);
    }
  }, []); // Empty deps to avoid re-init on question change

  useEffect(() => {
    if (assessmentType !== 'Assignment' || !showParts) return;
    let cancelled = false;
    const attemptInit = () => {
      if (cancelled) return;
      const el = document.getElementById('assignmentEditor');
      if (el && window.CKEDITOR) {
        initAssignmentEditor();
      } else {
        setTimeout(attemptInit, 200);
      }
    };
    attemptInit();
    return () => { cancelled = true; };
  }, [assessmentType, showParts, initAssignmentEditor]);

  // Keep default Q.No as next index when questions change (only if not editing)
  useEffect(() => {
    if (isEditingQbRef.current) return;  // Don't auto-increment while editing
    const next = (qpQuestions && qpQuestions.length) ? (qpQuestions.length + 1) : 1;
    setQbQNo(String(next));
  }, [qpQuestions]);

  // If editor-generated table provides Q.No list, prefer that for the dropdown
  useEffect(() => {
    if (qbAvailableQNos && qbAvailableQNos.length) {
      if (!qbAvailableQNos.includes(qbQNo)) setQbQNo(qbAvailableQNos[0]);
    }
  }, [qbAvailableQNos, qbQNo]);

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
  }, [showQbEditor, initInlineQbEditor]);

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
    const text = (editorText || qbQuestion || '').trim();
    if (!text) return showToast('Please enter a question.', 'error');
    const marks = parseInt(qbMarks, 10) || 0;
    if (marks <= 0) return showToast('Marks must be greater than zero.', 'error');

    const domainName = (bloomsDomains && qbKLDomain && bloomsDomains[qbKLDomain]) ? bloomsDomains[qbKLDomain].name : '';
    const qnoVal = (qbQNo && String(qbQNo).trim()) ? String(qbQNo).trim() : String((qpQuestions && qpQuestions.length) ? qpQuestions.length + 1 : 1);
    const newQ = { qno: qnoVal, question: text, kl: qbKL || 'L1', kldomain: domainName || '', co: qbCO || '', pi: qbPI || '', marks };
    // If PI is not explicitly selected but mapping exists for the selected CO, default to first PI
    if ((!newQ.pi || String(newQ.pi).trim() === '') && qbCO && coPiMapping && Array.isArray(coPiMapping[qbCO]) && coPiMapping[qbCO].length > 0) {
      newQ.pi = coPiMapping[qbCO][0];
    }
    const normalize = s => String(s || '').trim().toLowerCase();
    console.debug('[QB] handleAddQuestion qnoVal ->', qnoVal, 'isEditing ->', isEditingQbRef.current);
    setQpQuestions(prev => {
      // if a question with same normalized qno exists, replace it; otherwise add
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
    setQbQNo(String(q.qno || (index + 1)).trim());
    const domainKey = Object.keys(bloomsDomains || {}).find(k => (bloomsDomains[k] && bloomsDomains[k].name) === q.kldomain) || '';
    setQbKLDomain(domainKey);
    setQbKL(q.kl || 'L1');
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
  }, [qpQuestions, bloomsDomains, coPiMapping]);

  // AI Modal States
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSyllabus, setAiSyllabus] = useState('');
  const [aiDistribution, setAiDistribution] = useState('Easy: 30%, Medium: 50%, Hard: 20%');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [qpSet, setQpSet] = useState('Set 1');
  const [showFinalPreview, setShowFinalPreview] = useState(false);

  const [subjectCourseDetails, setSubjectCourseDetails] = useState(null);
  const [aiUnitConstraints, setAiUnitConstraints] = useState('');
  const [aiIncludeImages, setAiIncludeImages] = useState(false);

  // Fetch current user's signature URL
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        const userRef = ref(rtdb, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const userData = snapshot.val();
          setCurrentUserSignatureUrl(userData.signatureUrl || '');
        }
      } else {
        setCurrentUserId(null);
        setCurrentUserSignatureUrl('');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const userRef = ref(rtdb, `users/${user.uid}`);
    get(userRef).then(snapshot => {
      if (snapshot.exists()) {
        const userData = snapshot.val();
        setUserRole(userData.role);
        if (userData.role === 'Faculty') {
          const assignmentsRef = ref(rtdb, 'subject_assignments');
          const unsubscribe = onValue(assignmentsRef, (assignSnap) => {
            if (assignSnap.exists()) {
              const data = assignSnap.val();
              const progs = new Set();
              const depts = new Set();
              Object.entries(data).forEach(([progKey, deptData]) => {
                Object.entries(deptData).forEach(([deptKey, batchData]) => {
                  if (JSON.stringify(batchData).includes(user.uid)) {
                    progs.add(progKey);
                    depts.add(deptKey);
                  }
                });
              });
              setAssignedProgs(Array.from(progs));
              setAssignedDepts(Array.from(depts));
            } else {
              setAssignedProgs([]);
              setAssignedDepts([]);
            }
          });
          return () => unsubscribe();
        }
      }
    });
  }, []);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  useEffect(() => {
    const configsRef = ref(rtdb, 'cia_configs');
    const unsubscribe = onValue(configsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const configsArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setCiaConfigs(configsArray);
      } else {
        setCiaConfigs([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load Bloom's taxonomy domains for KL Domain dropdown
  useEffect(() => {
    const bloomsRef = ref(rtdb, 'blooms_taxonomy');
    const unsub = onValue(bloomsRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
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
      const regKey = sanitizeKey(regulation);
      const subjectKey = sanitizeKey(subject);

      let courseData = null;
      try {
        let courseRef = ref(rtdb, `courses/${progKey}/${deptKey}/${regKey}/${subjectKey}`);
        let snap = await get(courseRef);
        if (!snap.exists()) { // Fallback to Overall if not found in specific department
          courseRef = ref(rtdb, `courses/${progKey}/Overall/${regKey}/${subjectKey}`);
          snap = await get(courseRef);
        }
        if (snap.exists()) courseData = snap.val();
      } catch (error) { console.error("Error fetching course details for AI:", error); }
      setSubjectCourseDetails(courseData);
    };
    fetchCourseDetails();
  }, [program, department, batch, subject, getRegulationForBatch]);

  const filteredExams = useMemo(() => {
    if (!program || !department || !batch || !academicYear || !selectedSemester) return [];
    
    const semNum = deriveSemesterNumber(selectedSemester);
    
    return ciaConfigs.filter(config => 
      formatProgDisplay(config.program) === formatProgDisplay(program) &&
      (config.department === department || !config.department) &&
      (!config.batch || config.batch === batch) &&
      (!config.academicYear || config.academicYear === academicYear) &&
      (!config.semester || String(config.semester) === semNum) &&
      (assessmentType === 'Assignment' ? config.isAssignment : !config.isAssignment)
    );
  }, [ciaConfigs, program, department, batch, academicYear, selectedSemester, assessmentType]);

  const assignmentMarksMeta = useMemo(() => {
    const total = parseInt(assignmentConfig?.[0]?.marks, 10) || 0;
    const used = (assignmentConfig?.[0]?.mappings || []).reduce((sum, m) => sum + (parseInt(m?.marks, 10) || 0), 0);
    const remaining = Math.max(total - used, 0);
    const exceeded = Math.max(used - total, 0);
    return { total, used, remaining, exceeded, balanced: used === total };
  }, [assignmentConfig]);

  const deriveCOSummaryFromQp = useCallback((qp) => {
    const activeCOs = new Set();
    const coWeightage = {};

    if (!qp) return { activeCOs, coWeightage };

    // Assignment: each mapping contributes marks directly to its CO
    if (qp.assessment_type === 'Assignment') {
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

    // Exam: group by base Q.No to avoid double-counting either/or mark allocation
    const groups = {}; // { baseQNo: { marks: number, cos: Set<string> } }
    const addToGroup = (qnoRaw, coRaw, marksRaw) => {
      const co = String(coRaw || '').trim();
      const marks = parseInt(marksRaw, 10) || 0;
      if (!co || !co.toUpperCase().startsWith('CO') || marks <= 0) return;

      const base = String(qnoRaw || '')
        .trim()
        .replace(/\(a\)|\(b\)/gi, '')
        .replace(/\s+/g, '');
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
  }, []);

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
    if (assessmentType !== 'Exam' && assessmentType !== 'Assignment') return {};

    const summaryEntries = Object.entries(poSummaryMapping || {});
    if (!summaryEntries.length) return {};

    const poMarks = {};

    if (assessmentType === 'Assignment') {
      questionsSource.forEach((q) => {
        (q?.mappings || []).forEach((m) => {
          const coCode = String(m?.co || '').trim().toUpperCase();
          const selectedPis = Array.isArray(m?.pis) ? m.pis : [];
          const mapMarks = Number(m?.marks) || 0;

          if (!coCode || mapMarks <= 0 || selectedPis.length === 0) return;

          summaryEntries.forEach(([poCode, poData]) => {
            const mappedPis = (poData?.checked_map && poData.checked_map[coCode]) || [];
            if (!Array.isArray(mappedPis) || mappedPis.length === 0) return;

            const hasAnyMappedPi = selectedPis.some(pi => mappedPis.includes(pi));
            if (hasAnyMappedPi) {
              poMarks[poCode] = (poMarks[poCode] || 0) + mapMarks;
            }
          });
        });
      });
      return poMarks;
    }

    const groups = {};
    questionsSource.forEach((q) => {
      const normalized = normalizeQNo(q?.qno);
      if (!normalized) return;

      const qMatch = normalized.match(/^(\d+)([a-z])?$/i);
      const base = qMatch ? qMatch[1] : normalized;
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
  }, [assessmentType, poSummaryMapping, normalizeQNo]);

  // Marks strictly from saved/loaded state
  const savedPoMarks = useMemo(() => {
    if (assessmentType === 'Assignment') {
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
    if (assessmentType === 'Assignment') {
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
      const poCount = (sortedPoCodes || []).filter(c => /^PO\d+$/i.test(c)).length;
      const num = parseInt(psoMatch[1], 10);
      if (num > poCount) {
        return `PSO${num - poCount}`;
      }
    }
    return code;
  }, [sortedPoCodes]);

  // Build displayed summary (TOP TABLE): use ONLY savedPoMarks
  const displayedPoSummary = useMemo(() => {
    return (sortedPoCodes || []).map(po => ({
      poCode: po,
      displayCode: formatPoPsoCode(po),
      mappedCos: Object.keys((poSummaryMapping && poSummaryMapping[po] && poSummaryMapping[po].checked_map) || {}),
      marks: Number(savedPoMarks[po] || 0)
    }));
  }, [sortedPoCodes, savedPoMarks, poSummaryMapping, formatPoPsoCode]);

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

  const filteredProgrammes = Object.keys(programToDepartments).filter(prog => {
    if (userRole !== 'Faculty') return true;
    return assignedProgs.includes(formatProgrammeKey(prog));
  });

  const displayedBatches = useMemo(() => {
    if (assessmentType !== 'Assignment') return batches;
    if (!program || !department) return batches; // Don't filter if context is missing

    return batches.filter(b => {
      return ciaConfigs.some(config => 
        formatProgDisplay(config.program) === formatProgDisplay(program) &&
        config.department === department &&
        config.batch === b &&
        config.isAssignment === true
      );
    });
  }, [batches, assessmentType, ciaConfigs, program, department]);

  const filteredDepartments = useMemo(() => {
  const depts = programToDepartments[formatProgrammeKey(program)] || [];
  return depts.filter(dept => {
    if (userRole !== 'Faculty') return true;
    return assignedDepts.includes(sanitizeKey(dept));
  });
}, [program, userRole, assignedDepts, programToDepartments]);

  useEffect(() => {
    if (exam && exam !== 'custom') {
      const config = ciaConfigs.find(c => c.id === exam);
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
  }, [exam, ciaConfigs]);

  const getQuestionPaperHTML = useCallback((qp, cos = courseOutcomes, activeCOs = null, coWeightage = null, facultySignatureUrl = '') => {
    // Compute exam display name (resolve config ID to name)
    let examDisplay = qp.exam_name;
    if (!examDisplay) {
      const configObj = ciaConfigs.find(c => c.id === qp.qpaper_name);
      examDisplay = configObj?.examName || qp.qpaper_name;
    }

    const isAssignment = qp.assessment_type === 'Assignment';

    const yearLabel = { "1": "I", "2": "I", "3": "II", "4": "II", "5": "III", "6": "III", "7": "IV", "8": "IV" }[qp.semester] || "";
    const semLabel = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8": "VIII" }[qp.semester] || qp.semester;
    const yearSemester = `${yearLabel} / ${semLabel}`;
    const subjectDisplay = `${qp.subject} - ${qp.subject_name}`;

    // Prepare signature HTML
    let facultySignatureHtml = '';
    if (facultySignatureUrl) {
      facultySignatureHtml = `<img src="${facultySignatureUrl}" alt="Faculty Signature" style="height: 50px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`;
    } else {
      facultySignatureHtml = `<div style="height: 50px; width: 150px; margin: 0 auto; border-bottom: 1px solid #000;"></div>`; // Placeholder if no signature
    }

    // Placeholder for HOD signature (will be filled when approved)
    let hodSignatureHtml = '';
    if (qp.status === 'approved' && qp.hod_signature_url) {
      hodSignatureHtml = `<img src="${qp.hod_signature_url}" alt="HOD Signature" style="height: 50px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`;
    } else {
      hodSignatureHtml = `<div style="height: 50px; width: 150px; margin: 0 auto; border-bottom: 1px solid #000;"></div>`;
    }

    let html = `
<!-- Row 1: CO Assessment + Examination Cell -->
<table style="width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.3;">
  <tr>
    <td style="text-align: left; padding: 4px;">
      CO Assessment - Direct Assessment Tool - ${isAssignment ? 'Assignment' : 'Descriptive Continuous Assessment (DCA)'}
    </td>
    <td style="text-align: right; padding: 4px;">
      <div style="border: 2px solid black; padding: 6px; font-weight: bold; font-size: 11px; display: inline-block;">
        EXAMINATION CELL
      </div>
    </td>
  </tr>
</table>
<!-- Row 2: Logo + College Info -->
<table cellspacing="0" border="1" style="border-collapse:collapse; font-size:11px; height:80px; width:100%; border:1px solid #000;">
  <tbody>
    <tr>
      <td style="height:70px; text-align:center; width:100%"><img alt="logo" class="logo-img" src="https://i.postimg.cc/QdgcKs7s/ckcet-logo.png" style="height:60px; max-width:100%; width:754px;" /></td>
    </tr>
  </tbody>
</table>
<table style="width: 100%; border-collapse: collapse; margin-top: 10px;" border="1">
  <tr>
    <td style="padding: 4px;"><strong>${isAssignment ? 'Assignment' : 'Internal Assessment Test'}</strong></td>
    <td colspan="3" style="padding: 4px;">${examDisplay}${isAssignment && qp.assignment_kl_domain ? ` (${qp.assignment_kl_domain})` : ''}</td>
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
    <td style="padding: 4px;">-</td>
  </tr>
  <tr>
    <td style="padding: 4px;"><strong>Max Mark</strong></td>
    <td style="padding: 4px;">${qp.total_marks}</td>
    <td style="padding: 4px;"><strong>Duration</strong></td>
    <td style="padding: 4px;">180 min</td>
    <td style="padding: 4px;"><strong>Date</strong></td>
    <td style="padding: 4px;">${qp.exam_date ? new Date(qp.exam_date).toLocaleDateString() : '03.10.2024'}</td>
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
        qp.assignment_config.forEach((q, idx) => {
          const allCOs = (q.mappings || []).map(m => `${m.co} (${m.marks || 0})`).join(', ');
          const allPIs = (q.mappings || []).flatMap(m => m.pis).join(', ');
          html += `
            <tr>
              <td style="text-align: center; padding: 4px;">${idx + 1}</td>
              <td style="padding: 4px;">${q.question || ''}</td>
              <td contenteditable="true" style="text-align: center; padding: 4px;">${qp.assignment_kl || ''}</td>
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
    <td style="width: 50%; padding: 6px; border: none;">Part ${partLetter}</td>
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
          
          filteredQuestions.forEach((q, qIdx) => {
            if (q.either_or) {
              if (q.sub === 'a') {
                const nextQ = filteredQuestions[qIdx + 1];
                html += `
                  <tr>
                    <td style="text-align: center; padding: 4px;">${q.qno}</td>
                    <td style="padding: 4px;">${q.question || ''}</td>
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
                    <td style="padding: 4px;">${nextQ?.question || ""}</td>
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
                  <td style="padding: 4px;">${q.question || ''}</td>
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
    if (cos && cos.length > 0) {
      coRows = cos.map((co) => {
        const tick = activeSet.has(co.code) ? '✓' : '';
        const w = weightMap && Object.prototype.hasOwnProperty.call(weightMap, co.code) ? weightMap[co.code] : '';
        
        return `
          <tr>
            <td style="padding: 4px;">${co.code}</td>
            <td style="padding: 4px;">${co.description}</td>
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
    <td style="height: 60px; width: 25%;"></td>
    <td style="height: 60px; width: 25%;"></td>
    <td style="height: 60px; width: 25%;"></td>
    <td style="height: 60px; width: 25%;"></td>
  </tr>
  <tr>
    <td style="text-align: center; padding: 6px;">Subject Faculty Signature</td>
    <td style="text-align: center; padding: 6px;">Academic Coordinator Signature</td>
    <td style="text-align: center; padding: 6px;">HOD Signature</td>
    <td style="text-align: center; padding: 6px;">Academic Coordinator Signature</td>
  </tr>
</table>
    `;
    return html; // Removed facultySignatureUrl from deps because it's passed as an arg
  }, [courseOutcomes, ciaConfigs, deriveCOSummaryFromQp]); // Add facultySignatureUrl to deps if it's a state

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
    if (!department || !regulation || !subject || !academicYear || !program || !selectedSemester) {
      setCourseOutcomes([]);
      setCoPiMapping({});
      window.coPiMappingData = {};
      return;
    }

    const coKey = `${sanitizeKey(department)}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}`;
    const coRef = ref(rtdb, `course_outcomes/${coKey}`);

    const mappingKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(selectedSemester)}`;
    const mappingRef = ref(rtdb, `mapping_summary/${mappingKey}`);

    // console.log("Fetching COs from:", coKey);
    // console.log("Fetching Mapping from:", mappingKey);

    const unsubscribeCO = onValue(coRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedCOs = Object.entries(data)
          .map(([code, val]) => ({ 
            code, 
            description: typeof val === 'object' && val !== null ? val.description : val 
          }))
          .sort((a, b) => {
            const numA = parseInt(a.code.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.code.replace(/\D/g, '')) || 0;
            return numA - numB;
          });
        setCourseOutcomes(loadedCOs);
        if (assessmentType === 'Assignment' && loadedCOs.length > 0 && !numParts) {
          setNumParts(String(loadedCOs.length));
        }
        // console.log("Loaded Course Outcomes:", loadedCOs);
      } else {
        setCourseOutcomes([]);
      }
    });

    const unsubscribeMapping = onValue(mappingRef, (snapshot) => {
      const mappingData = snapshot.val();
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
      unsubscribeCO();
      unsubscribeMapping();
    };
  }, [department, batch, subject, academicYear, program, selectedSemester, getRegulationForBatch]);

  useEffect(() => {
    hasLoadedRef.current = false;
    // Clear previous paper states when configuration changes
    if (!editId) {
      setQpQuestions([]);
      setPartsConfig([]);
      setSavedExamParts([]);
      setAssignmentConfig([]);
      setShowParts(false);
      setShowFinalPreview(false);
      setNumParts('');
      setAssignmentKL('L1');
      setAssignmentKLDomain('');
    }
  }, [editId, compositeKey, program, department, batch, academicYear, selectedSemester, subject, exam, customExam]);

  // Auto-load existing paper for this exam if not in explicit edit mode
  useEffect(() => {
    if (editId || compositeKey || hasLoadedRef.current) return;
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) return;

    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam);
    const setSuffix = (selectedConfig?.numSets > 1) ? `_Set_${qpSet.replace(' ', '')}` : '';
    const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subject)}_${sanitizeKey(examDisplay)}`;

    const checkExisting = async () => {
      try {
        const existingQpId = exam === 'custom' ? (assessmentType === 'Assignment' ? 'Assignment' : 'Exam') : `${exam}${setSuffix}`;
        const qpRef = ref(rtdb, `generated_qps/${key}/${existingQpId}`);
        const snapshot = await get(qpRef);
        if (snapshot.exists()) {
          const qp = snapshot.val();

          if (qp && !hasLoadedRef.current) {
            hasLoadedRef.current = true;
            
            // Apply state updates
            if (qp.assessment_type === 'Assignment') {
              setNumParts(String(qp.assignment_config?.length || ''));
              setAssignmentConfig(qp.assignment_config || []);
              setSavedAssignmentConfig(qp.assignment_config || []);
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

            // Fetch COs explicitly for loading
            const progKey = formatProgrammeKey(qp.programme);
            const regulation = getRegulationForBatch(progKey, qp.batch);
            if (!regulation) return;
            const coKey = `${sanitizeKey(qp.department)}_${sanitizeKey(regulation)}_${sanitizeKey(qp.subject)}_${sanitizeKey(qp.academic_year)}`;
            const coRef = ref(rtdb, `course_outcomes/${coKey}`);
            const coSnapshot = await get(coRef);
            const coData = coSnapshot.val();
            let fetchedCOs = [];
            if (coData) {
              fetchedCOs = Object.entries(coData)
                .map(([code, val]) => ({ 
                  code, 
                  description: typeof val === 'object' && val !== null ? val.description : val 
                }))
                .sort((a, b) => (parseInt(a.code.replace(/\D/g, '')) || 0) - (parseInt(b.code.replace(/\D/g, '')) || 0));
            }
            setCourseOutcomes(fetchedCOs);

            // Wait for editor to be ready
            const checkEditor = setInterval(() => { // This interval is for loading existing paper on initial load
              if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor && window.CKEDITOR.instances.questionEditor.status === 'ready') {
                clearInterval(checkEditor);
                const html = getQuestionPaperHTML(qp, fetchedCOs);
                window.CKEDITOR.instances.questionEditor.setData(html);
                showToast(`Existing saved ${assessmentType} loaded for this subject/exam.`, "success");
              }
            }, 500);
          }
        }
      } catch (error) {
        console.error("Error checking for existing paper:", error);
      }
    };

    checkExisting();
  }, [program, department, batch, academicYear, selectedSemester, subject, exam, qpSet, customExam, ciaConfigs, editId, compositeKey, getQuestionPaperHTML, assessmentType, getRegulationForBatch]);

  useEffect(() => {
    const loadSavedPaper = async () => {
      if (!editId || !compositeKey || hasLoadedRef.current) return;

      try {
        hasLoadedRef.current = true;
        const qpRef = ref(rtdb, `generated_qps/${compositeKey}/${editId}`);
        const snapshot = await get(qpRef);
        const qp = snapshot.val();

        if (qp) {
          setAssessmentType(qp.assessment_type || 'Exam');
          setProgram(qp.programme || '');
          setDepartment(qp.department || '');
          setBatch(qp.batch || '');
          setAcademicYear(qp.academic_year || '');
          setSelectedSemester(qp.semester ? `${qp.semester}${qp.semester === '1' ? 'st' : qp.semester === '2' ? 'nd' : qp.semester === '3' ? 'rd' : 'th'} Semester` : '');
          setSubject(qp.subject || '');
          setExam(qp.qpaper_name || '');
          
          if (qp.assessment_type === 'Assignment') {
            setNumParts(String(qp.assignment_config?.length || ''));
            setAssignmentConfig(qp.assignment_config || []);
            setSavedAssignmentConfig(qp.assignment_config || []);
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

          // Fetch COs explicitly for loading
          const progKey = formatProgrammeKey(qp.programme);
          const regulation = getRegulationForBatch(progKey, qp.batch);
          if (!regulation) return;
          const coKey = `${sanitizeKey(qp.department)}_${sanitizeKey(regulation)}_${sanitizeKey(qp.subject)}_${sanitizeKey(qp.academic_year)}`;
          const coRef = ref(rtdb, `course_outcomes/${coKey}`);
          const coSnapshot = await get(coRef);
          const coData = coSnapshot.val();
          let fetchedCOs = [];
          if (coData) {
            fetchedCOs = Object.entries(coData)
              .map(([code, val]) => ({ 
                code, 
                description: typeof val === 'object' && val !== null ? val.description : val 
              }))
              .sort((a, b) => (parseInt(a.code.replace(/\D/g, '')) || 0) - (parseInt(b.code.replace(/\D/g, '')) || 0));
          }
          setCourseOutcomes(fetchedCOs);

          // Wait for editor to be ready
            const checkEditor = setInterval(() => { // This interval is for loading saved paper when editing
            if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor && window.CKEDITOR.instances.questionEditor.status === 'ready') {
              clearInterval(checkEditor);
              
              const html = getQuestionPaperHTML(qp, fetchedCOs);
              window.CKEDITOR.instances.questionEditor.setData(html);
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

  useEffect(() => {
    if (program) {
      setDepartment('');
    }
  }, [program]);

  // Prevent showing stale saved-summary when building a new paper context.
  useEffect(() => {
    if (editId || compositeKey || hasLoadedRef.current) return;
    setSavedExamParts([]);
  }, [program, department, batch, academicYear, selectedSemester, subject, exam, customExam, assessmentType, editId, compositeKey]);

  useEffect(() => {
    if (batch) {
      setAcademicYears(getAcademicYears(batch));
      setAcademicYear('');
    } else {
      setAcademicYears([]);
    }
  }, [batch]);

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
          return num % 2 === 0;
        });

        const getOrdinal = (n) => {
          const s = ["th", "st", "nd", "rd"];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        setSemesters(filteredSems.map(num => `${getOrdinal(num)} Semester`));
      } else {
        setSemesters([]);
      }
      setSelectedSemester('');
    } else {
      setSemesters([]);
    }
  }, [batch, academicYear, globalSemesterType]);

  // Fetch Subjects from Syllabus
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
        const syllabusRef = ref(rtdb, `syllabus_data/${syllabusKey}`);
        const snapshot = await get(syllabusRef);
        const data = snapshot.val();
        let fetchedSubjects = [];
        
        if (data && data.semesters && data.semesters[semNum]) {
          fetchedSubjects = data.semesters[semNum]
            .filter(s => s != null && s.isActive !== false)
            .map(s => ({
            value: s.code,
            text: `${s.code} - ${s.name}`
          }));
        }

        // Filter by HOD Assignments
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setSubjects([]);
          return;
        }

        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const userSnap = await get(userRef);
        const userRole = userSnap.exists() ? userSnap.val().role : null;

        const assignmentPath = `subject_assignments/${progKey}/${deptKey}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semNum}`;
        const assignmentRef = ref(rtdb, assignmentPath);
        const assignmentSnap = await get(assignmentRef);
        
        if (assignmentSnap.exists()) {
          const assignments = assignmentSnap.val();
          
          if (userRole === 'Admin' || userRole === 'HOD' || userRole === 'Principal') {
            // Show all subjects that have at least one allocation to ANY faculty
            const allAllocatedCodes = new Set();
            Object.values(assignments).forEach(userAssignments => {
              if (Array.isArray(userAssignments)) {
                userAssignments.forEach(code => allAllocatedCodes.add(code));
              }
            });
            const filteredSubjects = fetchedSubjects.filter(s => allAllocatedCodes.has(s.value));
            setSubjects(filteredSubjects);
          } else {
            const userAssignments = assignments[currentUser.uid] || [];
            const filteredSubjects = fetchedSubjects.filter(s => userAssignments.includes(s.value));
            setSubjects(filteredSubjects);
          }
        } else {
          setSubjects([]);
        }
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
      }
    };

    fetchSubjects();
  }, [program, department, batch, selectedSemester, academicYear, getRegulationForBatch]);

  useEffect(() => {
    // Load CKEditor script dynamically
    if (!window.CKEDITOR) {
      const script = document.createElement("script");
      script.src = "https://cdn.ckeditor.com/4.22.1/full-all/ckeditor.js";
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (window.CKEDITOR) {
          window.CKEDITOR.config.versionCheck = false;
          window.CKEDITOR.on('log', function(evt) {
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
      if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor) {
        try {
          window.CKEDITOR.instances.questionEditor.destroy(true);
        } catch (e) {
          console.warn("Error destroying CKEditor instance:", e);
        }
      }
    };
  }, []);

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

const initEditor = useCallback(() => {
  if (window.CKEDITOR && !window.CKEDITOR.instances.questionEditor) {
    const element = document.getElementById('questionEditor');
    if (!element) return;

    const editor = window.CKEDITOR.replace('questionEditor', {
      versionCheck: false,
      width: '210mm',
      height: '297mm',
      extraPlugins: 'print',
      toolbar: [
        { name: 'document', items: ['Source', '-', 'Print'] },
        { name: 'clipboard', items: ['Undo', 'Redo'] },
        { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', '-', 'RemoveFormat'] },
        { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight'] },
        { name: 'insert', items: ['Image', 'Table', 'HorizontalRule'] },
        { name: 'styles', items: ['Format', 'FontSize'] },
        { name: 'colors', items: ['TextColor', 'BGColor'] },
        { name: 'tools', items: ['Maximize'] }
      ],
      contentsCss: [window.CKEDITOR.basePath + 'contents.css'],
      contentsStyle: `
        @page { size: A4; margin: 20mm; }
        html, body { width: 210mm; }
        body { font-family: Arial, sans-serif; font-size: 12pt; margin: 0; padding: 20mm; line-height: 1.5; box-sizing: border-box; }
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

        const contents = evt.editor.container.findOne('.cke_contents');
        if (contents) {
          contents.setStyle('height', 'calc(297mm - 40mm)');
          contents.setStyle('overflow', 'auto');
        }

        window.CKEDITOR.addCss(
          'select{border:1px solid #d1d5db; border-radius:4px; padding:2px 4px; background-color:#f9fafb; font-size:11px; color:#374151; outline:none; cursor:pointer; transition:border-color 0.2s;}' +
          'select:focus{border-color:#3b82f6; background-color:#fff;}'
        );

        evt.editor.document.on('change', function(e) {
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
      } catch (e) {
        console.warn('Failed to apply A4 styles to CKEditor instance', e);
      }
    });
  }
}, []); // ✅ Fixed: removed extra closing brace
  const handleGenerateParts = () => {
    if (assessmentType !== 'Assignment') {
      if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam || !numParts) {
        showToast("Please fill in all required fields.", "error");
        return;
      }
    } else {
      if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
        showToast("Please fill in all required fields.", "error");
        return;
      }
    }

    if (exam === 'custom' && !customExam) {
      showToast("Please enter the custom exam name.", "error");
      return;
    }

    const count = assessmentType === 'Assignment' ? 1 : parseInt(numParts, 10);
    setQpQuestions([]);
    if (assessmentType === 'Assignment') {
      const selectedConfig = ciaConfigs.find(c => c.id === exam);
      const totalMarks = selectedConfig?.totalMarks || 0;
      
      setAssignmentConfig([{ 
        question: '', 
        marks: totalMarks,
        mappings: []
      }]);
    } else {
      const newPartsConfig = [];
      for (let i = 0; i < count; i++) {
        // If we have existing parts up to this index, preserve them, otherwise default
        if (partsConfig[i]) {
          newPartsConfig.push({ ...partsConfig[i] });
        } else {
          newPartsConfig.push({ numQuestions: 5, marksPerQuestion: 2, isEitherOr: i > 0 });
        }
      }
      setPartsConfig(newPartsConfig);
    }
    setShowParts(true);
    setShowFinalPreview(false);
  };

  const handlePartChange = (index, field, value) => {
    const updated = [...partsConfig];
    updated[index][field] = value;
    setPartsConfig(updated);
  };


  const handleAddCOAssignment = (coCode) => {
    if (!coCode) return;
    const updated = [...assignmentConfig];
    if (!updated[0].mappings) updated[0].mappings = [];
    
    if (!updated[0].mappings.some(m => m.co === coCode)) {
      updated[0].mappings.push({ co: coCode, pis: [], marks: '' });
      setAssignmentConfig(updated);
    }
  };

  const handleRemoveCOAssignment = (coIndex) => {
    const updated = [...assignmentConfig];
    updated[0].mappings = updated[0].mappings.filter((_, i) => i !== coIndex);
    setAssignmentConfig(updated);
  };

  const handleMappingMarksChange = (coIndex, markValue) => {
    const updated = [...assignmentConfig];
    const parsed = parseInt(markValue, 10);
    const nextMark = Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
    const totalAllowed = parseInt(updated?.[0]?.marks, 10) || 0;

    const usedWithoutCurrent = (updated[0].mappings || []).reduce((sum, m, idx) => {
      if (idx === coIndex) return sum;
      return sum + (parseInt(m?.marks, 10) || 0);
    }, 0);

    if (usedWithoutCurrent + nextMark > totalAllowed) {
      alert(`Entered mark exceeds the total assignment mark (${totalAllowed}). Value cleared.`);
      updated[0].mappings[coIndex].marks = '';
      setAssignmentConfig(updated);
      return;
    }

    updated[0].mappings[coIndex].marks = nextMark;
    setAssignmentConfig(updated);
  };

  const handleAddPIAssignment = (coIndex, piValue) => {
    if (!piValue) return;
    const updated = [...assignmentConfig];
    const mappings = updated[0].mappings;
    if (!mappings[coIndex].pis.includes(piValue)) {
      mappings[coIndex].pis.push(piValue);
      setAssignmentConfig(updated);
    }
  };

  const handleRemovePIAssignment = (coIndex, piIndex) => {
    const updated = [...assignmentConfig];
    updated[0].mappings[coIndex].pis = updated[0].mappings[coIndex].pis.filter((_, i) => i !== piIndex);
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
      const raw = String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\((a|b)\)$/i, '$1');
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
    if (assessmentType === 'Assignment') {
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
    if (assessmentType === 'Assignment') {
      assignmentConfig.forEach(q => {
        overallTotal += q.marks;
      });
    } else {
      partsConfig.forEach(part => {
        overallTotal += part.numQuestions * part.marksPerQuestion;
      });
    }

    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    
    if (assessmentType === 'Exam' && exam !== 'custom' && selectedConfig) {
      if (overallTotal !== selectedConfig.totalMarks) {
        showToast(`Error: Total marks (${overallTotal}) does not match CIA Config total marks (${selectedConfig.totalMarks}).`, "error");
        return;
      }
    }

    // Do not render to the second CKEditor here.
    // Only prepare Q.No options for builder; final rendering happens on Finalize.
    if (assessmentType === 'Exam') {
      const qnos = buildExpectedQNosFromParts(partsConfig);
      if (qnos.length) setQbAvailableQNos(qnos);
    }
    setShowFinalPreview(false);
    showToast('Parts ready. Enter questions and click Finalize to generate the paper.', 'success');
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

    if (assessmentType === 'Assignment') {
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
              marks,
              question: qa?.question || '',
              co: qa?.co || '',
              kl: qa?.kl || '',
              pi: qa?.pi || ((qa?.co && coPiMapping[qa.co] && coPiMapping[qa.co][0]) ? coPiMapping[qa.co][0] : '')
            });
            questions.push({
              qno: `${counter}(b)`,
              sub: 'b',
              either_or: true,
              marks,
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
              marks,
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
      assignment_kl: assignmentKL,
      assignment_kl_domain: assignmentKLDomain
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
              const content = editor.getData();
              const qnos = extractQNosFromHtml(content);
              if (qnos && qnos.length) setQbAvailableQNos(qnos);
              if (typeof window.refreshOutcomesSummary === 'function') window.refreshOutcomesSummary(true);
            } catch {
              /* ignore */
            }
          });
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

    let overallTotal = 0;
    const co_weightage = {};
    assignmentConfig.forEach(q => {
      overallTotal += q.marks;
      (q.mappings || []).forEach(m => {
        if (m.co) {
          const mapMarks = parseInt(m?.marks, 10) || 0;
          co_weightage[m.co] = (co_weightage[m.co] || 0) + mapMarks;
        }
      });
    });

    const semesterNum = deriveSemesterNumber(selectedSemester);
    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam);
    const setSuffix = (selectedConfig?.numSets > 1) ? `_Set_${qpSet.replace(' ', '')}` : '';

    const sanitizeKey = (key) => {
      if (!key) return '';
      return String(key).replace(/[.#$[\]]/g, '_');
    };

    const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subject)}_${sanitizeKey(examDisplay)}`;

    const selectedSub = subjects.find(s => s.value === subject);
    const subjectName = selectedSub ? selectedSub.text.split(' - ')[1] : '';

    const payload = {
      academic_year: academicYear,
      department: department,
      programme: program,
      batch: batch,
      parts: [],
      assignment_config: assignmentConfig,
      assignment_kl: assignmentKL,
      assignment_kl_domain: assignmentKLDomain,
      assessment_type: assessmentType,
      qpaper_name: exam === 'custom' ? examDisplay : exam,
      exam_name: examDisplay,
      saved_at: new Date().toISOString(),
      semester: String(semesterNum || ''),
      subject: subject,
      subject_name: subjectName,
      total_marks: overallTotal,
      co_weightage: co_weightage,
      status: status,
      forwarded_to: forwardedToUid,
      forwarded_by: status === 'forwarded' ? auth.currentUser?.uid : null,
      forwarded_at: status === 'forwarded' ? new Date().toISOString() : null
    };

    try {
      if (editId && compositeKey) {
        await set(ref(rtdb, `generated_qps/${compositeKey}/${editId}`), payload);
      } else if (status === 'forwarded') { // For new papers being forwarded
        await set(ref(rtdb, `generated_qps/${key}/${exam}`), payload); // Use exam ID as key for new forwarded papers
      } else {
        // For new papers being saved as draft
        // Use exam ID as key if not custom, otherwise fallback to 'Assignment'
        const qpId = exam === 'custom' ? 'Assignment' : exam;
        await set(ref(rtdb, `generated_qps/${key}/${qpId}`), payload);
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
    const doc = parser.parseFromString(content, 'text/html');
    const tables = doc.querySelectorAll('table');
    
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

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length === 0) return;

          const texts = Array.from(cells).map(c => c.textContent.trim());

          // Match digits or digits+(a), digits+(b) etc.
          let rowQ = '';
          for (let i = 0; i < texts.length; i++) {
            const m = texts[i].match(/^(\d+)\s*(?:\(?([ab])\)?)?/i);
            if (m) {
              rowQ = m[2] ? `${m[1]}(${m[2]})` : `${m[1]}`;
              break;
            }
          }

          // Skip separator rows like '(Or)'
          const isOrSeparator = texts.some(t => t.toLowerCase() === '(or)');
          if (isOrSeparator && !rowQ) return;

          if (rowQ) {
            currentQno = rowQ;
          }

          // Heuristics to find question text, KL, CO, PI within the row
          let questionText = '';
          if (questionIndex >= 0 && cells.length > questionIndex) {
            questionText = cells[questionIndex].textContent.trim();
          } else if (cells.length >= 2) {
            questionText = cells[1].textContent.trim();
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

          // If CO or PI missing, peek at next row (often PI or continuation appears on next TR)
          if ((!co || !pi) && row.nextElementSibling) {
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

          // Basic validation
          const qKey = rowQ || currentQno || '';
          if (qKey) {
            if (!questionText || questionText.toLowerCase().includes('enter your question here') || questionText.trim() === '') {
              invalidEntries.push(`Question ${qKey} text is empty`);
            }
            if (!co || co.trim() === '' || co.toUpperCase() === 'CO') {
              invalidEntries.push(`CO for Question ${qKey} is empty`);
            }
            if (!pi || pi.trim() === '' || pi.toUpperCase() === 'PI' || /^select\s*pi$/i.test(pi)) {
              invalidEntries.push(`PI for Question ${qKey} is empty`);
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
    if (assessmentType === 'Assignment') {
      assignmentConfig.forEach(q => {
        overallTotal += q.marks;
      });
    } else {
      partsConfig.forEach(part => {
        overallTotal += part.numQuestions * part.marksPerQuestion;
      });
    }

    const semesterNum = deriveSemesterNumber(selectedSemester);
    const selectedConfig = ciaConfigs.find(c => c.id === exam);
    const examDisplay = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam);

    const partsForPayload = [];
    let payloadQuestionCounter = 1;

    if (assessmentType === 'Exam') {
      partsConfig.forEach((part, index) => {
        const partLetter = String.fromCharCode(64 + index + 1);
        const qs = [];

        for (let j = 0; j < part.numQuestions; j++) {
          if (part.isEitherOr) {
            const qnoA = `${payloadQuestionCounter}(a)`;
            const qnoB = `${payloadQuestionCounter}(b)`;
            qs.push({
              qno: qnoA, sub: "a", either_or: true, marks: part.marksPerQuestion,
              question: extractedData[qnoA]?.question || "",
              co: extractedData[qnoA]?.co || "",
              kl: extractedData[qnoA]?.kl || "",
              pi: (extractedData[qnoA]?.pi && extractedData[qnoA].pi.toUpperCase() !== 'PI') ? extractedData[qnoA].pi : ""
            });
            qs.push({
              qno: qnoB, sub: "b", either_or: true, marks: part.marksPerQuestion,
              question: extractedData[qnoB]?.question || "",
              co: extractedData[qnoB]?.co || "",
              kl: extractedData[qnoB]?.kl || "",
              pi: (extractedData[qnoB]?.pi && extractedData[qnoB].pi.toUpperCase() !== 'PI') ? extractedData[qnoB].pi : ""
            });
          } else {
            const qno = `${payloadQuestionCounter}`;
            qs.push({
              qno: qno, either_or: false, marks: part.marksPerQuestion,
              question: extractedData[qno]?.question || "",
              co: extractedData[qno]?.co || "",
              kl: extractedData[qno]?.kl || "",
              pi: (extractedData[qno]?.pi && extractedData[qno].pi.toUpperCase() !== 'PI') ? extractedData[qno].pi : ""
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

    const sanitizeKey = (key) => {
      if (!key) return '';
      return String(key).replace(/[.#$[\]]/g, '_');
    };

    const key = `${sanitizeKey(department)}_${sanitizeKey(academicYear)}_${sanitizeKey(subject)}_${sanitizeKey(examDisplay)}`;

    const selectedSub = subjects.find(s => s.value === subject);
    const subjectName = selectedSub ? selectedSub.text.split(' - ')[1] : '';

    // Extract CO weightage from summary table
    const co_weightage = {};
    const summarySection = doc.querySelector('.outcomes-summary-section');
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
      qp_set: qpSet,
      parts: partsForPayload,
      assignment_config: assessmentType === 'Assignment' ? assignmentConfig : [],
      assessment_type: assessmentType,
      qpaper_name: exam === 'custom' ? examDisplay : exam,
      exam_name: examDisplay,
      saved_at: new Date().toISOString(),
      semester: String(semesterNum || ''),
      subject: subject,
      subject_name: subjectName,
      total_marks: overallTotal,
      co_weightage: co_weightage,
      status: status,
      forwarded_to: forwardedToUid,
      forwarded_by: status === 'forwarded' ? auth.currentUser?.uid : null,
      forwarded_at: status === 'forwarded' ? new Date().toISOString() : null
    };

    try {
      if (editId && compositeKey) {
        await set(ref(rtdb, `generated_qps/${compositeKey}/${editId}`), payload);
      } else if (status === 'forwarded') { // For new papers being forwarded
        await set(ref(rtdb, `generated_qps/${key}/${exam}`), payload); // Use exam ID as key for new forwarded papers
      } else {
        // For new papers being saved as draft
        // Use exam ID + Set as key if not custom
        const qpId = exam === 'custom' ? (assessmentType === 'Assignment' ? 'Assignment' : 'Exam') : `${exam}${setSuffix}`;
        await set(ref(rtdb, `generated_qps/${key}/${qpId}`), payload);
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

  const handleForwardPaper = async () => {
    if (!program || !department || !batch || !academicYear || !selectedSemester || !subject || !exam) {
        showToast("Please fill in all required fields before forwarding.", "error");
        return;
    }

    if (!currentUserSignatureUrl) {
        showToast("Please upload your digital signature in your profile before forwarding.", "error");
        return;
    }

    // 1. Get current editor content with signature
    const qpDataForForward = {
        programme: program,
        department,
        batch,
        academic_year: academicYear,
        semester: String(deriveSemesterNumber(selectedSemester) || ''),
        subject,
        subject_name: subjects.find(s => s.value === subject)?.text.split(' - ')[1] || '',
        qpaper_name: exam === 'custom' ? customExam : (ciaConfigs.find(c => c.id === exam)?.examName || exam),
        total_marks: 0, // Will be calculated in handleSaveQuestionPaper
        exam_date: ciaConfigs.find(c => c.id === exam)?.examDate || new Date().toISOString(),
        assessment_type: assessmentType,
        parts: assessmentType === 'Exam' ? partsConfig : [],
        assignment_config: assessmentType === 'Assignment' ? assignmentConfig : [],
        assignment_kl: assignmentKL,
        assignment_kl_domain: assignmentKLDomain
    };

    const contentWithSignature = getQuestionPaperHTML(qpDataForForward, courseOutcomes, null, null, currentUserSignatureUrl);

    // 2. Find HOD for the selected department
    let hodUid = null;
    try {
        const usersRef = ref(rtdb, 'users');
        const usersSnapshot = await get(usersRef);
        if (usersSnapshot.exists()) {
            const allUsers = usersSnapshot.val();
            const hods = Object.values(allUsers).filter(
                user => user.role === 'HOD' && user.department === department && user.isApproved
            );
            if (hods.length > 0) {
                hodUid = hods[0].uid; // Assuming one HOD per department or picking the first
            }
        }
    } catch (error) {
        console.error("Error finding HOD:", error);
        showToast("Failed to find HOD for the department.", "error");
        return;
    }

    if (!hodUid) {
        showToast(`No HOD found for department ${department}. Cannot forward.`, "error");
        return;
    }

    // 3. Update the editor with the content including signature before saving
    if (window.CKEDITOR && window.CKEDITOR.instances.questionEditor) {
        window.CKEDITOR.instances.questionEditor.setData(contentWithSignature, async () => {
            // 4. Save the paper with 'forwarded' status
            const isSaved = await handleSaveQuestionPaper(true, 'forwarded', hodUid);
            if (isSaved) {
                showToast("Question paper forwarded to HOD successfully!", "success");
            } else {
                showToast("Failed to forward question paper.", "error");
            }
        });
    } else {
        showToast("Editor not ready. Please finalize the paper first.", "error");
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

      const isSaved = await handleSaveQuestionPaper(true);
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
${JSON.stringify(assessmentType === 'Assignment' ? assignmentConfig : partsConfig, null, 2)}

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
      `}</style>
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[1000] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}
      <div className="question-paper-page container mx-auto p-6 max-w-7xl">
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="space-y-2.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Assessment Type</label>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                value={assessmentType} 
                onChange={e => { setAssessmentType(e.target.value); setShowParts(false); setQbAvailableQNos([]); }}
              >
                <option value="Exam">Exam</option>
                <option value="Assignment">Assignment</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Program</label>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                value={program} 
                onChange={e => { setProgram(e.target.value); setDepartment(''); setQbAvailableQNos([]); }}
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
                onChange={e => setDepartment(e.target.value)} 
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
                onChange={e => setBatch(e.target.value)} 
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

          <div className="space-y-2.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject</label>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                value={subject} 
                onChange={e => setSubject(e.target.value)}
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
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Exam</label>
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

          {exam && exam !== 'custom' && ciaConfigs.find(c => c.id === exam)?.numSets > 1 && (
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest ml-1">Choose Question Paper Set</label>
              <div className="relative">
                <select 
                  className="w-full appearance-none bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-black text-blue-700" 
                  value={qpSet} 
                  onChange={e => setQpSet(e.target.value)}
                >
                  {Array.from({ length: ciaConfigs.find(c => c.id === exam).numSets }, (_, i) => `Set ${i + 1}`).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">{assessmentType === 'Assignment' ? 'Questions (Fixed to 1)' : 'Parts'}</label>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                value={assessmentType === 'Assignment' ? '1' : numParts} 
                onChange={e => setNumParts(e.target.value)}
                disabled={assessmentType === 'Assignment'}
              >
                <option value="">Select</option>
                {assessmentType === 'Assignment' ? (
                  <option value="1">1 Question</option>
                ) : (
                  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
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
            <button
              onClick={() => setShowAIModal(true)}
              className="px-8 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-900/20 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Generate with AI
            </button>
          </div>
        </div>
      )}

      {showParts && assessmentType === 'Assignment' && assignmentConfig[0] && (
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#120c7a] flex items-center gap-2">
              <div className="w-2 h-8 bg-[#120c7a] rounded-full"></div>
              Assignment Configuration (Single Question)
            </h3>
            
            <div className="flex gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Domain</label>
                <div className="relative">
                  <select 
                    value={assignmentKLDomain} 
                    onChange={e => { setAssignmentKLDomain(e.target.value); setAssignmentKL(''); }} 
                    className="w-40 appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-xs"
                  >
                    <option value="">Select domain</option>
                    {Object.keys(bloomsDomains || {}).map(key => (
                      <option key={key} value={key}>{bloomsDomains[key]?.name || key}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">KL</label>
                <div className="relative">
                  <select 
                    value={assignmentKL} 
                    onChange={e => setAssignmentKL(e.target.value)} 
                    className="w-32 appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-xs"
                    disabled={!assignmentKLDomain}
                  >
                    {(() => {
                      const domain = bloomsDomains[assignmentKLDomain];
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
                      return ['L1','L2','L3','L4','L5','L6'].map(l => <option key={l} value={l}>{l}</option>);
                    })()}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {presentPoSummary && presentPoSummary.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <h3 className="font-bold text-slate-700 text-sm">PO / PSO Marks from Assignment PI Mapping</h3>
                </div>
                <div className="p-2 overflow-auto">
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

            <div className="p-6 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-4">
              <div className="flex justify-between items-start">
                <h4 className="font-bold text-slate-700 text-lg">Assignment Question</h4>
                <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Marks:</span>
                  <span className="font-bold text-[#120c7a]">{assignmentConfig[0].marks}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Assignment Question Content</label>
                <div className="border border-slate-200 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition-all bg-white shadow-sm">
                  <div id="assignmentEditor" className="min-h-[200px]"></div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h5 className="font-bold text-slate-700 text-sm">CO-wise Mark Distribution</h5>
                    <p className="text-[10px] text-slate-400 font-medium">Split the total marks ({assignmentConfig[0].marks}) across mapped COs</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${assignmentMarksMeta.balanced ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                      {assignmentMarksMeta.balanced ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      <span>Remaining Mark: {assignmentMarksMeta.remaining}</span>
                    </div>
                    
                    <div className="relative">
                      <button className="px-4 py-2 bg-[#120c7a] text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#0e0960] transition-all shadow-sm">
                        <Plus size={14} /> Add CO Mapping
                      </button>
                      <select
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        value=""
                        onChange={e => handleAddCOAssignment(e.target.value)}
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
                  {(assignmentConfig[0].mappings || []).map((mapping, coIdx) => (
                    <div key={coIdx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100 uppercase">
                          {mapping.co}
                        </span>
                        <button 
                          onClick={() => handleRemoveCOAssignment(coIdx)}
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
                            max={assignmentConfig[0].marks}
                            value={mapping.marks === 0 || mapping.marks === '0' || mapping.marks === '' || mapping.marks === null || mapping.marks === undefined ? '' : mapping.marks}
                            onChange={(e) => handleMappingMarksChange(coIdx, e.target.value)}
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
                            onChange={e => handleAddPIAssignment(coIdx, e.target.value)}
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
                              {pi}
                              <button onClick={() => handleRemovePIAssignment(coIdx, piIdx)}>
                                <XCircle size={10} className="text-slate-300 group-hover:text-red-500 transition-colors" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(assignmentConfig[0].mappings || []).length === 0 && (
                    <div className="md:col-span-2 py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                      No Course Outcomes mapped yet. Select a CO above.
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4 mt-8">
            <button
              onClick={handleFinalizeQuestions}
              className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
            >
              <CheckCircle2 size={20} />
              Finalize & Preview
            </button>
            <button
              onClick={handleSaveAssignment}
              className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-900/20 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
              Save Assignment
            </button>
            <button
              onClick={() => setShowAIModal(true)}
              className="px-8 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-900/20 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Generate with AI
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
                <h3 className="font-bold text-slate-700 text-sm">Overall Mapped PO / PSO (Persisted in DB)</h3>
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
          <h2 className="text-2xl font-bold text-[#120c7a] mb-6 flex items-center gap-3">
            <div className="w-2 h-8 bg-[#120c7a] rounded-full"></div>
            Enter Questions
          </h2>

          
          {showQbEditor && (
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 w-full mb-8">
              <div className="mb-4 bg-white rounded-xl overflow-hidden border border-slate-200">
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
                        </>
                      ) : (
                        <option value="">Generate Layout First</option>
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
                        return ['L1','L2','L3','L4','L5','L6'].map(l => <option key={l} value={l}>{l}</option>);
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
                            <div className="line-clamp-2" dangerouslySetInnerHTML={{ __html: q.question }}></div>
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
                <div className="mt-8 flex justify-center">
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
                <textarea name="ckeditor" id="questionEditor" ref={editorRef}></textarea>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-12 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[2rem] mb-8 group">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-slate-300 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Refresh Outcomes
              </button>
              <button
                onClick={handleForwardPaper}
                disabled={!currentUserSignatureUrl}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Forward to HOD
              </button>
              <button
                onClick={handleSaveQuestionPaper}
                className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                Save Paper
              </button>
            </div>
          )}
        </div>

      {showAIModal && (
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
